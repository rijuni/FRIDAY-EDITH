import asyncio
from typing import AsyncGenerator, Dict, List
from app.providers.base import BaseProvider, NormalizedChunk


class MockProvider(BaseProvider):
    """
    High-fidelity deterministic streaming provider for local dev and automated test suites.
    Simulates reasoning, chunk streaming, and citation grounding.
    """

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

        # 1. Yield Thinking / Reasoning tokens
        yield NormalizedChunk(
            event="thinking",
            text="F.R.I.D.A.Y. cognitive core analyzing query context, project memory, and grounded citations..."
        )
        await asyncio.sleep(0.05)

        # 2. Yield Streamed Response Chunks
        response_text = (
            f"F.R.I.D.A.Y. operational status verified. "
            f"I have received your prompt: \"{user_input}\". "
            f"The architecture is configured with strict non-Docker native execution, "
            f"dual SQLite/MySQL persistence, and an isolated Hyper-V runner for E.D.I.T.H."
        )

        words = response_text.split(" ")
        for i, word in enumerate(words):
            yield NormalizedChunk(
                event="chunk",
                text=word + (" " if i < len(words) - 1 else ""),
                metadata={"index": i}
            )
            await asyncio.sleep(0.02)

        # 3. Yield Citation
        yield NormalizedChunk(
            event="citation",
            text="",
            metadata={"source": "Blueprint v2.1", "section": "5.1 Friday Chat Core"}
        )

        # 4. Yield Done Event
        yield NormalizedChunk(
            event="done",
            text="",
            metadata={"total_tokens": self.count_tokens(response_text) + 20}
        )

    def count_tokens(self, text: str) -> int:
        # Rule of thumb: ~4 characters per token
        return max(1, len(text) // 4)

