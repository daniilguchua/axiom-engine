# Logging Refactor - Diagnostic Overhaul

**Goal:** Remove noise, add strategic diagnostics for step generation debugging

---

## Removed Logs (Low Signal)

### 1. Input Enrichment 
**Removed:** "📊 Generated {category} input data: {label}"
- **Why:** Too frequent, doesn't help when things go wrong
- **Kept:** Error logs only if generation fails

### 2. GHOST Debug Logs
**Removed:** "[GHOST] Captured raw mermaid from step {idx} ({size} chars)"
- **Why:** Fire-and-forget logging that doesn't help with actual issues
- **Note:** These claimed to be tested client-side in debug.html but no actual debugging value

### 3. Sanitized Graph Storage
**Removed:** "✅ Stored sanitized graph for step {idx}"
- **Why:** Noise - we only care if it FAILS, not every success

### 4. Generic Validation Warnings
**Before:** "⚠️ Step validation found {count} issue(s) in {mode}:"
- **After:** "⚠️ VALIDATION: {input_count} → {output_count} steps ({rejected} rejected)"
- **Better:** Shows the actual reduction/impact in one line

---

## Added Logs (High Signal - Diagnostic)

### 1. LLM Generation Results Chain
```
🔍 LLM: 3 step(s) returned
   Steps: [3, 4, 5]
   Current DB: 3 items, max step 2
```

**What it shows:**
- Exact step numbers LLM produced
- Current database state before storage
- Allows correlation between LLM output and DB state

### 2. Validation Summary
```
✅ VALIDATION: All 3 steps passed
```
or with rejections:
```
⚠️ VALIDATION: 3 → 2 steps (1 rejected)
     Step 3 already exists in array (removing duplicate)
```

### 3. Storage Operation
```
💾 STORAGE: EXTENDED
   Stored: [3, 4, 5]
   Before: 3 items (max 2)
   After:  6 items (max 5)
```

**What it shows:**
- What was actually stored (after validation)
- Array state transformation
- Easy to verify: after_len should equal max_step + 1

### 4. Final State
```
📋 FINAL STATE: 6 items, steps=[0, 1, 2, 3, 4, 5]
✅ Integrity OK
```

**If there's a problem:**
```
📋 FINAL STATE: 7 items, steps=[0, 1, 2, 3, 3, 4, 5]
❌ INTEGRITY FAILED: length 7 != max+1 6
```

### 5. Database State Marker
```
<!--DB_STATE:{"total": 6, "steps": [0, 1, 2, 3, 4, 5]}-->
```

**Why:** 
- Embedded in response sent to frontend
- Frontend can compare what it received vs what's in DB
- Shows whether steps are being communicated to client

### 6. Simulation Status
```
⏸ Continuing (6 total)  # More steps to generate
🏁 Simulation marked as final  # Algorithm complete
```

---

## Log Flow for Single Request

**Example: "Generate Next" on quicksort with 3 steps already**

```
[CONTINUE_SIMULATION] ENGINEER: continue_simulation from step 3...

🔍 LLM: 3 step(s) returned
   Steps: [3, 4, 5]
   Current DB: 3 items, max step 2

✅ VALIDATION: All 3 steps passed

💾 STORAGE: EXTENDED
   Stored: [3, 4, 5]
   Before: 3 items (max 2)
   After:  6 items (max 5)

📋 FINAL STATE: 6 items, steps=[0, 1, 2, 3, 4, 5]
✅ Integrity OK

⏸ Continuing (6 total)

<!--DB_STATE:{"total": 6, "steps": [0, 1, 2, 3, 4, 5]}-->
```

---

## Debugging Checklist

When something goes wrong, look for:

1. **"🔍 LLM: X step(s) returned"**
   - If this shows fewer than 3 steps → LLM isn't following instructions
   - Check step numbers - are they sequential?

2. **"⚠️ VALIDATION: X → Y steps"**
   - If Y < X → some steps were rejected
   - Look at the rejection reasons listed below
   - Check if "already exists" suggests duplicate handling

3. **"💾 STORAGE: [steps]"**
   - Compare "Before" and "After" 
   - Expected: after_len = before_len + X (where X = validated steps)
   - If "REPLACED" vs "EXTENDED" is wrong → mode detection issue

4. **"📋 FINAL STATE: N items, steps=[...]"**
   - Manually verify all numbers are present
   - Should be continuous: [0,1,2,3,4,5] not [0,1,2,4,5] or [0,1,2,3,3,5]
   - Check for duplicates

5. **"<!--DB_STATE:...-->"**
   - Frontend logs will show what it reads
   - Compare to final state above
   - If different → communication issue between backend and frontend

---

## Summary of Changes

| Category | Removed | Added |
|----------|---------|-------|
| Lines | ~30 | ~15 |
| Signal/Noise Ratio | Low (was) | High (now) |
| Debug-Ability | Hard to trace flow | Clear request→validation→storage→final state |
| Performance | No change | No change |

All changes are logging only - no business logic changes.
