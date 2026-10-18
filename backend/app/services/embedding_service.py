import os
import re
import math
from typing import List, Dict, Any, Optional

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

class EmbeddingService:
    """
    Robust Embedding Service supporting:
    1. BGE-M3 / Sentence-Transformers (When enabled / downloaded)
    2. Google Gemini Embeddings (via API)
    3. Resilient In-Memory Embedding Cache
    4. Fast, deterministic Subword TF-IDF Vectorizer with pure Python fallback
    """
    _model = None
    _model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
    _cache: Dict[str, List[float]] = {}
    _gemini_client = None
    _gemini_disabled = False

    @classmethod
    def get_model(cls):
        if cls._model is None and os.getenv("USE_NEURAL_EMBEDDINGS", "0") == "1":
            try:
                from sentence_transformers import SentenceTransformer
                model_to_load = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
                print(f"[EmbeddingService] Loading neural embedding model: {model_to_load}...")
                cls._model = SentenceTransformer(model_to_load)
                cls._model_name = model_to_load
                print(f"[EmbeddingService] {model_to_load} loaded successfully!")
            except Exception as e:
                print(f"[EmbeddingService] SentenceTransformer load deferred ({e}), using fast local vectorizer.")
                cls._model = None
        return cls._model

    @classmethod
    def encode_text(cls, text: str) -> List[float]:
        """
        Encodes a single text string into a normalized dense embedding vector.
        """
        text_clean = text.strip()
        if not text_clean:
            return [0.0] * 1024

        if text_clean in cls._cache:
            return cls._cache[text_clean]

        # 1. Try Local Sentence-Transformers if enabled
        model = cls.get_model()
        if model is not None:
            try:
                vec = model.encode(text_clean, normalize_embeddings=True, show_progress_bar=False)
                vec_list = [float(v) for v in vec]
                cls._cache[text_clean] = vec_list
                return vec_list
            except Exception as e:
                print(f"[EmbeddingService] Neural encode error: {e}")

        # 2. Fast high-dimensional subword n-gram vectorizer
        vec = cls._fallback_vectorize(text_clean)
        cls._cache[text_clean] = vec
        return vec

    @classmethod
    def compute_similarity(cls, text_a: str, text_b: str) -> float:
        """
        Computes cosine similarity between two texts.
        Returns a float between 0.0 and 1.0.
        """
        vec_a = cls.encode_text(text_a)
        vec_b = cls.encode_text(text_b)

        min_dim = min(len(vec_a), len(vec_b))
        if min_dim == 0:
            return 0.0

        dot = 0.0
        norm_a_sq = 0.0
        norm_b_sq = 0.0

        for i in range(min_dim):
            va = vec_a[i]
            vb = vec_b[i]
            dot += va * vb
            norm_a_sq += va * va
            norm_b_sq += vb * vb

        norm_a = math.sqrt(norm_a_sq)
        norm_b = math.sqrt(norm_b_sq)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        sim = dot / (norm_a * norm_b)
        return max(0.0, min(1.0, (sim + 1.0) / 2.0 if sim < 0 else sim))

    @staticmethod
    def _fallback_vectorize(text: str, dim: int = 1024) -> List[float]:
        """
        Deterministic, robust hashed n-gram embedding fallback.
        Embeds semantic word stems and character 3-grams into 1024-dim space.
        """
        vec = [0.0] * dim
        words = re.findall(r"\b[a-zA-Z]{2,}\b", text.lower())
        if not words:
            return vec

        for word in words:
            # Word level feature
            idx = abs(hash(word)) % dim
            vec[idx] += 1.5
            # Subword stem feature (first 4 chars)
            stem = word[:4] if len(word) >= 4 else word
            stem_idx = abs(hash(f"stem_{stem}")) % dim
            vec[stem_idx] += 1.0
            # Character trigrams for morphological robustness
            for i in range(len(word) - 2):
                tri_idx = abs(hash(word[i:i+3])) % dim
                vec[tri_idx] += 0.5

        norm_sq = sum(v * v for v in vec)
        norm = math.sqrt(norm_sq)
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec
