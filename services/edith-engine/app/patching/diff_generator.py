import difflib
import hashlib
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel

_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


class PatchHunk(BaseModel):
    hunk_header: str
    old_start: int
    old_length: int
    new_start: int
    new_length: int
    lines: List[str]


class UnifiedDiffResult(BaseModel):
    file_path: str
    original_checksum: str
    modified_checksum: str
    diff_text: str
    hunks_count: int
    is_identical: bool


class PatchApplyResult(BaseModel):
    original_checksum: str
    modified_checksum: str
    modified_content: str
    hunks_applied: int


class DiffEngine:
    """Generates standard unified diffs and applies hunk patches strictly."""

    @staticmethod
    def compute_checksum(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def generate_diff(
        self, file_path: str, original_content: str, modified_content: str
    ) -> UnifiedDiffResult:
        clean_path = (file_path or "untitled").replace("\\", "/").lstrip("/")
        orig_sum = self.compute_checksum(original_content)
        mod_sum = self.compute_checksum(modified_content)

        if orig_sum == mod_sum:
            return UnifiedDiffResult(
                file_path=clean_path,
                original_checksum=orig_sum,
                modified_checksum=mod_sum,
                diff_text="",
                hunks_count=0,
                is_identical=True,
            )

        orig_lines = original_content.splitlines(keepends=True)
        mod_lines = modified_content.splitlines(keepends=True)

        diff = list(
            difflib.unified_diff(
                orig_lines,
                mod_lines,
                fromfile=f"a/{clean_path}",
                tofile=f"b/{clean_path}",
                lineterm="\n",
            )
        )

        # Ensure lines missing trailing newlines are unambiguously represented
        normalized_diff: List[str] = []
        for entry in diff:
            if not entry.endswith(("\n", "\r\n")):
                normalized_diff.append(entry + "\n\\ No newline at end of file\n")
            else:
                normalized_diff.append(entry)

        diff_text = "".join(normalized_diff)
        hunks_count = sum(1 for line in normalized_diff if line.startswith("@@"))

        return UnifiedDiffResult(
            file_path=clean_path,
            original_checksum=orig_sum,
            modified_checksum=mod_sum,
            diff_text=diff_text,
            hunks_count=hunks_count,
            is_identical=False,
        )

    def apply_patch(self, original_content: str, patch_text: str) -> str:
        """Strictly parse and apply a unified diff patch to original_content."""
        if not patch_text or not patch_text.strip():
            return original_content

        patch_lines = patch_text.splitlines(keepends=True)
        orig_lines = original_content.splitlines(keepends=True)
        default_newline = "\r\n" if "\r\n" in original_content else "\n"

        # Skip optional header lines until the first hunk
        idx = 0
        while idx < len(patch_lines) and not patch_lines[idx].startswith("@@"):
            idx += 1

        if idx >= len(patch_lines):
            raise ValueError("Invalid unified diff: no @@ hunk headers found.")

        result_lines: List[str] = []
        orig_cursor = 0
        hunks_applied = 0

        while idx < len(patch_lines):
            header = patch_lines[idx].rstrip("\r\n")
            match = _HUNK_HEADER_RE.match(header)
            if not match:
                # Ignore trailing blank lines after hunks
                if not header.strip():
                    idx += 1
                    continue
                raise ValueError(f"Malformed unified diff hunk header: {header}")

            old_start = int(match.group(1))
            old_count = int(match.group(2)) if match.group(2) is not None else 1
            new_count = int(match.group(4)) if match.group(4) is not None else 1
            idx += 1

            # Collect raw operations for this hunk
            hunk_ops: List[Tuple[str, str, bool]] = []
            while idx < len(patch_lines):
                raw_line = patch_lines[idx]
                if raw_line.startswith("@@") or raw_line.startswith("diff --git "):
                    break
                if raw_line.startswith("--- ") or raw_line.startswith("+++ "):
                    # Only treat as next file header if outside active hunk counts
                    old_tally = sum(1 for op, _, _ in hunk_ops if op in (" ", "-"))
                    new_tally = sum(1 for op, _, _ in hunk_ops if op in (" ", "+"))
                    if old_tally >= old_count and new_tally >= new_count:
                        break

                if raw_line.startswith("\\ No newline at end of file"):
                    if hunk_ops:
                        prev_op, prev_text, _ = hunk_ops[-1]
                        hunk_ops[-1] = (prev_op, prev_text.rstrip("\r\n"), False)
                    idx += 1
                    continue

                if not raw_line:
                    idx += 1
                    continue

                op = raw_line[0]
                if op not in (" ", "-", "+"):
                    raise ValueError(f"Unexpected diff line prefix {op!r} inside hunk.")

                has_nl = raw_line.endswith(("\n", "\r\n"))
                payload = raw_line[1:]
                hunk_ops.append((op, payload, has_nl))
                idx += 1

            # Verify hunk counts
            old_tally = sum(1 for op, _, _ in hunk_ops if op in (" ", "-"))
            new_tally = sum(1 for op, _, _ in hunk_ops if op in (" ", "+"))
            if old_tally != old_count or new_tally != new_count:
                raise ValueError(
                    f"Hunk line count mismatch in {header}: "
                    f"expected (-{old_count},+{new_count}), got (-{old_tally},+{new_tally})."
                )

            target_index = 0 if (old_start == 0 and old_count == 0) else max(old_start - 1, 0)
            if target_index < orig_cursor or target_index > len(orig_lines):
                raise ValueError(
                    f"Hunk target line {old_start} out of range (cursor={orig_cursor}, lines={len(orig_lines)})."
                )

            result_lines.extend(orig_lines[orig_cursor:target_index])
            orig_cursor = target_index

            for op, payload, has_nl in hunk_ops:
                if op in (" ", "-"):
                    if orig_cursor >= len(orig_lines):
                        raise ValueError(f"Patch context exceeds original file length at line {orig_cursor + 1}.")
                    actual = orig_lines[orig_cursor]
                    if actual.rstrip("\r\n") != payload.rstrip("\r\n"):
                        raise ValueError(
                            f"Patch context mismatch at line {orig_cursor + 1}: "
                            f"expected {payload.rstrip()!r}, found {actual.rstrip()!r}."
                        )
                    if op == " ":
                        result_lines.append(actual)
                    orig_cursor += 1
                elif op == "+":
                    line_text = payload
                    if not has_nl:
                        line_text = line_text.rstrip("\r\n")
                    elif not line_text.endswith(("\n", "\r\n")):
                        line_text = line_text + default_newline
                    result_lines.append(line_text)

            hunks_applied += 1

        if hunks_applied == 0:
            raise ValueError("Unified diff contained zero applicable hunks.")

        result_lines.extend(orig_lines[orig_cursor:])
        return "".join(result_lines)
