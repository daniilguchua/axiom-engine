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
    
    def get_cached_simulation(
        self, 
        user_prompt: str,
        difficulty: str = "engineer",
        require_complete: bool = True,
        require_verified: bool = False,
        is_broken_callback=None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a cached simulation using semantic similarity.
        
        Args:
            user_prompt: The user's query
            difficulty: The difficulty level (explorer, engineer, architect) - MUST match exactly
            require_complete: If True, only return simulations marked as complete
            require_verified: If True, only return client-verified simulations
            is_broken_callback: Optional callback to check if simulation is broken
            
        Returns:
            Cached playlist data or None if no match found
        """
        # Check if simulation is broken
        if is_broken_callback and is_broken_callback(user_prompt):
            logger.warning(f"⛔ Cache blocked: Prompt has broken simulation record")
            return None
        
        query_vec = get_text_embedding(user_prompt)
        if not query_vec:
            logger.warning("Failed to generate embedding for query")
            return None
        
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            
            # Build query based on requirements
            conditions = [f"difficulty = '{difficulty}'"]  # MUST match difficulty exactly
            if require_complete:
                conditions.append("(status = 'complete' OR status = 'verified')")
                conditions.append("is_final_complete = 1")
            if require_verified:
                conditions.append("client_verified = 1")

            where_clause = " AND ".join(conditions)
            
            cursor.execute(f"""
                SELECT prompt_key, embedding, playlist_json, status, is_final_complete, client_verified, difficulty
                FROM simulation_cache 
                WHERE {where_clause}
            """)
            
            rows = cursor.fetchall()
        
        best_score = 0.0
        best_match = None
        best_key = None
        
        for row in rows:
            db_key, db_emb_json, data, status, is_final, verified, db_difficulty = row
            if not db_emb_json:
                continue
                
            try:
                db_vec = json.loads(db_emb_json)
                score = cosine_similarity(query_vec, db_vec)
                
                logger.debug(f"Similarity '{user_prompt[:30]}...' vs '{db_key[:30]}...' (diff={db_difficulty}): {score:.4f}")
                
                if score > best_score:
                    best_score = score
                    best_match = data
                    best_key = db_key
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Failed to parse embedding for {db_key}: {e}")
                continue
        
        if best_score >= self.SIMILARITY_THRESHOLD:
            logger.info(f"⚡ CACHE HIT ({best_score:.2f}, {difficulty}): '{user_prompt[:40]}...' matched '{best_key[:40]}...'")
            
            # Update access metrics
            self._update_access_metrics(best_key)
            
            return json.loads(best_match)
        
        logger.debug(f"Cache miss for: '{user_prompt[:40]}...' (difficulty={difficulty}, best score: {best_score:.2f})")
        return None
    
    def save_simulation(
        self,
        prompt: str,
        playlist_data: Dict[str, Any],
        difficulty: str = "engineer",
        is_final_complete: bool = False,
        client_verified: bool = False,
        session_id: Optional[str] = None,
        is_broken_callback=None,
        clear_broken_callback=None
    ) -> bool:
        """
        Save a simulation to cache.
        
        CRITICAL: Will NOT save if:
        1. There's a broken simulation record
        2. is_final_complete is False and the last step isn't marked as final
        3. New entries require client verification
        
        Args:
            prompt: The original user prompt
            playlist_data: The complete playlist JSON
            difficulty: The difficulty level (explorer, engineer, architect)
            is_final_complete: Whether the simulation reached its natural end
            client_verified: Whether client has verified the rendering
            session_id: Session ID for repair checking
            is_broken_callback: Optional callback to check if simulation is broken
            clear_broken_callback: Optional callback to clear broken status
            
        Returns:
            True if saved, False if skipped
        """
        clean_key = prompt.strip()
        
        # Clear broken status if client verified
        if client_verified and clear_broken_callback:
            clear_broken_callback(clean_key)
        
        # CHECK 1: Is this simulation marked as broken?
        if is_broken_callback and is_broken_callback(clean_key):
            logger.warning(f"⛔ CACHE BLOCKED: Simulation marked as broken for '{clean_key[:40]}...'")
            return False
        
        # CHECK 2: Validate the simulation data
        steps = playlist_data.get('steps', [])
        if not steps:
            logger.warning(f"⏳ CACHE SKIP: No steps in simulation for '{clean_key[:40]}...'")
            return False
        
        last_step = steps[-1]
        
        # CHECK 3: Only cache if explicitly marked final
        if not is_final_complete:
            is_final_complete = last_step.get('is_final', False)
        
        if not is_final_complete:
            logger.info(f"⏳ CACHE SKIP: Simulation not complete for '{clean_key[:40]}...'")
            return False
        
        # CHECK 4: Require client verification for new entries
        if not client_verified:
            # Check if we're updating an existing verified entry
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT client_verified FROM simulation_cache WHERE prompt_key = ?",
                    (clean_key,)
                )
                row = cursor.fetchone()
                if not row:
                    logger.info(f"⏳ CACHE SKIP: Client verification required for new entry")
                    return False
                # Existing entry, allow update
        
        # Generate embedding
        embedding = get_text_embedding(clean_key)
        emb_json = json.dumps(embedding) if embedding else None
        
        if not emb_json:
            logger.warning(f"Failed to generate embedding for caching: '{clean_key[:40]}...'")
            return False
        
        json_str = json.dumps(playlist_data)
        step_count = len(steps)
        status = "verified" if client_verified else "complete"
        
        with self.db.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO simulation_cache 
                    (prompt_key, embedding, playlist_json, status, step_count, 
                     is_final_complete, client_verified, difficulty, created_at, last_accessed, access_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(prompt_key) DO UPDATE SET
                        embedding = excluded.embedding,
                        playlist_json = excluded.playlist_json,
                        status = excluded.status,
                        step_count = excluded.step_count,
                        is_final_complete = excluded.is_final_complete,
                        client_verified = CASE 
                            WHEN excluded.client_verified = 1 THEN 1 
                            ELSE simulation_cache.client_verified 
                        END,
                        difficulty = excluded.difficulty,
                        last_accessed = excluded.last_accessed
                """, (
                    clean_key, emb_json, json_str, status, step_count,
                    is_final_complete, client_verified, difficulty, datetime.now(), datetime.now()
                ))
                conn.commit()
                logger.info(f"💾 CACHED: '{clean_key[:40]}...' ({step_count} steps, difficulty={difficulty}, verified={client_verified})")
                return True
            except Exception as e:
                logger.error(f"Cache save failed: {e}")
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
