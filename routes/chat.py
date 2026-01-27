# routes/chat.py
"""
Main chat endpoint with streaming response and difficulty selection.
"""

import logging
import json

from flask import Blueprint, request, jsonify, Response, g
import google.generativeai as genai

from core.config import get_configured_api_key, get_session_manager, get_cache_manager
from core.decorators import validate_session, rate_limit
from core.prompts import get_system_prompt, DIFFICULTY_PROMPTS
from core.utils import InputValidator
from core.repair_tester import RepairTester

logger = logging.getLogger(__name__)

# Initialize repair tester for raw output capture
repair_tester = RepairTester()

chat_bp = Blueprint('chat', __name__)


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


@chat_bp.route('/chat', methods=['POST'])
@_require_api_key
@validate_session
@rate_limit(max_requests=30, window_seconds=60)
def chat():
    """Main chat endpoint with streaming response."""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400
    
    raw_message = data.get("message", "")
    user_msg = InputValidator.sanitize_message(raw_message)
    
    # Get difficulty level (default to engineer)
    difficulty = data.get("difficulty", "engineer").lower()
    if difficulty not in DIFFICULTY_PROMPTS:
        difficulty = "engineer"
    
    if not user_msg:
        return jsonify({"error": "Message cannot be empty"}), 400
    
    session_id = g.session_id
    session_manager = get_session_manager()
    cache_manager = get_cache_manager()
    user_db = session_manager.get_session(session_id)
    
    # Store difficulty preference in session
    user_db["difficulty"] = difficulty
    
    logger.info(f"📊 Difficulty: {difficulty.upper()} | Message: {user_msg[:50]}...")
    
    # =========================================================================
    # INTENT DETECTION
    # =========================================================================
    
    triggers_new = ["simulate", "simulation", "run", "visualize", "step through", 
                    "show", "create", "demonstrate"]
    triggers_continue = ["next", "continue", "proceed", "go on", "more"]
    
    is_new_sim = any(t in user_msg.lower() for t in triggers_new)
    
    if any(t in user_msg.lower() for t in ["more", "next"]):
        is_new_sim = False
    
    is_continue = (
        any(t in user_msg.lower() for t in triggers_continue) 
        and user_db["simulation_active"]
    )
    
    # =========================================================================
    # CACHE CHECK (Only for new simulations, only if VERIFIED complete)
    # =========================================================================
    
    if is_new_sim:
        # Use raw prompt for semantic search, difficulty as filter
        cache_key = user_msg  # No longer prefix with difficulty
        
        if not cache_manager.has_pending_repair(session_id, cache_key):
            cached_data = cache_manager.get_cached_simulation(
                cache_key,
                difficulty=difficulty,  # Filter by difficulty
                require_complete=True,
                require_verified=True
            )
            
            if cached_data:
                user_db["simulation_active"] = True
                user_db["current_sim_data"] = cached_data.get('steps', [])
                user_db["current_step_index"] = 0
                user_db["original_prompt"] = cache_key
                user_db["original_difficulty"] = difficulty
                
                logger.info(f"⚡ Cache hit for: {user_msg[:40]}... (difficulty: {difficulty})")
                return jsonify(cached_data)
    
    # =========================================================================
    # MODE SELECTION
    # =========================================================================
    
    if is_new_sim:
        mode = "NEW_SIMULATION"
        user_db["simulation_active"] = True
        user_db["chat_history"] = []
        user_db["current_sim_data"] = []
        user_db["current_step_index"] = 0
        user_db["original_prompt"] = user_msg  # Raw prompt, no difficulty prefix
        user_db["original_difficulty"] = difficulty  # Store difficulty separately
        user_db["simulation_verified"] = False
        logger.info(f"🆕 NEW SIMULATION ({difficulty}): {user_msg[:50]}... (Session: {session_id[:16]}...)")
        
    elif is_continue:
        mode = "CONTINUE_SIMULATION"
        logger.info(f"➡️ CONTINUE SIMULATION (Session: {session_id[:16]}...)")
        
    elif user_db["simulation_active"]:
        mode = "CONTEXTUAL_QA"
        
    else:
        mode = "GENERAL_QA"
    
    # =========================================================================
    # RETRIEVAL (RAG)
    # =========================================================================
    
    context = ""
    sources = []
    
    if user_db["vector_store"]:
        try:
            retriever = user_db["vector_store"].as_retriever(search_kwargs={"k": 4})
            docs = retriever.invoke(user_msg)
            context = "\n\n".join([d.page_content for d in docs])
            sources = [d.metadata for d in docs]
        except Exception as e:
            logger.error(f"Retrieval error: {e}")
    
    # =========================================================================
    # PROMPT CONSTRUCTION
    # =========================================================================
    
    history_str = "\n".join([
        f"{m['role']}: {m['content']}" 
        for m in user_db["chat_history"][-10:]
    ])
    
    context_instruction = f"""
**CONTEXT FROM UPLOADED FILE:**
{context if context else "NO FILE LOADED. Use your internal knowledge."}

**CRITICAL INSTRUCTION:**
If the Context above is empty or irrelevant, USE YOUR INTERNAL KNOWLEDGE.
Do NOT say "Based on the context provided...".
You are an Expert Engine. You know how {user_msg} works.
"""
    
    expect_json = False
    
    # Get the appropriate system prompt for the difficulty level
    SYSTEM_PROMPT = get_system_prompt(difficulty)
    
    if mode == "NEW_SIMULATION":
        expect_json = True
        final_system_instruction = SYSTEM_PROMPT
        
    elif mode == "CONTINUE_SIMULATION":
        expect_json = True
        last_context = "Start of simulation."
        last_mermaid = ""
        
        if user_db["current_sim_data"]:
            last = user_db["current_sim_data"][-1]
            last_mermaid = last.get('mermaid', '')
            last_context = f"LAST STEP DATA: {last.get('data_table')}\nLAST LOGIC: {last.get('instruction')}"
        
        step_count = len(user_db["current_sim_data"])
        
        # Get difficulty-appropriate continuation prompt
        continuation_style = {
            "explorer": "Keep the tone FUN and FRIENDLY. Use emojis and analogies.",
            "engineer": "Maintain technical precision. Show calculations and complexity.",
            "architect": "Include hardware context, tensor shapes, and scaling analysis."
        }
        
        final_system_instruction = f"""
{SYSTEM_PROMPT}

**MODE: CONTINUATION (JSON ONLY)**
**TASK:** Resume the simulation from the Context below.
**STYLE REMINDER:** {continuation_style.get(difficulty, '')}

**CRITICAL GRAPH INSTRUCTION:**
Below is the MERMAID code from the previous step. You **MUST** use this exact code as your base template.
1. **COPY** the Previous Graph structure (Nodes, Subgraphs, Styling).
2. **MODIFY** only what has changed (Update text values, move arrows, highlight new active nodes).
3. **DO NOT** reinvent the layout. Keep node IDs consistent.

**PREVIOUS GRAPH TO ITERATE ON:**
```mermaid
{last_mermaid}
```

**CONTEXT:** {last_context}

**REQUIREMENTS:**
1. Generate the NEXT 2 steps (Steps {step_count} and {step_count + 1}).
2. Maintain the depth and style of the {difficulty.upper()} mode.
3. **FORMAT:** Output strictly the JSON 'steps' array. Do NOT output a 'summary' field.
"""
        
    elif mode == "CONTEXTUAL_QA":
        expect_json = False
        curr_state = ""
        if user_db["current_sim_data"]:
            curr_state = user_db["current_sim_data"][-1].get('instruction', 'No context')
        
        # Adjust QA style based on difficulty
        qa_style = {
            "explorer": "Answer in a friendly, encouraging way. Use simple terms and analogies.",
            "engineer": "Provide a technical answer with relevant complexity analysis.",
            "architect": "Give a deep, research-level answer with implementation details."
        }
        
        final_system_instruction = f"""
**MODE: TEACHER (TEXT)**
**DIFFICULTY: {difficulty.upper()}**
The user has paused the simulation to ask a question.
CURRENT BOARD STATE: {curr_state}

USER QUESTION: "{user_msg}"

INSTRUCTIONS:
1. Answer the question in the {difficulty.upper()} style: {qa_style.get(difficulty, '')}
2. Reference the current simulation step if relevant.
3. Do NOT generate a JSON playlist.
4. If you need to draw a diagram, use standard Markdown ```mermaid``` blocks.
"""
        
    else:  # GENERAL_QA
        expect_json = False
        final_system_instruction = f"""
**MODE: GENERAL ASSISTANT**
**DIFFICULTY: {difficulty.upper()}**
Answer the question. Use the Context if available, otherwise use internal knowledge.
Match the {difficulty.upper()} mode style in your response.
"""
    
    full_prompt = f"""
{final_system_instruction}
{context_instruction}
**HISTORY:**
{history_str}
**USER:** {user_msg}
"""
    
    # =========================================================================
    # STREAMING GENERATION
    # =========================================================================
    
    def generate():
        config = {
            "temperature": 0.2,  # Lower temperature for more consistent JSON output
            "max_output_tokens": 12000,
            "response_mime_type": "application/json" if expect_json else "text/plain"
        }
        
        # Use latest model as requested by user
        model = genai.GenerativeModel('gemini-2.5-pro', generation_config=config)
        
        full_response = ""
        
        try:
            stream = model.generate_content(full_prompt, stream=True)
            
            for chunk in stream:
                if chunk.parts:
                    clean_chunk = chunk.text.replace("$$", "").replace(r"\[", "(").replace(r"\]", ")")
                    full_response += clean_chunk
                    yield clean_chunk
        except StopIteration:
            # Stream ended normally - this is expected when the stream completes
            pass
        except Exception as e:
            logger.exception(f"Streaming error: {e}")
            yield f"\n\n**SYSTEM ERROR:** {str(e)}"
        
        # =========================================================
        # POST-STREAM PROCESSING
        # =========================================================
        
        if expect_json:
            try:
                clean_json = full_response.strip()
                
                # Remove markdown code blocks
                if "```json" in clean_json:
                    parts = clean_json.split("```json")
                    if len(parts) > 1:
                        clean_json = parts[1].split("```")[0]
                elif "```" in clean_json:
                    parts = clean_json.split("```")
                    if len(parts) >= 3:
                        inner = parts[1].strip()
                        # Check if inner content starts with a language tag (python, javascript, etc.)
                        # If so, the AI is outputting code, not JSON
                        lang_tags = ('python', 'javascript', 'js', 'typescript', 'ts', 'java', 'cpp', 'c++', 'ruby', 'go', 'rust')
                        if inner.split('\n')[0].strip().lower() in lang_tags:
                            logger.error(f"❌ AI output is a code block, not JSON: {inner[:100]}")
                            raise ValueError("AI generated a code block instead of JSON. Please retry.")
                        clean_json = inner
                
                clean_json = clean_json.strip()
                
                # Fix common JSON issues
                import re
                # Fix unescaped backslashes (not valid JSON escapes)
                clean_json = re.sub(r'\\(?![\\"/bfnrtu]|u[0-9a-fA-F]{4})', r'\\\\', clean_json)
                # Fix single quotes
                clean_json = clean_json.replace("\\'", "'")
                # Fix double-escaped quotes
                clean_json = clean_json.replace('\\\\"', '\\"')
                
                # Reject if it looks like code (Python, JS, pseudocode, etc.)
                code_patterns = (
                    'queue', 'def ', 'import ', 'class ', 'if ', 'for ', 'while ', 
                    'pseudocode', 'function', 'const ', 'let ', 'var ', 'return ',
                    '#!/', '#include', 'public ', 'private ', 'void ', 'int ',
                    '// ', '/* ', 'async ', 'await ', 'console.', 'print(',
                    'python\n', 'javascript\n', 'java\n'  # Markdown language tags
                )
                stripped = clean_json.lstrip()
                if stripped.startswith(code_patterns) or not stripped.startswith('{'):
                    logger.error(f"❌ AI output is not JSON. First 200 chars: {clean_json[:200]}")
                    raise ValueError("AI generated code/text instead of JSON. Please retry.")
                
                data_obj = json.loads(clean_json)
                new_steps = []
                
                if isinstance(data_obj, dict) and "steps" in data_obj:
                    new_steps = data_obj["steps"]
                elif isinstance(data_obj, list):
                    new_steps = data_obj
                
                if new_steps:
                    # GHOST DEBUG: Capture raw mermaid for testing (non-blocking)
                    try:
                        for step_idx, step in enumerate(new_steps):
                            if 'mermaid' in step:
                                # Fire-and-forget: log raw mermaid for debugging
                                # This happens BEFORE any sanitization
                                logger.debug(f"[GHOST] Captured raw mermaid from step {step_idx} ({len(step['mermaid'])} chars)")
                                # Note: Actual testing happens client-side via debug.html
                    except Exception as debug_err:
                        # Don't let debug capture break the main flow
                        logger.warning(f"[GHOST] Debug capture failed: {debug_err}")

                    if mode == "NEW_SIMULATION":
                        user_db["current_sim_data"] = new_steps
                    else:
                        user_db["current_sim_data"].extend(new_steps)

                    user_db["current_step_index"] = len(user_db["current_sim_data"]) - 1

                    last_step = user_db["current_sim_data"][-1]
                    is_final = last_step.get("is_final", False)

                    if is_final:
                        logger.info(f"⏳ Simulation complete, awaiting client verification...")
                        user_db["awaiting_verification"] = True
                    else:
                        logger.info(f"⏳ Step complete (not final). Total: {len(user_db['current_sim_data'])}")
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error: {e}")
            except Exception as e:
                logger.exception(f"Post-processing error: {e}")
        
        # Update chat history
        user_db["chat_history"].append({"role": "user", "content": user_msg})
        user_db["chat_history"].append({"role": "model", "content": full_response})
        
        if sources:
            source_text = "\n\n**SOURCES:**\n" + "\n".join([
                f"- {s.get('source', 'Unknown')}" for s in sources
            ])
            yield source_text
    
    return Response(generate(), mimetype='text/plain')


@chat_bp.route('/difficulty-info', methods=['GET'])
def difficulty_info():
    """Return information about available difficulty levels."""
    return jsonify({
        "difficulties": {
            "explorer": {
                "name": "🌟 Explorer",
                "tagline": "Fun & Friendly Learning",
                "description": "Perfect for beginners! Uses games, analogies, and emojis to make algorithms approachable.",
                "audience": "CS101/102 students, visual learners",
                "features": [
                    "Simple vocabulary & short sentences",
                    "Real-world analogies (pizza delivery, video games)",
                    "Encouraging tone with celebrations",
                    "Clean, simple diagrams (8-15 nodes)"
                ],
                "example_topic": "BFS as a neighborhood explorer"
            },
            "engineer": {
                "name": "⚙️ Engineer", 
                "tagline": "Technical & Practical",
                "description": "Industry-ready explanations with Big-O analysis, pseudocode, and real applications.",
                "audience": "DS&A students, interview prep, developers",
                "features": [
                    "Complexity analysis (Time/Space)",
                    "Pseudocode with calculations",
                    "Edge cases and invariants",
                    "Detailed diagrams (10-20 nodes)"
                ],
                "example_topic": "Dijkstra's with priority queue operations"
            },
            "architect": {
                "name": "🏗️ Architect",
                "tagline": "Deep Theory & Systems",
                "description": "Research-level depth with mathematical rigor, hardware context, and scaling analysis.",
                "audience": "Grad students, senior engineers, researchers",
                "features": [
                    "Mathematical derivations",
                    "Hardware-aware (FLOPs, memory bandwidth)",
                    "Tensor shapes and numerical stability",
                    "Complex diagrams (15-30 nodes)"
                ],
                "example_topic": "Transformer attention with tensor operations"
            }
        },
        "default": "engineer"
    })
