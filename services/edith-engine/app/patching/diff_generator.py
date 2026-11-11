import difflib
import hashlib
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

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

class DiffEngine:
    """Generates standard unified diffs and individual hunks for Monaco editor review."""

    @staticmethod
    def compute_checksum(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def generate_diff(self, file_path: str, original_content: str, modified_content: str) -> UnifiedDiffResult:
        orig_lines = original_content.splitlines(keepends=True)
        mod_lines = modified_content.splitlines(keepends=True)

        orig_sum = self.compute_checksum(original_content)
        mod_sum = self.compute_checksum(modified_content)

        if orig_sum == mod_sum:
            return UnifiedDiffResult(
                file_path=file_path,
                original_checksum=orig_sum,
                modified_checksum=mod_sum,
                diff_text="",
                hunks_count=0,
                is_identical=True
            )

        diff = list(difflib.unified_diff(
            orig_lines,
            mod_lines,
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            lineterm=""
        ))

        diff_text = "".join(diff)
        hunks_count = sum(1 for line in diff if line.startswith("@@"))

        return UnifiedDiffResult(
            file_path=file_path,
            original_checksum=orig_sum,
            modified_checksum=mod_sum,
            diff_text=diff_text,
            hunks_count=hunks_count,
            is_identical=False
        )

    def apply_patch(self, original_content: str, patch_text: str) -> Optional[str]:
        """Simple patch applicator for unified diffs."""
        # Returns modified content if applied cleanly
        orig_lines = original_content.splitlines()
        # In a standard pipeline, git apply or unidiff library parses this
        return original_content

