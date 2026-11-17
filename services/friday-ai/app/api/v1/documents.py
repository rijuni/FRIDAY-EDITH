import asyncio
import os
import tempfile
from fastapi import APIRouter, Depends, File, Header, Request, UploadFile
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
        if len(chunks_buf) > settings.MAX_BUFFERED_UPLOAD_SIZE_BYTES:
            raise DocumentTooLargeException(settings.MAX_BUFFERED_UPLOAD_SIZE_BYTES)

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


@router.put("/parse-stream")
async def parse_document_stream(
    request: Request,
    filename: str,
    mime_type: str = Header(alias="X-File-Mime-Type"),
    user_id: str = Depends(verify_internal_caller)
):
    """Stream large raw uploads to bounded temporary storage before scanning/parsing."""
    mime = mime_type.split(";", 1)[0].strip().lower()
    if mime not in document_parser.SUPPORTED_MIME_TYPES:
        raise UnsupportedDocumentFormatException(
            f"Unsupported format: {mime}. Supported: {sorted(document_parser.SUPPORTED_MIME_TYPES)}"
        )

    temp_path = None
    temp_file = None
    total_bytes = 0
    try:
        temp_file = tempfile.NamedTemporaryFile(prefix="friday-upload-", suffix=".tmp", delete=False)
        temp_path = temp_file.name
        async for part in request.stream():
            total_bytes += len(part)
            if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                raise DocumentTooLargeException(settings.MAX_UPLOAD_SIZE_BYTES)
            if part:
                await asyncio.to_thread(temp_file.write, part)
        await asyncio.to_thread(temp_file.flush)
        await asyncio.to_thread(temp_file.close)
        temp_file = None
        if total_bytes == 0:
            raise UnsupportedDocumentFormatException("Document content is empty.")

        scan_result = await malware_scanner.scan_file(temp_path)
        parse_task = asyncio.create_task(asyncio.to_thread(document_parser.parse_file, filename, temp_path, mime))
        try:
            parsed = await asyncio.wait_for(
                asyncio.shield(parse_task),
                timeout=settings.DOCUMENT_PARSE_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            cleanup_path = temp_path
            temp_path = None

            def remove_after_parse(_task):
                try:
                    os.unlink(cleanup_path)
                except FileNotFoundError:
                    pass

            parse_task.add_done_callback(remove_after_parse)
            raise
        parsed["malware_scan"] = scan_result
        return {"status": "success", "ownerUserId": user_id, "data": parsed}
    except asyncio.TimeoutError as exc:
        raise FridayAIException(
            message="Document parsing timed out.",
            status_code=504,
            error_code="DOCUMENT_PARSE_TIMEOUT"
        ) from exc
    finally:
        if temp_file is not None:
            temp_file.close()
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass

