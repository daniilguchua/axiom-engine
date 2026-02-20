"""
Unit tests for core/prompts/document_qa.py
Tests persona-specific document prompts and simulation grounding instructions.
"""

from core.prompts.document_qa import (
    DOCUMENT_QA_PROMPTS,
    DOCUMENT_SIMULATION_INSTRUCTION,
    get_document_qa_prompt,
    get_document_simulation_instruction,
)


class TestGetDocumentQaPrompt:
    """Test the get_document_qa_prompt() function."""

    def test_returns_explorer_prompt(self):
        """Test that explorer difficulty returns the explorer prompt."""
        result = get_document_qa_prompt("explorer")
        assert result == DOCUMENT_QA_PROMPTS["explorer"]
        assert "friendly" in result.lower() or "encouraging" in result.lower() or "curiosity" in result.lower()

    def test_returns_engineer_prompt(self):
        """Test that engineer difficulty returns the engineer prompt."""
        result = get_document_qa_prompt("engineer")
        assert result == DOCUMENT_QA_PROMPTS["engineer"]

    def test_returns_architect_prompt(self):
        """Test that architect difficulty returns the architect prompt."""
        result = get_document_qa_prompt("architect")
        assert result == DOCUMENT_QA_PROMPTS["architect"]

    def test_default_is_engineer(self):
        """Test that default difficulty is engineer."""
        result = get_document_qa_prompt()
        assert result == DOCUMENT_QA_PROMPTS["engineer"]

    def test_invalid_difficulty_falls_back_to_engineer(self):
        """Test that invalid difficulty falls back to engineer."""
        result = get_document_qa_prompt("invalid_level")
        assert result == DOCUMENT_QA_PROMPTS["engineer"]

    def test_empty_string_falls_back_to_engineer(self):
        """Test that empty string falls back to engineer."""
        result = get_document_qa_prompt("")
        assert result == DOCUMENT_QA_PROMPTS["engineer"]

    def test_all_prompts_are_non_empty(self):
        """Test that all prompts contain substantial content."""
        for difficulty, prompt in DOCUMENT_QA_PROMPTS.items():
            assert len(prompt) > 100, f"{difficulty} prompt is too short"

    def test_all_prompts_mention_document(self):
        """Test that all prompts reference the uploaded document."""
        for difficulty, prompt in DOCUMENT_QA_PROMPTS.items():
            assert "document" in prompt.lower(), f"{difficulty} prompt doesn't mention 'document'"


class TestGetDocumentSimulationInstruction:
    """Test the get_document_simulation_instruction() function."""

    def test_returns_non_empty_string(self):
        """Test that instruction is a non-empty string."""
        result = get_document_simulation_instruction()
        assert isinstance(result, str)
        assert len(result) > 50

    def test_mentions_document(self):
        """Test that instruction references the document."""
        result = get_document_simulation_instruction()
        assert "document" in result.lower()

    def test_mentions_simulation_or_visualization(self):
        """Test that instruction mentions simulation/visualization context."""
        result = get_document_simulation_instruction()
        lower = result.lower()
        assert "simulat" in lower or "visualiz" in lower or "algorithm" in lower

    def test_constant_matches_function(self):
        """Test that the function returns the constant."""
        assert get_document_simulation_instruction() == DOCUMENT_SIMULATION_INSTRUCTION
