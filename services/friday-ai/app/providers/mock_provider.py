import asyncio
from typing import AsyncGenerator, Dict, List
from app.providers.base import BaseProvider, NormalizedChunk


class MockProvider(BaseProvider):
    """
    Deterministic mock provider for local development and automated test suites.
    Clearly labels responses as simulated output rather than external LLM responses.
    """

    is_mock: bool = True

    def __init__(self, model_id: str = "mock-nebula-v2"):
        super().__init__(model_id)

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> AsyncGenerator[NormalizedChunk, None]:
        user_input = messages[-1]["content"] if messages else ""
        base_meta = {"is_mock": True, "provider": self.model_id}

        # 1. Yield Thinking / Reasoning tokens
        yield NormalizedChunk(
            event="thinking",
            text=f"[MockProvider:{self.model_id}] Simulating deterministic local reasoning...",
            metadata={**base_meta}
        )
        await asyncio.sleep(0.03)

        # 2. Yield clearly labeled simulated response chunks
        response_text = (
            f"[Simulated Response — {self.model_id}] "
            f"Received prompt ({len(user_input)} chars): \"{user_input}\". "
            f"External LLM API providers are not yet connected; streaming deterministic local test fixture."
        )

        words = response_text.split(" ")
        for i, word in enumerate(words):
            yield NormalizedChunk(
                event="chunk",
                text=word + (" " if i < len(words) - 1 else ""),
                metadata={**base_meta, "index": i}
            )
            await asyncio.sleep(0.015)

        # 3. Yield Citation
        yield NormalizedChunk(
            event="citation",
            text="",
            metadata={**base_meta, "source": "Local Mock Fixture", "section": "5.1 Friday Chat Core"}
        )

        # 4. Yield Done Event
        yield NormalizedChunk(
            event="done",
            text="",
            metadata={**base_meta, "total_tokens": self.count_tokens(response_text) + 20}
        )

    def count_tokens(self, text: str) -> int:
        # Rule of thumb: ~4 characters per token
        return max(1, len(text) // 4)

