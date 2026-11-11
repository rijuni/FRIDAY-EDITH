import os
import ast
from typing import List, Dict, Any
from pydantic import BaseModel, Field

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
    """Indexes repository file hierarchy and extracts AST symbols."""

    IGNORE_DIRS = {
        ".git", "node_modules", ".venv", "__pycache__", "dist",
        "build", ".idea", ".vscode", "coverage", ".next"
    }

    def scan_file_tree(self, root_dir: str, max_files: int = 100) -> List[IndexedFile]:
        indexed: List[IndexedFile] = []
        if not os.path.exists(root_dir):
            return indexed

        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune ignored directories in-place
            dirnames[:] = [d for d in dirnames if d not in self.IGNORE_DIRS]

            for fname in filenames:
                if len(indexed) >= max_files:
                    return indexed

                full_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(full_path, root_dir).replace("\\", "/")
                ext = os.path.splitext(fname)[1]

                symbols: List[FileSymbol] = []
                # If Python file, extract AST symbols
                if ext == ".py":
                    symbols = self._extract_python_symbols(full_path)

                try:
                    size = os.path.getsize(full_path)
                except OSError:
                    size = 0

                indexed.append(IndexedFile(
                    relative_path=rel_path,
                    extension=ext,
                    size_bytes=size,
                    symbols=symbols
                ))

        return indexed

    def _extract_python_symbols(self, file_path: str) -> List[FileSymbol]:
        symbols: List[FileSymbol] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                tree = ast.parse(f.read(), filename=file_path)

            for node in ast.iter_child_nodes(tree):
                if isinstance(node, ast.FunctionDef):
                    symbols.append(FileSymbol(
                        name=node.name,
                        symbol_type="function",
                        line_number=node.lineno,
                        docstring=ast.get_docstring(node) or ""
                    ))
                elif isinstance(node, ast.AsyncFunctionDef):
                    symbols.append(FileSymbol(
                        name=node.name,
                        symbol_type="async_function",
                        line_number=node.lineno,
                        docstring=ast.get_docstring(node) or ""
                    ))
                elif isinstance(node, ast.ClassDef):
                    symbols.append(FileSymbol(
                        name=node.name,
                        symbol_type="class",
                        line_number=node.lineno,
                        docstring=ast.get_docstring(node) or ""
                    ))
        except Exception:
            pass
        return symbols

