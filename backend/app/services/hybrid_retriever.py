import re
import math
from typing import List, Dict, Any, Tuple
from .embedding_service import EmbeddingService

class HybridRetriever:
    """
    Advanced Tri-Hybrid Retrieval System:
    1. Dense Vector Semantic Search (BGE-M3 / Gemini Embeddings)
    2. BM25 Sparse Lexical Matching (Exact scientific terms, acronyms, formulas)
    3. Reciprocal Rank Fusion (RRF) for optimal rank aggregation
    4. Contextual Cross-Score Re-ranking for top candidate precision
    """

    @classmethod
    def retrieve(
        cls, 
        query: str, 
        candidate_items: List[Dict[str, Any]], 
        text_key: str = "text", 
        top_k: int = 5
    ) -> List[Tuple[float, Dict[str, Any]]]:
        """
        Executes hybrid retrieval over a candidate pool.
        Each candidate is a dict with at least {text_key: "..."} and optional metadata.
        Returns sorted list of (score, candidate_item).
        """
        if not candidate_items:
            return []

        # 1. Compute Dense Vector Similarities
        dense_scores = []
        for idx, item in enumerate(candidate_items):
            item_text = item.get(text_key, "")
            sim = EmbeddingService.compute_similarity(query, item_text)
            dense_scores.append((idx, sim))

        # Sort dense descending
        dense_ranked = sorted(dense_scores, key=lambda x: x[1], reverse=True)
        dense_rank_map = {item_idx: rank for rank, (item_idx, _) in enumerate(dense_ranked)}

        # 2. Compute BM25 Scores
        bm25_scores = cls._compute_bm25(query, [item.get(text_key, "") for item in candidate_items])
        bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)
        bm25_rank_map = {item_idx: rank for rank, (item_idx, _) in enumerate(bm25_ranked)}

        # 3. Reciprocal Rank Fusion (RRF) with constant k=60
        rrf_scores = []
        k_const = 60.0
        for idx in range(len(candidate_items)):
            r_dense = dense_rank_map.get(idx, 999)
            r_bm25 = bm25_rank_map.get(idx, 999)

            score_dense = 1.0 / (k_const + r_dense)
            score_bm25 = 1.0 / (k_const + r_bm25)
            fused_score = score_dense + score_bm25
            rrf_scores.append((idx, fused_score))

        # Sort by RRF score
        rrf_sorted = sorted(rrf_scores, key=lambda x: x[1], reverse=True)
        top_candidates = rrf_sorted[: min(top_k * 2, len(candidate_items))]

        # 4. Contextual Re-ranking (Fine-grained interaction score)
        reranked = []
        q_tokens = set(cls._tokenize(query))

        for idx, fused_score in top_candidates:
            item = candidate_items[idx]
            item_text = item.get(text_key, "")
            item_tokens = set(cls._tokenize(item_text))

            # Direct lexical intersection bonus
            token_overlap = len(q_tokens.intersection(item_tokens))
            overlap_ratio = token_overlap / max(1, len(q_tokens))

            # Dense similarity
            dense_sim = next((score for i, score in dense_scores if i == idx), 0.5)

            # Re-rank composite score: 50% dense + 25% RRF rank + 25% exact overlap
            final_score = (dense_sim * 0.50) + (min(1.0, fused_score * 30.0) * 0.25) + (overlap_ratio * 0.25)
            reranked.append((float(round(final_score, 3)), item))

        reranked.sort(key=lambda x: x[0], reverse=True)
        return reranked[:top_k]

    @classmethod
    def _compute_bm25(cls, query: str, corpus: List[str], k1: float = 1.5, b: float = 0.75) -> List[float]:
        """
        Standard BM25 implementation for scientific token matching.
        """
        tokenized_corpus = [cls._tokenize(doc) for doc in corpus]
        tokenized_query = cls._tokenize(query)

        N = len(corpus)
        if N == 0:
            return []

        doc_lens = [len(doc) for doc in tokenized_corpus]
        avg_doc_len = sum(doc_lens) / N if N > 0 else 1.0

        # Term document frequencies
        df = {}
        for doc in tokenized_corpus:
            for term in set(doc):
                df[term] = df.get(term, 0) + 1

        # Calculate scores
        scores = []
        for i, doc in enumerate(tokenized_corpus):
            doc_len = doc_lens[i]
            score = 0.0
            doc_term_freqs = {}
            for t in doc:
                doc_term_freqs[t] = doc_term_freqs.get(t, 0) + 1

            for q_term in tokenized_query:
                if q_term in doc_term_freqs:
                    freq = doc_term_freqs[q_term]
                    doc_freq = df.get(q_term, 1)
                    # Robertson-Spärck Jones IDF
                    idf = math.log((N - doc_freq + 0.5) / (doc_freq + 0.5) + 1.0)
                    numerator = freq * (k1 + 1)
                    denominator = freq + k1 * (1 - b + b * (doc_len / (avg_doc_len or 1.0)))
                    score += idf * (numerator / (denominator or 1.0))
            scores.append(max(0.0, score))

        return scores

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        stopwords = {
            "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to",
            "for", "with", "by", "that", "this", "these", "those", "and", "or",
            "what", "how", "why", "does", "which", "can", "could", "should"
        }
        words = re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())
        return [w for w in words if w not in stopwords]
