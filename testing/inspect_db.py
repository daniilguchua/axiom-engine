#!/usr/bin/env python3
"""
AXIOM Database Inspector

Run this to see exactly what's in your database.
"""

import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.expanduser("~/.axiom_data/axiom.db")

def inspect_database():
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at: {DB_PATH}")
        return
    
    print(f"📂 Database: {DB_PATH}")
    print(f"📅 Inspected at: {datetime.now()}")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # =========================================================================
    # TABLE 1: simulation_cache (THE MAIN CACHE)
    # =========================================================================
    print("\n" + "="*70)
    print("📦 SIMULATION_CACHE (Main cache - what gets served on cache hits)")
    print("="*70)
    
    cursor.execute("""
        SELECT id, prompt_key, status, step_count, is_final_complete, 
               client_verified, access_count, avg_rating, created_at
        FROM simulation_cache
        ORDER BY created_at DESC
    """)
    
    rows = cursor.fetchall()
    if not rows:
        print("\n   ⚠️  EMPTY - No simulations cached yet!")
        print("   This means /confirm-complete has never successfully saved a simulation.")
    else:
        print(f"\n   Found {len(rows)} cached simulation(s):\n")
        for row in rows:
            verified = "✅" if row['client_verified'] else "❌"
            final = "✅" if row['is_final_complete'] else "❌"
            print(f"   [{row['id']}] {verified} \"{row['prompt_key'][:50]}...\"")
            print(f"       Status: {row['status']} | Steps: {row['step_count']} | Final: {final} | Verified: {verified}")
            print(f"       Hits: {row['access_count']} | Rating: {row['avg_rating']} | Created: {row['created_at']}")
            print()
    
    # =========================================================================
    # TABLE 2: broken_simulations (BLOCKLIST)
    # =========================================================================
    print("\n" + "="*70)
    print("🚫 BROKEN_SIMULATIONS (Blocklist - these prompts are BLOCKED)")
    print("="*70)
    
    cursor.execute("""
        SELECT prompt_key, failed_step_index, failure_reason, created_at
        FROM broken_simulations
        ORDER BY created_at DESC
    """)
    
    rows = cursor.fetchall()
    if not rows:
        print("\n   ✅ Empty - No blocked prompts")
    else:
        print(f"\n   ⚠️  Found {len(rows)} BLOCKED prompt(s):\n")
        for row in rows:
            print(f"   🚫 \"{row['prompt_key'][:50]}...\"")
            print(f"      Failed at step: {row['failed_step_index']}")
            print(f"      Reason: {row['failure_reason']}")
            print(f"      Blocked since: {row['created_at']}")
            print()
        print("   💡 To unblock: DELETE FROM broken_simulations;")
    
    # =========================================================================
    # TABLE 3: pending_repairs
    # =========================================================================
    print("\n" + "="*70)
    print("🔧 PENDING_REPAIRS (Active repairs - blocks caching until resolved)")
    print("="*70)
    
    cursor.execute("""
        SELECT session_id, prompt_key, step_index, status, created_at
        FROM pending_repairs
        WHERE status = 'pending'
        ORDER BY created_at DESC
    """)
    
    rows = cursor.fetchall()
    if not rows:
        print("\n   ✅ No pending repairs")
    else:
        print(f"\n   ⚠️  Found {len(rows)} pending repair(s):\n")
        for row in rows:
            print(f"   🔧 Step {row['step_index']} of \"{row['prompt_key'][:40]}...\"")
            print(f"      Status: {row['status']} | Since: {row['created_at']}")
            print()
        print("   💡 These may be stale. To clear: DELETE FROM pending_repairs WHERE status='pending';")
    
    # =========================================================================
    # TABLE 4: repair_logs (ML Training Data)
    # =========================================================================
    print("\n" + "="*70)
    print("🔧 REPAIR_LOGS (ML training - repair attempts)")
    print("="*70)
    
    cursor.execute("SELECT COUNT(*) FROM repair_logs")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM repair_logs WHERE was_successful = 1")
    successful = cursor.fetchone()[0]
    
    print(f"\n   Total repairs: {total}")
    print(f"   Successful: {successful}")
    if total > 0:
        print(f"   Success rate: {successful/total*100:.1f}%")
    
    cursor.execute("""
        SELECT repair_method, was_successful, repair_duration_ms, created_at
        FROM repair_logs
        ORDER BY created_at DESC
        LIMIT 5
    """)
    
    rows = cursor.fetchall()
    if rows:
        print("\n   Recent repairs:")
        for row in rows:
            status = "✅" if row['was_successful'] else "❌"
            duration = f"{row['repair_duration_ms']}ms" if row['repair_duration_ms'] else "N/A"
            print(f"   {status} {row['repair_method']} ({duration}) - {row['created_at']}")
    
    # =========================================================================
    # TABLE 5: graph_dataset (ML Training Data)
    # =========================================================================
    print("\n" + "="*70)
    print("📊 GRAPH_DATASET (ML training - successful graphs)")
    print("="*70)
    
    cursor.execute("SELECT COUNT(*) FROM graph_dataset")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM graph_dataset WHERE was_repaired = 1")
    repaired = cursor.fetchone()[0]
    
    print(f"\n   Total graphs: {total}")
    print(f"   Originally broken (repaired): {repaired}")
    print(f"   Clean renders: {total - repaired}")
    
    # =========================================================================
    # TABLE 6: feedback_logs
    # =========================================================================
    print("\n" + "="*70)
    print("👍 FEEDBACK_LOGS (User ratings)")
    print("="*70)
    
    cursor.execute("SELECT COUNT(*) FROM feedback_logs")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM feedback_logs WHERE rating = 1")
    positive = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM feedback_logs WHERE rating = -1")
    negative = cursor.fetchone()[0]
    
    print(f"\n   Total feedback: {total}")
    print(f"   👍 Positive: {positive}")
    print(f"   👎 Negative: {negative}")
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "="*70)
    print("📋 SUMMARY")
    print("="*70)
    
    cursor.execute("SELECT COUNT(*) FROM simulation_cache WHERE client_verified = 1")
    verified_cache = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM broken_simulations")
    blocked = cursor.fetchone()[0]
    
    print(f"""
   Verified cached simulations: {verified_cache}
   Blocked prompts: {blocked}
   
   If verified_cache is 0, the caching flow isn't completing.
   Check that:
   1. confirmSimulationComplete() is being called (check browser console)
   2. /confirm-complete endpoint is returning 200
   3. No prompts are in broken_simulations blocking them
    """)
    
    conn.close()

def clear_blocklist():
    """Clear broken_simulations to unblock all prompts."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM broken_simulations")
    cursor.execute("DELETE FROM pending_repairs")
    conn.commit()
    conn.close()
    print("✅ Cleared broken_simulations and pending_repairs")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "clear":
        clear_blocklist()
    else:
        inspect_database()
        print("\n💡 Run with 'clear' argument to unblock all prompts:")
        print(f"   python {sys.argv[0]} clear")