import re
from typing import Dict, Any, Tuple
from pydantic import BaseModel

class PolicyDecision(BaseModel):
    command: str
    decision: str  # "SAFE" | "CONFIRMATION_REQUIRED" | "DENIED"
    reason: str
    risk_score: int  # 0 to 100

class CommandPolicyGateway:
    """Enforces zero-trust command classification for E.D.I.T.H. execution."""

    SAFE_PATTERNS = [
        r"^(git\s+(status|diff|log|branch|show))(\s+.*)?$",
        r"^(dir|ls|pwd|echo)(\s+.*)?$",
        r"^(node|python|npm|pytest)\s+(--version|-v)$",
        r"^(npm\s+(test|run\s+test|run\s+build|run\s+lint))(\s+.*)?$",
        r"^(pytest)(\s+.*)?$",
    ]

    DENIED_PATTERNS = [
        r"(rmdir\s+/s\s+/q\s+[c-zC-Z]:\\)",
        r"(format\s+[c-zC-Z]:)",
        r"(diskpart)",
        r"(sudo\s+rm\s+-rf\s+/)",
        r"(curl\s+.*\|\s*(bash|sh))",
        r"(invoke-expression\s+.*downloadstring)",
        r"(del\s+/[fF]\s+/[sS]\s+/[qQ]\s+[c-zC-Z]:\\Windows)",
    ]

    CONFIRMATION_PATTERNS = [
        r"^(git\s+(commit|push|rebase|reset|checkout|clean))(\s+.*)?$",
        r"^(npm\s+(install|i|uninstall|update))(\s+.*)?$",
        r"^(pip\s+(install|uninstall))(\s+.*)?$",
        r"^(del|rm|rmdir|remove-item)(\s+.*)?$",
        r"^(mkdir|md|New-Item)(\s+.*)?$",
    ]

    def evaluate(self, command: str) -> PolicyDecision:
        cmd_clean = command.strip()

        # 1. Check DENIED patterns
        for pattern in self.DENIED_PATTERNS:
            if re.search(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(
                    command=cmd_clean,
                    decision="DENIED",
                    reason="Potentially destructive or prohibited OS level operation detected.",
                    risk_score=100
                )

        # 2. Check SAFE patterns
        for pattern in self.SAFE_PATTERNS:
            if re.match(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(
                    command=cmd_clean,
                    decision="SAFE",
                    reason="Read-only or sanctioned verification command.",
                    risk_score=10
                )

        # 3. Check CONFIRMATION patterns
        for pattern in self.CONFIRMATION_PATTERNS:
            if re.match(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(
                    command=cmd_clean,
                    decision="CONFIRMATION_REQUIRED",
                    reason="Mutates repository filesystem state or package dependencies.",
                    risk_score=60
                )

        # 4. Default: Require confirmation for unrecognized commands
        return PolicyDecision(
            command=cmd_clean,
            decision="CONFIRMATION_REQUIRED",
            reason="Unclassified arbitrary shell execution requires explicit human authorization.",
            risk_score=75
        )

