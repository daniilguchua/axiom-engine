import logging
import os
import json
import google.generativeai as genai
from core.cache import CacheManager
from core.utils import get_text_embedding, cosine_similarity

# 1. SETUP LOGGING
logging.basicConfig(level=logging.INFO, format='%(message)s')
print("--- 🧪 VECTOR SEMANTIC TEST SUITE ---")

# 2. CHECK API KEY
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("❌ CRITICAL: GEMINI_API_KEY is missing from environment.")
    exit(1)

genai.configure(api_key=api_key)

def run_tests():
    cm = CacheManager()
    
    # TEST DATA
    # We want "Prompt A" and "Prompt B" to match, but "Prompt C" to fail.
    original_prompt = "Visualize the TCP Handshake"
    similar_prompt = "show me a simulation of how tcp connection works"
    different_prompt = "Explain Binary Search Trees"

    print(f"\n1. Generating Embeddings...")
    vec_original = get_text_embedding(original_prompt)
    vec_similar = get_text_embedding(similar_prompt)
    vec_different = get_text_embedding(different_prompt)

    if not vec_original or not vec_similar:
        print("❌ FAILED: Could not generate embeddings from API.")
        return

    print("✅ Embeddings generated successfully.")

    # 3. MATH CHECK
    print(f"\n2. Calculating Cosine Similarities...")
    
    # Score 1: Should be High (> 0.85)
    score_match = cosine_similarity(vec_original, vec_similar)
    print(f"   '{original_prompt}' vs '{similar_prompt}'")
    print(f"   Score: {score_match:.4f}")

    # Score 2: Should be Low (< 0.70)
    score_mismatch = cosine_similarity(vec_original, vec_different)
    print(f"   '{original_prompt}' vs '{different_prompt}'")
    print(f"   Score: {score_mismatch:.4f}")

    # ASSERTIONS
    if score_match > 0.80:
        print("✅ PASS: Semantic Match Logic works (Score > 0.80)")
    else:
        print("❌ FAIL: Semantic Match Logic is too weak.")

    if score_mismatch < 0.75:
        print("✅ PASS: Differentiation Logic works (Score < 0.75)")
    else:
        print("❌ FAIL: System thinks Binary Trees are TCP (False Positive).")

    # 4. DATABASE CHECK
    print(f"\n3. Testing Database Storage...")
    
    # Clear old test data if exists
    conn = cm._get_conn()
    conn.execute("DELETE FROM simulation_cache WHERE prompt_key = ?", (original_prompt,))
    conn.commit()
    conn.close()

    # Save Dummy Data
    dummy_data = {"steps": [{"instruction": "TEST_DATA", "step": 0}]}
    cm.save_simulation(original_prompt, dummy_data)
    
    # Retrieve using the SIMILAR prompt (not the exact one)
    result = cm.get_cached_simulation(similar_prompt)
    
    if result and result.get('steps')[0]['instruction'] == "TEST_DATA":
        print("✅ PASS: Database successfully retrieved data using Semantic Search!")
    else:
        print("❌ FAIL: Database retrieval failed.")

if __name__ == "__main__":
    run_tests()