#!/usr/bin/env python
"""
Quick test to verify dashboard endpoints work correctly.
"""
import sys
import json
from flask import Flask
from routes import register_routes

def test_dashboard_endpoints():
    """Test that dashboard endpoints are properly registered."""
    
    # Create Flask test app
    app = Flask(__name__)
    app.config['TESTING'] = True
    
    # Register routes
    register_routes(app)
    
    # Check routes were registered
    routes = [str(rule) for rule in app.url_map.iter_rules()]
    
    print("🔍 Checking dashboard endpoints...\n")
    
    # Check for main endpoints
    endpoints_to_check = [
        '/repair-stats',
        '/api/debug/repairs-detailed',
        '/debug/cache',
        '/debug/stats'
    ]
    
    found_endpoints = []
    missing_endpoints = []
    
    for endpoint in endpoints_to_check:
        if any(endpoint in route for route in routes):
            found_endpoints.append(endpoint)
            print(f"✓ {endpoint}")
        else:
            missing_endpoints.append(endpoint)
            print(f"✗ {endpoint}")
    
    print(f"\n📊 Summary:")
    print(f"  Found: {len(found_endpoints)}/{len(endpoints_to_check)}")
    
    if missing_endpoints:
        print(f"  Missing: {missing_endpoints}")
        return False
    
    # Check static files
    print(f"\n📁 Checking static files...")
    import os
    dashboard_file = '/Users/daniel/Desktop/rag-chat-project/static/debug-dashboard.html'
    if os.path.exists(dashboard_file):
        size = os.path.getsize(dashboard_file)
        print(f"✓ debug-dashboard.html ({size} bytes)")
    else:
        print(f"✗ debug-dashboard.html not found")
        return False
    
    # Check for required JavaScript functions in dashboard
    with open(dashboard_file, 'r') as f:
        content = f.read()
        required_functions = [
            'loadAllData',
            'displayStats',
            'displayCharts',
            'displayRepairs',
            'showDetail',
            'closeModal'
        ]
        
        print(f"\n⚙️  Checking dashboard functions...")
        all_present = True
        for func in required_functions:
            if f'function {func}' in content or f'{func}(' in content:
                print(f"  ✓ {func}")
            else:
                print(f"  ✗ {func}")
                all_present = False
        
        if not all_present:
            return False
    
    print(f"\n✅ All dashboard components verified successfully!\n")
    return True

if __name__ == '__main__':
    try:
        success = test_dashboard_endpoints()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
