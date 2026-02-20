"""
User feedback and quality tracking.
Logs ratings, graph samples, and maintains cache quality metrics.
"""

import json
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


class FeedbackLogger:
    """
    Tracks user feedback and graph quality for ML training.
    Updates cache ratings based on user votes.
    """

    def __init__(self, database):
        """
        Initialize feedback logger with database connection.

        Args:
            database: CacheDatabase instance for DB operations
        """
        self.db = database

    def log_graph_sample(
        self,
        code: str,
        context: str,
        source: str = "simulation",
        was_repaired: bool = False,
        quality_score: float | None = None,
    ) -> None:
        """
        Save a graph sample for ML training data.

        Args:
            code: Mermaid code
            context: Description/context for the graph
            source: Source type (simulation, repair, user, etc.)
            was_repaired: Whether this code went through repair
            quality_score: Quality rating (0-1)
        """
        if not code or not code.strip():
            return

        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO graph_dataset
                    (mermaid_code, description_context, source_type, was_repaired, quality_score, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (code, context, source, was_repaired, quality_score, datetime.now()),
                )
        except Exception as e:
            # Log but don't raise - this is non-critical
            logger.warning(f"Graph log failed (non-critical): {e}")

    def log_feedback(
        self,
        prompt: str,
        sim_data: Any,
        rating: int,
        session_id: str | None = None,
        step_index: int | None = None,
        comment: str | None = None,
        update_rating_callback=None,
    ) -> None:
        """
        Log user feedback for quality tracking.

        Args:
            prompt: User prompt that was rated
            sim_data: Simulation data
            rating: User rating (typically -1 or 1)
            session_id: Session ID
            step_index: Specific step that was rated
            comment: Optional user comment
            update_rating_callback: Callback to update cache rating
        """
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                json_str = json.dumps(sim_data) if isinstance(sim_data, (dict, list)) else str(sim_data)
                cursor.execute(
                    """
                    INSERT INTO feedback_logs
                    (session_id, prompt, sim_data_json, rating, step_index, comment, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                    (session_id, prompt, json_str, rating, step_index, comment, datetime.now()),
                )
                logger.info(f"[FEEDBACK] Logged: rating={rating} for '{prompt[:30]}...'")
        except Exception as e:
            # Log but don't raise - this is non-critical
            logger.warning(f"Feedback log failed (non-critical): {e}")

        # Update average rating in cache (after first connection is closed)
        if update_rating_callback:
            try:
                update_rating_callback(prompt, rating)
            except Exception:
                pass  # Non-critical

    def update_cache_rating(self, prompt: str, new_rating: int) -> None:
        """Update the average rating for a cached simulation.

        Note: Currently a no-op because the simulation_cache table lacks
        avg_rating and access_count columns. Ratings are still recorded
        in the feedback_logs table.

        Args:
            prompt: The prompt to update rating for.
            new_rating: New rating value.
        """
        pass
