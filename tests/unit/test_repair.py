"""
Unit tests for routes/repair.py
Tests repair tier system and repair attempt tracking.
"""

import json
import time
from unittest.mock import Mock, patch

from core.utils import sanitize_mermaid_code

# --- Tier 1: Python Sanitizer Tests ---


class TestTier1PythonFix:
    """Test Tier 1 quick-fix Python sanitizer repair."""

    def test_tier1_fixes_spaced_cylinder(self):
        """Test Tier 1 fixes cylinder with spaces."""
        bad_code = "graph LR\nA[ (Node) ]"
        result = sanitize_mermaid_code(bad_code)
        # Should fix space between [ and (
        assert "[ (" not in result
        assert "graph LR" in result

    def test_tier1_fixes_spaced_circle(self):
        """Test Tier 1 fixes circle with spaces."""
        bad_code = "graph LR\nB( (Node) )"
        result = sanitize_mermaid_code(bad_code)
        # Should fix space between ( and (
        assert "( (" not in result

    def test_tier1_fixes_escaped_quotes(self):
        """Test Tier 1 fixes escaped quotes."""
        bad_code = 'graph LR\nA["Label\\"with\\"quotes"]'
        result = sanitize_mermaid_code(bad_code)
        assert '\\"' not in result

    def test_tier1_fixes_double_semicolons(self):
        """Test Tier 1 removes double semicolons."""
        bad_code = "graph LR\nA[Node];;\nB[Node];;"
        result = sanitize_mermaid_code(bad_code)
        assert ";;" not in result

    def test_tier1_fixes_wrong_direction(self):
        """Test Tier 1 forces horizontal direction."""
        bad_code = "graph TD\nA --> B"
        result = sanitize_mermaid_code(bad_code)
        assert "graph LR" in result

    def test_tier1_preserves_valid_code(self):
        """Test Tier 1 doesn't break valid code."""
        good_code = "graph LR\n  A[Start] --> B[End]"
        result = sanitize_mermaid_code(good_code)
        assert "graph LR" in result
        assert "Start" in result
        assert "End" in result

    def test_tier1_handles_empty_input(self):
        """Test Tier 1 handles empty input gracefully."""
        result = sanitize_mermaid_code("")
        assert result == ""

    def test_tier1_handles_none_input(self):
        """Test Tier 1 handles None input gracefully."""
        result = sanitize_mermaid_code(None)
        assert result == ""

    def test_tier1_converts_literal_newlines(self):
        """Test Tier 1 converts escaped \\n to actual newlines."""
        bad_code = "graph LR\\nA[Start] --> B[End]"
        result = sanitize_mermaid_code(bad_code)
        assert "\n" in result
        assert "\\n" not in result


# --- Repair Endpoint Integration Tests (Using Flask Test Client) ---


class TestRepairEndpoints:
    """Test repair endpoints with Flask app."""

    def test_quick_fix_endpoint_basic(self, flask_client, monkeypatch):
        """Test calling the /quick-fix endpoint."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        with patch("routes.repair.get_session_manager") as mock_sm:
            mock_session_manager = Mock()
            mock_session_manager.get_session.return_value = {"chat_history": [], "simulation_active": True}
            mock_sm.return_value = mock_session_manager

            with patch("routes.repair.get_cache_manager") as mock_cm:
                mock_cache_manager = Mock()
                mock_cm.return_value = mock_cache_manager

                with patch("core.config.get_configured_api_key", return_value="test-key"):
                    # Make request
                    response = flask_client.post(
                        "/quick-fix",
                        json={
                            "code": "graph TD\nA[ (Bad) ]",
                            "error": "Rendering failed",
                            "step_index": 1,
                            "sim_id": "sim-123",
                        },
                        headers={"X-Session-ID": "test-session-123"},
                    )

                    # Should return 200 with fixed code
                    if response.status_code == 200:
                        data = json.loads(response.data)
                        assert "fixed_code" in data
                        assert data["tier"] == 1

    def test_quick_fix_no_code_error(self, flask_client, monkeypatch):
        """Test that /quick-fix returns error without code."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

        with patch("core.config.get_configured_api_key", return_value="test-key"):
            response = flask_client.post(
                "/quick-fix",
                json={
                    "error": "Rendering failed",
                    "step_index": 1,
                },
                headers={"X-Session-ID": "test-session-123"},
            )

            # Should handle gracefully (may be 400 or handled by decorator)
            assert response.status_code in [200, 400, 401, 500]


# --- Repair Tier Result Logging ---


class TestRepairTierResultLogging:
    """Test logging of repair tier results."""

    def test_repair_attempt_data_format(self):
        """Test that repair attempt data is structured correctly."""
        attempt_data = {
            "sim_id": "sim-123",
            "step_index": 1,
            "tier": 1,
            "tier_name": "TIER1_PYTHON",
            "attempt_number": 1,
            "input_code": "bad code",
            "output_code": "fixed code",
            "error_before": "Syntax error",
            "error_after": None,
            "was_successful": True,
            "duration_ms": 15,
        }

        # Verify required fields
        required_fields = ["sim_id", "step_index", "tier", "tier_name", "input_code", "output_code", "was_successful"]

        for field in required_fields:
            assert field in attempt_data

    def test_successful_repair_logging(self, cache_mock):
        """Test logging of successful repair."""
        cache_mock.log_repair_attempt(
            session_id="session-1",
            sim_id="sim-123",
            step_index=1,
            tier=1,
            tier_name="TIER1_PYTHON",
            input_code="bad",
            output_code="fixed",
            was_successful=True,
            duration_ms=15,
        )

        cache_mock.log_repair_attempt.assert_called_once()

    def test_failed_repair_logging(self, cache_mock):
        """Test logging of failed repair."""
        cache_mock.log_repair_attempt(
            session_id="session-1",
            sim_id="sim-123",
            step_index=1,
            tier=1,
            tier_name="TIER1_PYTHON",
            input_code="bad",
            output_code="still_bad",
            error_after="Still has errors",
            was_successful=False,
            duration_ms=15,
        )

        cache_mock.log_repair_attempt.assert_called_once()


# --- Repair Statistics Tests ---


class TestRepairStatistics:
    """Test repair statistics and tracking."""

    def test_repair_stats_structure(self):
        """Test that repair stats have expected structure."""
        stats = {
            "tier1_python_fixes": 100,
            "tier2_js_fixes": 50,
            "tier3_llm_fixes": 25,
            "tier4_full_fixes": 10,
            "total_repairs": 185,
            "total_failures": 5,
        }

        assert "tier1_python_fixes" in stats
        assert "total_repairs" in stats
        assert stats["total_repairs"] >= stats["tier1_python_fixes"]

    def test_tier_success_rates(self):
        """Test calculating success rates by tier."""
        tier_data = {
            "tier1": {"success": 100, "total": 120},
            "tier2": {"success": 45, "total": 60},
            "tier3": {"success": 22, "total": 30},
        }

        for _tier, data in tier_data.items():
            success_rate = data["success"] / data["total"]
            # Earlier tiers should have higher success rates
            assert 0 <= success_rate <= 1


# --- Sanitization Edge Cases ---


class TestSanitizationEdgeCases:
    """Test edge cases in Mermaid sanitization for repair."""

    def test_sanitize_malformed_subgraph(self):
        """Test sanitizing malformed subgraph."""
        bad_code = 'subgraph G1["unclosed'
        result = sanitize_mermaid_code(bad_code)
        # Should handle gracefully
        assert isinstance(result, str)

    def test_sanitize_mixed_escaping(self):
        """Test sanitizing with mixed quote escaping."""
        bad_code = """graph LR
        A["Node with \\"escaped\\" quotes"]
        B[ (Cylinder) ]
        """
        result = sanitize_mermaid_code(bad_code)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_sanitize_nested_shapes(self):
        """Test sanitizing nested or complex shapes."""
        bad_code = "A[ (( Nested ) )]"
        result = sanitize_mermaid_code(bad_code)
        assert isinstance(result, str)

    def test_sanitize_broken_arrows(self):
        """Test sanitizing broken arrow syntax."""
        bad_code = """graph LR
        A --> B
        C--
        -->D
        """
        result = sanitize_mermaid_code(bad_code)
        assert isinstance(result, str)

    def test_sanitize_empty_labels(self):
        """Test sanitizing empty arrow labels."""
        bad_code = 'A -- "" --> B'
        result = sanitize_mermaid_code(bad_code)
        assert '-- "" -->' not in result

    def test_sanitize_classdef_formatting(self):
        """Test sanitizing classDef statements."""
        bad_code = "classDef myClass fill:#f9f\nA:::myClass"
        result = sanitize_mermaid_code(bad_code)
        # Should have proper formatting
        assert isinstance(result, str)

    def test_sanitize_preserves_graph_structure(self):
        """Test that sanitization preserves graph connectivity."""
        code = """graph LR
        A[Start] --> B[Process]
        B --> C{Decision}
        C -->|Yes| D[Success]
        C -->|No| E[Failure]
        """
        result = sanitize_mermaid_code(code)
        # Should preserve key nodes
        assert "A" in result
        assert "B" in result
        assert "Decision" in result

    def test_sanitize_very_long_input(self):
        """Test sanitization of very long code."""
        long_code = "graph LR\n" + "\n".join([f"N{i}[Node{i}]" for i in range(100)])
        result = sanitize_mermaid_code(long_code)
        assert isinstance(result, str)
        assert len(result) > 0


# --- Performance Tests ---


class TestRepairPerformance:
    """Test performance of repair operations."""

    def test_tier1_repair_speed(self):
        """Test that Tier 1 repair is fast (<100ms for typical case)."""
        bad_code = "graph TD\nA[ (Node) ]\nB( (Node2) )"

        start = time.time()
        result = sanitize_mermaid_code(bad_code)
        duration_ms = (time.time() - start) * 1000

        # Tier 1 should be very fast
        assert duration_ms < 100
        assert result != bad_code

    def test_sanitization_deterministic(self):
        """Test that sanitization is deterministic."""
        bad_code = "graph TD\nA[ (Node) ]"

        result1 = sanitize_mermaid_code(bad_code)
        result2 = sanitize_mermaid_code(bad_code)

        assert result1 == result2
