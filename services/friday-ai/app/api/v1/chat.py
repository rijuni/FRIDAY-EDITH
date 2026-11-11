from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from sse_starlette.sse import EventSourceResponse
import json

from app.orchestration.router import router as model_router
from app.context.window import context_manager

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatStreamRequest(BaseModel):
    model: str = "claude-3-7-sonnet"
    messages: List[ChatMessage]
    system_prompt: Optional[str] = "You are F.R.I.D.A.Y., a high-intelligence AI assistant."
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(4096, ge=1, le=32000)


@router.post("/stream")
async def stream_chat(req: ChatStreamRequest):
    provider = model_router.resolve_provider(req.model)
    raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]
    compacted_messages = context_manager.prune_and_assemble(
        messages=raw_messages,
        system_prompt=req.system_prompt or ""
    )

    async def event_generator():
        async for chunk in provider.generate_stream(
            messages=compacted_messages,
            system_prompt=req.system_prompt or "",
            temperature=req.temperature,
            max_tokens=req.max_tokens
        ):
            payload = {
                "event": chunk.event,
                "text": chunk.text,
                "metadata": chunk.metadata
            }
            yield {
                "event": chunk.event,
                "data": json.dumps(payload)
            }

    return EventSourceResponse(event_generator())

