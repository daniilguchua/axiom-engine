# core/cache/__init__.py
"""
Facade for the refactored cache system.
Maintains backward compatibility while delegating to specialized modules.
"""

import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

from .database import CacheDatabase, DB_PATH
from .semantic_cache import SemanticCache
from .repair_tracker import RepairTracker
from .repair_logger import RepairLogger
from .feedback_logger import FeedbackLogger
from core.utils import get_text_embedding, cosine_similarity  # Re-export for backward compat

logger = logging.getLogger(__name__)


class SimulationStatus(Enum):
    """Status of a cached simulation."""
    COMPLETE = "complete"
    PARTIAL = "partial"
    REPAIRING = "repairing"
    FAILED = "failed"
    VERIFIED = "verified"


@dataclass
class CachedSimulation:
    """Represents a cached simulation with metadata."""
    prompt_key: str
    playlist_data: Dict[str, Any]
    status: SimulationStatus
    step_count: int
    created_at: datetime
    last_accessed: datetime
    access_count: int
    avg_rating: Optional[float]
    client_verified: bool


class CacheManager:
    """
    Facade for the refactored cache system.
    Delegates operations to specialized modules while maintaining the same API.
    
    Key Features:
    - Semantic similarity search for cache hits
    - Repair-aware caching (won't cache broken simulations)
    - Connection pooling for thread safety
    - Comprehensive logging for ML training data
    """
    
    SIMILARITY_THRESHOLD = 0.80
    MAX_POOL_SIZE = 5
    
    def __init__(self, db_path=None):
        """Initialize all cache subsystems."""
        if db_path is None:
            db_path = DB_PATH
        self.database = CacheDatabase(db_path)
        self.semantic_cache = SemanticCache(self.database)
        self.repair_tracker = RepairTracker(self.database)
        self.repair_logger = RepairLogger(self.database)
        self.feedback_logger = FeedbackLogger(self.database)
        logger.info("🚀 CacheManager initialized with modular architecture")
    
    def _get_connection(self):
        """Backward compatibility: delegate to database.get_connection()."""
        return self.database.get_connection()
    
    def _update_access_metrics(self, prompt_key: str) -> None:
        """Backward compatibility: delegate to semantic_cache."""
        self.semantic_cache._update_access_metrics(prompt_key)
    
    # =========================================================================
    # SEMANTIC CACHE OPERATIONS
    # =========================================================================
    
    def get_cached_simulation(
        self, 
        prompt: str,
        difficulty: str = "engineer"
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a cached simulation using semantic similarity.
        
        Strategy:
          1. Exact hash match (fast, no API call)
          2. Semantic similarity search (cosine >= 0.80)
        
        Args:
            prompt: Raw user prompt (hashed/embedded internally)
            difficulty: Difficulty level filter
        """
        return self.semantic_cache.get_cached_simulation(
            prompt=prompt,
            difficulty=difficulty
        )
    
    def save_simulation(
        self,
        prompt: str,
        playlist_data: Dict[str, Any],
        difficulty: str = "engineer",
        is_final_complete: bool = False,
        client_verified: bool = False,
        session_id: Optional[str] = None
    ) -> bool:
        """
        Save a simulation to cache.
        Delegates to SemanticCache module.
        """
        # Check if broken before saving
        if self._is_simulation_broken(prompt, difficulty):
            logger.info(f"Skipping cache save for broken simulation: {prompt[:40]}...")
            return False
        
        return self.semantic_cache.save_simulation(
            prompt=prompt,
            playlist_data=playlist_data,
            difficulty=difficulty,
            is_final_complete=is_final_complete,
            client_verified=client_verified
        )
    
    def _get_prompt_hash(self, prompt: str) -> str:
        """Generate a hash for the prompt (for deduplication)."""
        return self.semantic_cache.get_prompt_hash(prompt)
    
    # =========================================================================
    # REPAIR TRACKING OPERATIONS
    # =========================================================================
    
    def _is_simulation_broken(self, prompt: str, difficulty: str) -> bool:
        """Check if simulation is marked broken (fixed bug: no longer needs callback)."""
        return self.repair_tracker.is_simulation_broken(prompt, difficulty)
    
    def mark_simulation_broken(
        self,
        prompt: str,
        difficulty: str,
        reason: str = ""
    ) -> bool:
        """Mark simulation as broken."""
        return self.repair_tracker.mark_simulation_broken(prompt, difficulty, reason)
    
    def clear_broken_status(self, prompt: str, difficulty: str) -> bool:
        """Clear broken status."""
        return self.repair_tracker.clear_broken_status(prompt, difficulty)
    
    def mark_repair_pending(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int
    ) -> None:
        """Mark that a step is being repaired."""
        self.repair_tracker.mark_repair_pending(
            session_id=session_id,
            prompt_key=prompt_key,
            step_index=step_index
        )
    
    def mark_repair_resolved(
        self,
        session_id: str,
        prompt_key: str,
        step_index: int,
        success: bool = True
    ) -> None:
        """Mark a specific repair as resolved."""
        self.repair_tracker.mark_repair_resolved(
            session_id=session_id,
            prompt_key=prompt_key,
            step_index=step_index,
            success=success
        )
    
    def clear_pending_repairs(
        self,
        session_id: str,
        prompt_key: str
    ) -> int:
        """Clear ALL pending repairs for a session/prompt."""
        return self.repair_tracker.clear_pending_repairs(
            session_id=session_id,
            prompt_key=prompt_key
        )
    
    def clear_all_pending_repairs(self, session_id: str) -> int:
        """Clear ALL pending repair flags for a session."""
        return self.repair_tracker.clear_all_pending_repairs(session_id)
    
    def has_pending_repair(self, session_id: str, prompt_key: str) -> bool:
        """Check if there are any pending repairs for this session/prompt."""
        return self.repair_tracker.has_pending_repair(session_id, prompt_key)
    
    def get_pending_repairs(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all pending repairs for a session."""
        return self.repair_tracker.get_pending_repairs(session_id)

    def cleanup_stale_pending_repairs(self, max_age_minutes: int = 15) -> int:
        """Clear pending repairs older than max_age_minutes."""
        return self.repair_tracker.cleanup_stale_pending_repairs(max_age_minutes)
    
    # =========================================================================
    # REPAIR LOGGING OPERATIONS
    # =========================================================================
    
    def log_repair(
        self,
        repair_method: str,
        broken_code: str,
        error_msg: str,
        fixed_code: str,
        success: bool = True,
        session_id: Optional[str] = None,
        duration_ms: Optional[int] = None
    ) -> None:
        """Log a repair attempt for analysis."""
        self.repair_logger.log_repair(
            repair_method=repair_method,
            broken_code=broken_code,
            error_msg=error_msg,
            fixed_code=fixed_code,
            success=success,
            session_id=session_id,
            duration_ms=duration_ms
        )
    
    def log_repair_attempt(
        self,
        session_id: str,
        sim_id: str,
        step_index: int,
        tier: int,
        tier_name: str,
        attempt_number: int,
        input_code: str,
        output_code: str,
        error_before: str,
        error_after: Optional[str],
        was_successful: bool,
        duration_ms: int
    ) -> None:
        """Log a granular repair attempt with tier tracking."""
        self.repair_logger.log_repair_attempt(
            session_id=session_id,
            sim_id=sim_id,
            step_index=step_index,
            tier=tier,
            tier_name=tier_name,
            attempt_number=attempt_number,
            input_code=input_code,
            output_code=output_code,
            error_before=error_before,
            error_after=error_after,
            was_successful=was_successful,
            duration_ms=duration_ms
        )
    
    def get_repair_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get repair statistics for the last N days."""
        return self.repair_logger.get_repair_stats(days)
    
    def get_recent_repair_attempts(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent repair attempts for debugging."""
        return self.repair_logger.get_recent_repair_attempts(limit)

    def log_raw_mermaid(
        self,
        session_id: str,
        sim_id: str,
        step_index: int,
        raw_mermaid_code: str,
        initial_render_success: bool = False,
        initial_error_msg: Optional[str] = None,
        required_repair: bool = False,
        repair_tier: Optional[str] = None,
        final_success: bool = False
    ) -> None:
        """Log raw mermaid code from LLM for analysis."""
        self.repair_logger.log_raw_mermaid(
            session_id=session_id,
            sim_id=sim_id,
            step_index=step_index,
            raw_mermaid_code=raw_mermaid_code,
            initial_render_success=initial_render_success,
            initial_error_msg=initial_error_msg,
            required_repair=required_repair,
            repair_tier=repair_tier,
            final_success=final_success
        )

    def get_raw_mermaid_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get statistics on raw mermaid code from LLM."""
        return self.repair_logger.get_raw_mermaid_stats(days)

    def get_failed_raw_mermaid(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent failed mermaid codes for debugging."""
        return self.repair_logger.get_failed_raw_mermaid(limit)
    
    # =========================================================================
    # FEEDBACK LOGGING OPERATIONS
    # =========================================================================
    
    def _update_cache_rating(self, prompt: str, new_rating: int) -> None:
        """Update the average rating for a cached simulation."""
        self.feedback_logger.update_cache_rating(prompt, new_rating)
    
    def log_graph_sample(
        self,
        code: str,
        context: str,
        source: str = "simulation",
        was_repaired: bool = False,
        quality_score: Optional[float] = None
    ) -> None:
        """Save a graph sample for ML training data."""
        self.feedback_logger.log_graph_sample(
            code=code,
            context=context,
            source=source,
            was_repaired=was_repaired,
            quality_score=quality_score
        )

    def log_feedback(
        self,
        prompt: str,
        sim_data: Any,
        rating: int,
        session_id: Optional[str] = None,
        step_index: Optional[int] = None,
        comment: Optional[str] = None
    ) -> None:
        """Log user feedback for quality tracking."""
        self.feedback_logger.log_feedback(
            prompt=prompt,
            sim_data=sim_data,
            rating=rating,
            session_id=session_id,
            step_index=step_index,
            comment=comment,
            update_rating_callback=self._update_cache_rating
        )
    
    # =========================================================================
    # ANALYTICS & METRICS
    # =========================================================================
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Return cache statistics for monitoring."""
        with self.database.get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache")
            total_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE client_verified = 1")
            verified_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE embedding IS NOT NULL")
            with_embeddings = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM pending_repairs WHERE status = 'pending'")
            pending_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM repair_logs WHERE was_successful = 1")
            successful_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM repair_logs")
            total_repairs = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM broken_simulations")
            broken_count = cursor.fetchone()[0]
            
            return {
                "cached_simulations": total_count,
                "verified_simulations": verified_count,
                "with_embeddings": with_embeddings,
                "broken_simulations": broken_count,
                "pending_repairs": pending_repairs,
                "repair_success_rate": round(successful_repairs / total_repairs, 2) if total_repairs > 0 else None,
                "total_repair_attempts": total_repairs,
            }
    
    def export_training_data(self, output_path: str) -> int:
        """Export graph dataset for ML training."""
        with self.database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT mermaid_code, description_context, source_type, was_repaired, quality_score
                FROM graph_dataset
                WHERE quality_score IS NULL OR quality_score >= 0.5
            """)
            
            rows = cursor.fetchall()
            
            data = [
                {
                    "code": row[0],
                    "context": row[1],
                    "source": row[2],
                    "was_repaired": bool(row[3]),
                    "quality": row[4]
                }
                for row in rows
            ]
            
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"📤 Exported {len(data)} training samples to {output_path}")
            return len(data)


# Maintain backward compatibility - import from core.cache still works
__all__ = ['CacheManager', 'SimulationStatus', 'CachedSimulation', 'DB_PATH', 'get_text_embedding', 'cosine_similarity']
