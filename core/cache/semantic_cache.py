"""
Semantic caching with embedding-based similarity search.
Handles cache hits/misses and simulation storage.

Retrieval strategy (in order):
  1. Exact hash match (fast, no API call)
  2. Semantic similarity via cosine similarity on embeddings (>= 0.80 threshold)
"""

import hashlib
import json
import logging

from core.utils import cosine_similarity, get_text_embedding

logger = logging.getLogger(__name__)


class SemanticCache:
    """
    Semantic similarity-based cache for simulations.
    Uses cosine similarity on embeddings to find similar prompts.
    Falls back to exact hash match for entries without embeddings.
    """

    SIMILARITY_THRESHOLD = 0.80

    def __init__(self, database):
        """
        Initialize semantic cache with database connection.

        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database
        logger.info("[INIT] SemanticCache initialized (similarity threshold: %.2f)", self.SIMILARITY_THRESHOLD)

    def get_cached_simulation(self, prompt: str, difficulty: str) -> dict | None:
        """
        Retrieve cached simulation using semantic similarity.

        Strategy:
          1. Try exact hash match first (fast, no API call)
          2. If no exact match, compute embedding and find best semantic match
          3. Return best match if cosine similarity >= SIMILARITY_THRESHOLD

        Args:
            prompt: The raw user prompt
            difficulty: The difficulty level to filter by

        Returns:
            Parsed simulation data dict, or None if no match found
        """
        prompt_key = self.get_prompt_hash(prompt)

        # --- Step 1: Exact hash match (fast path, no API call) ---
        exact_result = self._exact_hash_lookup(prompt_key, difficulty)
        if exact_result:
            logger.info(f"[HIT] Cache HIT (exact match) for '{prompt[:50]}...' (difficulty={difficulty})")
            return exact_result

        # --- Step 2: Semantic similarity search ---
        similar_result = self._semantic_similarity_search(prompt, difficulty)
        if similar_result:
            return similar_result

        logger.info(f"[MISS] Cache MISS for '{prompt[:50]}...' (difficulty={difficulty})")
        return None

    def _exact_hash_lookup(self, prompt_key: str, difficulty: str) -> dict | None:
        """Fast exact-match lookup by prompt hash + difficulty."""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT simulation_json FROM simulation_cache
                    WHERE prompt_key = ? AND difficulty = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (prompt_key, difficulty),
                )
                row = cursor.fetchone()
                if row:
                    return json.loads(row[0])
                return None
        except Exception as e:
            logger.error(f"Exact hash lookup error: {e}")
            return None

    def _semantic_similarity_search(self, prompt: str, difficulty: str) -> dict | None:
        """
        Search cached simulations by cosine similarity on embeddings.

        Fetches all cached entries for the given difficulty that have embeddings,
        computes cosine similarity with the query embedding, and returns the
        best match above the threshold.

        Args:
            prompt: Raw user prompt
            difficulty: Difficulty level filter

        Returns:
            Best matching simulation data, or None
        """
        try:
            # Generate embedding for the query prompt
            query_embedding = get_text_embedding(prompt)
            if not query_embedding:
                logger.warning("[WARN] Could not generate embedding for semantic search")
                return None

            # Fetch all cached entries for this difficulty that have embeddings
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT prompt_key, embedding, simulation_json
                    FROM simulation_cache
                    WHERE difficulty = ? AND embedding IS NOT NULL
                    """,
                    (difficulty,),
                )
                rows = cursor.fetchall()

            if not rows:
                return None

            # Find the best match
            best_score = 0.0
            best_data = None

            for row in rows:
                row[0]
                cached_embedding = json.loads(row[1])
                cached_json = row[2]

                score = cosine_similarity(query_embedding, cached_embedding)

                if score > best_score:
                    best_score = score
                    best_data = cached_json

            if best_score >= self.SIMILARITY_THRESHOLD and best_data:
                logger.info(
                    f"[HIT] Cache HIT (semantic, {best_score:.2f} similarity) "
                    f"for '{prompt[:50]}...' (difficulty={difficulty})"
                )
                return json.loads(best_data)

            if best_score > 0:
                logger.info(
                    f"[MISS] Best semantic match was {best_score:.2f} "
                    f"(threshold: {self.SIMILARITY_THRESHOLD}) - below threshold"
                )

            return None

        except Exception as e:
            logger.error(f"Semantic similarity search error: {e}")
            return None

    def save_simulation(
        self, prompt: str, playlist_data: dict, difficulty: str, is_final_complete: bool, client_verified: bool = False
    ) -> bool:
        """Save simulation to cache with embedding for semantic search."""
        if not is_final_complete:
            logger.info("Skipping cache save - simulation not final complete")
            return False

        try:
            prompt_key = self.get_prompt_hash(prompt)
            simulation_json = json.dumps(playlist_data)

            # Generate embedding for semantic similarity search
            embedding = get_text_embedding(prompt)
            embedding_json = json.dumps(embedding) if embedding else None
            if not embedding:
                logger.warning("[WARN] Could not generate embedding for cache save (will still save with hash)")

            with self.db.get_connection() as conn:
                cursor = conn.cursor()

                # Check for existing client-verified entry
                cursor.execute(
                    """
                    SELECT id FROM simulation_cache
                    WHERE prompt_key = ? AND difficulty = ? AND client_verified = 1
                    """,
                    (prompt_key, difficulty),
                )
                if cursor.fetchone():
                    logger.info("Skipping save - client-verified entry exists")
                    return False

                cursor.execute(
                    """
                    INSERT INTO simulation_cache
                    (prompt_key, embedding, difficulty, simulation_json, client_verified)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(prompt_key, difficulty) DO UPDATE SET
                        simulation_json = excluded.simulation_json,
                        embedding = COALESCE(excluded.embedding, simulation_cache.embedding),
                        client_verified = excluded.client_verified,
                        created_at = CURRENT_TIMESTAMP
                    """,
                    (prompt_key, embedding_json, difficulty, simulation_json, 1 if client_verified else 0),
                )
                logger.info(
                    f"[CACHE] Saved simulation: '{prompt[:40]}...' "
                    f"(difficulty={difficulty}, verified={client_verified}, "
                    f"has_embedding={'yes' if embedding else 'no'})"
                )
                return True
        except Exception as e:
            logger.error(f"Cache save error: {e}")
            return False

    def get_prompt_hash(self, prompt: str) -> str:
        """Generate a hash for the prompt (for deduplication)."""
        normalized = prompt.strip().lower()
        return hashlib.sha256(normalized.encode()).hexdigest()[:32]
