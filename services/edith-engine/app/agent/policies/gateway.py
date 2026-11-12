import re
from pydantic import BaseModel
from app.core.config import settings


class PolicyDecision(BaseModel):
    command: str
    decision: str  # "SAFE" | "CONFIRMATION_REQUIRED" | "DENIED"
    reason: str
    risk_score: int  # 0 to 100


def _contains_shell_chaining_or_redirection(cmd: str) -> bool:
    """Detect shell operators, pipelines, redirection, or command substitution."""
    if "\n" in cmd or "\r" in cmd or "\x00" in cmd:
        return True

    in_single_quote = False
    in_double_quote = False
    escaped = False
    n = len(cmd)

    for i, ch in enumerate(cmd):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and not in_single_quote:
            escaped = True
            continue
        if ch == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            continue
        if ch == '"' and not in_single_quote:
            in_double_quote = not in_double_quote
            continue

        # Backticks and $(...) execute inside double-quoted strings in POSIX/PowerShell
        if not in_single_quote:
            if ch == "`":
                return True
            if ch == "$" and i + 1 < n and cmd[i + 1] == "(":
                return True

        if not in_single_quote and not in_double_quote:
            if ch in (";", "|", "&", ">", "<"):
                return True

    return False


class CommandPolicyGateway:
    """Enforces zero-trust command classification for E.D.I.T.H. execution."""

    SAFE_PATTERNS = [
        r"^(git\s+(status|diff|log|branch|show))(\s+.*)?$",
        r"^(dir|ls|pwd|echo)(\s+.*)?$",
        r"^(node|python|npm|pytest)\s+(--version|-v|-V)$",
        r"^(npm\s+(test|run\s+test|run\s+build|run\s+lint))(\s+.*)?$",
        r"^(pytest)(\s+.*)?$",
    ]

    DENIED_PATTERNS = [
        r"(rmdir\s+/s\s+/q\s+[c-zC-Z]:\\)",
        r"(del\s+/[fF]\s+/[sS]\s+/[qQ]\s+[c-zC-Z]:\\)",
        r"(format\s+[c-zC-Z]:)",
        r"(\bdiskpart\b|\bbcdedit\b|\breg\s+delete\b)",
        r"(sudo\s+rm\s+-[rRfF]+)",
        r"(rm\s+-[rRfF]{1,4}\s+(/|~|\*|\.\.)(\s|$))",
        r"(\bmkfs\b|\bdd\s+if=)",
        r"(:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:)",
        r"((curl|wget|irm|iwr)\s+.*\|\s*(bash|sh|zsh|pwsh|powershell|iex))",
        r"(invoke-expression|powershell(\.exe)?\s+.*(-enc|-encodedcommand|downloadstring))",
        r"(certutil\s+.*-urlcache)",
        r"(/etc/(passwd|shadow|sudoers)|C:\\Windows\\System32)",
    ]

    UNSAFE_GIT_FLAGS_RE = re.compile(r"(^|\s)(-c|--exec-path|--upload-pack|--receive-pack|--ext-diff)\b", re.IGNORECASE)
    NESTED_SHELL_RE = re.compile(r"\b(cmd(\.exe)?\s+/c|powershell(\.exe)?\s+-c|pwsh\s+-c|(ba|z)?sh\s+-c)\b", re.IGNORECASE)

    CONFIRMATION_PATTERNS = [
        r"^(git\s+(commit|push|rebase|reset|checkout|clean|merge|pull))(\s+.*)?$",
        r"^(npm\s+(install|i|uninstall|update|ci))(\s+.*)?$",
        r"^(pip\s+(install|uninstall))(\s+.*)?$",
        r"^(del|rm|rmdir|remove-item|move-item|mv|cp|copy-item)(\s+.*)?$",
        r"^(mkdir|md|new-item)(\s+.*)?$",
    ]

    def evaluate(self, command: str) -> PolicyDecision:
        cmd_clean = (command or "").strip()

        if not cmd_clean:
            return PolicyDecision(
                command="",
                decision="DENIED",
                reason="Empty command cannot be executed.",
                risk_score=100,
            )

        if "\x00" in cmd_clean or len(cmd_clean) > settings.MAX_COMMAND_LENGTH:
            return PolicyDecision(
                command=cmd_clean[:128],
                decision="DENIED",
                reason="Command rejected due to invalid control characters or excessive length.",
                risk_score=100,
            )

        # 1. Check DENIED patterns across the full command (even if chained after a safe prefix)
        for pattern in self.DENIED_PATTERNS:
            if re.search(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(
                    command=cmd_clean,
                    decision="DENIED",
                    reason="Potentially destructive or prohibited OS level operation detected.",
                    risk_score=100,
                )

        # 2. Block shell chaining, pipes, redirections, command substitution, or nested shells from matching SAFE
        has_chaining = _contains_shell_chaining_or_redirection(cmd_clean)
        has_nested_shell = bool(self.NESTED_SHELL_RE.search(cmd_clean))
        if has_chaining or has_nested_shell:
            return PolicyDecision(
                command=cmd_clean,
                decision="CONFIRMATION_REQUIRED",
                reason="Shell chaining, redirection, pipe, or nested shell operator requires explicit developer approval.",
                risk_score=85,
            )

        # 3. Check SAFE patterns strictly (disallow unsafe git execution flags)
        for pattern in self.SAFE_PATTERNS:
            if re.match(pattern, cmd_clean, re.IGNORECASE):
                if cmd_clean.lower().startswith("git ") and self.UNSAFE_GIT_FLAGS_RE.search(cmd_clean):
                    return PolicyDecision(
                        command=cmd_clean,
                        decision="CONFIRMATION_REQUIRED",
                        reason="Git override flags (-c/--exec-path/--ext-diff) require explicit confirmation.",
                        risk_score=75,
                    )
                return PolicyDecision(
                    command=cmd_clean,
                    decision="SAFE",
                    reason="Read-only or sanctioned verification command.",
                    risk_score=10,
                )

        # 4. Check CONFIRMATION patterns
        for pattern in self.CONFIRMATION_PATTERNS:
            if re.match(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(
                    command=cmd_clean,
                    decision="CONFIRMATION_REQUIRED",
                    reason="Mutates repository filesystem state or package dependencies.",
                    risk_score=60,
                )

        # 5. Fail-safe default for unrecognized commands
        return PolicyDecision(
            command=cmd_clean,
            decision="CONFIRMATION_REQUIRED",
            reason="Unclassified arbitrary shell execution requires explicit human authorization.",
            risk_score=75,
        )
