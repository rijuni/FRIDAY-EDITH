import json
from typing import Dict, Any, List


class DocumentParser:
    """
    Safe document text extraction pipeline for plain text, markdown, CSV, and JSON data.
    """

    SUPPORTED_MIME_TYPES = {
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/json"
    }

    def parse_content(self, filename: str, content_bytes: bytes, mime_type: str) -> Dict[str, Any]:
        text = content_bytes.decode("utf-8", errors="replace")

        # Chunk into segments of ~1500 chars (~350-400 tokens)
        chunk_size = 1500
        chunks = []
        for i in range(0, len(text), chunk_size):
            chunks.append({
                "chunk_index": len(chunks),
                "text": text[i:i + chunk_size],
                "char_count": len(text[i:i + chunk_size])
            })

        return {
            "filename": filename,
            "mime_type": mime_type,
            "total_chars": len(text),
            "chunk_count": len(chunks),
            "chunks": chunks
        }


document_parser = DocumentParser()

