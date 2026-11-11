from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "F.R.I.D.A.Y. AI Intelligence Service"
    VERSION: str = "2.1.0"
    ENVIRONMENT: str = "development"
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # CORS & Security
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # LLM Provider Credentials
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    # Context & Ingestion limits
    MAX_CONTEXT_TOKENS: int = 128000
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB

    class Config:
        env_file = Path(__file__).resolve().parent.parent.parent.parent / ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

