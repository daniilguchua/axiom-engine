"""
Node Inspection Endpoint
Provides rich, context-aware explanations for clicked nodes in simulations.
"""

import logging

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

node_inspect_bp = Blueprint("node_inspect", __name__)


# Difficulty-specific prompt templates
DIFFICULTY_STYLES = {
    "explorer": {
        "tone": "friendly and encouraging, using simple analogies",
        "max_words": 60,
        "emoji": True,
        "instructions": "Use simple language a beginner would understand.",
    },
    "engineer": {
        "tone": "technical and precise, with complexity analysis when relevant",
        "max_words": 80,
        "emoji": False,
        "instructions": "Be specific about operations and data structure impacts.",
    },
    "architect": {
        "tone": "research-grade with implementation details and trade-offs",
        "max_words": 100,
        "emoji": False,
        "instructions": "Include hardware context, algorithmic insights, and optimization considerations.",
    },
}


def build_node_inspection_prompt(node_id, step_data, difficulty="engineer"):
    """Build a context-aware prompt for node inspection."""

    style = DIFFICULTY_STYLES.get(difficulty, DIFFICULTY_STYLES["engineer"])
    step_analysis = step_data.get("step_analysis", {})

    prompt = f"""You are an expert algorithm tutor inspecting a node in a simulation.

**STUDENT CLICKED:** {node_id}

**SIMULATION CONTEXT:**
- Step Number: {step_data.get("step", 0)}
- Algorithm Phase: {step_data.get("instruction", "")[:100]}...
- What Changed This Step: {step_analysis.get("what_changed", "N/A")}
- Current State: {step_analysis.get("current_state", "N/A")}

**YOUR TASK:**
Explain what the node "{node_id}" represents in this specific step. Use a {style["tone"]} tone.

**REQUIRED FORMAT:**
📍 **Value:** [What is this node's current value or state?]
⚡ **Change:** [Why did it change this step? Or why didn't it change?]
➡️ **Next:** [What will happen to this node in the next step?]

**IMPORTANT:**
- Keep response under {style["max_words"]} words total
- {style["instructions"]}
- Be specific to THIS step, not general algorithm explanation
- Use emojis sparingly if at all
- Answer conversationally, not as bullet points
"""

    return prompt


@node_inspect_bp.route("/node-inspect", methods=["POST", "OPTIONS"])
def inspect_node():
    """
    Inspect a clicked node with rich context.

    Request body:
    {
        "node_id": "NodeA",
        "step_data": {...step object...},
        "difficulty": "engineer"
    }

    Response: Plain text explanation (markdown formatted)
    """
    try:
        if request.method == "OPTIONS":
            return "", 204

        data = request.get_json()

        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400

        node_id = data.get("node_id", "")
        step_data = data.get("step_data", {})
        difficulty = data.get("difficulty", "engineer").lower()

        # Validate inputs
        if not node_id:
            return jsonify({"error": "node_id is required"}), 400

        if difficulty not in DIFFICULTY_STYLES:
            difficulty = "engineer"

        # Build prompt
        prompt = build_node_inspection_prompt(node_id, step_data, difficulty)

        # Generate response
        try:
            from core.config import get_genai_client

            client = get_genai_client()
            if not client:
                logger.error("Gemini client not initialized")
                return jsonify({"error": "Gemini API not configured"}), 500

            response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
            explanation = response.text

            logger.info(f"[INSPECT] Node inspection: {node_id} (difficulty: {difficulty})")

            return explanation, 200

        except Exception as e:
            logger.exception(f"LLM error during node inspection: {e}")
            return jsonify({"error": "Failed to generate explanation", "details": str(e)}), 500

    except Exception as e:
        logger.exception(f"Node inspection error: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
