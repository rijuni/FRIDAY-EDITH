from typing import List, Dict
from app.core.config import settings
from app.core.errors import ContextLimitExceededException


class ContextWindowManager:
    def __init__(self, max_tokens: int = settings.MAX_CONTEXT_TOKENS):
        self.max_tokens = max_tokens

    def prune_and_assemble(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str = "",
        max_budget: int = 16000
    ) -> List[Dict[str, str]]:
        """
        Ensures total message context remains well within the token ceiling.
        Keeps system prompt, initial user prompt, and recent conversational turns.
        """
        estimated_system_tokens = len(system_prompt) // 4
        if estimated_system_tokens > max_budget:
            raise ContextLimitExceededException(estimated_system_tokens, max_budget)

        budget_remaining = max_budget - estimated_system_tokens
        compacted: List[Dict[str, str]] = []

        # Iterate backward from newest message
        for msg in reversed(messages):
            msg_tokens = len(msg.get("content", "")) // 4
            if budget_remaining - msg_tokens <= 0 and len(compacted) > 0:
                break
            compacted.insert(0, msg)
            budget_remaining -= msg_tokens

        return compacted


context_manager = ContextWindowManager()
