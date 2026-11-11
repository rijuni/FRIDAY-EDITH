from fastapi import APIRouter, UploadFile, File, HTTPException
from app.ingestion.parser import document_parser

router = APIRouter()


@router.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    mime = file.content_type or "text/plain"
    if mime not in document_parser.SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {mime}. Supported: {list(document_parser.SUPPORTED_MIME_TYPES)}"
        )

    content = await file.read()
    parsed = document_parser.parse_content(file.filename or "document.txt", content, mime)
    return {
        "status": "success",
        "data": parsed
    }

