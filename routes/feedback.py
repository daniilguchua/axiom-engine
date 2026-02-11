# routes/feedback.py
"""
Feedback and voting endpoints.
"""

import logging

from flask import Blueprint, request, jsonify, g
from google import genai

from core.config import get_configured_api_key, get_session_manager, get_cache_manager
from core.decorators import validate_session, rate_limit, require_configured_api_key
from core.utils import InputValidator

logger = logging.getLogger(__name__)

feedback_bp = Blueprint('feedback', __name__)


@feedback_bp.route('/vote', methods=['POST'])
@validate_session
def vote():
    """Record user feedback on a simulation."""
    data = request.get_json()
    rating = data.get("rating")  # 1 or -1
    step_index = data.get("step_index")
    comment = data.get("comment")
    
    if rating not in [1, -1]:
        return jsonify({"error": "Invalid rating. Must be 1 or -1"}), 400
    
    session_id = g.session_id
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)
    
    # Find the original prompt
    last_user_msg = "Unknown"
    for msg in reversed(user_db["chat_history"]):
        if msg["role"] == "user":
            last_user_msg = msg["content"]
            break
    
    cache_manager.log_feedback(
        prompt=last_user_msg,
        sim_data=user_db["current_sim_data"],
        rating=rating,
        session_id=session_id,
        step_index=step_index,
        comment=comment
    )
    
    return jsonify({"status": "recorded"}), 200


@feedback_bp.route('/enhance-prompt', methods=['POST'])
@require_configured_api_key
@rate_limit(max_requests=20, window_seconds=60)
def enhance():
    """Enhance a user prompt using the COSTARA method."""
    data = request.get_json()
    msg = InputValidator.sanitize_message(data.get("message", ""))
    
    if not msg:
        return jsonify({"error": "Message required"}), 400
    
    # Detect simulation intent
    sim_keywords = ["simulate", "simulation", "step", "interactive", "run", 
                    "show me", "visualize", "algorithm", "process"]
    is_simulation = any(k in msg.lower() for k in sim_keywords)
    
    if is_simulation:
        meta_prompt = f"""
You are an expert Prompt Engineer for a High-Fidelity Educational Simulation Engine.
Use the **COSTARA Method** to rewrite the user's request: "{msg}".

**GOAL:** Transform into a sophisticated "Creative Brief" that triggers the Engine's interactive JSON capabilities.

**C - CONTEXT:** User wants to visualize a complex Computer Science or System concept.
**O - OBJECTIVE:** Trigger "Simulation Playlist" mode (JSON output) to teach step-by-step.
**S - STYLE:** "The Compassionate Professor." Deep analogies, real-world comparisons, Big-O analysis.
**T - TONE:** Academic, Precise, yet Engaging and Narrative-driven.
**A - AUDIENCE:** The Axiom Backend AI (which strictly speaks JSON).

**R - RULES:**
1. Explicitly command: "Output a JSON Simulation Playlist."
2. Say: "Use high-contrast visual cues to distinguish active elements from inactive ones."
3. Ask: "Treat the algorithm as a story with a beginning, middle, and end."
4. Demand the `data_table` field tracks variables in real-time.
5. Demand the `instruction` field explains *why* changes happened.

**A - ACTION:** Write the final optimized prompt text.

**OUTPUT:** Return ONLY the refined prompt text. No quotes or labels.
"""
    else:
        meta_prompt = f"""
Use the COSTARA method to enhance this question: "{msg}".
**C:** User needs a clear, academic explanation.
**O:** Provide a compassionate, structured answer.
**S:** The "Compassionate Professor."
**T:** Warm, Professional, and Lucid.
**R:** Ask for Markdown headers, clear examples, and analogies.
**A:** Rewrite the prompt for a clear explanation.

**OUTPUT:** Return ONLY the refined prompt text.
"""
    
    try:
        from core.config import get_genai_client
        client = get_genai_client()
        if not client:
            logger.error("Gemini client not initialized")
            return jsonify({"error": "Gemini API not configured"}), 500
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=meta_prompt
        )
        clean_text = response.text.strip().replace('```markdown', '').replace('```', '').strip()
        
        return jsonify({"enhanced_prompt": clean_text})
        
    except Exception as e:
        logger.error(f"Enhancement failed: {e}")
        return jsonify({"error": str(e)}), 500


@feedback_bp.route('/log-graph', methods=['POST'])
@validate_session
def log_graph():
    """
    Log a successful graph render for ML training data.
    Called by client after any successful mermaid render.
    """
    data = request.get_json()
    
    mermaid_code = data.get("mermaid_code", "")
    context = data.get("context", "")
    source = data.get("source", "unknown")
    was_repaired = data.get("was_repaired", False)
    
    if not mermaid_code:
        return jsonify({"status": "skipped", "reason": "empty code"}), 200
    
    cache_manager = get_cache_manager()
    
    try:
        cache_manager.log_graph_sample(
            code=mermaid_code,
            context=context,
            source=source,
            was_repaired=was_repaired,
            quality_score=None  # Could be set later via feedback
        )
        
        logger.debug(f"📊 Graph logged: source={source}, repaired={was_repaired}")
        return jsonify({"status": "logged"}), 200
        
    except Exception as e:
        logger.error(f"Graph log failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500