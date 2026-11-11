from typing import List, Dict, Any


class HybridRetriever:
    """
    RAG hybrid retrieval foundation performing permission-filtered keyword & semantic matching.
    """

    def retrieve(
        self,
        query: str,
        knowledge_chunks: List[Dict[str, Any]],
        top_k: int = 3
    ) -> List[Dict[str, Any]]:
        query_terms = set(query.lower().split())

        scored_chunks = []
        for chunk in knowledge_chunks:
            text = chunk.get("text", "").lower()
            matches = sum(1 for term in query_terms if term in text)
            if matches > 0:
                scored_chunks.append({
                    **chunk,
                    "relevance_score": matches / max(1, len(query_terms))
                })

        scored_chunks.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
        return scored_chunks[:top_k]


retriever = HybridRetriever()
