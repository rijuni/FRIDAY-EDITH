import logging
import re
import sys
from contextvars import ContextVar
from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SECRET_PATTERNS = [
    (re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z\-_]{16,})\b"), "[REDACTED_KEY]"),
    (re.compile(r'("?(?:api[_-]?key|token|secret|password|prompt|content)"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r'\1"[REDACTED]"'),
]


class RedactingContextFilter(logging.Filter):
    """Injects correlation request_id and scrubs secret/prompt patterns from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("-")
        msg = record.getMessage()
        for pattern, replacement in _SECRET_PATTERNS:
            msg = pattern.sub(replacement, msg)
        record.msg = msg
        record.args = ()
        return True


def setup_logging():
    level = logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RedactingContextFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] [req=%(request_id)s] %(name)s: %(message)s")
    )

    root_logger = logging.getLogger("friday_ai")
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.propagate = False
    return root_logger


logger = setup_logging()

