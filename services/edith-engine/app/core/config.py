from pydantic_settings import BaseSettings
from pydantic import Field
import os

class Settings(BaseSettings):
    APP_NAME: str = "E.D.I.T.H. Autonomous Agent Engine"
    VERSION: str = "2.1.0"
    PORT: int = 8002
    HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "INFO"
    DEFAULT_WORKSPACE_DIR: str = Field(default_factory=lambda: os.getcwd())
    RUNNER_HOST_URL: str = "http://127.0.0.1:8003"
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

