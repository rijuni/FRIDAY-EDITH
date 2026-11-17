import csv
import io
import json
import os
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree

from app.core.config import settings
from app.core.errors import DocumentTooLargeException, FridayAIException, UnsupportedDocumentFormatException


class DocumentParser:
    """Bounded, in-memory text extraction for common office and text documents."""

    EXTENSION_MIME_TYPES = {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".csv": "text/csv",
        ".json": "application/json",
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    SUPPORTED_MIME_TYPES = set(EXTENSION_MIME_TYPES.values())
    MAX_EXTRACTED_CHARS = 4 * 1024 * 1024
    MAX_ZIP_MEMBERS = 10_000
    MAX_ZIP_UNCOMPRESSED_BYTES = 10 * 1024 * 1024
    MAX_PDF_PAGES = 100
    MAX_SHEETS = 20
    MAX_SHEET_ROWS = 10_000
    MAX_SHEET_COLUMNS = 200

    def _safe_archive(self, content_bytes: bytes | str) -> zipfile.ZipFile:
        if isinstance(content_bytes, bytes):
            archive_source = io.BytesIO(content_bytes)
            signature = content_bytes[:4]
        else:
            archive_source = content_bytes
            with open(content_bytes, "rb") as source:
                signature = source.read(4)
        if signature != b"PK\x03\x04":
            raise UnsupportedDocumentFormatException("Office document has an invalid ZIP signature.")
        try:
            archive = zipfile.ZipFile(archive_source)
            members = archive.infolist()
            if len(members) > self.MAX_ZIP_MEMBERS:
                archive.close()
                raise UnsupportedDocumentFormatException("Office document contains too many entries.")
            expanded_size = 0
            for item in members:
                member_path = PurePosixPath(item.filename)
                if member_path.is_absolute() or ".." in member_path.parts or "\\" in item.filename:
                    archive.close()
                    raise UnsupportedDocumentFormatException("Office document contains an unsafe archive path.")
                expanded_size += item.file_size
                if expanded_size > self.MAX_ZIP_UNCOMPRESSED_BYTES:
                    archive.close()
                    raise UnsupportedDocumentFormatException("Office document expands beyond the safe parsing limit.")
                if item.compress_size == 0 and item.file_size > 0:
                    archive.close()
                    raise UnsupportedDocumentFormatException("Office document has an invalid compressed entry.")
                if item.compress_size and item.file_size / item.compress_size > 250:
                    archive.close()
                    raise UnsupportedDocumentFormatException("Office document compression ratio exceeds the safe limit.")
            if archive.testzip() is not None:
                archive.close()
                raise UnsupportedDocumentFormatException("Office document archive failed integrity validation.")
            return archive
        except UnsupportedDocumentFormatException:
            raise
        except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
            raise UnsupportedDocumentFormatException("Office document archive is malformed.") from exc

    def _extract_pdf(self, content_bytes: bytes | None = None, source_path: str | None = None) -> str:
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise FridayAIException(
                "PDF parsing dependency is unavailable. Install the Friday AI service dependencies.",
                503,
                "FILE_PARSER_UNAVAILABLE",
            ) from exc
        try:
            source = open(source_path, "rb") if source_path else io.BytesIO(content_bytes or b"")
            with source:
                if source.read(5) != b"%PDF-":
                    raise UnsupportedDocumentFormatException("PDF signature or end marker is invalid.")
                source.seek(0, 2)
                size = source.tell()
                source.seek(max(0, size - 2048))
                if b"%%EOF" not in source.read():
                    raise UnsupportedDocumentFormatException("PDF signature or end marker is invalid.")
                source.seek(0)
                reader = PdfReader(source, strict=True)
                return self._extract_pdf_reader(reader)
        except UnsupportedDocumentFormatException:
            raise
        except Exception as exc:
            raise UnsupportedDocumentFormatException("PDF could not be parsed safely.") from exc

    def _extract_pdf_reader(self, reader) -> str:
        try:
            if reader.is_encrypted:
                raise UnsupportedDocumentFormatException("Encrypted PDFs are not supported.")
            if len(reader.pages) > self.MAX_PDF_PAGES:
                raise UnsupportedDocumentFormatException("PDF exceeds the 100 page parsing limit.")
            pages = []
            total_chars = 0
            for page in reader.pages:
                contents = page.get_contents()
                if contents and len(contents.get_data()) > self.MAX_EXTRACTED_CHARS:
                    raise UnsupportedDocumentFormatException("PDF page content stream exceeds the parsing limit.")
                page_text = page.extract_text() or ""
                total_chars += len(page_text)
                if total_chars > self.MAX_EXTRACTED_CHARS:
                    raise UnsupportedDocumentFormatException("PDF extracted text exceeds the parsing limit.")
                pages.append(page_text)
            text = "\n\n".join(pages).strip()
            if not text:
                raise UnsupportedDocumentFormatException("PDF contains no extractable text; scanned-image OCR is not enabled.")
            return text
        except UnsupportedDocumentFormatException:
            raise

    def _extract_docx(self, archive: zipfile.ZipFile) -> str:
        if "word/document.xml" not in archive.namelist():
            raise UnsupportedDocumentFormatException("DOCX document structure is invalid.")
        try:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        except (ElementTree.ParseError, KeyError) as exc:
            raise UnsupportedDocumentFormatException("DOCX document XML is malformed.") from exc
        paragraphs = []
        for paragraph in root.iter():
            if not paragraph.tag.endswith("}p"):
                continue
            fragments = [node.text or "" for node in paragraph.iter() if node.tag.endswith("}t")]
            value = "".join(fragments).strip()
            if value:
                paragraphs.append(value)
        return "\n".join(paragraphs)

    def _extract_xlsx(self, content_bytes: bytes | str) -> str:
        archive = self._safe_archive(content_bytes)
        try:
            if "xl/workbook.xml" not in archive.namelist():
                raise UnsupportedDocumentFormatException("XLSX workbook structure is invalid.")
        finally:
            archive.close()
        try:
            from openpyxl import load_workbook
        except ImportError as exc:
            raise FridayAIException(
                "XLSX parsing dependency is unavailable. Install the Friday AI service dependencies.",
                503,
                "FILE_PARSER_UNAVAILABLE",
            ) from exc
        try:
            workbook_source = io.BytesIO(content_bytes) if isinstance(content_bytes, bytes) else content_bytes
            workbook = load_workbook(workbook_source, read_only=True, data_only=True, keep_links=False)
        except Exception as exc:
            raise UnsupportedDocumentFormatException("XLSX workbook could not be parsed safely.") from exc
        lines = []
        total_chars = 0
        try:
            for sheet in workbook.worksheets[:self.MAX_SHEETS]:
                lines.append(f"[Worksheet: {sheet.title}]")
                for row_number, row in enumerate(sheet.iter_rows(values_only=True), start=1):
                    if row_number > self.MAX_SHEET_ROWS:
                        break
                    cells = [str(value).strip() if value is not None else "" for value in row[:self.MAX_SHEET_COLUMNS]]
                    rendered = "\t".join(cells).rstrip()
                    if rendered:
                        lines.append(rendered)
                        total_chars += len(rendered)
                        if total_chars > self.MAX_EXTRACTED_CHARS:
                            raise UnsupportedDocumentFormatException("XLSX extracted text exceeds the parsing limit.")
        finally:
            workbook.close()
        return "\n".join(lines)

    def _chunk(self, text: str) -> list[dict]:
        chunk_size = 1500
        overlap = 120
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            if end < len(text):
                boundary = max(text.rfind("\n\n", start, end), text.rfind("\n", start, end), text.rfind(". ", start, end))
                if boundary > start + chunk_size // 2:
                    end = boundary + (2 if text[boundary:boundary + 2] == ". " else 1)
            segment = text[start:end].strip()
            if segment:
                chunks.append({"chunk_index": len(chunks), "text": segment, "char_count": len(segment)})
            if end >= len(text):
                break
            start = max(start + 1, end - overlap)
        return chunks

    def parse_content(self, filename: str, content_bytes: bytes, mime_type: str) -> dict:
        safe_filename = re.sub(r"[\x00-\x1f\x7f]", "", (filename or "").replace("\\", "/").split("/")[-1]).strip()
        extension = PurePosixPath(safe_filename).suffix.lower()
        expected_mime = self.EXTENSION_MIME_TYPES.get(extension)
        if not expected_mime:
            raise UnsupportedDocumentFormatException(f"Unsupported file extension '{extension}'.")
        if mime_type != expected_mime:
            raise UnsupportedDocumentFormatException("Document extension and MIME type do not match.")
        if not content_bytes:
            raise UnsupportedDocumentFormatException("Document content is empty.")
        if len(content_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise DocumentTooLargeException(settings.MAX_UPLOAD_SIZE_BYTES)

        if extension == ".pdf":
            text = self._extract_pdf(content_bytes)
        elif extension == ".docx":
            archive = self._safe_archive(content_bytes)
            try:
                text = self._extract_docx(archive)
            finally:
                archive.close()
        elif extension == ".xlsx":
            text = self._extract_xlsx(content_bytes)
        else:
            if b"\x00" in content_bytes:
                raise UnsupportedDocumentFormatException("Binary or NUL-byte text content is not permitted.")
            try:
                text = content_bytes.decode("utf-8", errors="strict")
            except UnicodeDecodeError as exc:
                raise UnsupportedDocumentFormatException("Document must be valid UTF-8 encoded text.") from exc
            if extension == ".json":
                try:
                    json.loads(text)
                except json.JSONDecodeError as exc:
                    raise UnsupportedDocumentFormatException("Malformed JSON document content.") from exc
            if extension == ".csv":
                try:
                    for _ in csv.reader(io.StringIO(text)):
                        pass
                except csv.Error as exc:
                    raise UnsupportedDocumentFormatException("Malformed CSV document content.") from exc

        if len(text) > self.MAX_EXTRACTED_CHARS:
            raise UnsupportedDocumentFormatException("Extracted document text exceeds the parsing limit.")
        chunks = self._chunk(text)
        return {
            "filename": safe_filename,
            "mime_type": mime_type,
            "total_chars": len(text),
            "total_bytes": len(content_bytes),
            "chunk_count": len(chunks),
            "chunks": chunks,
        }

    def parse_file(self, filename: str, source_path: str, mime_type: str) -> dict:
        """Parse a bounded document from disk without loading the raw upload into memory."""
        safe_filename = re.sub(r"[\x00-\x1f\x7f]", "", (filename or "").replace("\\", "/").split("/")[-1]).strip()
        extension = PurePosixPath(safe_filename).suffix.lower()
        expected_mime = self.EXTENSION_MIME_TYPES.get(extension)
        if not expected_mime:
            raise UnsupportedDocumentFormatException(f"Unsupported file extension '{extension}'.")
        if mime_type != expected_mime:
            raise UnsupportedDocumentFormatException("Document extension and MIME type do not match.")
        total_bytes = os.path.getsize(source_path)
        if total_bytes <= 0:
            raise UnsupportedDocumentFormatException("Document content is empty.")
        if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
            raise DocumentTooLargeException(settings.MAX_UPLOAD_SIZE_BYTES)

        if extension == ".pdf":
            text = self._extract_pdf(source_path=source_path)
        elif extension == ".docx":
            archive = self._safe_archive(source_path)
            try:
                text = self._extract_docx(archive)
            finally:
                archive.close()
        elif extension == ".xlsx":
            text = self._extract_xlsx(source_path)
        else:
            # UTF-8 needs at most four bytes per character. Reject larger inputs before
            # decoding; the extracted-text cap remains independent of the upload cap.
            max_text_bytes = self.MAX_EXTRACTED_CHARS * 4 + 4
            if total_bytes > max_text_bytes:
                raise UnsupportedDocumentFormatException("Extracted document text exceeds the parsing limit.")
            with open(source_path, "rb") as source:
                content_bytes = source.read(max_text_bytes + 1)
            if len(content_bytes) > max_text_bytes:
                raise UnsupportedDocumentFormatException("Extracted document text exceeds the parsing limit.")
            if b"\x00" in content_bytes:
                raise UnsupportedDocumentFormatException("Binary or NUL-byte text content is not permitted.")
            try:
                text = content_bytes.decode("utf-8", errors="strict")
            except UnicodeDecodeError as exc:
                raise UnsupportedDocumentFormatException("Document must be valid UTF-8 encoded text.") from exc
            if extension == ".json":
                try:
                    json.loads(text)
                except json.JSONDecodeError as exc:
                    raise UnsupportedDocumentFormatException("Malformed JSON document content.") from exc
            if extension == ".csv":
                try:
                    for _ in csv.reader(io.StringIO(text)):
                        pass
                except csv.Error as exc:
                    raise UnsupportedDocumentFormatException("Malformed CSV document content.") from exc

        if len(text) > self.MAX_EXTRACTED_CHARS:
            raise UnsupportedDocumentFormatException("Extracted document text exceeds the parsing limit.")
        chunks = self._chunk(text)
        return {
            "filename": safe_filename,
            "mime_type": mime_type,
            "total_chars": len(text),
            "total_bytes": total_bytes,
            "chunk_count": len(chunks),
            "chunks": chunks,
        }


document_parser = DocumentParser()
