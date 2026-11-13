from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.logging import RedactingContextFilter
from app.context.window import context_manager
from app.rag.retriever import retriever
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
    assert "<retrieved_document" in results[0]["guarded_context"]
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


if __name__ == "__main__":
    print("Running F.R.I.D.A.Y. AI Service Tests...")
    test_health_check()
    test_internal_auth_required()
    test_chat_stream_authorized_and_labeled()
    test_document_parse_and_validation()
    test_context_window_compaction()
    test_rag_user_and_workspace_isolation()
    test_log_redaction()
    print("All 7 F.R.I.D.A.Y. AI Python tests passed successfully.")

