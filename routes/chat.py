# routes/chat.py
"""
Main chat endpoint with streaming response and difficulty selection.
"""

import logging
import json
import random

from flask import Blueprint, request, jsonify, Response, g
import google.generativeai as genai

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
                logger.info(f"📊 Generated {category} input data: {data['label']}")
                return data
            except Exception as e:
                logger.warning(f"Input generation failed for {category}: {e}")
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
    # CACHE CHECK (Only for new simulations, only if VERIFIED complete)
    # =========================================================================
    
    # Generate concrete input data for simulations
    input_data = None
    if is_new_sim:
        input_data = _enrich_simulation_input(user_msg)
    
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
                user_db["input_data"] = input_data
                
                # Include input_data in cached response so frontend can display it
                if input_data:
                    cached_data["input_data"] = input_data
                
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
        last_mermaid = ""
        
        if user_db["current_sim_data"]:
            last = user_db["current_sim_data"][-1]
            last_mermaid = last.get('mermaid', '')
            last_context = f"LAST STEP DATA: {last.get('data_table')}\nLAST LOGIC: {last.get('instruction')}"
        
        step_count = len(user_db["current_sim_data"])
        
        # Build cumulative algorithm history from step_analysis fields
        analysis_history = ""
        if user_db["current_sim_data"]:
            recent_analyses = []
            for step in user_db["current_sim_data"][-6:]:
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
        
        final_system_instruction = f"""
{SYSTEM_PROMPT}

**MODE: CONTINUATION (JSON ONLY)**
**TASK:** Resume the simulation from the Context below.
**STYLE REMINDER:** {continuation_style.get(difficulty, '')}
{input_reminder}
{analysis_history}
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
    
    # For continuations, the frontend sends a verbose prompt with full state context.
    # The backend already builds its own context from user_db["current_sim_data"],
    # so using the raw frontend message would be redundant and bloats the prompt.
    if mode == "CONTINUE_SIMULATION":
        step_count_for_prompt = len(user_db["current_sim_data"])
        user_msg_for_prompt = f"CONTINUE_SIMULATION from step {step_count_for_prompt}. Generate the next 2 steps as a JSON steps array."
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
        # Temperature per difficulty: explorer is more creative, architect is precise
        temp_map = {"explorer": 0.55, "engineer": 0.4, "architect": 0.3}
        config = {
            "temperature": temp_map.get(difficulty, 0.4),
            "max_output_tokens": 14000,
            "response_mime_type": "application/json" if expect_json else "text/plain"
        }
        
        # Use latest model as requested by user
        model = genai.GenerativeModel('gemini-2.5-pro', generation_config=config)
        
        full_response = ""
        
        try:
            stream = model.generate_content(full_prompt, stream=True)
            
            for chunk in stream:
                if chunk.parts:
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
        
        # Yield input_data as trailing marker so frontend can display the badge
        if expect_json and input_data:
            yield f"\n<!--AXIOM_INPUT_DATA:{json.dumps(input_data)}-->"
        elif expect_json and not input_data:
            # For continuations, yield stored input data
            stored = user_db.get("input_data")
            if stored:
                yield f"\n<!--AXIOM_INPUT_DATA:{json.dumps(stored)}-->"
    
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
