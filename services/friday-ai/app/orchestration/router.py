from typing import Dict, List

from app.core.config import settings
from app.core.errors import FridayAIException, ProviderConfigurationException
from app.providers.base import BaseProvider
from app.providers.http_providers import AnthropicProvider, GeminiProvider, OpenAIProvider
from app.providers.mock_provider import MockProvider


class ModelRouter:
    """Resolve only configured model IDs; never silently replace a real model with a mock."""

    def __init__(self):
        self._provider_classes = {
            "openai": (OpenAIProvider, settings.OPENAI_MODEL, settings.OPENAI_API_KEY),
            "anthropic": (AnthropicProvider, settings.ANTHROPIC_MODEL, settings.ANTHROPIC_API_KEY),
            "gemini": (GeminiProvider, settings.GEMINI_MODEL, settings.GEMINI_API_KEY),
        }

    def available_models(self) -> List[Dict[str, str]]:
        mode = settings.FRIDAY_AI_PROVIDER
        if mode == "mock":
            return [
                {"id": "claude-3-7-sonnet", "label": "F.R.I.D.A.Y. Mock (Claude-style)"},
                {"id": "gpt-4o", "label": "F.R.I.D.A.Y. Mock (GPT-style)"},
                {"id": "gemini-2-flash", "label": "F.R.I.D.A.Y. Mock (Gemini-style)"},
            ]
        models = []
        providers = self._provider_classes.items() if mode == "auto" else [(mode, self._provider_classes[mode])]
        for provider, (_, model_id, api_key) in providers:
            if api_key and model_id:
                models.append({"id": model_id, "label": f"{provider.title()} · {model_id}"})
        return models

    def resolve_provider(self, requested_model: str = "claude-3-7-sonnet") -> BaseProvider:
        mode = settings.FRIDAY_AI_PROVIDER
        if mode == "mock":
            return MockProvider(requested_model or "mock-nebula-v2")

        legacy_aliases = {
            "gpt-4o": "openai",
            "claude-3-7-sonnet": "anthropic",
            "gemini-2-flash": "gemini",
        }
        expected_provider = legacy_aliases.get(requested_model)
        candidates = self._provider_classes.items() if mode == "auto" else [(mode, self._provider_classes[mode])]
        for provider_name, (provider_class, configured_model, api_key) in candidates:
            if expected_provider and expected_provider != provider_name:
                continue
            if requested_model == configured_model or expected_provider == provider_name:
                if not api_key:
                    raise ProviderConfigurationException(provider_name)
                return provider_class(configured_model)

        raise FridayAIException(
            message="The selected model is not configured for this F.R.I.D.A.Y. service.",
            status_code=400,
            error_code="MODEL_NOT_AVAILABLE",
        )


router = ModelRouter()
