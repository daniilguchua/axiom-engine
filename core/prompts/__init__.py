"""
AXIOM Engine - System Prompts for Difficulty Levels
Public API for prompt generation - maintains backward compatibility
"""

from .constants import SHAPE_REFERENCE, MERMAID_FIX
from .examples import EXPLORER_ONE_SHOT, ENGINEER_ONE_SHOT, ARCHITECT_ONE_SHOT
from .explorer import EXPLORER_PROMPT
from .engineer import ENGINEER_PROMPT
from .architect import ARCHITECT_PROMPT
from .document_qa import get_document_qa_prompt, get_document_simulation_instruction

DIFFICULTY_PROMPTS = {
    "explorer": EXPLORER_PROMPT,
    "engineer": ENGINEER_PROMPT,
    "architect": ARCHITECT_PROMPT
}

def get_system_prompt(difficulty: str = "engineer") -> str:
    """
    Get the appropriate system prompt for the selected difficulty level.
    
    Args:
        difficulty: One of 'explorer', 'engineer', 'architect'
        
    Returns:
        Complete system prompt string
    """
    difficulty = difficulty.lower()
    if difficulty not in DIFFICULTY_PROMPTS:
        difficulty = "engineer"  # Default fallback
    
    return DIFFICULTY_PROMPTS[difficulty]

SYSTEM_PROMPT = ENGINEER_PROMPT

__all__ = [
    # Primary public API
    'get_system_prompt',
    'DIFFICULTY_PROMPTS',
    'SYSTEM_PROMPT',
    
    # Document QA
    'get_document_qa_prompt',
    'get_document_simulation_instruction',
    
    # Difficulty-specific prompts
    'EXPLORER_PROMPT',
    'ENGINEER_PROMPT',
    'ARCHITECT_PROMPT',
    
    # Shared constants
    'SHAPE_REFERENCE',
    'MERMAID_FIX',
    
    # One-shot examples
    'EXPLORER_ONE_SHOT',
    'ENGINEER_ONE_SHOT',
    'ARCHITECT_ONE_SHOT',
]
