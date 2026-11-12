import json
from pathlib import Path
from typing import Dict, Any
from app.core.errors import UnsupportedDocumentFormatException


class DocumentParser:
    """
    Safe document text extraction pipeline for plain text, markdown, CSV, and JSON data.
    Validates content encoding, binary absence, and JSON syntax cleanly.
    """

    SUPPORTED_MIME_TYPES = {
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/json"
    }

    SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ""}

    def parse_content(self, filename: str, content_bytes: bytes, mime_type: str) -> Dict[str, Any]:
        if mime_type not in self.SUPPORTED_MIME_TYPES:
            raise UnsupportedDocumentFormatException(
                f"Unsupported MIME type '{mime_type}'. Allowed: {sorted(self.SUPPORTED_MIME_TYPES)}"
            )

        ext = Path(filename or "document.txt").suffix.lower()
        if ext not in self.SUPPORTED_EXTENSIONS:
            raise UnsupportedDocumentFormatException(
                f"Unsupported file extension '{ext}'."
            )

        if b"\x00" in content_bytes:
            raise UnsupportedDocumentFormatException("Binary or NUL-byte content is not permitted for text ingestion.")

        try:
            text = content_bytes.decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            raise UnsupportedDocumentFormatException("Document must be valid UTF-8 encoded text.") from exc

        if mime_type == "application/json":
            try:
                json.loads(text)
            except json.JSONDecodeError as exc:
                raise UnsupportedDocumentFormatException("Malformed JSON document content.") from exc

        # Chunk into segments of ~1500 chars (~350-400 tokens)
        chunk_size = 1500
        chunks = []
        for i in range(0, len(text), chunk_size):
            segment = text[i:i + chunk_size]
            chunks.append({
                "chunk_index": len(chunks),
                "text": segment,
                "char_count": len(segment)
            })

        return {
            "filename": Path(filename or "document.txt").name,
            "mime_type": mime_type,
            "total_chars": len(text),
            "chunk_count": len(chunks),
            "chunks": chunks
        }


document_parser = DocumentParser()

