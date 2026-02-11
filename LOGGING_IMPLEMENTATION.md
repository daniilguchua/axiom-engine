# Logging Implementation Guide

## Overview
Refactored the logging system to provide clear, actionable diagnostics without cognitive overload. Replaced scattered logs with a structured database, minimized console noise, and added a visual diagnostics viewer.

---

## What Changed

### 1. **Database Schema** (`core/cache/database.py`)
- ✅ Added `llm_diagnostics` table with 15 columns tracking:
  - Mode, difficulty, timestamp
  - Raw LLM response (first 5KB)
  - LLM step count vs validation output
  - Before/after storage state (JSON snapshots)
  - Integrity check results
  
- ✅ Added helper methods:
  - `save_llm_diagnostic()` - Write diagnostic record to DB
  - `get_latest_diagnostics(session_id, limit)` - Retrieve past N diagnostics

### 2. **Console Logging** (`routes/chat.py`)
**Removed (noise):**
- ❌ Generic "⚡ Cache hit" messages
- ❌ Detailed validation warning per-step
- ❌ Generic "✅ All X steps passed" messages
- ❌ Pre-mode-detection log
- ❌ Verbose "⏸ Continuing (N total)" messages

**Kept (signal):**
- ✅ Mode detection logging (NEW_SIMULATION, CONTINUE_SIMULATION, etc)
- ✅ LLM step count summary: `🔍 LLM returned: 3 steps [1,2,3]`
- ✅ Errors: validation rejections, JSON parse failures, integrity failures
- ✅ Final completion: `🏁 Simulation complete (8 steps)`
- ✅ One-line compact summary: `[CONT] LLM: 1 → 1 (stored), DB: 3 → 4`

### 3. **Structured Diagnostic Helper** (`routes/chat.py`)
Added `_log_diagnostic()` function that:
- Writes one-line console summary with compact information
- Stores full diagnostic record to database
- Captures raw LLM response (first 5KB for inspection)
- Compares before/after storage state
- Records validation results and integrity checks

### 4. **Debug Dashboard** (`routes/debug.py`)
Added `/debug/llm-diagnostics?session_id=...` endpoint that serves interactive HTML showing:
- **Latest 20 diagnostics** for a session (reverse chronological)
- **For each request:**
  - Mode badge (color-coded: NEW=green, CONTINUE=blue, QA=orange)
  - Difficulty level
  - Timestamp
  - **Step flow visualization:** "LLM generated: 1 steps → Validation: 1 → 1 steps → Stored 1"
  - **Before/after storage:** JSON snapshots of current_sim_data
  - **Integrity check:** ✅ or ❌ with details
  - **Raw LLM response:** First 500 chars formatted for readability

---

## How to Use It

### 1. Generate a Simulation
```bash
# Terminal
curl http://localhost:5000/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message": "simulate quicksort", "difficulty": "engineer"}'
```

### 2. Check Console Logs
Look for compact one-liners like:
```
[NEW] LLM: 3 → 3 (stored), DB: 0 → 3
[CONT] LLM: 1 → 1 (stored), DB: 3 → 4 (expected 3 steps!)
🔍 LLM returned: 1 steps [4]
❌ INTEGRITY FAILED: length 4 != max+1 5
```

### 3. Open Diagnostics Viewer
```
http://localhost:5000/debug/llm-diagnostics?session_id=YOUR_SESSION_ID
```

**In the browser:**
- See color-coded request modes
- Inspect raw LLM JSON output
- View before/after storage state
- Check integrity pass/fail with details
- Scroll through time-series diagnostics

---

## Diagnostic Information Available

### Per Request:
| Field | Purpose |
|-------|---------|
| `mode` | NEW_SIMULATION, CONTINUE_SIMULATION, CONTEXTUAL_QA, GENERAL_QA |
| `difficulty` | explorer, engineer, architect |
| `llm_raw_response` | First 5KB of actual LLM JSON for inspection |
| `llm_step_count` | How many steps LLM generated |
| `validation_input_count` | Steps before validation |
| `validation_output_count` | Steps after validation (should match LLM count if valid) |
| `storage_before_json` | Snapshot of current_sim_data before storing |
| `storage_after_json` | Snapshot of current_sim_data after storing |
| `integrity_check_pass` | True/false: length == max_step + 1 |
| `integrity_error` | Error message if integrity check failed |

---

## Key Insight: Finding Why Only 1 Step Is Generated

When you see the console message:
```
[CONT] LLM: 1 → 1 (stored), DB: 3 → 4 (expected 3!)
```

This tells you: **LLM returned 1 step, validation accepted it, and it's now stored.**

To debug further:
1. Open `/debug/llm-diagnostics?session_id=...`
2. Scroll to the latest CONTINUE_SIMULATION entry
3. Expand the "Raw LLM Response" section
4. **Inspect the actual JSON** - is it literally returning only 1 step object?

If the JSON shows `[{step: 4, ...}]` (array of 1), the problem is **upstream at the prompt**.
If the JSON shows 3 steps but console says "1 → 1", the problem is in **validation logic**.

---

## Console Log Examples

### Healthy Flow
```
🆕 NEW SIMULATION (engineer): quicksort...
🔍 LLM returned: 3 steps [1,2,3]
[NEW] LLM: 3 → 3 (stored), DB: 0 → 3
🏁 Simulation complete (3 steps)
```

### Problematic Flow (The Current Issue)
```
➡️ CONTINUE SIMULATION
🔍 LLM returned: 1 step [4]
⚠️ [CONT] LLM: 1 → 1 (stored), DB: 3 → 4 (expected 3 steps!)
```

### Error Cases
```
❌ LLM returned empty/invalid steps
❌ All steps rejected by validation
❌ INTEGRITY FAILED: length 4 != max+1 5
❌ JSON decode error: ...
```

---

## Database Location
```
core/.axiom_test_cache/axiom.db
```

To inspect directly (if needed):
```bash
sqlite3 core/.axiom_test_cache/axiom.db
SELECT * FROM llm_diagnostics WHERE session_id = 'YOUR_ID' ORDER BY created_at DESC;
```

---

## Files Modified
- ✅ `core/cache/database.py` - Added schema + helper methods
- ✅ `routes/chat.py` - Refactored logging, added `_log_diagnostic()` helper
- ✅ `routes/debug.py` - Added `/debug/llm-diagnostics` endpoint
- ✅ All syntax validated
