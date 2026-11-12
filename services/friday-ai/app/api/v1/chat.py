import asyncio
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.context.window import context_manager
from app.core.auth import verify_internal_caller
from app.core.config import settings
from app.core.errors import FridayAIException
from app.core.logging import logger
from app.orchestration.router import router as model_router

router = APIRouter()


class ChatMessage(BaseModel):
    role: str = Field(..., max_length=20)
    content: str = Field(..., min_length=1, max_length=settings.MAX_PROMPT_CHARS)


class ChatStreamRequest(BaseModel):
    model: str = Field(default="claude-3-7-sonnet", max_length=100)
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=settings.MAX_MESSAGES_PER_REQUEST)
    system_prompt: Optional[str] = Field(
        default="You are F.R.I.D.A.Y., a high-intelligence AI assistant.",
        max_length=8000
    )
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(4096, ge=1, le=32000)


@router.post("/stream")
async def stream_chat(
    request: Request,
    req: ChatStreamRequest,
    user_id: str = Depends(verify_internal_caller)
):
    provider = model_router.resolve_provider(req.model)
    raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]
    compacted_messages = context_manager.prune_and_assemble(
        messages=raw_messages,
        system_prompt=req.system_prompt or ""
    )

    logger.debug(f"Starting stream for user={user_id} model={provider.model_id} turns={len(compacted_messages)}")

    async def event_generator():
        try:
            async for chunk in provider.generate_stream(
                messages=compacted_messages,
                system_prompt=req.system_prompt or "",
                temperature=req.temperature,
                max_tokens=req.max_tokens
            ):
                if await request.is_disconnected():
                    logger.info(f"Client disconnected mid-stream user={user_id}")
                    break

                payload = {
                    "event": chunk.event,
                    "text": chunk.text,
                    "metadata": {
                        "is_mock": provider.is_mock,
                        "provider": provider.model_id,
                        **chunk.metadata
                    }
                }
                yield {
                    "event": chunk.event,
                    "data": json.dumps(payload)
                }
        except asyncio.CancelledError:
            logger.info(f"Stream cancelled for user={user_id}")
        except FridayAIException as exc:
            yield {
                "event": "error",
                "data": json.dumps({
                    "event": "error",
                    "errorCode": exc.error_code,
                    "message": exc.message
                })
            }
        except Exception:
            logger.error("Unexpected SSE streaming error")
            yield {
                "event": "error",
                "data": json.dumps({
                    "event": "error",
                    "errorCode": "AI_STREAM_ERROR",
                    "message": "Streaming failed unexpectedly."
                })
            }

    return EventSourceResponse(event_generator())

