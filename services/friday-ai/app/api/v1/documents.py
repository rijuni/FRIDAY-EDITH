import asyncio
from fastapi import APIRouter, Depends, File, UploadFile
from app.core.auth import verify_internal_caller
from app.core.config import settings
from app.core.errors import (
    DocumentTooLargeException,
    FridayAIException,
    UnsupportedDocumentFormatException
)
from app.ingestion.parser import document_parser
from app.ingestion.malware import malware_scanner

router = APIRouter()

UPLOAD_READ_CHUNK = 64 * 1024


@router.post("/parse")
async def parse_document(
    file: UploadFile = File(...),
    user_id: str = Depends(verify_internal_caller)
):
    mime = (file.content_type or "text/plain").split(";")[0].strip().lower()
    if mime not in document_parser.SUPPORTED_MIME_TYPES:
        raise UnsupportedDocumentFormatException(
            f"Unsupported format: {mime}. Supported: {sorted(document_parser.SUPPORTED_MIME_TYPES)}"
        )

    chunks_buf = bytearray()
    while True:
        part = await file.read(UPLOAD_READ_CHUNK)
        if not part:
            break
        chunks_buf.extend(part)
        if len(chunks_buf) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise DocumentTooLargeException(settings.MAX_UPLOAD_SIZE_BYTES)

    try:
        scan_result = await malware_scanner.scan(bytes(chunks_buf))
        parsed = await asyncio.wait_for(
            asyncio.to_thread(
                document_parser.parse_content,
                file.filename or "document.txt",
                bytes(chunks_buf),
                mime
            ),
            timeout=settings.DOCUMENT_PARSE_TIMEOUT_SECONDS
        )
        parsed["malware_scan"] = scan_result
    except asyncio.TimeoutError as exc:
        raise FridayAIException(
            message="Document parsing timed out.",
            status_code=504,
            error_code="DOCUMENT_PARSE_TIMEOUT"
        ) from exc
    finally:
        await file.close()

    return {
        "status": "success",
        "ownerUserId": user_id,
        "data": parsed
    }

