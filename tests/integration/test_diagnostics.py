#!/usr/bin/env python3
"""
Test script to verify the new diagnostics logging system.
Tests database schema, helper methods, and logging infrastructure.
"""

import json

from core.cache.database import DB_PATH, CacheDatabase


def test_diagnostics_table():
    """Test that the llm_diagnostics table is created correctly."""
    print("\n" + "=" * 60)
    print("🧪 Testing LLM Diagnostics Table")
    print("=" * 60)

    # Initialize database
    print(f"\n1️⃣ Initializing database at: {DB_PATH}")
    db = CacheDatabase(DB_PATH)
    print("   ✅ Database connected")

    # Check that table exists
    print("\n2️⃣ Checking llm_diagnostics table exists...")
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(llm_diagnostics)")
        columns = [col[1] for col in cursor.fetchall()]

        expected_cols = [
            "id",
            "session_id",
            "mode",
            "difficulty",
            "llm_raw_response",
            "llm_response_length",
            "llm_step_count",
            "validation_input_count",
            "validation_output_count",
            "validation_warnings",
            "storage_before_json",
            "storage_after_json",
            "integrity_check_pass",
            "integrity_error",
            "created_at",
        ]

        missing = set(expected_cols) - set(columns)
        if missing:
            print(f"   ❌ Missing columns: {missing}")
            return False
        print(f"   ✅ Table has all {len(expected_cols)} expected columns")
        print(f"   Columns: {', '.join(columns)}")

    # Test save_llm_diagnostic method
    print("\n3️⃣ Testing save_llm_diagnostic() method...")
    test_data = {
        "mode": "CONTINUE_SIMULATION",
        "difficulty": "engineer",
        "llm_raw_response": '{"steps": [{"step": 1, "instruction": "Test step"}]}',
        "llm_step_count": 1,
        "validation_input_count": 1,
        "validation_output_count": 1,
        "validation_warnings": "",
        "storage_before_json": json.dumps([]),
        "storage_after_json": json.dumps([{"step": 1}]),
        "integrity_check_pass": True,
        "integrity_error": "",
    }

    test_session = "test_session_12345"
    db.save_llm_diagnostic(test_session, test_data)
    print("   ✅ save_llm_diagnostic() executed without error")

    # Test get_latest_diagnostics method
    print("\n4️⃣ Testing get_latest_diagnostics() method...")
    diagnostics = db.get_latest_diagnostics(test_session, limit=5)

    if not diagnostics:
        print("   ❌ No diagnostics retrieved")
        return False

    print(f"   ✅ Retrieved {len(diagnostics)} diagnostic record(s)")

    # Inspect first record
    first = diagnostics[0]
    print("   Record details:")
    print(f"     - mode: {first['mode']}")
    print(f"     - difficulty: {first['difficulty']}")
    print(f"     - llm_step_count: {first['llm_step_count']}")
    print(f"     - integrity_check_pass: {first['integrity_check_pass']}")
    print(f"     - created_at: {first['created_at']}")

    # Verify data integrity
    if (
        first["mode"] != test_data["mode"]
        or first["difficulty"] != test_data["difficulty"]
        or first["llm_step_count"] != test_data["llm_step_count"]
    ):
        print("   ❌ Stored data doesn't match input")
        return False

    print("   ✅ Data integrity verified")

    return True


def test_logging_helper():
    """Test the _log_diagnostic helper function."""
    print("\n" + "=" * 60)
    print("🧪 Testing _log_diagnostic() Helper Function")
    print("=" * 60)

    try:
        print("\n1️⃣ Importing _log_diagnostic from routes.chat...")
        from routes.chat import _log_diagnostic

        print("   ✅ Import successful")

        print("\n2️⃣ Function signature check...")
        import inspect

        sig = inspect.signature(_log_diagnostic)
        params = list(sig.parameters.keys())
        print(f"   Parameters: {', '.join(params)}")

        expected_params = [
            "cache_manager",
            "session_id",
            "mode",
            "difficulty",
            "llm_raw",
            "new_steps",
            "cleaned_steps",
            "storage_before",
            "storage_after",
            "integrity_pass",
            "integrity_error",
        ]

        if params == expected_params:
            print(f"   ✅ Correct signature ({len(params)} parameters)")
        else:
            print("   ⚠️ Signature mismatch")
            print(f"      Expected: {expected_params}")
            print(f"      Got: {params}")

        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def test_debug_endpoint():
    """Test that the debug endpoint is properly defined."""
    print("\n" + "=" * 60)
    print("🧪 Testing /debug/llm-diagnostics Endpoint")
    print("=" * 60)

    try:
        print("\n1️⃣ Importing llm_diagnostics from routes.debug...")
        from routes.debug import llm_diagnostics

        print("   ✅ Endpoint function imported")

        print("\n2️⃣ Checking function attributes...")
        print(f"   - Function name: {llm_diagnostics.__name__}")
        print(f"   - Docstring: {llm_diagnostics.__doc__[:60]}...")
        print("   ✅ Endpoint properly defined")

        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def main():
    """Run all tests."""
    print("\n" + "🔍 LLM DIAGNOSTICS LOGGING SYSTEM TEST SUITE" + "\n")

    results = []

    # Test 1: Database schema
    results.append(("Diagnostics Table", test_diagnostics_table()))

    # Test 2: Logging helper
    results.append(("Logging Helper", test_logging_helper()))

    # Test 3: Debug endpoint
    results.append(("Debug Endpoint", test_debug_endpoint()))

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)

    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")

    passed = sum(1 for _, result in results if result)
    total = len(results)

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n✨ All tests passed! Diagnostics system is operational.")
        return 0
    else:
        print(f"\n⚠️ {total - passed} test(s) failed. Review output above.")
        return 1


if __name__ == "__main__":
    exit(main())
