from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any, List
from pydantic import BaseModel, Field


class ProviderCapabilities(BaseModel):
    streaming: bool = True
    tool_calls: bool = False
    is_mock: bool = False
    max_context_tokens: int = 128000


class NormalizedChunk(BaseModel):
    event: str  # "chunk", "thinking", "tool_call", "citation", "done", "error"
    text: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BaseProvider(ABC):
    is_mock: bool = False

    def __init__(self, model_id: str):
        self.model_id = model_id

    @property
    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(is_mock=self.is_mock)

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

