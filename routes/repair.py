"""
Mermaid diagram repair endpoints with tiered repair system.

Tier 1: Python sanitizer only (fast, free)
Tier 2: Python + JS sanitizer (fast, free) - client applies JS
Tier 3: LLM repair + Python sanitizer (slow, costs API calls)
Tier 4: LLM repair + Python + JS sanitizer (slow, costs API calls)
"""

import logging
import time

from flask import Blueprint, g, jsonify, request

from core.config import get_cache_manager, get_session_manager
from core.decorators import require_configured_api_key, validate_session
from core.utils import sanitize_mermaid_code

logger = logging.getLogger(__name__)

repair_bp = Blueprint("repair", __name__)


@repair_bp.route("/quick-fix", methods=["POST"])
@validate_session
def quick_fix():
    """
    TIER 1: Apply Python sanitizer only.

    This is the FIRST attempt at repair - fast and free.
    Client should try rendering after this before escalating to LLM.

    Returns:
        {
            "fixed_code": "...",
            "tier": 1,
            "tier_name": "TIER1_PYTHON",
            "changed": true/false,
            "duration_ms": 5
        }
    """
    data = request.get_json()
    bad_code = data.get("code", "")
    data.get("error", "")
    step_index = data.get("step_index", 0)
    data.get("sim_id", "")

    if not bad_code:
        return jsonify({"error": "No code provided"}), 400

    start_time = time.time()

    get_cache_manager()

    # Apply Python sanitizer
    fixed_code = sanitize_mermaid_code(bad_code)

    duration_ms = int((time.time() - start_time) * 1000)
    changed = fixed_code != bad_code

    logger.info(f"[QUICK-FIX] Tier 1 Python: step={step_index}, changed={changed}, duration={duration_ms}ms")

    # Log the attempt (will be marked success/fail when client reports back)
    # We log this as "pending" - client will call /repair-tier-result to confirm

    return jsonify(
        {
            "fixed_code": fixed_code,
            "tier": 1,
            "tier_name": "TIER1_PYTHON",
            "changed": changed,
            "duration_ms": duration_ms,
        }
    )


@repair_bp.route("/repair-tier-result", methods=["POST"])
@validate_session
def repair_tier_result():
    """
    Client reports the result of a repair tier attempt.

    Called after client tries to render the fixed code.
    This logs the granular repair attempt to the database.
    """
    data = request.get_json()
    session_id = g.session_id

    sim_id = data.get("sim_id", "")
    step_index = data.get("step_index", 0)
    tier = data.get("tier", 1)
    tier_name = data.get("tier_name", "UNKNOWN")
    attempt_number = data.get("attempt_number", 1)
    input_code = data.get("input_code", "")
    output_code = data.get("output_code", "")
    error_before = data.get("error_before", "")
    error_after = data.get("error_after")
    was_successful = data.get("was_successful", False)
    duration_ms = data.get("duration_ms", 0)

    cache_manager = get_cache_manager()

    # Log the granular attempt
    cache_manager.log_repair_attempt(
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
        duration_ms=duration_ms,
    )

    return jsonify({"status": "logged", "tier": tier_name, "success": was_successful})


@repair_bp.route("/repair-stats", methods=["GET"])
def repair_stats():
    """
    Get repair statistics showing which tiers are fixing what.

    Returns breakdown like:
    {
        "tier1_python_fixes": 847,     // 62%
        "tier2_js_fixes": 341,         // 25%
        "tier3_llm_fixes": 178,        // 13%
        "total_failures": 12,
        "success_rate": 99.1,
        ...
    }
    """
    days = request.args.get("days", 7, type=int)

    cache_manager = get_cache_manager()
    stats = cache_manager.get_repair_stats(days=days)
    recent = cache_manager.get_recent_repair_attempts(limit=10)

    return jsonify({"stats": stats, "recent_attempts": recent})


@repair_bp.route("/confirm-complete", methods=["POST"])
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
    data.get("sim_id")
    step_count = data.get("step_count", 0)
    client_steps = data.get("steps")

    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)

    # Validate the simulation exists
    if not user_db["current_sim_data"] and not client_steps:
        return jsonify({"error": "No simulation data found"}), 400

    if client_steps and len(client_steps) == step_count:
        logger.info("ðŸ“¥ Using client-provided steps (may contain repairs)")
        user_db["current_sim_data"] = client_steps
    elif len(user_db["current_sim_data"]) != step_count:
        return jsonify(
            {"error": "Step count mismatch", "expected": len(user_db["current_sim_data"]), "received": step_count}
        ), 400

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
        logger.info(f"âœ… Cleared {cleared_count} pending repairs (client verified)")

    # Clear any old "broken" flags since client successfully rendered all steps
    cache_manager.clear_broken_status(original_prompt, original_difficulty)

    # Cache the simulation with the (potentially repaired) steps
    full_playlist = {"type": "simulation_playlist", "steps": user_db["current_sim_data"]}

    success = cache_manager.save_simulation(
        prompt=original_prompt,
        playlist_data=full_playlist,
        difficulty=original_difficulty,  # Pass difficulty for proper cache filtering
        is_final_complete=True,
        client_verified=True,
        session_id=session_id,
    )

    if success:
        user_db["simulation_verified"] = True
        logger.info(f"âœ… Simulation verified & cached: '{original_prompt[:40]}...' (difficulty={original_difficulty})")
        return jsonify({"status": "cached", "prompt": original_prompt[:50], "difficulty": original_difficulty}), 200
    else:
        return jsonify({"status": "cache_failed"}), 500


@repair_bp.route("/repair-failed", methods=["POST"])
@validate_session
def repair_failed():
    """
    Client calls this when a step fails to render after all repair attempts.
    This marks the simulation as broken and prevents caching.
    """
    data = request.get_json()
    session_id = g.session_id
    data.get("sim_id")
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
    difficulty = user_db.get("original_difficulty", "engineer")
    cache_manager.mark_simulation_broken(
        prompt=original_prompt, difficulty=difficulty, reason=f"Failed at step {step_index}"
    )

    logger.warning(f"âŒ Simulation marked broken at step {step_index}: '{original_prompt[:40]}...'")

    return jsonify({"status": "marked_broken"}), 200


@repair_bp.route("/repair", methods=["POST"])
@require_configured_api_key
@validate_session
def repair():
    """
    TIER 3: LLM-based repair (called after Tier 1 & 2 fail).

    IMPORTANT: This endpoint SANITIZES the LLM output before returning.
    The client should still try rendering, then try JS sanitizer if needed.
    """
    data = request.get_json()
    bad_code = data.get("code", "")
    error_msg = data.get("error", "")
    step_index = data.get("step_index", 0)
    context = data.get("context", "")
    data.get("sim_id", "")
    is_fallback = data.get("is_fallback", False)
    attempt_number = data.get("attempt_number", 1)
    previous_working = data.get("previous_working")

    if not bad_code:
        return jsonify({"error": "No code provided"}), 400

    session_id = g.session_id
    start_time = time.time()

    session_manager = get_session_manager()
    cache_manager = get_cache_manager()

    logger.info(f"[REPAIR] LLM Tier 3: attempt={attempt_number}, step={step_index}, fallback={is_fallback}")

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
        if is_fallback and previous_working:
            logger.info("[REPAIR] Fallback mode: modifying previous working graph")

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

            from core.config import get_genai_client

            client = get_genai_client()
            if not client:
                logger.error("Gemini client not initialized")
                fallback_response = {"status": "error", "message": "Gemini API not configured"}
                return jsonify(fallback_response), 500

            response = client.models.generate_content(model="gemini-2.5-flash", contents=fallback_prompt)

            if "```" in response.text:
                ai_fix = response.text.split("```")[1].replace("mermaid", "").strip()
            else:
                ai_fix = response.text.strip()

            # CRITICAL: Sanitize LLM output!
            ai_fix = sanitize_mermaid_code(ai_fix)

            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"[REPAIR] LLM fallback response received in {duration_ms}ms")

            # NOTE: Don't log success yet - client will report actual result via /repair-tier-result

            return jsonify(
                {
                    "fixed_code": ai_fix,
                    "method": "fallback",
                    "tier": 3,
                    "tier_name": "TIER3_LLM_PYTHON",
                    "sanitized": True,
                    "duration_ms": duration_ms,
                }
            )

        if attempt_number >= 2 and previous_working:
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
- Subgraph IDs must be SHORT (2-6 chars) with labels: subgraph IN["Input Layer"]

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
- Subgraph IDs must be SHORT (2-6 chars) with display labels: subgraph IN["Input Layer"]

OUTPUT ONLY THE FIXED MERMAID CODE. No explanation, no markdown code blocks."""

        model_name = "gemini-2.5-pro" if attempt_number >= 3 else "gemini-2.5-flash"

        logger.info(f"[REPAIR] Calling LLM ({model_name}) for attempt {attempt_number}...")

        from core.config import get_genai_client

        client = get_genai_client()
        if not client:
            logger.error("Gemini client not initialized")
            return jsonify({"error": "Gemini API not configured"}), 500

        response = client.models.generate_content(model=model_name, contents=repair_prompt)

        raw = response.text
        if "```mermaid" in raw:
            ai_fix = raw.split("```mermaid")[1].split("```")[0].strip()
        elif "```" in raw:
            ai_fix = raw.split("```")[1].split("```")[0].strip()
        else:
            ai_fix = raw.strip()

        # CRITICAL: Sanitize LLM output with Python sanitizer!
        ai_fix_sanitized = sanitize_mermaid_code(ai_fix)
        was_modified = ai_fix_sanitized != ai_fix

        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(f"[REPAIR] LLM response received in {duration_ms}ms, sanitized={was_modified}")

        # NOTE: Don't log success yet - client will report actual result via /repair-tier-result

        return jsonify(
            {
                "fixed_code": ai_fix_sanitized,
                "method": "llm",
                "tier": 3,
                "tier_name": "TIER3_LLM_PYTHON",
                "attempt": attempt_number,
                "sanitized": was_modified,
                "duration_ms": duration_ms,
            }
        )

    except Exception as e:
        logger.exception(f"[REPAIR] Failed: {e}")

        duration_ms = int((time.time() - start_time) * 1000)

        cache_manager.log_repair(
            repair_method=f"FAILED_ATTEMPT_{attempt_number}",
            broken_code=bad_code,
            error_msg=error_msg,
            fixed_code="",
            success=False,
            session_id=session_id,
            duration_ms=duration_ms,
        )

        if original_prompt:
            cache_manager.mark_repair_resolved(session_id, original_prompt, step_index, success=False)

        return jsonify({"error": str(e)}), 500


@repair_bp.route("/repair-success", methods=["POST"])
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
        logger.info(f"âœ… Repair verified by client: step {step_index}")

    return jsonify({"status": "acknowledged"}), 200


@repair_bp.route("/clear-pending-repairs", methods=["POST"])
@validate_session
def clear_pending_repairs():
    """Clear ALL pending repair flags for this session."""
    session_id = g.session_id
    cache_manager = get_cache_manager()

    # Clear all pending repairs for this session
    cleared_count = cache_manager.clear_all_pending_repairs(session_id)

    logger.info(f"[REPAIR] Cleared {cleared_count} pending repairs for session {session_id}")

    return jsonify({"status": "cleared", "count": cleared_count}), 200
