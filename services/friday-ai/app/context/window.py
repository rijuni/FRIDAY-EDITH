from typing import List, Dict
from app.core.config import settings
from app.core.errors import ContextLimitExceededException, FridayAIException

ALLOWED_MESSAGE_ROLES = {"system", "developer", "user", "assistant", "tool"}


class ContextWindowManager:
    def __init__(self, max_tokens: int = settings.MAX_CONTEXT_TOKENS):
        self.max_tokens = max_tokens

    @staticmethod
    def estimate_tokens(text: str) -> int:
        if not text:
            return 0
        return max(1, (len(text) + 3) // 4)

    def prune_and_assemble(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str = "",
        max_budget: int = 16000
    ) -> List[Dict[str, str]]:
        """
        Validates message roles and ensures total context remains within token budget.
        Always accounts for system/developer prompts first, then keeps newest conversation turns.
        """
        effective_budget = min(max_budget, self.max_tokens)
        estimated_system_tokens = self.estimate_tokens(system_prompt)
        if estimated_system_tokens > effective_budget:
            raise ContextLimitExceededException(estimated_system_tokens, effective_budget)

        pinned_instruction_messages: List[Dict[str, str]] = []
        conversational_messages: List[Dict[str, str]] = []
        pinned_tokens = estimated_system_tokens

        for msg in messages:
            role = (msg.get("role") or "").lower().strip()
            if role not in ALLOWED_MESSAGE_ROLES:
                raise FridayAIException(
                    message=f"Unsupported message role '{role}'.",
                    status_code=400,
                    error_code="VALIDATION_ERROR"
                )
            normalized = {"role": role, "content": msg.get("content", "")}
            if role in {"system", "developer"}:
                pinned_tokens += self.estimate_tokens(normalized["content"])
                pinned_instruction_messages.append(normalized)
            else:
                conversational_messages.append(normalized)

        if pinned_tokens > effective_budget:
            raise ContextLimitExceededException(pinned_tokens, effective_budget)

        budget_remaining = effective_budget - pinned_tokens
        compacted_turns: List[Dict[str, str]] = []

        for msg in reversed(conversational_messages):
            msg_tokens = self.estimate_tokens(msg["content"])
            if msg_tokens > budget_remaining and len(compacted_turns) > 0:
                break
            if msg_tokens > budget_remaining and len(compacted_turns) == 0:
                # Truncate single oversized turn so prompt stays bounded within remaining budget
                max_chars = max(4, budget_remaining * 4)
                compacted_turns.append({
                    "role": msg["role"],
                    "content": msg["content"][-max_chars:]
                })
                break
            compacted_turns.insert(0, msg)
            budget_remaining -= msg_tokens

        return pinned_instruction_messages + compacted_turns


context_manager = ContextWindowManager()

