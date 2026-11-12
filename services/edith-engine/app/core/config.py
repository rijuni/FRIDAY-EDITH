import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field

_DEFAULT_INTERNAL_SECRET = "dev_internal_service_secret_change_in_prod"


def _default_workspace_dir() -> str:
    """Resolve the monorepo root when running inside services/edith-engine, else cwd."""
    candidate = Path(__file__).resolve()
    for parent in candidate.parents:
        if (parent / "services").is_dir() and (parent / "apps").is_dir():
            return str(parent)
    return os.getcwd()


class Settings(BaseSettings):
    APP_NAME: str = "E.D.I.T.H. Autonomous Agent Engine"
    VERSION: str = "2.1.0"
    ENVIRONMENT: str = "development"
    PORT: int = 8002
    HOST: str = "127.0.0.1"
    LOG_LEVEL: str = "INFO"

    DEFAULT_WORKSPACE_DIR: str = Field(default_factory=_default_workspace_dir)
    ALLOWED_WORKSPACE_ROOTS: str = ""
    RUNNER_HOST_URL: str = "http://127.0.0.1:8003"

    # Internal service-to-service authentication
    INTERNAL_SERVICE_SECRET: str = _DEFAULT_INTERNAL_SECRET
    REQUIRE_INTERNAL_AUTH: bool = True

    # Strict CORS origins (comma-separated)
    CORS_ALLOW_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Bounded safety & resource limits
    MAX_SCAN_FILES: int = 500
    MAX_PARSE_BYTES: int = 524_288
    MAX_READ_BYTES: int = 262_144
    MAX_PROMPT_LENGTH: int = 8_000
    MAX_COMMAND_LENGTH: int = 2_000
    MAX_CONTENT_BYTES: int = 1_048_576
    MAX_PAYLOAD_BYTES: int = 2_097_152

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOW_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_workspace_roots_list(self) -> List[str]:
        configured = [r.strip() for r in self.ALLOWED_WORKSPACE_ROOTS.split(",") if r.strip()]
        if configured:
            return configured
        return [self.DEFAULT_WORKSPACE_DIR]

    def validate_security_posture(self) -> None:
        if self.is_production:
            if (
                not self.INTERNAL_SERVICE_SECRET
                or self.INTERNAL_SERVICE_SECRET == _DEFAULT_INTERNAL_SECRET
                or len(self.INTERNAL_SERVICE_SECRET) < 16
            ):
                raise RuntimeError(
                    "INTERNAL_SERVICE_SECRET must be set to a strong secret in production."
                )


settings = Settings()
settings.validate_security_posture()
