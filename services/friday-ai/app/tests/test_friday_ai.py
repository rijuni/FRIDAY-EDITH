import asyncio
import json
from fastapi.testclient import TestClient
from app.main import app
from app.context.window import context_manager

client = TestClient(app)


def test_health_check():
    response = client.get("/v1/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "F.R.I.D.A.Y." in data["service"]


def test_chat_stream():
    payload = {
        "model": "claude-3-7-sonnet",
        "messages": [
            {"role": "user", "content": "Initialize F.R.I.D.A.Y. systems"}
        ],
        "temperature": 0.5,
        "max_tokens": 1024
    }
    response = client.post("/v1/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "thinking" in response.text
    assert "chunk" in response.text


def test_document_parse():
    sample_text = b"FRIDAY Architecture: Dual React UI, Express Backend, Python AI."
    response = client.post(
        "/v1/documents/parse",
        files={"file": ("architecture.txt", sample_text, "text/plain")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["chunk_count"] == 1


def test_context_window_compaction():
    messages = [
        {"role": "user", "content": f"Message turn {i} with extensive context details."}
        for i in range(50)
    ]
    compacted = context_manager.prune_and_assemble(messages, system_prompt="System", max_budget=200)
    assert len(compacted) < 50
    assert len(compacted) > 0


if __name__ == "__main__":
    print("Running F.R.I.D.A.Y. AI Service Tests...")
    test_health_check()
    print("✅ test_health_check passed")
    test_chat_stream()
    print("✅ test_chat_stream passed")
    test_document_parse()
    print("✅ test_document_parse passed")
    test_context_window_compaction()
    print("✅ test_context_window_compaction passed")
    print("🎉 All F.R.I.D.A.Y. AI Python tests passed successfully!")
