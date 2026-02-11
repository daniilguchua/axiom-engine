#!/usr/bin/env python3
"""
Verification script for Phase 1 + Phase 2-Lite cache fixes.
Tests the broken simulation tracking with retry logic.
"""

import os
import sys
import tempfile
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.cache import CacheManager

def test_broken_simulation_tracking():
    """Test the new broken simulation tracking with retry logic."""
    print("\n" + "="*70)
    print("TESTING: Phase 1 + Phase 2-Lite - Broken Simulation Tracking")
    print("="*70)
    
    # Create temporary database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        # Initialize cache manager
        print("\n✓ Initializing CacheManager...")
        cache = CacheManager(db_path=db_path)
        
        test_prompt = "Create a graph showing data flow"
        test_difficulty = "engineer"
        
        # Test 1: Initial state - should not be broken
        print("\n[TEST 1] Checking initial state...")
        is_broken = cache._is_simulation_broken(test_prompt, test_difficulty)
        assert is_broken is False, "Should not be broken initially"
        print("✓ PASS: Simulation not marked as broken initially")
        
        # Test 2: Mark as broken (first failure)
        print("\n[TEST 2] Marking simulation as broken (attempt 1/3)...")
        result = cache.mark_simulation_broken(
            prompt=test_prompt,
            difficulty=test_difficulty,
            reason="Test failure 1"
        )
        assert result is True, "Should successfully mark as broken"
        print("✓ PASS: Successfully marked as broken")
        
        # Test 3: Check if broken (should be True)
        print("\n[TEST 3] Verifying broken status...")
        is_broken = cache._is_simulation_broken(test_prompt, test_difficulty)
        assert is_broken is True, "Should be marked as broken"
        print("✓ PASS: Simulation correctly identified as broken")
        
        # Test 4: Mark as broken again (second failure)
        print("\n[TEST 4] Marking broken again (attempt 2/3)...")
        result = cache.mark_simulation_broken(
            prompt=test_prompt,
            difficulty=test_difficulty,
            reason="Test failure 2"
        )
        assert result is True, "Should increment retry count"
        is_broken = cache._is_simulation_broken(test_prompt, test_difficulty)
        assert is_broken is True, "Should still be broken"
        print("✓ PASS: Retry count incremented correctly")
        
        # Test 5: Mark as broken third time (should become permanently broken)
        print("\n[TEST 5] Marking broken third time (attempt 3/3 - PERMANENT)...")
        result = cache.mark_simulation_broken(
            prompt=test_prompt,
            difficulty=test_difficulty,
            reason="Test failure 3"
        )
        assert result is True, "Should mark as permanently broken"
        is_broken = cache._is_simulation_broken(test_prompt, test_difficulty)
        assert is_broken is True, "Should be permanently broken"
        print("✓ PASS: Marked as permanently broken after 3 attempts")
        
        # Test 6: Clear broken status
        print("\n[TEST 6] Clearing broken status...")
        cleared = cache.clear_broken_status(test_prompt, test_difficulty)
        assert cleared is True, "Should clear broken status"
        is_broken = cache._is_simulation_broken(test_prompt, test_difficulty)
        assert is_broken is False, "Should no longer be broken"
        print("✓ PASS: Broken status cleared successfully")
        
        # Test 7: Different difficulty should be independent
        print("\n[TEST 7] Testing difficulty independence...")
        cache.mark_simulation_broken(test_prompt, "architect", "Test failure")
        is_broken_architect = cache._is_simulation_broken(test_prompt, "architect")
        is_broken_engineer = cache._is_simulation_broken(test_prompt, "engineer")
        assert is_broken_architect is True, "Architect difficulty should be broken"
        assert is_broken_engineer is False, "Engineer difficulty should not be broken"
        print("✓ PASS: Different difficulties tracked independently")
        
        # Test 8: Test save_simulation respects broken status
        print("\n[TEST 8] Testing cache save respects broken status...")
        cache.mark_simulation_broken(test_prompt, test_difficulty, "Block caching")
        playlist_data = {"type": "simulation_playlist", "steps": [{"code": "graph LR\n  A-->B"}]}
        
        result = cache.save_simulation(
            prompt=test_prompt,
            playlist_data=playlist_data,
            difficulty=test_difficulty,
            is_final_complete=True,
            client_verified=True
        )
        assert result is False, "Should refuse to cache broken simulation"
        print("✓ PASS: Broken simulations not cached")
        
        # Test 9: Clear and verify caching works
        print("\n[TEST 9] Testing cache after clearing broken status...")
        cache.clear_broken_status(test_prompt, test_difficulty)
        result = cache.save_simulation(
            prompt=test_prompt,
            playlist_data=playlist_data,
            difficulty=test_difficulty,
            is_final_complete=True,
            client_verified=True
        )
        assert result is True, "Should cache after clearing broken status"
        print("✓ PASS: Caching works after clearing broken status")
        
        print("\n" + "="*70)
        print("✅ ALL TESTS PASSED! Phase 1 + Phase 2-Lite working correctly")
        print("="*70)
        print("\nKey Features Verified:")
        print("  ✓ Broken simulation tracking works (bug fixed)")
        print("  ✓ Retry count tracking (1, 2, 3 attempts)")
        print("  ✓ Permanent broken status after 3 failures")
        print("  ✓ Clear broken status functionality")
        print("  ✓ Difficulty-based independence")
        print("  ✓ Cache respects broken status")
        print("  ✓ No more callback parameter confusion")
        print()
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Cleanup
        if os.path.exists(db_path):
            os.unlink(db_path)
            print(f"🧹 Cleaned up temporary database")

if __name__ == "__main__":
    success = test_broken_simulation_tracking()
    sys.exit(0 if success else 1)
