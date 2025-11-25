#!/usr/bin/env python3
"""
Quick test to verify bug fixes work as expected.
"""
import os

os.environ['GEMINI_API_KEY'] = 'test-api-key-for-validation'

from flask import Flask
from routes.chat import chat_bp
from routes.upload import upload_bp

app = Flask(__name__)
app.register_blueprint(chat_bp)
app.register_blueprint(upload_bp)

client = app.test_client()

print("Testing Bug Fixes")
print("=" * 60)

# Test 1: Session ID required (should reject)
print("\n1. Testing /chat without session ID (should reject with 401):")
response = client.post('/chat', json={"message": "test"})
print(f"   Status: {response.status_code} - {'✅ PASS' if response.status_code == 401 else '❌ FAIL'}")

# Test 2: Invalid session format (should reject)
print("\n2. Testing /chat with invalid session format (should reject with 401):")
response = client.post('/chat', 
                       json={"message": "test"},
                       headers={"X-Session-ID": "invalid@#$"})
print(f"   Status: {response.status_code} - {'✅ PASS' if response.status_code == 401 else '❌ FAIL'}")

# Test 3: Upload without session (should reject)
print("\n3. Testing /upload without session ID (should reject with 401):")
response = client.post('/upload', data={"file": "test"})
print(f"   Status: {response.status_code} - {'✅ PASS' if response.status_code == 401 else '❌ FAIL'}")

# Test 4: Upload with wrong content-type (should reject with 415)
print("\n4. Testing /upload with JSON instead of multipart (should reject with 415):")
response = client.post('/upload',
                       json={"text": "not a file"},
                       headers={"X-Session-ID": "test-session-123"})
print(f"   Status: {response.status_code} - {'✅ PASS' if response.status_code == 415 else '❌ FAIL'}")

print("\n" + "=" * 60)
print("Bug Fix Verification Complete!")
