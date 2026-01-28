#!/usr/bin/env python3
"""
Remove 'direction TB/LR' from inside subgraphs in prompts.py mermaid examples.
This fixes the parser crash issue documented in repair_tests.db.
"""

import re

def remove_subgraph_directions(text):
    """Remove direction TB/LR that appears after subgraph declarations."""
    # Pattern: subgraph NAME[Label]\\n  direction TB/LR;\\n  
    # Note: In the Python source, these are literal \\n strings, not actual newlines
    pattern = r'(subgraph [A-Z_0-9]+\[[^\]]+\]\\\\n)  direction (TB|LR);\\\\n  '
    replacement = r'\1  '
    result = re.sub(pattern, replacement, text)
    
    # Also handle RL (right-to-left) cases
    pattern_rl = r'(subgraph [A-Z_0-9]+\[[^\]]+\]\\\\n)  direction (RL);\\\\n  '
    result = re.sub(pattern_rl, replacement, result)
    
    return result

# Read the file
with open('core/prompts.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Apply fixes
original_len = len(content)
content = remove_subgraph_directions(content)
changes = original_len - len(content)

# Write back
with open('core/prompts.py', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✅ Fixed prompts.py - Removed {changes} characters of direction statements")
print(f"   All 'direction TB/LR' inside subgraphs have been removed")
