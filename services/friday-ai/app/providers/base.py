from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any, List
from pydantic import BaseModel


class NormalizedChunk(BaseModel):
    event: str  # "chunk", "thinking", "tool_call", "citation", "done"
    text: str = ""
    metadata: Dict[str, Any] = {}


class BaseProvider(ABC):
    def __init__(self, model_id: str):
        self.model_id = model_id

    @abstractmethod
    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> AsyncGenerator[NormalizedChunk, None]:
        """Yields standardized streaming events."""
        pass

    @abstractmethod
    def count_tokens(self, text: str) -> int:
        """Estimates token usage for context budgeting."""
        pass
