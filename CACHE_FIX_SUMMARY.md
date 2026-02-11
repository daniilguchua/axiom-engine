# Cache Fix Summary - Phase 1 + Phase 2-Lite

**Date:** February 10, 2026  
**Status:** ✅ COMPLETED & VERIFIED

---

## 🐛 Critical Bugs Fixed

### 1. **Non-Functional Broken Simulation Check** (CRITICAL)
**Problem:** The `_is_simulation_broken()` check always returned `False` because it required a `get_hash_callback` parameter that was never passed.

**Fix:** 
- Removed confusing callback parameter
- `RepairTracker` now handles hashing internally
- Broken simulation checks now actually work!

**Files Changed:**
- [core/cache/__init__.py](core/cache/__init__.py#L133-L135)
- [core/cache/repair_tracker.py](core/cache/repair_tracker.py#L28-L44)

### 2. **Hashing Inconsistency**
**Problem:** `is_simulation_broken()` expected a callback, but `mark_simulation_broken()` computed hashes directly.

**Fix:** Standardized hashing with internal `_get_prompt_hash()` method in `RepairTracker`.

---

## 🎯 New Features (Phase 2-Lite)

### Smart Retry Logic
Replaces binary "broken/not-broken" with intelligent retry system:

```python
# First failure: marked broken, can retry after 24h
# Second failure: still temporary, retry after 24h
# Third failure: PERMANENTLY BROKEN (requires manual clear)
```

### New Database Schema
Added to `broken_simulations` table:
- `retry_count` - Tracks failure attempts (1, 2, 3+)
- `last_retry_at` - Timestamp of last failure
- `is_permanently_broken` - Flag for permanent failures

### Automatic Recovery
- Broken status **expires after 24 hours** (cooldown period)
- After cooldown, simulation can be retried automatically
- Only after **3 failures** does it become permanent

---

## 📊 How It Works Now

### Marking Broken
```python
# First failure
cache_manager.mark_simulation_broken(
    prompt="Create a data flow graph",
    difficulty="engineer",
    reason="Failed at step 2"
)
# Result: retry_count=1, temporary broken, cooldown starts

# Second failure (within 24h)
cache_manager.mark_simulation_broken(...)
# Result: retry_count=2, still temporary

# Third failure
cache_manager.mark_simulation_broken(...)
# Result: retry_count=3, PERMANENTLY BROKEN
```

### Checking Status
```python
is_broken = cache_manager._is_simulation_broken(prompt, difficulty)

# Returns True if:
#   - Permanently broken (retry_count >= 3), OR
#   - Temporarily broken within 24h cooldown

# Returns False if:
#   - Never marked broken, OR
#   - Cooldown expired (auto-cleared)
```

### Clearing Status
```python
# Called automatically when client confirms success
cache_manager.clear_broken_status(prompt, difficulty)

# This:
# - Removes broken status entry
# - Resets retry count
# - Allows caching again
```

---

## ✅ What's Fixed

| Issue | Before | After |
|-------|--------|-------|
| Broken check | Always returned `False` | Actually blocks broken simulations |
| Retry logic | None - permanent on first failure | 3 attempts with 24h cooldown |
| Recovery | Required manual intervention | Auto-recovery after cooldown |
| API | Confusing callback parameter | Simple, clean API |
| Hash consistency | Inconsistent across methods | Unified internal hashing |

---

## 🎯 Key Confirmations

### ✅ Simulations ARE Cached by Difficulty
Yes! Confirmed in [semantic_cache.py](core/cache/semantic_cache.py#L36-L47):
- Cache key: `(prompt_key, difficulty)`
- Unique constraint: `UNIQUE(prompt_key, difficulty)`
- Different difficulties = separate cache entries

### ✅ Broken Status is Difficulty-Specific
Same prompt can be:
- Broken at "architect" difficulty
- Working at "engineer" difficulty
- They're tracked independently!

---

## 🔄 Workflow

### New Simulation Request
```
1. User sends prompt with difficulty="engineer"
2. Check: is_simulation_broken(prompt, "engineer")?
3. If broken and in cooldown → block retrieval from cache
4. If not broken OR cooldown expired → proceed normally
```

### Simulation Fails
```
1. Client calls /repair-failed
2. mark_simulation_broken(prompt, difficulty, reason)
3. Increment retry_count
4. If retry_count >= 3 → set is_permanently_broken=1
5. Start 24h cooldown
```

### Simulation Succeeds
```
1. Client calls /confirm-complete
2. clear_broken_status(prompt, difficulty)
3. save_simulation(...) → now allowed
4. Simulation cached for future use
```

---

## 📝 Migration

The database automatically migrates when you start the app:

1. Detects old schema (missing `retry_count`, `last_retry_at`, `is_permanently_broken`)
2. Creates new table with updated schema
3. Migrates existing data (sets retry_count=1 for old entries)
4. All existing broken simulations start with 1 retry attempt

**No manual intervention needed!**

---

## 🧪 Testing

Run verification:
```bash
python verify_schema.py
```

All tests passing:
- ✅ Retry count tracking
- ✅ Permanent broken flag
- ✅ Composite unique key (prompt + difficulty)
- ✅ Difficulty independence
- ✅ Retry increment logic
- ✅ Automatic expiration

---

## 💡 Best Practices

### When to Clear Broken Status
- ✅ Client successfully renders all steps: **AUTO-CLEARED** in `/confirm-complete`
- ✅ You fix the prompt/code generation: Use `/debug/clear-broken` endpoint
- ❌ Don't clear automatically on retry - let cooldown handle it

### When a Simulation Should Stay Broken
- Prompt consistently generates invalid Mermaid syntax
- LLM produces malformed graph structures
- Inherent issue with the prompt itself

### When a Simulation Should Recover
- Temporary API failures
- Rate limiting
- Transient network issues
- LLM occasionally produces bad output

---

## 🚀 Benefits

1. **Resilience** - Temporary failures don't permanently block prompts
2. **Automatic Recovery** - No manual intervention for transient issues  
3. **Protection** - Consistently bad simulations still blocked after 3 attempts
4. **Debugging** - `retry_count` shows problem patterns
5. **Independence** - Same prompt works differently per difficulty level

---

## 📁 Files Modified

1. **core/cache/database.py** - Schema migration with retry tracking
2. **core/cache/repair_tracker.py** - Smart retry logic, removed callback
3. **core/cache/__init__.py** - Fixed broken check call
4. **tests/unit/test_cache.py** - Updated tests for new API

---

**Status:** Ready for production use! 🎉
