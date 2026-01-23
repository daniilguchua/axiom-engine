# routes/repair.py
"""
Mermaid diagram repair endpoints.
"""

import logging
import time

from flask import Blueprint, request, jsonify, g
import google.generativeai as genai

from core.config import get_configured_api_key, get_session_manager, get_cache_manager
from core.decorators import validate_session

logger = logging.getLogger(__name__)

repair_bp = Blueprint('repair', __name__)


def _require_api_key(f):
    """Local wrapper for require_api_key decorator."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_configured_api_key():
            return jsonify({
                "error": "Server misconfigured: GEMINI_API_KEY not set"
            }), 503
        return f(*args, **kwargs)
    return decorated


@repair_bp.route('/confirm-complete', methods=['POST'])
@validate_session
def confirm_complete():
    """
    Client calls this after ALL steps have been successfully rendered.
    Only then do we cache the simulation.
    
    CRITICAL: Client sends the steps array which may contain REPAIRED mermaid code.
    We must use the client's version, not our stored version.
    """
    data = request.get_json()
    session_id = g.session_id
    sim_id = data.get("sim_id")
    step_count = data.get("step_count", 0)
    client_steps = data.get("steps")  # NEW: Client sends repaired steps
    
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)
    
    # Validate the simulation exists
    if not user_db["current_sim_data"] and not client_steps:
        return jsonify({"error": "No simulation data found"}), 400
    
    # CRITICAL: Use client's steps if provided (they contain repaired mermaid)
    if client_steps and len(client_steps) == step_count:
        logger.info(f"📥 Using client-provided steps (may contain repairs)")
        user_db["current_sim_data"] = client_steps
    elif len(user_db["current_sim_data"]) != step_count:
        return jsonify({
            "error": "Step count mismatch",
            "expected": len(user_db["current_sim_data"]),
            "received": step_count
        }), 400
    
    # Check if the last step is marked as final
    last_step = user_db["current_sim_data"][-1]
    if not last_step.get("is_final", False):
        return jsonify({"error": "Simulation not marked as final"}), 400
    
    # Get the original prompt and difficulty for cache key
    original_prompt = user_db.get("original_prompt", "")
    original_difficulty = user_db.get("original_difficulty", "engineer")
    
    if not original_prompt:
        for msg in user_db["chat_history"]:
            if msg["role"] == "user":
                original_prompt = msg["content"]
                break
    
    if not original_prompt:
        return jsonify({"error": "Could not determine original prompt"}), 400
    
    # Check for any pending repairs
    cleared_count = cache_manager.clear_pending_repairs(session_id, original_prompt)
    if cleared_count > 0:
        logger.info(f"✅ Cleared {cleared_count} pending repairs (client verified)")
    
    # Clear any old "broken" flags since client successfully rendered all steps
    cache_manager.clear_broken_status(original_prompt)
    
    # Cache the simulation with the (potentially repaired) steps
    full_playlist = {
        "type": "simulation_playlist",
        "steps": user_db["current_sim_data"]
    }
    
    success = cache_manager.save_simulation(
        prompt=original_prompt,
        playlist_data=full_playlist,
        difficulty=original_difficulty,  # Pass difficulty for proper cache filtering
        is_final_complete=True,
        client_verified=True, 
        session_id=session_id
    )
    
    if success:
        user_db["simulation_verified"] = True
        logger.info(f"✅ Simulation verified & cached: '{original_prompt[:40]}...' (difficulty={original_difficulty})")
        return jsonify({"status": "cached", "prompt": original_prompt[:50], "difficulty": original_difficulty}), 200
    else:
        return jsonify({"status": "cache_failed"}), 500


@repair_bp.route('/repair-failed', methods=['POST'])
@validate_session
def repair_failed():
    """
    Client calls this when a step fails to render after all repair attempts.
    This marks the simulation as broken and prevents caching.
    """
    data = request.get_json()
    session_id = g.session_id
    sim_id = data.get("sim_id")
    step_index = data.get("step_index", 0)
    
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)
    
    # Get the original prompt
    original_prompt = user_db.get("original_prompt", "")
    if not original_prompt:
        for msg in user_db["chat_history"]:
            if msg["role"] == "user":
                original_prompt = msg["content"]
                break
    
    # Mark as permanently failed
    cache_manager.mark_simulation_broken(
        session_id=session_id,
        prompt_key=original_prompt,
        step_index=step_index
    )
    
    logger.warning(f"❌ Simulation marked broken at step {step_index}: '{original_prompt[:40]}...'")
    
    return jsonify({"status": "marked_broken"}), 200


@repair_bp.route('/repair', methods=['POST'])
@_require_api_key
@validate_session
def repair():
    """
    Repair broken Mermaid code using LLM.
    
    IMPORTANT: This endpoint is called AFTER the client's sanitizer failed.
    We go straight to the LLM - no regex shortcuts here.
    """
    data = request.get_json()
    bad_code = data.get("code", "")
    error_msg = data.get("error", "")
    step_index = data.get("step_index", 0)
    context = data.get("context", "")
    is_fallback = data.get("is_fallback", False)
    attempt_number = data.get("attempt_number", 1)
    previous_working = data.get("previous_working")
    
    if not bad_code:
        return jsonify({"error": "No code provided"}), 400
    
    session_id = g.session_id
    start_time = time.time()
    
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    
    logger.info(f"🔧 Repair request: attempt={attempt_number}, step={step_index}, fallback={is_fallback}")
    
    # Get the original prompt for cache tracking
    user_db = session_manager.get_session(session_id)
    original_prompt = user_db.get("original_prompt", "")
    if not original_prompt:
        for m in user_db["chat_history"]:
            if m["role"] == "user":
                original_prompt = m["content"]
                break
    
    # Mark repair as pending (prevents premature caching)
    if original_prompt:
        cache_manager.mark_repair_pending(session_id, original_prompt, step_index)
    
    try:
        # =====================================================================
        # FALLBACK MODE: Modify previous working graph for current step
        # =====================================================================
        
        if is_fallback and previous_working:
            logger.info(f"🔄 Fallback repair: modifying previous working graph")
            
            fallback_prompt = f"""You have a working Mermaid diagram and need to create a variation for the next step.

WORKING BASE GRAPH:
```mermaid
{previous_working}
```

CONTEXT FOR NEW STEP:
{context}

INSTRUCTIONS:
1. Keep the same structure and node IDs
2. Update labels/values to reflect the new step
3. Move the 'active' class highlight to the relevant nodes
4. Add a completion indicator if this should be the final step

OUTPUT ONLY THE MODIFIED MERMAID CODE. No explanation, no markdown blocks."""
            
            logger.info(f"📡 Calling LLM for fallback repair...")
            model = genai.GenerativeModel('models/gemini-2.5-flash')
            response = model.generate_content(fallback_prompt)

            if "```" in response.text:
                ai_fix = response.text.split("```")[1].replace("mermaid", "").strip()
            else:
                ai_fix = response.text.strip()
            
            
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ LLM fallback response received in {duration_ms}ms")
            
            cache_manager.log_repair(
                repair_method="LLM_FALLBACK",
                broken_code=bad_code,
                error_msg="FALLBACK_REQUEST",
                fixed_code=ai_fix,
                success=True,
                session_id=session_id,
                duration_ms=duration_ms
            )
            
            if original_prompt:
                cache_manager.mark_repair_resolved(session_id, original_prompt, step_index, success=True)
            
            return jsonify({"fixed_code": ai_fix, "method": "fallback"})
        
        # =====================================================================
        # STANDARD LLM REPAIR (No regex shortcut - client already tried that)
        # =====================================================================
        
        # Build repair prompt based on attempt number
        if attempt_number >= 2 and previous_working:
            # On later attempts, give the LLM the previous working code as reference
            repair_prompt = f"""Fix this Mermaid diagram. The error was: {error_msg}

BROKEN CODE:
```mermaid
{bad_code}
```

REFERENCE (previous working version):
```mermaid
{previous_working}
```

Keep the same general structure as the reference but fix the syntax errors.
Common issues to check:
- Unescaped quotes inside labels
- Missing semicolons after classDef
- Malformed arrow syntax
- Unbalanced brackets

OUTPUT ONLY THE FIXED MERMAID CODE. No explanation, no markdown blocks."""
        else:
            repair_prompt = f"""Fix this Mermaid diagram code. The error was: {error_msg}

BROKEN CODE:
```mermaid
{bad_code}
```

CONTEXT: {context}

Common Mermaid syntax issues to fix:
- Unescaped quotes inside labels (use single quotes or HTML entities)
- Missing semicolons after classDef statements
- Malformed arrow syntax (should be --> or ==>)
- Unbalanced brackets or parentheses
- Invalid node IDs (no spaces, start with letter)

OUTPUT ONLY THE FIXED MERMAID CODE. No explanation, no markdown code blocks."""
        
        if attempt_number >= 3:
            model_name = 'models/gemini-2.5-pro'
        else:
            model_name = 'models/gemini-2.5-flash'
    
        logger.info(f"📡 Calling LLM for repair attempt {attempt_number}...")
        
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(repair_prompt)
        
        raw = response.text
        if "```mermaid" in raw:
            ai_fix = raw.split("```mermaid")[1].split("```")[0].strip()
        elif "```" in raw:
            ai_fix = raw.split("```")[1].split("```")[0].strip()
        else:
            ai_fix = raw.strip()
                
        
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(f"✅ LLM repair response received in {duration_ms}ms")
        
        # Log the repair attempt
        cache_manager.log_repair(
            repair_method=f"LLM_GEMINI_ATTEMPT_{attempt_number}",
            broken_code=bad_code,
            error_msg=error_msg,
            fixed_code=ai_fix,
            success=True,  # We got a response; client will verify if it actually works
            session_id=session_id,
            duration_ms=duration_ms
        )
        
        # Don't mark as resolved yet - client needs to verify the fix works
        # The client will call /repair again if it fails, or validation will clear it
        
        return jsonify({
            "fixed_code": ai_fix, 
            "method": "llm",
            "attempt": attempt_number,
            "duration_ms": duration_ms
        })
        
    except Exception as e:
        logger.exception(f"Repair failed: {e}")
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        cache_manager.log_repair(
            repair_method=f"FAILED_ATTEMPT_{attempt_number}",
            broken_code=bad_code,
            error_msg=error_msg,
            fixed_code="",
            success=False,
            session_id=session_id,
            duration_ms=duration_ms
        )
        
        if original_prompt:
            cache_manager.mark_repair_resolved(session_id, original_prompt, step_index, success=False)
        
        return jsonify({"error": str(e)}), 500


@repair_bp.route('/repair-success', methods=['POST'])
@validate_session
def repair_success():
    """Client reports a repair was verified working."""
    data = request.get_json()
    session_id = g.session_id
    step_index = data.get("step_index", 0)
    
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)
    original_prompt = user_db.get("original_prompt", "")
    
    if original_prompt:
        cache_manager.mark_repair_resolved(session_id, original_prompt, step_index, success=True)
        logger.info(f"✅ Repair verified by client: step {step_index}")
    
    return jsonify({"status": "acknowledged"}), 200