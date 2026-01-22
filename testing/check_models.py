import os
import google.generativeai as genai
from dotenv import load_dotenv # Only if you use a .env file

# 1. Load your API Key (Replace with your actual key string if not using .env)
# os.environ["GEMINI_API_KEY"] = "YOUR_ACTUAL_API_KEY_HERE" 
# OR load from environment:
load_dotenv() 
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

print("--- YOUR AVAILABLE MODELS ---")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"Name: {m.name}")
except Exception as e:
    print(f"Error: {e}")