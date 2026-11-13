import json
import asyncio
from typing import AsyncGenerator, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.core.errors import (
    FridayAIException,
    ProviderConfigurationException,
    ProviderTimeoutException,
    ProviderUnavailableException,
)
from app.providers.base import BaseProvider, NormalizedChunk


def _messages_for_provider(messages: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], List[str]]:
    """Separate system-like instructions from user-visible conversation turns."""
    conversation: List[Dict[str, str]] = []
    instructions: List[str] = []
    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")
        if role in {"system", "developer"}:
            instructions.append(content)
        elif role in {"user", "assistant"}:
            conversation.append({"role": role, "content": content})
        elif role == "tool":
            # Tool output is untrusted context. No client supplied tool call is executed.
            conversation.append({"role": "user", "content": f"[Tool result]\n{content}"})
    return conversation, instructions


class HttpProvider(BaseProvider):
    provider_name = "provider"

    def __init__(self, model_id: str):
        super().__init__(model_id)

    def count_tokens(self, text: str) -> int:
        return max(1, (len(text) + 3) // 4)

    async def _open_stream(self, url: str, headers: Dict[str, str], payload: Dict):
        client = httpx.AsyncClient(timeout=httpx.Timeout(settings.PROVIDER_REQUEST_TIMEOUT_SECONDS, connect=10.0))
        request = client.build_request("POST", url, headers=headers, json=payload)
        try:
            response = await client.send(request, stream=True)
        except asyncio.CancelledError:
            await client.aclose()
            raise
        except httpx.TimeoutException as exc:
            await client.aclose()
            raise ProviderTimeoutException(self.provider_name) from exc
        except httpx.HTTPError as exc:
            await client.aclose()
            raise ProviderUnavailableException(self.provider_name) from exc
        if response.status_code >= 400:
            await response.aclose()
            await client.aclose()
            raise ProviderUnavailableException(self.provider_name)
        return client, response

    async def _read_sse(self, response: httpx.Response) -> AsyncGenerator[Dict, None]:
        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                value = json.loads(data)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                yield value


class OpenAIProvider(HttpProvider):
    provider_name = "openai"

    async def generate_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        if not settings.OPENAI_API_KEY:
            raise ProviderConfigurationException(self.provider_name)
        turns, instructions = _messages_for_provider(messages)
        full_instructions = "\n\n".join([system_prompt, *instructions]).strip()
        payload = {
            "model": self.model_id,
            "messages": ([{"role": "system", "content": full_instructions}] if full_instructions else []) + turns,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        client, response = await self._open_stream(
            "https://api.openai.com/v1/chat/completions",
            {"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
            payload,
        )
        try:
            async for frame in self._read_sse(response):
                if frame.get("error"):
                    raise ProviderUnavailableException(self.provider_name)
                delta = ((frame.get("choices") or [{}])[0].get("delta") or {}).get("content")
                if isinstance(delta, str) and delta:
                    yield NormalizedChunk(event="chunk", text=delta, metadata={"provider": self.provider_name})
            yield NormalizedChunk(event="done", metadata={"provider": self.provider_name})
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutException(self.provider_name) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableException(self.provider_name) from exc
        finally:
            await response.aclose()
            await client.aclose()


class AnthropicProvider(HttpProvider):
    provider_name = "anthropic"

    async def generate_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        if not settings.ANTHROPIC_API_KEY:
            raise ProviderConfigurationException(self.provider_name)
        turns, instructions = _messages_for_provider(messages)
        full_instructions = "\n\n".join([system_prompt, *instructions]).strip()
        payload = {
            "model": self.model_id,
            "messages": turns,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        if full_instructions:
            payload["system"] = full_instructions
        client, response = await self._open_stream(
            "https://api.anthropic.com/v1/messages",
            {
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            payload,
        )
        try:
            async for frame in self._read_sse(response):
                if frame.get("type") == "error" or frame.get("error"):
                    raise ProviderUnavailableException(self.provider_name)
                if frame.get("type") != "content_block_delta":
                    continue
                delta = frame.get("delta") or {}
                if delta.get("type") == "text_delta" and isinstance(delta.get("text"), str):
                    yield NormalizedChunk(event="chunk", text=delta["text"], metadata={"provider": self.provider_name})
            yield NormalizedChunk(event="done", metadata={"provider": self.provider_name})
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutException(self.provider_name) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableException(self.provider_name) from exc
        finally:
            await response.aclose()
            await client.aclose()


class GeminiProvider(HttpProvider):
    provider_name = "gemini"

    async def generate_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        if not settings.GEMINI_API_KEY:
            raise ProviderConfigurationException(self.provider_name)
        turns, instructions = _messages_for_provider(messages)
        full_instructions = "\n\n".join([system_prompt, *instructions]).strip()
        payload = {
            "contents": [
                {"role": "model" if turn["role"] == "assistant" else "user", "parts": [{"text": turn["content"]}]}
                for turn in turns
            ],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if full_instructions:
            payload["systemInstruction"] = {"parts": [{"text": full_instructions}]}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_id}:streamGenerateContent?alt=sse"
        client, response = await self._open_stream(
            url,
            {"x-goog-api-key": settings.GEMINI_API_KEY, "content-type": "application/json"},
            payload,
        )
        try:
            async for frame in self._read_sse(response):
                if frame.get("error"):
                    raise ProviderUnavailableException(self.provider_name)
                for candidate in frame.get("candidates", []):
                    for part in (candidate.get("content") or {}).get("parts", []):
                        text = part.get("text")
                        if isinstance(text, str) and text:
                            yield NormalizedChunk(event="chunk", text=text, metadata={"provider": self.provider_name})
            yield NormalizedChunk(event="done", metadata={"provider": self.provider_name})
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutException(self.provider_name) from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableException(self.provider_name) from exc
        finally:
            await response.aclose()
            await client.aclose()
