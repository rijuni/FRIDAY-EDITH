import ast
import hashlib
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import FileReadException, WorkspaceAccessDeniedException


class FileSymbol(BaseModel):
    name: str
    symbol_type: str  # "class" | "function" | "async_function"
    line_number: int
    docstring: str = ""


class IndexedFile(BaseModel):
    relative_path: str
    extension: str
    size_bytes: int
    symbols: List[FileSymbol] = Field(default_factory=list)


class RepositoryIndexer:
    """Indexes allowlisted repository workspaces and safely reads workspace files."""

    IGNORE_DIRS = {
        ".git",
        "node_modules",
        ".venv",
        "__pycache__",
        "dist",
        "build",
        ".idea",
        ".vscode",
        "coverage",
        ".next",
        ".pytest_cache",
    }

    def __init__(self, allowed_roots: Optional[List[str]] = None):
        self._explicit_allowed_roots = allowed_roots

    def _get_allowed_roots(self) -> List[Path]:
        raw_roots = (
            self._explicit_allowed_roots
            if self._explicit_allowed_roots is not None
            else settings.allowed_workspace_roots_list
        )
        return [Path(r).resolve() for r in raw_roots if str(r).strip()]

    def resolve_workspace_root(self, root_dir: Optional[str] = None) -> Path:
        candidate = Path(root_dir or settings.DEFAULT_WORKSPACE_DIR).resolve()
        allowed_roots = self._get_allowed_roots()
        if not any(candidate == allowed or candidate.is_relative_to(allowed) for allowed in allowed_roots):
            raise WorkspaceAccessDeniedException(
                f"Workspace path '{root_dir}' is outside configured ALLOWED_WORKSPACE_ROOTS."
            )
        return candidate

    def resolve_safe_file(self, root_dir: Optional[str], relative_path: str) -> tuple[Path, Path]:
        resolved_root = self.resolve_workspace_root(root_dir)
        clean_rel = (relative_path or "").strip()
        if not clean_rel or "\x00" in clean_rel:
            raise FileReadException("Invalid file path.")
        candidate = (resolved_root / clean_rel).resolve()
        if not candidate.is_relative_to(resolved_root):
            raise WorkspaceAccessDeniedException(
                "Target file path escapes allowlisted workspace root."
            )
        return resolved_root, candidate

    def read_workspace_file(self, root_dir: Optional[str], relative_path: str) -> Dict[str, Any]:
        resolved_root, file_path = self.resolve_safe_file(root_dir, relative_path)
        if not file_path.exists() or not file_path.is_file():
            raise FileReadException(f"File not found: {relative_path}", status_code=404)

        size_bytes = file_path.stat().st_size
        if size_bytes > settings.MAX_READ_BYTES:
            raise FileReadException(
                f"File '{relative_path}' exceeds maximum preview size ({settings.MAX_READ_BYTES} bytes).",
                status_code=413,
            )

        raw = file_path.read_bytes()
        if b"\x00" in raw:
            raise FileReadException(f"Binary files are not supported in IDE viewer: {relative_path}")

        content = raw.decode("utf-8", errors="replace")
        norm_rel = os.path.relpath(str(file_path), str(resolved_root)).replace("\\", "/")
        checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return {
            "relative_path": norm_rel,
            "content": content,
            "size_bytes": size_bytes,
            "checksum": checksum,
        }

    def scan_file_tree(self, root_dir: Optional[str] = None, max_files: int = 100) -> List[IndexedFile]:
        resolved_root = self.resolve_workspace_root(root_dir)
        bounded_max = max(1, min(int(max_files or 100), settings.MAX_SCAN_FILES))
        indexed: List[IndexedFile] = []

        if not resolved_root.exists():
            return indexed

        for dirpath, dirnames, filenames in os.walk(str(resolved_root), followlinks=False):
            # Prune ignored directories and symlinks in-place
            dirnames[:] = sorted(
                d
                for d in dirnames
                if d not in self.IGNORE_DIRS and not os.path.islink(os.path.join(dirpath, d))
            )

            for fname in sorted(filenames):
                if len(indexed) >= bounded_max:
                    return indexed

                full_path = os.path.join(dirpath, fname)
                if os.path.islink(full_path):
                    continue

                try:
                    real_file = Path(full_path).resolve()
                    if not real_file.is_relative_to(resolved_root):
                        continue
                    size = real_file.stat().st_size
                except OSError:
                    continue

                rel_path = os.path.relpath(str(real_file), str(resolved_root)).replace("\\", "/")
                ext = os.path.splitext(fname)[1]

                symbols: List[FileSymbol] = []
                if ext == ".py" and size <= settings.MAX_PARSE_BYTES:
                    symbols = self._extract_python_symbols(str(real_file))

                indexed.append(
                    IndexedFile(
                        relative_path=rel_path,
                        extension=ext,
                        size_bytes=size,
                        symbols=symbols,
                    )
                )

        return indexed

    def _extract_python_symbols(self, file_path: str) -> List[FileSymbol]:
        symbols: List[FileSymbol] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                tree = ast.parse(f.read(), filename=file_path)

            for node in ast.iter_child_nodes(tree):
                if isinstance(node, ast.FunctionDef):
                    symbols.append(
                        FileSymbol(
                            name=node.name,
                            symbol_type="function",
                            line_number=node.lineno,
                            docstring=ast.get_docstring(node) or "",
                        )
                    )
                elif isinstance(node, ast.AsyncFunctionDef):
                    symbols.append(
                        FileSymbol(
                            name=node.name,
                            symbol_type="async_function",
                            line_number=node.lineno,
                            docstring=ast.get_docstring(node) or "",
                        )
                    )
                elif isinstance(node, ast.ClassDef):
                    symbols.append(
                        FileSymbol(
                            name=node.name,
                            symbol_type="class",
                            line_number=node.lineno,
                            docstring=ast.get_docstring(node) or "",
                        )
                    )
        except Exception:
            pass
        return symbols
