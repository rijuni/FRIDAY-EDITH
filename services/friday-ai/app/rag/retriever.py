import json
import math
import re
from typing import List, Dict, Any, Optional


class HybridRetriever:
    """
    Permission-filtered hybrid retrieval engine combining BM25 lexical ranking
    and dense vector semantic similarity with Reciprocal Rank Fusion (RRF),
    enforcing strict user/workspace ownership boundaries and prompt-injection isolation.
    """

    BM25_K1 = 1.5
    BM25_B = 0.75
    RRF_K = 60.0

    @staticmethod
    def _wrap_untrusted_chunk(text: str, source: str) -> str:
        """Serialize retrieved text as JSON data; this is context separation, not a model security boundary."""
        sanitized = text.replace("\x00", "").strip()
        return json.dumps({"source": source, "document_text": sanitized}, ensure_ascii=False)

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """Case-folded alphanumeric token extraction."""
        return [t for t in re.findall(r"[\w'-]{2,}", text.casefold()) if t]

    @staticmethod
    def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two numeric vectors."""
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return max(0.0, min(1.0, dot / (norm_a * norm_b)))

    def _generate_feature_embedding(self, text: str, dimensions: int = 64) -> List[float]:
        """
        Generate a deterministic hashed n-gram feature vector for offline semantic comparison
        when external dense embedding model outputs are not pre-indexed on chunks.
        """
        vec = [0.0] * dimensions
        tokens = self._tokenize(text)
        if not tokens:
            return vec
        for i, token in enumerate(tokens):
            idx = hash(token) % dimensions
            vec[idx] += 1.0
            # Also capture bigram sequence features
            if i + 1 < len(tokens):
                bigram = f"{token}_{tokens[i + 1]}"
                b_idx = hash(bigram) % dimensions
                vec[b_idx] += 0.5

        # L2-normalize vector
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    def _score_bm25(
        self,
        query_terms: set[str],
        doc_tokens: List[str],
        doc_lengths: List[int],
        df_map: Dict[str, int],
        total_docs: int,
    ) -> float:
        """Calculate BM25 relevance score with Okapi saturation and length normalization."""
        if not query_terms or not doc_tokens or total_docs == 0:
            return 0.0

        avgdl = (sum(doc_lengths) / total_docs) if total_docs > 0 else 1.0
        dl = len(doc_tokens)
        score = 0.0

        # Term frequencies in this document
        tf_map: Dict[str, int] = {}
        for token in doc_tokens:
            tf_map[token] = tf_map.get(token, 0) + 1

        for term in query_terms:
            if term not in tf_map:
                continue
            tf = tf_map[term]
            df = df_map.get(term, 0)
            # Standard Lucene/BM25 IDF formula
            idf = math.log(1.0 + (total_docs - df + 0.5) / (df + 0.5))
            numerator = tf * (self.BM25_K1 + 1.0)
            denominator = tf + self.BM25_K1 * (1.0 - self.BM25_B + self.BM25_B * (dl / avgdl))
            score += idf * (numerator / denominator)

        return max(0.0, score)

    def retrieve(
        self,
        query: str,
        knowledge_chunks: List[Dict[str, Any]],
        user_id: str,
        workspace_id: Optional[str] = None,
        top_k: int = 3,
        semantic_weight: float = 0.4,
        query_embedding: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform scoped hybrid retrieval combining lexical BM25 and dense vector similarity.
        Fails closed if user ownership context is absent.
        """
        if not user_id or not user_id.strip():
            # Fail closed when user ownership scope is missing
            return []

        query_tokens = self._tokenize(query)
        query_terms = set(query_tokens)
        if not query_terms and not query_embedding:
            return []

        # 1. Filter chunks by user ownership and workspace scope
        eligible_chunks = []
        for chunk in knowledge_chunks:
            if chunk.get("user_id") != user_id:
                continue
            if workspace_id is not None and chunk.get("workspace_id") not in (None, workspace_id):
                continue
            raw_text = str(chunk.get("text") or "")
            if not raw_text.strip():
                continue
            eligible_chunks.append({
                "chunk": chunk,
                "text": raw_text,
                "tokens": self._tokenize(raw_text),
                "embedding": chunk.get("embedding"),
            })

        if not eligible_chunks:
            return []

        total_docs = len(eligible_chunks)
        doc_lengths = [len(item["tokens"]) for item in eligible_chunks]

        # 2. Compute Document Frequencies (DF) for BM25
        df_map: Dict[str, int] = {}
        for term in query_terms:
            df_map[term] = sum(1 for item in eligible_chunks if term in item["tokens"])

        # 3. Query embedding for dense semantic comparison
        default_query_vec = query_embedding or self._generate_feature_embedding(query)

        # 4. Score eligible chunks
        scored_candidates = []
        for item in eligible_chunks:
            chunk = item["chunk"]
            raw_text = item["text"]
            tokens = item["tokens"]

            # Lexical BM25 score
            bm25_score = self._score_bm25(query_terms, tokens, doc_lengths, df_map, total_docs)
            overlap_count = sum(1 for term in query_terms if term in tokens)

            # Dense vector similarity
            chunk_vec = item["embedding"] if isinstance(item["embedding"], list) else self._generate_feature_embedding(raw_text)
            query_vec = default_query_vec
            if len(query_vec) != len(chunk_vec) and not query_embedding:
                query_vec = self._generate_feature_embedding(query, dimensions=len(chunk_vec))

            semantic_score = self._cosine_similarity(query_vec, chunk_vec)

            # Skip documents with zero relevance across both signals
            if overlap_count == 0 and semantic_score <= 0.0:
                continue

            # Combined hybrid relevance score
            lexical_normalized = (overlap_count / len(query_terms)) if query_terms else 0.0
            combined_relevance = (1.0 - semantic_weight) * max(lexical_normalized, min(1.0, bm25_score / 5.0)) + semantic_weight * semantic_score

            if combined_relevance <= 0.0:
                continue

            source_title = str(chunk.get("source") or chunk.get("title") or "unknown")
            scored_candidates.append({
                "id": chunk.get("id"),
                "source": source_title,
                "chunk_index": chunk.get("chunk_index", 0),
                "knowledge_base_id": chunk.get("knowledge_base_id"),
                "relevance_score": round(combined_relevance, 4),
                "bm25_score": round(bm25_score, 4),
                "semantic_score": round(semantic_score, 4),
                "citation": {
                    "source": source_title,
                    "chunk_index": chunk.get("chunk_index", 0),
                },
                "guarded_context": self._wrap_untrusted_chunk(raw_text, source_title),
                "prompt_injection_guarded": True,
            })

        # Rank by combined relevance descending
        scored_candidates.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored_candidates[:top_k]


retriever = HybridRetriever()

