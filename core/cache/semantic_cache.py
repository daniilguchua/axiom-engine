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
    
    def get_cached_simulation(self, prompt_key: str, difficulty: str) -> Optional[Dict]:
        """Retrieve cached simulation by prompt_key and difficulty."""
        try:
            cursor = self.db.get_connection().cursor()
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
                return json.loads(result[0])
            return None
        except Exception as e:
            print(f"Cache retrieval error: {e}")
            return None
    
    def save_simulation(self, prompt_key: str, difficulty: str, simulation: Dict) -> bool:
        """Save simulation to cache if not marked as broken."""
        if not simulation.get("is_final_complete"):
            return False
        
        # Check if broken
        if self.is_broken_callback and self.is_broken_callback(prompt_key, difficulty):
            return False
        
        try:
            cursor = self.db.get_connection().cursor()
            simulation_json = json.dumps(simulation)
            
            # Check for existing client-verified entry
            cursor.execute(
                """
                SELECT id FROM simulation_cache
                WHERE prompt_key = ? AND difficulty = ? AND client_verified = 1
                """,
                (prompt_key, difficulty)
            )
            if cursor.fetchone():
                return False
            
            cursor.execute(
                """
                INSERT INTO simulation_cache (prompt_key, difficulty, simulation_json, client_verified)
                VALUES (?, ?, ?, 0)
                ON CONFLICT(prompt_key, difficulty) DO UPDATE SET
                    simulation_json = excluded.simulation_json,
                    created_at = CURRENT_TIMESTAMP
                """,
                (prompt_key, difficulty, simulation_json)
            )
            self.db.get_connection().commit()
            return True
        except Exception as e:
            print(f"Cache save error: {e}")
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
