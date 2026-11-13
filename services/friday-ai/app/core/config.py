from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from pathlib import Path

DEFAULT_INTERNAL_SECRET = "dev_internal_service_secret_change_in_prod"


class Settings(BaseSettings):
    APP_NAME: str = "F.R.I.D.A.Y. AI Intelligence Service"
    VERSION: str = "2.1.0"
    ENVIRONMENT: str = Field(
        default="development",
        validation_alias=AliasChoices("ENVIRONMENT", "NODE_ENV")
    )
    PORT: int = 8001
    HOST: str = "127.0.0.1"

    # Service-to-service & CORS Security
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    INTERNAL_SERVICE_SECRET: str = DEFAULT_INTERNAL_SECRET
    REQUIRE_INTERNAL_AUTH: bool = True

    # LLM Provider Credentials (never serialized to clients or logs)
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    # Provider selection stays explicit. `mock` is the safe local default;
    # `auto` routes only recognized model IDs to a configured provider.
    FRIDAY_AI_PROVIDER: str = "mock"
    OPENAI_MODEL: str = "gpt-4o"
    ANTHROPIC_MODEL: str = "claude-3-7-sonnet"
    GEMINI_MODEL: str = "gemini-2.0-flash"
    PROVIDER_REQUEST_TIMEOUT_SECONDS: float = 90.0

    # Production document uploads require a local ClamAV daemon. Dev mode may
    # explicitly leave scanning off; it is never allowed in production.
    MALWARE_SCAN_MODE: str = "off"
    CLAMD_HOST: str = "127.0.0.1"
    CLAMD_PORT: int = 3310
    MALWARE_SCAN_TIMEOUT_SECONDS: float = 15.0

    # Context, Payload & Ingestion limits
    MAX_CONTEXT_TOKENS: int = 128000
    MAX_PROMPT_CHARS: int = 32000
    MAX_MESSAGES_PER_REQUEST: int = 100
    MAX_JSON_BODY_BYTES: int = 1024 * 1024  # 1 MB
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    DOCUMENT_PARSE_TIMEOUT_SECONDS: float = 10.0

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[4] / ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

if settings.FRIDAY_AI_PROVIDER not in {"mock", "auto", "openai", "anthropic", "gemini"}:
    raise RuntimeError("FRIDAY_AI_PROVIDER must be mock, auto, openai, anthropic, or gemini")

if settings.ENVIRONMENT == "production" and settings.INTERNAL_SERVICE_SECRET == DEFAULT_INTERNAL_SECRET:
    raise RuntimeError("INTERNAL_SERVICE_SECRET must be overridden in production environment")
if settings.ENVIRONMENT == "production" and not settings.REQUIRE_INTERNAL_AUTH:
    raise RuntimeError("REQUIRE_INTERNAL_AUTH cannot be disabled in production environment")
if settings.MALWARE_SCAN_MODE not in {"off", "clamd"}:
    raise RuntimeError("MALWARE_SCAN_MODE must be off or clamd")
if settings.ENVIRONMENT == "production" and settings.MALWARE_SCAN_MODE != "clamd":
    raise RuntimeError("MALWARE_SCAN_MODE=clamd is required in production")

