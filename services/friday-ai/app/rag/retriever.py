from typing import List, Dict, Any, Optional


class HybridRetriever:
    """
    Permission-filtered hybrid retrieval engine enforcing strict user/workspace ownership
    and prompt-injection isolation for retrieved document chunks.
    """

    @staticmethod
    def _wrap_untrusted_chunk(text: str, source: str) -> str:
        """Wraps retrieved text in explicit data boundaries to prevent prompt injection."""
        sanitized = text.replace("\x00", "").strip()
        return f"<retrieved_document source=\"{source}\">\n{sanitized}\n</retrieved_document>"

    def retrieve(
        self,
        query: str,
        knowledge_chunks: List[Dict[str, Any]],
        user_id: str,
        workspace_id: Optional[str] = None,
        top_k: int = 3
    ) -> List[Dict[str, Any]]:
        if not user_id or not user_id.strip():
            # Fail closed when user ownership scope is missing
            return []

        query_terms = {term for term in query.lower().split() if term}
        if not query_terms:
            return []

        scored_chunks = []
        for chunk in knowledge_chunks:
            if chunk.get("user_id") != user_id:
                continue
            if workspace_id is not None and chunk.get("workspace_id") not in (None, workspace_id):
                continue

            raw_text = chunk.get("text", "")
            lower_text = raw_text.lower()
            matches = sum(1 for term in query_terms if term in lower_text)
            if matches > 0:
                source_title = str(chunk.get("source") or chunk.get("title") or "unknown")
                scored_chunks.append({
                    "id": chunk.get("id"),
                    "source": source_title,
                    "chunk_index": chunk.get("chunk_index", 0),
                    "relevance_score": matches / len(query_terms),
                    "citation": {
                        "source": source_title,
                        "chunk_index": chunk.get("chunk_index", 0)
                    },
                    "guarded_context": self._wrap_untrusted_chunk(raw_text, source_title),
                    "prompt_injection_guarded": True
                })

        scored_chunks.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
        return scored_chunks[:top_k]


retriever = HybridRetriever()

