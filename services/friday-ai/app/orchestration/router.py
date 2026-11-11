from typing import Dict
from app.providers.base import BaseProvider
from app.providers.mock_provider import MockProvider
from app.core.config import settings
from app.core.logging import logger


class ModelRouter:
    def __init__(self):
        self._providers: Dict[str, BaseProvider] = {
            "mock-nebula-v2": MockProvider("mock-nebula-v2"),
            "claude-3-7-sonnet": MockProvider("claude-3-7-sonnet"),
            "gpt-4o": MockProvider("gpt-4o"),
            "gemini-2-flash": MockProvider("gemini-2-flash")
        }

    def resolve_provider(self, requested_model: str = "claude-3-7-sonnet") -> BaseProvider:
        logger.debug(f"Resolving model provider for: {requested_model}")
        if requested_model in self._providers:
            return self._providers[requested_model]

        logger.info(f"Model '{requested_model}' not directly matched, routing to default nebula core")
        return self._providers["mock-nebula-v2"]


router = ModelRouter()

