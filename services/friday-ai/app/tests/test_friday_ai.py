import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.errors import ProviderConfigurationException, FridayAIException
from app.core.logging import RedactingContextFilter
from app.context.window import context_manager
from app.rag.retriever import retriever
from app.ingestion.parser import document_parser
from app.orchestration.router import ModelRouter, router as model_router
from app.providers.base import NormalizedChunk
from app.providers.http_providers import AnthropicProvider, GeminiProvider, OpenAIProvider
import app.providers.http_providers as http_providers
import asyncio
import io
import zipfile
from app.core.errors import MalwareDetectedException, MalwareScannerUnavailableException
from app.ingestion.malware import MalwareScanner
import logging

client = TestClient(app)
INTERNAL_HEADERS = {
    "X-Internal-Service-Token": settings.INTERNAL_SERVICE_SECRET,
    "X-User-Id": "usr_test_owner",
    "X-Request-Id": "req-test-123"
}


def test_health_check():
    response = client.get("/v1/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" not in data, "Minimal liveness check must not leak deployment metadata"
    assert response.headers.get("x-request-id")


def test_internal_auth_required():
    payload = {
        "model": "claude-3-7-sonnet",
        "messages": [{"role": "user", "content": "Hello"}]
    }
    no_secret = client.post("/v1/chat/stream", json=payload)
    assert no_secret.status_code == 401
    assert no_secret.json()["errorCode"] == "UNAUTHORIZED_INTERNAL_CALLER"

    bad_secret = client.post(
        "/v1/chat/stream",
        json=payload,
        headers={"X-Internal-Service-Token": "wrong-secret", "X-User-Id": "usr_1"}
    )
    assert bad_secret.status_code == 401

    no_user = client.post(
        "/v1/chat/stream",
        json=payload,
        headers={"X-Internal-Service-Token": settings.INTERNAL_SERVICE_SECRET}
    )
    assert no_user.status_code == 401


def test_chat_stream_authorized_and_labeled():
    import json

    payload = {
        "model": "claude-3-7-sonnet",
        "messages": [
            {"role": "user", "content": "Initialize F.R.I.D.A.Y. systems"}
        ],
        "temperature": 0.5,
        "max_tokens": 1024
    }
    response = client.post("/v1/chat/stream", json=payload, headers=INTERNAL_HEADERS)
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "req-test-123"
    assert "text/event-stream" in response.headers["content-type"]

    events = []
    full_text = ""
    for line in response.text.splitlines():
        if line.startswith("data: "):
            frame = json.loads(line[6:])
            events.append(frame)
            if frame.get("event") == "chunk":
                full_text += frame.get("text", "")

    assert any(e.get("event") == "thinking" for e in events)
    assert any(e.get("event") == "done" for e in events)
    assert all(e.get("metadata", {}).get("is_mock") is True for e in events if e.get("event") != "error")
    assert "Simulated Response" in full_text


def test_document_parse_and_validation():
    sample_text = b"FRIDAY Architecture: Dual React UI, Express Backend, Python AI."
    response = client.post(
        "/v1/documents/parse",
        headers=INTERNAL_HEADERS,
        files={"file": ("architecture.txt", sample_text, "text/plain")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["ownerUserId"] == "usr_test_owner"
    assert data["data"]["chunk_count"] == 1

    # Binary NUL-byte rejection
    binary_res = client.post(
        "/v1/documents/parse",
        headers=INTERNAL_HEADERS,
        files={"file": ("evil.txt", b"abc\x00def", "text/plain")}
    )
    assert binary_res.status_code == 400
    assert binary_res.json()["errorCode"] == "UNSUPPORTED_DOCUMENT_FORMAT"

    # Malformed JSON rejection
    bad_json_res = client.post(
        "/v1/documents/parse",
        headers=INTERNAL_HEADERS,
        files={"file": ("broken.json", b"{not-valid-json", "application/json")}
    )
    assert bad_json_res.status_code == 400

    # Unsupported MIME rejection
    bad_mime_res = client.post(
        "/v1/documents/parse",
        headers=INTERNAL_HEADERS,
        files={"file": ("payload.exe", b"MZ", "application/octet-stream")}
    )
    assert bad_mime_res.status_code == 400

    bad_pdf = client.post(
        "/v1/documents/parse", headers=INTERNAL_HEADERS,
        files={"file": ("fake.pdf", b"not a PDF", "application/pdf")}
    )
    assert bad_pdf.status_code == 400


def test_docx_text_extraction_and_zip_safety():
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("word/document.xml", """
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body><w:p><w:r><w:t>Safe document text</w:t></w:r></w:p></w:body>
            </w:document>
        """)
    parsed = document_parser.parse_content(
        "guide.docx", payload.getvalue(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert parsed["chunks"][0]["text"] == "Safe document text"
    unsafe = io.BytesIO()
    with zipfile.ZipFile(unsafe, "w") as archive:
        archive.writestr("../outside.txt", "not extracted")
        archive.writestr("word/document.xml", "<w:document />")
    try:
        document_parser.parse_content(
            "bad.docx", unsafe.getvalue(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        raise AssertionError("Unsafe archive path should be rejected")
    except Exception as exc:
        assert getattr(exc, "error_code", None) == "UNSUPPORTED_DOCUMENT_FORMAT"


def test_pdf_and_xlsx_document_extraction():
    content_stream = b"BT /F1 12 Tf 72 720 Td (Phase three PDF text) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content_stream)).encode() + b" >>\nstream\n" + content_stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode()
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    parsed_pdf = document_parser.parse_content("brief.pdf", bytes(pdf), "application/pdf")
    assert "Phase three PDF text" in parsed_pdf["chunks"][0]["text"]

    from openpyxl import Workbook
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Budget"
    sheet.append(["Category", "Amount"])
    sheet.append(["Hosting", 120])
    xlsx = io.BytesIO()
    workbook.save(xlsx)
    workbook.close()
    parsed_xlsx = document_parser.parse_content(
        "budget.xlsx", xlsx.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    extracted = parsed_xlsx["chunks"][0]["text"]
    assert "[Worksheet: Budget]" in extracted and "Hosting\t120" in extracted


def test_context_window_compaction():
    messages = [
        {"role": "developer", "content": "Follow strict coding standards."},
        *[
            {"role": "user" if i % 2 == 0 else "tool", "content": f"Message turn {i} with extensive context details."}
            for i in range(50)
        ]
    ]
    compacted = context_manager.prune_and_assemble(messages, system_prompt="System", max_budget=200)
    assert compacted[0]["role"] == "developer", "System/developer messages must be preserved"
    assert len(compacted) < 51
    assert len(compacted) > 1


def test_rag_user_and_workspace_isolation():
    chunks = [
        {"id": "1", "user_id": "usr_a", "workspace_id": "ws_1", "source": "secret.md", "chunk_index": 0, "text": "quantum architecture token"},
        {"id": "2", "user_id": "usr_b", "workspace_id": "ws_1", "source": "other.md", "chunk_index": 0, "text": "quantum architecture token"},
        {"id": "3", "user_id": "usr_a", "workspace_id": "ws_2", "source": "ws2.md", "chunk_index": 0, "text": "quantum architecture token"},
    ]
    results = retriever.retrieve("quantum architecture", chunks, user_id="usr_a", workspace_id="ws_1")
    assert len(results) == 1
    assert results[0]["id"] == "1"
    assert results[0]["prompt_injection_guarded"] is True
    assert '"document_text"' in results[0]["guarded_context"]
    assert retriever.retrieve("quantum", chunks, user_id="") == []


def test_log_redaction():
    log_filter = RedactingContextFilter()
    record = logging.LogRecord(
        name="friday_ai",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="Bearer secretJwtToken123 sk-testsecretkey9999",
        args=(),
        exc_info=None
    )
    log_filter.filter(record)
    assert "secretJwtToken123" not in record.msg
    assert "sk-testsecretkey9999" not in record.msg
    assert "[REDACTED]" in record.msg


def test_document_parser_rejects_mime_mismatch_and_sanitizes_filename():
    from app.core.errors import UnsupportedDocumentFormatException
    parsed = document_parser.parse_content("C:\\temp\\guide.md", b"first paragraph\n\nsecond paragraph", "text/markdown")
    assert parsed["filename"] == "guide.md"
    assert parsed["chunk_count"] == 1
    try:
        document_parser.parse_content("guide.json", b"{}", "text/plain")
        raise AssertionError("MIME mismatch should fail")
    except UnsupportedDocumentFormatException:
        pass


def test_provider_router_never_falls_back_to_mock():
    previous = (settings.FRIDAY_AI_PROVIDER, settings.OPENAI_API_KEY)
    try:
        settings.FRIDAY_AI_PROVIDER = "auto"
        settings.OPENAI_API_KEY = None
        try:
            model_router.resolve_provider("gpt-4o")
            raise AssertionError("Unconfigured real provider should fail closed")
        except ProviderConfigurationException:
            pass
        try:
            model_router.resolve_provider("invented-model")
            raise AssertionError("Unknown model should be rejected")
        except FridayAIException as exc:
            assert exc.error_code == "MODEL_NOT_AVAILABLE"
    finally:
        settings.FRIDAY_AI_PROVIDER, settings.OPENAI_API_KEY = previous


def test_openai_provider_normalizes_sse_without_network():
    class FakeResponse:
        status_code = 200
        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
            yield 'data: {"choices":[{"delta":{"content":" world"}}]}'
            yield 'data: [DONE]'
        async def aclose(self):
            return None

    class FakeClient:
        request = None
        def __init__(self, **kwargs):
            pass
        def build_request(self, method, url, headers, json):
            self.request = {"method": method, "url": url, "headers": headers, "json": json}
            FakeClient.request = self.request
            return self.request
        async def send(self, request, stream=True):
            return FakeResponse()
        async def aclose(self):
            return None

    original_client = http_providers.httpx.AsyncClient
    original_key = settings.OPENAI_API_KEY
    http_providers.httpx.AsyncClient = FakeClient
    settings.OPENAI_API_KEY = "unit-test-key"
    try:
        async def collect():
            provider = OpenAIProvider("gpt-4o")
            return [event async for event in provider.generate_stream([{"role": "user", "content": "Hi"}])]
        chunks = asyncio.run(collect())
        assert [chunk.text for chunk in chunks if chunk.event == "chunk"] == ["Hello", " world"]
        assert chunks[-1].event == "done"
        assert FakeClient.request["headers"]["Authorization"] == "Bearer unit-test-key"
        assert FakeClient.request["json"]["stream"] is True
    finally:
        http_providers.httpx.AsyncClient = original_client
        settings.OPENAI_API_KEY = original_key


def test_anthropic_and_gemini_provider_stream_normalization():
    class FakeResponse:
        status_code = 200
        def __init__(self, lines): self.lines = lines
        async def aiter_lines(self):
            for line in self.lines: yield line
        async def aclose(self): return None

    class FakeClient:
        last_request = None
        def __init__(self, **kwargs): pass
        def build_request(self, method, url, headers, json):
            FakeClient.last_request = {"method": method, "url": url, "headers": headers, "json": json}
            return FakeClient.last_request
        async def send(self, request, stream=True):
            if "anthropic.com" in request["url"]:
                return FakeResponse(['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}'])
            return FakeResponse(['data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]}}]}'])
        async def aclose(self): return None

    original_client = http_providers.httpx.AsyncClient
    original_keys = (settings.ANTHROPIC_API_KEY, settings.GEMINI_API_KEY)
    http_providers.httpx.AsyncClient = FakeClient
    settings.ANTHROPIC_API_KEY = "anthropic-test-key"
    settings.GEMINI_API_KEY = "gemini-test-key"
    try:
        async def collect(provider):
            return [chunk async for chunk in provider.generate_stream([{"role": "user", "content": "Hello"}], system_prompt="Be safe")]
        anthropic = asyncio.run(collect(AnthropicProvider(settings.ANTHROPIC_MODEL)))
        assert [item.text for item in anthropic if item.event == "chunk"] == ["Claude"]
        assert FakeClient.last_request["headers"]["x-api-key"] == "anthropic-test-key"
        assert FakeClient.last_request["json"]["system"] == "Be safe"
        gemini = asyncio.run(collect(GeminiProvider(settings.GEMINI_MODEL)))
        assert [item.text for item in gemini if item.event == "chunk"] == ["Gemini"]
        assert FakeClient.last_request["headers"]["x-goog-api-key"] == "gemini-test-key"
        assert FakeClient.last_request["json"]["systemInstruction"]["parts"][0]["text"] == "Be safe"
    finally:
        http_providers.httpx.AsyncClient = original_client
        settings.ANTHROPIC_API_KEY, settings.GEMINI_API_KEY = original_keys


def test_clamav_scanner_protocol_and_fail_closed():
    original_mode = settings.MALWARE_SCAN_MODE
    original_open = asyncio.open_connection
    class FakeReader:
        def __init__(self, response): self.response = response
        async def readuntil(self, marker): return self.response
    class FakeWriter:
        def __init__(self): self.data = bytearray()
        def write(self, data): self.data.extend(data)
        async def drain(self): return None
        def close(self): return None
        async def wait_closed(self): return None
    async def healthy_open(*args):
        writer = FakeWriter()
        return FakeReader(b"stream: OK\0"), writer
    try:
        settings.MALWARE_SCAN_MODE = "clamd"
        asyncio.open_connection = healthy_open
        assert asyncio.run(MalwareScanner().scan(b"clean sample")) == "clamav-clean"
        async def infected_open(*args):
            return FakeReader(b"stream: Eicar-Test-Signature FOUND\0"), FakeWriter()
        asyncio.open_connection = infected_open
        try:
            asyncio.run(MalwareScanner().scan(b"test signature"))
            raise AssertionError("Detected malware should be rejected")
        except MalwareDetectedException:
            pass
        async def unavailable_open(*args):
            raise OSError("clamd unavailable")
        asyncio.open_connection = unavailable_open
        try:
            asyncio.run(MalwareScanner().scan(b"clean sample"))
            raise AssertionError("Scanner failure must fail closed")
        except MalwareScannerUnavailableException:
            pass
    finally:
        settings.MALWARE_SCAN_MODE = original_mode
        asyncio.open_connection = original_open


def test_chat_stream_injects_scoped_retrieval_and_user_memory():
    captured = {}

    class TestProvider:
        model_id = "test-provider-model"
        is_mock = False
        def count_tokens(self, text):
            return max(1, len(text) // 4)
        async def generate_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
            captured["messages"] = messages
            captured["system_prompt"] = system_prompt
            yield NormalizedChunk(event="chunk", text="It is in your document.")
            yield NormalizedChunk(event="done")

    original_resolver = model_router.resolve_provider
    model_router.resolve_provider = lambda model: TestProvider()
    try:
        response = client.post(
            "/v1/chat/stream",
            headers=INTERNAL_HEADERS,
            json={
                "model": "test-provider-model",
                "messages": [{"role": "user", "content": "Where is the authentication token described?"}],
                "knowledge_chunks": [{
                    "id": "chunk-a", "source": "Personal/security.md", "title": "security.md",
                    "text": "The authentication token must be stored securely.",
                    "chunk_index": 0, "knowledge_base_id": "kb-a"
                }],
                "memories": [{"id": "memory-a", "category": "user_preference", "content": "Prefers concise answers."}]
            }
        )
        assert response.status_code == 200
        assert "event: citations" in response.text
        assert "Personal/security.md" in response.text
        assert "The authentication token must be stored securely" in captured["messages"][-1]["content"]
        assert "Prefers concise answers" in captured["system_prompt"]
    finally:
        model_router.resolve_provider = original_resolver


if __name__ == "__main__":
    print("Running F.R.I.D.A.Y. AI Service Tests...")
    test_health_check()
    test_internal_auth_required()
    test_chat_stream_authorized_and_labeled()
    test_document_parse_and_validation()
    test_context_window_compaction()
    test_rag_user_and_workspace_isolation()
    test_log_redaction()
    test_document_parser_rejects_mime_mismatch_and_sanitizes_filename()
    test_docx_text_extraction_and_zip_safety()
    test_pdf_and_xlsx_document_extraction()
    test_provider_router_never_falls_back_to_mock()
    test_openai_provider_normalizes_sse_without_network()
    test_anthropic_and_gemini_provider_stream_normalization()
    test_clamav_scanner_protocol_and_fail_closed()
    test_chat_stream_injects_scoped_retrieval_and_user_memory()
    print("All 16 F.R.I.D.A.Y. AI Python tests passed successfully.")

