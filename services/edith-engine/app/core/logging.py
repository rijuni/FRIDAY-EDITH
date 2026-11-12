import logging
import re
import sys
from contextvars import ContextVar
from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SENSITIVE_PATTERNS = [
    (re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9\-_]{12,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bAIza[A-Za-z0-9\-_]{16,}"), "[REDACTED_KEY]"),
    (
        re.compile(
            r'("(?:x-internal-service-token|authorization|password|token|secret|api_key)"\s*:\s*)"[^"]*"',
            re.IGNORECASE,
        ),
        r'\1"[REDACTED]"',
    ),
]


def redact_sensitive_text(text: str) -> str:
    masked = text
    for pattern, repl in _SENSITIVE_PATTERNS:
        masked = pattern.sub(repl, masked)
    return masked


class RedactingContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("-")
        if isinstance(record.msg, str):
            record.msg = redact_sensitive_text(record.msg)
        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    redact_sensitive_text(a) if isinstance(a, str) else a for a in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: redact_sensitive_text(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
        return True


def setup_logging() -> logging.Logger:
    logger_instance = logging.getLogger("edith-engine")
    logger_instance.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    logger_instance.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RedactingContextFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] [req=%(request_id)s] [%(name)s] %(message)s")
    )
    logger_instance.addHandler(handler)
    logger_instance.propagate = False
    return logger_instance


logger = setup_logging()
