# routes/chat.py
"""
Main chat endpoint with streaming response and difficulty selection.
"""

import logging
import json
import random

from flask import Blueprint, request, jsonify, Response, g
from google import genai

from core.config import get_configured_api_key, get_session_manager, get_cache_manager
from core.decorators import validate_session, rate_limit, require_configured_api_key
from core.prompts import get_system_prompt, DIFFICULTY_PROMPTS
from core.utils import InputValidator
from core.repair_tester import RepairTester

logger = logging.getLogger(__name__)

# Initialize repair tester for raw output capture
repair_tester = RepairTester()

chat_bp = Blueprint('chat', __name__)


# ============================================================================
# INPUT DATA ENRICHMENT
# ============================================================================

_ALGO_PATTERNS = [
    # Order matters! More specific patterns first.
    ("sort", {
        "keywords": ["sort", "quicksort", "mergesort", "merge sort", "heapsort", "heap sort",
                     "bubblesort", "bubble sort", "insertion sort", "selection sort", "radix"],
        "generator": lambda: {
            "type": "array",
            "label": "Input Array",
            "value": random.sample(range(1, 100), random.randint(7, 10))
        }
    }),
    ("tree", {
        "keywords": ["bst", "binary search tree", "binary tree", "avl", "red-black",
                     "tree insertion", "tree deletion", "tree traversal", "inorder",
                     "preorder", "postorder", "heap"],
        "generator": lambda: {
            "type": "tree",
            "label": "Insert Sequence (BST)",
            "value": random.sample(range(1, 50), 8)
        }
    }),
    ("graph", {
        "keywords": ["dijkstra", "bfs", "breadth first", "dfs", "depth first",
                     "bellman", "prim", "kruskal", "shortest path", "spanning tree",
                     "topological", "graph traversal"],
        "generator": lambda: {
            "type": "graph",
            "label": "Weighted Graph (Adjacency List)",
            "value": {
                "A": {"B": 4, "C": 2},
                "B": {"A": 4, "D": 5, "E": 10},
                "C": {"A": 2, "D": 8, "F": 3},
                "D": {"B": 5, "C": 8, "E": 2},
                "E": {"B": 10, "D": 2, "F": 6},
                "F": {"C": 3, "E": 6}
            },
            "start": "A"
        }
    }),
    ("search", {
        "keywords": ["binary search", "linear search", "search algorithm",
                     "search a sorted", "searching"],
        "generator": lambda: {
            "type": "search",
            "label": "Sorted Array + Target",
            "value": (arr := sorted(random.sample(range(1, 80), 10)),
                      {"array": arr, "target": random.choice(arr)})[1]
        }
    }),
    ("dp", {
        "keywords": ["dynamic programming", "knapsack", "fibonacci", "longest common",
                     "lcs", "edit distance", "coin change", "memoization", "tabulation"],
        "generator": lambda: {
            "type": "dp",
            "label": "Problem Instance",
            "value": {
                "items": [{"weight": w, "value": v} for w, v in
                          zip(random.sample(range(1, 15), 5),
                              random.sample(range(5, 50), 5))],
                "capacity": random.randint(15, 25)
            }
        }
    }),
    ("linkedlist", {
        "keywords": ["linked list", "singly linked", "doubly linked", "reverse linked",
                     "cycle detection", "linked list merge"],
        "generator": lambda: {
            "type": "linkedlist",
            "label": "Linked List Values",
            "value": random.sample(range(1, 30), 6)
        }
    }),
    ("hash", {
        "keywords": ["hash table", "hash map", "hashing", "collision", "open addressing",
                     "chaining"],
        "generator": lambda: {
            "type": "hashtable",
            "label": "Keys to Insert (table size 7)",
            "value": {"keys": random.sample(range(1, 50), 6), "table_size": 7}
        }
    }),
]


def _enrich_simulation_input(user_msg):
    """Detect algorithm type and generate concrete input data.
    
    Returns:
        dict or None: Input data dict with type, label, value fields,
                      or None if algorithm type not recognized.
    """
    msg_lower = user_msg.lower()
    
    for category, config in _ALGO_PATTERNS:
        if any(kw in msg_lower for kw in config["keywords"]):
            try:
                data = config["generator"]()
                return data
            except Exception as e:
                logger.error(f"Failed to generate {category} input: {e}")
                return None
    
    return None


def _format_input_for_prompt(input_data):
    """Format input_data dict into a string for the LLM prompt."""
    if not input_data:
        return ""
    
    value = input_data.get("value")
    label = input_data.get("label", "Input Data")
    data_type = input_data.get("type", "unknown")
    
    formatted = json.dumps(value, indent=2) if isinstance(value, (dict, list)) else str(value)
    
    # Type-specific instructions to prevent common LLM mistakes
    type_guidance = ""
    if data_type == "graph":
        start = input_data.get("start", "A")
        type_guidance = f"""
**GRAPH EDGE SYNTAX (CRITICAL — VIOLATION = CRASH):**
- Start node: {start}
- For weighted edges, use LABELED ARROWS: `A -->|"4"| B;` or `A == "4" ==> B;`
- NEVER chain edges: `A -- "4" -- B` ← THIS CRASHES THE RENDERER
- Each edge MUST be a separate statement ending with semicolon
- Example: `A -->|"4"| B;\nA -->|"2"| C;\nB -->|"5"| D;`
"""
    elif data_type == "array" or data_type == "tree" or data_type == "linkedlist":
        type_guidance = """
**ARRAY/LIST VISUALIZATION:**
- Show each element as a separate node with its value and index
- Highlight the active element(s) being compared/swapped with the `active` class
- Use `done` class for elements in their final sorted position
"""
    elif data_type == "search":
        type_guidance = """
**SEARCH VISUALIZATION:**
- Show the array with low/mid/high pointers as labeled nodes
- Highlight the current search range and comparison
"""
    
    return f"""

**INPUT DATA ({label}):**
```
{formatted}
```
{type_guidance}
**CRITICAL:** You MUST use this exact data in your simulation. Do NOT invent your own example.
Operate on these specific values step by step. Show how each element changes throughout the algorithm.
"""


# ============================================================================
# STEP VALIDATION AND DEDUPLICATION
# ============================================================================

def validate_and_clean_steps(new_steps, current_sim_data, mode):
    """
    Validate and clean new steps before storing.
    
    Detects and removes:
    - Duplicate step numbers
    - Out-of-order steps
    - Steps with missing required fields
    
    Args:
        new_steps: List of step dicts from LLM
        current_sim_data: Current list of steps in session
        mode: Either "NEW_SIMULATION" or "CONTINUE_SIMULATION"
    
    Returns:
        Tuple of (cleaned_steps, warnings)
    """
    warnings = []
    cleaned = []
    seen_step_nums = set()
    
    # Get existing step numbers
    if current_sim_data:
        existing_nums = {s.get('step', -1) for s in current_sim_data}
    else:
        existing_nums = set()
    
    for step in new_steps:
        step_num = step.get('step')
        
        # Validation 1: Must have step number
        if step_num is None:
            warnings.append(f"Step missing 'step' field: {step.get('instruction', '')[:30]}...")
            continue
        
        # Validation 2: Duplicate within new response
        if step_num in seen_step_nums:
            warnings.append(f"Duplicate step number {step_num} in response (removing second occurrence)")
            continue
        
        # Validation 3: Duplicate with existing steps
        if step_num in existing_nums:
            warnings.append(f"Step {step_num} already exists in array (removing duplicate)")
            continue
        
        # Validation 4: Required fields present
        required_fields = ['step', 'instruction', 'mermaid']
        missing = [f for f in required_fields if f not in step]
        if missing:
            warnings.append(f"Step {step_num} missing fields: {', '.join(missing)}")
            step.update({f: "" for f in missing})
        
        seen_step_nums.add(step_num)
        cleaned.append(step)
    
    # Log validation results
    if warnings:
        logger.warning(f"⚠️ VALIDATION: {len(new_steps)} → {len(cleaned)} steps ({len(warnings)} issues)")
    
    return cleaned, warnings


def get_max_step_number(sim_data):
    """
    Get the highest step number from simulation data.
    Uses step field, not array length.
    Returns -1 if empty.
    """
    if not sim_data:
        return -1
    return max([s.get('step', -1) for s in sim_data])


def get_last_unique_step(sim_data):
    """
    Get the last step with a UNIQUE step number.
    Skips duplicates at the end of array.
    Returns None if empty.
    """
    if not sim_data:
        return None

    # Count occurrences of each step number
    from collections import Counter
    step_counts = Counter(s.get('step', -1) for s in sim_data)

    # Walk backwards and return the first step whose number appears exactly once
    for step in reversed(sim_data):
        step_num = step.get('step', -1)
        if step_counts[step_num] == 1:
            return step

    # All steps are duplicates; return the last one as fallback
    return sim_data[-1]


def _log_diagnostic(cache_manager, session_id, mode, difficulty, llm_raw, new_steps, cleaned_steps, 
                    storage_before, storage_after, integrity_pass, integrity_error):
    """
    Log diagnostic information for LLM request to database.
    Provides centralized diagnostic tracking for debugging.
    
    Args:
        cache_manager: Cache manager instance with database
        session_id: Session ID
        mode: Request mode (NEW_SIMULATION, CONTINUE_SIMULATION, etc)
        difficulty: Difficulty level
        llm_raw: Raw LLM response string
        new_steps: Steps parsed from LLM (before validation)
        cleaned_steps: Steps after validation
        storage_before: DB state before storing (list of step dicts)
        storage_after: DB state after storing (list of step dicts)
        integrity_pass: Boolean indicating integrity check passed
        integrity_error: Error message if integrity failed
    """
    try:
        import json
        
        # Log to console (one line, structured)
        step_diff = len(cleaned_steps) - len(storage_before)
        console_msg = f"[{mode[:4]}] LLM: {len(new_steps)} → {len(cleaned_steps)} (stored), DB: {len(storage_before)} → {len(storage_after)}"
        
        if len(cleaned_steps) == 1 and mode == "CONTINUE_SIMULATION":
            logger.warning(f"⚠️ {console_msg} (expected 3 steps!)")
        else:
            logger.info(console_msg)
        
        # Log to database
        diagnostic_data = {
            'mode': mode,
            'difficulty': difficulty,
            'llm_raw_response': llm_raw[:5000] if llm_raw else '',
            'llm_step_count': len(new_steps),
            'validation_input_count': len(new_steps),
            'validation_output_count': len(cleaned_steps),
            'validation_warnings': '',
            'storage_before_json': json.dumps([{'step': s.get('step'), 'instr': s.get('instruction', '')[:50]} for s in storage_before]),
            'storage_after_json': json.dumps([{'step': s.get('step'), 'instr': s.get('instruction', '')[:50]} for s in storage_after]),
            'integrity_check_pass': integrity_pass,
            'integrity_error': integrity_error or ''
        }
        
        if hasattr(cache_manager, '_database') and cache_manager._database:
            cache_manager._database.save_llm_diagnostic(session_id, diagnostic_data)
    except Exception as e:
        logger.error(f"Failed to log diagnostic: {e}")


@chat_bp.route('/chat', methods=['POST'])
@require_configured_api_key
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
    
    # Get session with proper error handling
    try:
        user_db = session_manager.get_session(session_id)
    except ValueError as e:
        logger.error(f"Invalid session: {e}")
        return jsonify({"error": "Invalid session ID"}), 401
    
    if user_db is None:
        logger.error(f"Session not found: {session_id}")
        return jsonify({"error": "Session not found"}), 401
    
    # Store difficulty preference in session
    user_db["difficulty"] = difficulty
    
    # =========================================================================
    # INTENT DETECTION
    # =========================================================================
    
    triggers_new = ["simulate", "simulation", "run", "visualize", "step through", 
                    "show", "create", "demonstrate"]
    triggers_continue = ["next", "continue", "proceed", "go on", "more"]
    
    # Check for regeneration trigger (user edited input data)
    is_regenerate = "REGENERATE_SIMULATION_WITH_NEW_INPUT" in user_msg
    
    is_new_sim = any(t in user_msg.lower() for t in triggers_new)
    
    if any(t in user_msg.lower() for t in ["more", "next"]):
        is_new_sim = False

    # Explicit CONTINUE_SIMULATION command from the GENERATE_MORE button always wins
    if "continue_simulation" in user_msg.lower():
        is_new_sim = False
    
    # Detect explicit CONTINUE_SIMULATION command from frontend GENERATE_MORE button.
    # This works even if session was lost (simulation_active is False).
    is_explicit_continue = "continue_simulation" in user_msg.lower()

    is_continue = is_explicit_continue or (
        any(t in user_msg.lower() for t in triggers_continue)
        and user_db["simulation_active"]
    )

    # If explicit continue but session lost, re-activate the simulation
    if is_explicit_continue and not user_db["simulation_active"]:
        user_db["simulation_active"] = True
        logger.warning(f"⚠️ Session lost but got explicit CONTINUE_SIMULATION, re-activating")
    
    # =========================================================================
    # HANDLE INPUT DATA REGENERATION
    # =========================================================================
    
    if is_regenerate:
        # Extract edited input data from message
        try:
            # Message format: REGENERATE_SIMULATION_WITH_NEW_INPUT: {...json...}
            import re
            match = re.search(r'REGENERATE_SIMULATION_WITH_NEW_INPUT:\s*(.*?)(?:\nUser comment:|$)', user_msg, re.DOTALL)
            if match:
                json_str = match.group(1).strip()
                edited_input = json.loads(json_str)
                user_db["input_data"] = edited_input  # Override with edited version
                logger.info(f"🔄 Input data regeneration detected: {edited_input.get('type', 'unknown')} type")
            
            # Force new simulation mode
            is_new_sim = True
            is_continue = False
            is_explicit_continue = False
        except Exception as e:
            logger.error(f"Failed to parse input data regeneration: {e}")
            # Fall back to treating it as a regular new simulation
            is_new_sim = True
            is_continue = False
    
    # =========================================================================
    # CACHE CHECK (Only for new simulations, only if VERIFIED complete)
    # =========================================================================
    
    # Generate concrete input data for simulations (unless regenerating with edited input)
    input_data = None
    if is_new_sim and not is_regenerate:
        input_data = _enrich_simulation_input(user_msg)
    elif is_new_sim and is_regenerate:
        # Input data already set from regeneration handler above
        input_data = user_db.get("input_data")
    
    # Skip cache check if regenerating (user is intentionally trying new input)
    if is_new_sim and not is_regenerate:
        if not cache_manager.has_pending_repair(session_id, user_msg):
            cached_data = cache_manager.get_cached_simulation(
                prompt=user_msg,
                difficulty=difficulty
            )
            
            if cached_data:
                user_db["simulation_active"] = True
                user_db["current_sim_data"] = cached_data.get('steps', [])
                user_db["current_step_index"] = 0
                user_db["original_prompt"] = user_msg
                user_db["original_difficulty"] = difficulty
                user_db["input_data"] = input_data
                
                # Include input_data in cached response so frontend can display it
                if input_data:
                    cached_data["input_data"] = input_data
                
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
        user_db["input_data"] = input_data  # Store generated input data
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
Do NOT say "Based on the context provided..."
You are an Expert Engine. You know how {user_msg} works.
"""
    
    expect_json = False
    
    # Get the appropriate system prompt for the difficulty level
    SYSTEM_PROMPT = get_system_prompt(difficulty)
    
    if mode == "NEW_SIMULATION":
        expect_json = True
        # Inject concrete input data into the system prompt
        input_section = _format_input_for_prompt(input_data)
        final_system_instruction = SYSTEM_PROMPT + input_section
        
    elif mode == "CONTINUE_SIMULATION":
        expect_json = True
        last_context = "Start of simulation."
        graph_progression = ""
        
        if user_db["current_sim_data"]:
            # FIX #3: Find last UNIQUE step, not just array[-1]
            last = get_last_unique_step(user_db["current_sim_data"])
            if last is None:
                last = user_db["current_sim_data"][-1]
            last_context = f"LAST STEP DATA: {last.get('data_table')}\nLAST LOGIC: {last.get('instruction')}"
            
            # Include last 3 graphs for pattern recognition (use sanitized versions if available)
            recent_steps = user_db["current_sim_data"][-3:]
            if len(recent_steps) >= 3:
                graph_progression = "\n".join([
                    f"**STEP {step.get('step', '?')} GRAPH:**\n```mermaid\n{step.get('mermaid_sanitized', step.get('mermaid', ''))}\n```"
                    for step in recent_steps
                ])
            elif len(recent_steps) >= 1:
                # Fallback if fewer than 3 steps exist
                # FIX #6: Warn if using non-sanitized mermaid
                fallback_step = recent_steps[-1]
                mermaid_code = fallback_step.get('mermaid_sanitized', fallback_step.get('mermaid', ''))
                graph_progression = f"**PREVIOUS GRAPH:**\n```mermaid\n{mermaid_code}\n```"
        
        # FIX #2: Use max step number, not array length
        max_step = get_max_step_number(user_db["current_sim_data"])
        step_count = max_step + 1
        
        # Build cumulative algorithm history from step_analysis fields
        analysis_history = ""
        if user_db["current_sim_data"]:
            recent_analyses = []
            for step in user_db["current_sim_data"][-10:]:
                sa = step.get('step_analysis', {})
                if sa:
                    recent_analyses.append({
                        "step": step.get('step', '?'),
                        "what_changed": sa.get('what_changed', ''),
                        "current_state": sa.get('current_state', ''),
                        "why_matters": sa.get('why_matters', '')
                    })
            if recent_analyses:
                analysis_history = f"""\n**ALGORITHM HISTORY (last {len(recent_analyses)} steps — maintain continuity!):**
```json
{json.dumps(recent_analyses, indent=1)}
```
"""
        
        # Include original input data so LLM remembers the dataset
        stored_input = user_db.get("input_data")
        input_reminder = _format_input_for_prompt(stored_input) if stored_input else ""
        
        # Get difficulty-appropriate continuation prompt
        continuation_style = {
            "explorer": "Keep the tone FUN and FRIENDLY. Use emojis and analogies.",
            "engineer": "Maintain technical precision. Show calculations and complexity.",
            "architect": "Include hardware context, tensor shapes, and scaling analysis."
        }
        
        # Include original simulation request for context preservation
        original_prompt_reminder = ""
        if user_db.get("original_prompt"):
            original_prompt_reminder = f"\n**ORIGINAL TASK:** {user_db['original_prompt']}\n"
        
        final_system_instruction = f"""
{SYSTEM_PROMPT}

**MODE: CONTINUATION (JSON ONLY)**
**TASK:** Resume the simulation from the Context below.
**STYLE REMINDER:** {continuation_style.get(difficulty, '')}
{original_prompt_reminder}
{input_reminder}
{analysis_history}

**CRITICAL INSTRUCTIONS FOR CONTINUATION:**

1. **EXAMINE THE PROGRESSION BELOW** - These are the last 3 steps showing how the algorithm has evolved:

{graph_progression}

2. **YOUR TASK - GENERATE THE NEXT 3 NEW STEPS:**
   - You will create Steps {step_count}, {step_count + 1}, and {step_count + 2}
   - These are BRAND NEW steps that continue the algorithm forward
   - Each step MUST show DIFFERENT state than all previous steps
   - DO NOT regenerate or copy Step {step_count - 1} (the last step shown above)

3. **HOW TO EVOLVE THE GRAPH:**
   - Keep the same node IDs (if previous graphs use H1, H2... keep those exact IDs)
   - UPDATE node labels to show new values (e.g., "H1 | z:0.8" → "H1 | z:0.9")
   - MOVE the 'active' class to the next node being processed
   - CHANGE edge styling if relationships evolve
   - NO RUNTIME SUBGRAPHS - put Call Stack/Queue data in data_table HTML field

4. **ALGORITHM MUST PROGRESS:**
   - If last step processed Node A, next step processes Node B or a different phase
   - If last step was "iteration 1", next step is "iteration 2" or "phase complete"
   - Each of your 3 steps should show measurable forward progress
   - FORBIDDEN: Outputting the same graph state 3 times with no changes

**CONTEXT:** {last_context}

**REQUIREMENTS:**
1. **CRITICAL - EXACTLY 3 STEPS REQUIRED:**
   - Your output MUST be a JSON object with a "steps" array containing EXACTLY 3 step objects
   - Format: `{{"steps": [{{"step": {step_count}, ...}}, {{"step": {step_count + 1}, ...}}, {{"step": {step_count + 2}, ...}}]}}`
   - Step numbers MUST be {step_count}, {step_count + 1}, {step_count + 2}
   - ❌ WRONG: `{{"steps": [{{"step": {step_count}}}]}}` (only 1 step)
   - ❌ WRONG: `{{"steps": [{{"step": {step_count - 1}, ...}}]}}` (regenerating old step)
   - ✅ CORRECT: Object with "steps" array containing 3 distinct step objects with ascending numbers
   - VIOLATION = SYSTEM CRASH. You MUST output exactly 3 steps.
2. Maintain the depth and style of the {difficulty.upper()} mode.
3. **ENDING CRITERIA:** Set `is_final: true` when algorithm reaches natural termination (array sorted, goal found, queue empty, all nodes visited). Target 8-12 total steps for engineer difficulty. Current step count: {step_count}.
4. **FORMAT:** Output strictly a JSON object with a "steps" key containing the array. Do NOT output a 'summary' field.
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
    
    # For continuations, the frontend sends a verbose prompt with full state context.
    # The backend already builds its own context from user_db["current_sim_data"],
    # so using the raw frontend message would be redundant and bloats the prompt.
    if mode == "CONTINUE_SIMULATION":
        # Use max step number (not array length) to match system prompt
        max_step = get_max_step_number(user_db["current_sim_data"])
        user_msg_for_prompt = f"CONTINUE_SIMULATION from step {max_step}. Generate the next 3 steps as a JSON steps array starting with step {max_step + 1}."
    else:
        user_msg_for_prompt = user_msg

    full_prompt = f"""
{final_system_instruction}
{context_instruction}
**HISTORY:**
{history_str}
**USER:** {user_msg_for_prompt}
"""
    
    # =========================================================================
    # STREAMING GENERATION
    # =========================================================================
    
    def generate():
        # Temperature per difficulty: higher for continuations to prevent repetition
        # Continuations need more creativity to avoid copying previous steps
        if mode == "CONTINUE_SIMULATION":
            temp_map = {"explorer": 0.7, "engineer": 0.6, "architect": 0.5}
        else:
            temp_map = {"explorer": 0.55, "engineer": 0.4, "architect": 0.3}
        
        config = {
            "temperature": temp_map.get(difficulty, 0.4),
            "max_output_tokens": 14000,
            "response_mime_type": "application/json" if expect_json else "text/plain"
        }
        
        # Get client and generate content with streaming
        from core.config import get_genai_client
        client = get_genai_client()
        if not client:
            logger.error("Gemini client not initialized")
            yield "ERROR: Gemini API not initialized"
            return
        
        full_response = ""
        
        try:
            stream = client.models.generate_content_stream(
                model='gemini-2.5-pro',
                contents=full_prompt,
                config=genai.types.GenerateContentConfig(**config)
            )
            
            for chunk in stream:
                if chunk.text:
                    clean_chunk = chunk.text
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
                        # Strip optional language tag (e.g. "json\n{...}" -> "{...")
                        if inner and '\n' in inner and inner.split('\n', 1)[0].strip().isalpha():
                            inner = inner.split('\n', 1)[1].strip()
                        clean_json = inner

                
                clean_json = clean_json.strip()
                
                
                # Reject if it looks like code (Python, JS, pseudocode, etc.)
                code_patterns = (
                    'queue', 'def ', 'import ', 'class ', 'if ', 'for ', 'while ', 
                    'pseudocode', 'function', 'const ', 'let ', 'var ', 'return ',
                    '#!/', '#include', 'public ', 'private ', 'void ', 'int ',
                    '// ', '/* ', 'async ', 'await ', 'console.', 'print(',
                    'python\n', 'javascript\n', 'java\n'  # Markdown language tags
                )
                stripped = clean_json.lstrip()
                if stripped.startswith(code_patterns) or not (stripped.startswith('{') or stripped.startswith('[')):
                    logger.error(f"❌ AI output is not JSON. First 200 chars: {clean_json[:200]}")
                    raise ValueError("AI generated code/text instead of JSON. Please retry.")
                
                data_obj = json.loads(clean_json)
                new_steps = []
                
                if isinstance(data_obj, dict) and "steps" in data_obj:
                    new_steps = data_obj["steps"]
                elif isinstance(data_obj, list):
                    new_steps = data_obj
                
                if not new_steps:
                    logger.error("❌ LLM returned empty/invalid steps")
                    # Log diagnostic with empty steps
                    storage_before = user_db.get('current_sim_data', [])
                    _log_diagnostic(cache_manager, session_id, mode, difficulty, 
                                   full_response, [], [], storage_before, storage_before, False, "Empty steps")
                else:
                    step_numbers = [s.get('step', '?') for s in new_steps]
                    
                    # FIX #1: Validate and clean steps before storing
                    storage_before = user_db.get('current_sim_data', [])
                    
                    cleaned_steps, validation_warnings = validate_and_clean_steps(
                        new_steps,
                        storage_before,
                        mode
                    )
                    
                    if not cleaned_steps:
                        logger.warning(f"⚠️ All {len(new_steps)} steps rejected during validation")
                        _log_diagnostic(cache_manager, session_id, mode, difficulty,
                                       full_response, new_steps, [], storage_before, storage_before, False, "Validation rejected all")
                    else:
                        # Store steps
                        if mode == "NEW_SIMULATION":
                            user_db["current_sim_data"] = cleaned_steps
                            action = "REPLACED"
                        else:
                            user_db["current_sim_data"].extend(cleaned_steps)
                            action = "EXTENDED"
                        
                        storage_after = user_db["current_sim_data"]

                        user_db["current_step_index"] = len(user_db["current_sim_data"]) - 1

                        # FIX #4: Add integrity check
                        max_step = get_max_step_number(storage_after)
                        array_len = len(storage_after)
                        expected_len = max_step + 1
                        
                        final_steps = [s.get('step', '?') for s in storage_after]
                        
                        integrity_pass = (array_len == expected_len)
                        integrity_error = ""
                        
                        if not integrity_pass:
                            integrity_error = f"length {array_len} != max+1 {expected_len}"
                            logger.error(f"❌ INTEGRITY FAILED: {integrity_error}")
                        
                        # Log diagnostic to database
                        _log_diagnostic(cache_manager, session_id, mode, difficulty,
                                       full_response, new_steps, cleaned_steps, 
                                       storage_before, storage_after, integrity_pass, integrity_error)

                        last_step = storage_after[-1]
                        is_final = last_step.get("is_final", False)

                        if is_final:
                            logger.info(f"🏁 Simulation complete ({len(storage_after)} steps)")
                            user_db["awaiting_verification"] = True
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {e}")
            except Exception as e:
                logger.exception(f"Post-processing error: {e}")
        
        
        # Update chat history
        # For continuations and JSON responses, store clean summaries instead of
        # massive raw data. This prevents history from snowballing and confusing
        # the LLM on subsequent requests.
        if mode == "CONTINUE_SIMULATION":
            step_total = len(user_db.get("current_sim_data", []))
            user_db["chat_history"].append({
                "role": "user",
                "content": f"User requested simulation continuation from step {step_total - 2}"
            })
            user_db["chat_history"].append({
                "role": "model",
                "content": f"Generated continuation steps. Total steps now: {step_total}"
            })
        elif expect_json and full_response.strip().startswith(("{", "[")):
            user_db["chat_history"].append({"role": "user", "content": user_msg})
            step_total = len(user_db.get("current_sim_data", []))
            user_db["chat_history"].append({
                "role": "model",
                "content": f"Generated simulation playlist with {step_total} steps."
            })
        else:
            user_db["chat_history"].append({"role": "user", "content": user_msg})
            user_db["chat_history"].append({"role": "model", "content": full_response})
        
        if sources:
            source_text = "\n\n**SOURCES:**\n" + "\n".join([
                f"- {s.get('source', 'Unknown')}" for s in sources
            ])
            yield source_text
        
        # Yield final confirmation to frontend
        if expect_json and user_db.get('current_sim_data'):
            db_steps = [s.get('step', '?') for s in user_db.get('current_sim_data', [])]
            yield f"\n<!--DB_STATE:{json.dumps({'total': len(user_db['current_sim_data']), 'steps': db_steps})}-->"
        
        # Yield input_data as trailing marker so frontend can display the badge
        if expect_json and input_data:
            yield f"\n<!--AXIOM_INPUT_DATA:{json.dumps(input_data)}-->"
        elif expect_json and not input_data:
            # For continuations, yield stored input data
            stored = user_db.get("input_data")
            if stored:
                yield f"\n<!--AXIOM_INPUT_DATA:{json.dumps(stored)}-->"
    
    return Response(generate(), mimetype='text/plain')


@chat_bp.route('/update-sanitized-graph', methods=['POST'])
@validate_session
def update_sanitized_graph():
    """Store the sanitized Mermaid graph from frontend after successful render.
    
    This ensures continuations use working graphs instead of raw LLM output.
    """
    data = request.get_json()
    session_id = g.session_id
    step_index = data.get('step_index')
    sanitized_code = data.get('sanitized_mermaid')
    
    if step_index is None or not sanitized_code:
        return jsonify({"error": "Missing step_index or sanitized_mermaid"}), 400
    
    session_manager = get_session_manager()
    user_db = session_manager.get_session(session_id)
    
    if not user_db or not user_db.get('current_sim_data'):
        return jsonify({"error": "No simulation data found"}), 400
    
    if step_index >= len(user_db['current_sim_data']):
        return jsonify({"error": "Invalid step_index"}), 400
    
    # Store sanitized version alongside raw LLM output
    user_db['current_sim_data'][step_index]['mermaid_sanitized'] = sanitized_code
    
    return jsonify({"success": True})


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
                    "Thought-provoking questions after each step",
                    "Clean, simple diagrams (~6 nodes)"
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
                    "Pseudocode line references per step",
                    "Edge cases and invariants",
                    "Detailed diagrams (9-12 nodes)"
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
                    "Alternative algorithm comparisons",
                    "Complex diagrams (12-18 nodes)"
                ],
                "example_topic": "Transformer attention with tensor operations"
            }
        },
        "default": "engineer"
    })
