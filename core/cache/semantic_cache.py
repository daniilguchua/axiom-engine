# core/cache/semantic_cache.py
"""
Semantic caching with embedding-based similarity search.
Handles cache hits/misses and simulation storage.
"""

import json
import logging
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any

from core.utils import get_text_embedding, cosine_similarity

logger = logging.getLogger(__name__)


class SemanticCache:
    """
    Semantic similarity-based cache for simulations.
    Uses cosine similarity on embeddings to find similar prompts.
    """
    
    SIMILARITY_THRESHOLD = 0.80
    
    def __init__(self, database):
        """
        Initialize semantic cache with database connection.
        
        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database
        logger.info("📦 SemanticCache initialized")
    
    def get_cached_simulation(self, prompt_key: str, difficulty: str) -> Optional[Dict]:
        """Retrieve cached simulation by prompt_key and difficulty."""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT simulation_json FROM simulation_cache
                    WHERE prompt_key = ? AND difficulty = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (prompt_key, difficulty)
                )
                result = cursor.fetchone()
                if result:
                    logger.info(f"✅ Cache hit for '{prompt_key[:40]}...' (difficulty={difficulty})")
                    return json.loads(result[0])
                logger.info(f"❌ Cache miss for '{prompt_key[:40]}...' (difficulty={difficulty})")
                return None
        except Exception as e:
            logger.error(f"Cache retrieval error: {e}")
            return None
    
    def save_simulation(
        self,
        prompt: str,
        playlist_data: Dict,
        difficulty: str,
        is_final_complete: bool,
        client_verified: bool = False
    ) -> bool:
        """Save simulation to cache with proper validation."""
        if not is_final_complete:
            logger.info(f"Skipping cache save - simulation not final complete")
            return False
        
        try:
            prompt_key = self.get_prompt_hash(prompt)
            simulation_json = json.dumps(playlist_data)
            
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check for existing client-verified entry
                cursor.execute(
                    """
                    SELECT id FROM simulation_cache
                    WHERE prompt_key = ? AND difficulty = ? AND client_verified = 1
                    """,
                    (prompt_key, difficulty)
                )
                if cursor.fetchone():
                    logger.info(f"Skipping save - client-verified entry exists")
                    return False
                
                cursor.execute(
                    """
                    INSERT INTO simulation_cache (prompt_key, difficulty, simulation_json, client_verified)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(prompt_key, difficulty) DO UPDATE SET
                        simulation_json = excluded.simulation_json,
                        client_verified = excluded.client_verified,
                        created_at = CURRENT_TIMESTAMP
                    """,
                    (prompt_key, difficulty, simulation_json, 1 if client_verified else 0)
                )
                logger.info(f"✅ Cached simulation: '{prompt[:40]}...' (difficulty={difficulty}, verified={client_verified})")
                return True
        except Exception as e:
            logger.error(f"Cache save error: {e}")
            return False
    
    def _update_access_metrics(self, prompt_key: str) -> None:
        """Update last_accessed and access_count for a cache entry."""
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE simulation_cache 
                SET last_accessed = ?, access_count = access_count + 1
                WHERE prompt_key = ?
            """, (datetime.now(), prompt_key))
    
    def get_prompt_hash(self, prompt: str) -> str:
        """Generate a hash for the prompt (for deduplication)."""
        normalized = prompt.strip().lower()
        return hashlib.sha256(normalized.encode()).hexdigest()[:32]
