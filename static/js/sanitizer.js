// js/sanitizer.js
/**
 * AXIOM Engine - Sanitization & JSON Repair
 * Functions for cleaning mermaid code and repairing LLM JSON output.
 */

(function() {
    
    // =========================================================================
    // MERMAID CODE SANITIZER
    // =========================================================================
    
    function sanitizeMermaidString(raw) {
        if (!raw || typeof raw !== 'string') {
            console.warn('[AXIOM:SANITIZER] Invalid input (empty or not string)');
            return 'flowchart LR\nA["Empty"]';
        }

        let clean = raw;
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 1: UNESCAPE & NORMALIZE
        // ═══════════════════════════════════════════════════════════════

        // Force LR layout - catch all variants (AGGRESSIVE)
        clean = clean.replace(/(graph|flowchart)\s+(TD|TB|BT|RL)\b/gi, "$1 LR");
        clean = clean.replace(/\b(TD|TB|BT|RL)\b(?=\s*[;\n])/gi, "LR");
        
        // Ensure LR direction exists - add if missing
        if (!/flowchart\s+LR|graph\s+LR/i.test(clean)) {
            clean = clean.replace(/^(flowchart|graph)\b/i, "$1 LR");
        }

        // Convert escaped newlines to real newlines
        const beforeNewlineConvert = clean;
        clean = clean.replace(/\\n/g, "\n");


        // CRITICAL FIX: Convert escaped quotes to real quotes
        // LLMs sometimes return \" instead of " in their JSON
        const beforeQuoteConvert = clean;
        clean = clean.replace(/\\"/g, '"');


        // Normalize quotes
        clean = clean.replace(/[""]/g, '"').replace(/['']/g, "'");

        // Remove wrapper subgraphs that break LR orientation
        // Mermaid ignores outer 'flowchart LR' when nodes are inside a subgraph
        // Only remove subgraphs that contain ONLY node declarations (no edges)
        const beforeSubgraphFix = clean;
        clean = clean.replace(/subgraph\s+\w+\[[^\]]+\]\s*\n([\s\S]*?)\nend;?/gi, function(match, content) {
            // Check if content has any edges (arrows)
            const hasEdges = /-->|==>|---|<--|<==|o--|x--|o==/.test(content);
            if (!hasEdges) {
                return content; // Return just the node declarations without subgraph wrapper
            }
            return match; // Keep subgraphs that have edges (they're structural)
        });
        


        // Remove markdown code block wrappers
        const beforeCodeBlock = clean;
        clean = clean.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
        clean = clean.trim();

        // ═══════════════════════════════════════════════════════════════
        // EMERGENCY FIX: BRACKET CORRUPTION & UNICODE GARBAGE
        // ═══════════════════════════════════════════════════════════════

        // FIX 1: Mixed bracket shapes [{"text"}] or [{text}] → ["text"]
        clean = clean.replace(/\[\s*\{+"?([^"}\]]*)"?\}+\s*\]/g, '["$1"]');

        // FIX 2: All unicode fractions (there are many variants)
        clean = clean.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, function(m) {
            const map = {'½':'1/2','¼':'1/4','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'};
            return map[m] || m;
        });

        // FIX 3: Unicode fraction slash (⁄) to regular slash
        clean = clean.replace(/⁄/g, '/');

        // FIX 4: Remove ALL garbage unicode that breaks mermaid
        clean = clean.replace(/[ﬂﬁ¶°§©®™•·²³¹⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, '');

        // FIX 5: Broken ampersands (keep only valid HTML entities)
        clean = clean.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, ' and ');

        // FIX 6: Double/nested brackets
        clean = clean.replace(/\[\[+/g, '[');
        clean = clean.replace(/\]\]+/g, ']');
        clean = clean.replace(/\{\{+/g, '{');
        clean = clean.replace(/\}\}+/g, '}');
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 2: PROTECT STRING LITERALS (MASKING)
        // ═══════════════════════════════════════════════════════════════
        
        const tokenMap = new Map();
        let tokenCounter = 0;
        
        // Mask all quoted strings to protect them during transformations
        clean = clean.replace(/"([^"]*?)"/g, (match, content) => {
            // Fix common issues inside strings
            let fixed = content
        // Convert markdown lists to bullet points
                .replace(/\n\s*[-*]\s+/g, "<br/>• ")
                .replace(/<br\/?>\s*[-*]\s+/gi, "<br/>• ")
                .replace(/:\s*[-*]\s+/g, ": • ")
                .replace(/^[-*]\s+/, "• ")
        // Convert remaining newlines to <br/>
                .replace(/\n/g, "<br/>")
        // Escape parentheses (Mermaid interprets them as shapes)
                .replace(/\(/g, "&#40;")
                .replace(/\)/g, "&#41;")
        // Remove any remaining problematic characters
                .replace(/[[\]]/g, "");
            
            const token = `__STR_${tokenCounter++}__`;
            tokenMap.set(token, `"${fixed}"`);
            return token;
        });
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 3: FIX GRAPH DECLARATION
        // ═══════════════════════════════════════════════════════════════
        
        // Force flowchart LR if no valid declaration
        if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)/im.test(clean)) {
            clean = "flowchart LR\n" + clean;
        }
        
        // Normalize graph direction to LR
        clean = clean.replace(/^(graph|flowchart)\s+(TD|TB|RL|BT)/im, "$1 LR");

        // Handle graph/flowchart with NO direction keyword (Mermaid defaults to TD)
        clean = clean.replace(/^(graph|flowchart)\s*(?=\n|$)/im, "$1 LR");

        // Ensure newline after graph declaration
        clean = clean.replace(/^((?:graph|flowchart)\s+LR)([^\n])/im, "$1\n$2");
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 4: FIX STRUCTURAL ISSUES
        // ═══════════════════════════════════════════════════════════════
        
        // Fix "endsubgraph" → "end"
        clean = clean.replace(/endsubgraph/gi, "end");
        
        // Fix smashed "end" (e.g., "]end" → "]\nend")
        clean = clean.replace(/([\]\)\}>])\s*end/gi, "$1\nend");
        
        // Fix smashed keywords after brackets
        clean = clean.replace(/([\]\)\}>])\s*(subgraph|class|classDef|style|linkStyle)/gi, "$1\n$2");
        
        // Ensure subgraph has newline after title
        clean = clean.replace(/(subgraph\s+\w+(?:\s*\[.*?\])?)\s*([A-Za-z])/gi, "$1\n$2");

        // Remove direction statements from inside subgraphs (not supported in Mermaid v11.3.0+)
        // Mermaid v11.3.0 does NOT support direction statements inside subgraph blocks
        // This was causing ALL parse errors in repair_tests.db
        clean = clean.replace(/(subgraph\s+\w+(?:\s*\[.*?\])?)\s*\n\s*direction\s+(?:LR|RL|TB|TD|BT)\s*;?\s*\n/gi, "$1\n");

        // ═══════════════════════════════════════════════════════════════
        // PHASE 5: FIX ARROWS
        // ═══════════════════════════════════════════════════════════════
        
        // Fix hybrid arrows (-- label ==> or == label -->)
        clean = clean.replace(/--\s*(__STR_\d+__)\s*==>/g, "== $1 ==>");
        clean = clean.replace(/==\s*(__STR_\d+__)\s*-->/g, "-- $1 -->");
        
        // Fix arrows without spaces
        clean = clean.replace(/(\w)(-->|==>|-.->)(\w)/g, "$1 $2 $3");
        
        // Fix malformed circle arrows
        clean = clean.replace(/--o/g, "-->");
        clean = clean.replace(/o--/g, "-->");

        // Join arrows broken across lines
        // "A --> \n B" → "A --> B"
        clean = clean.replace(/(-->|==>|---|-\.->)\s*\n\s*(\w)/g, "$1 $2");

        // ═══════════════════════════════════════════════════════════════
        // PHASE 6: FIX CLASSDEFS & STYLES
        // ═══════════════════════════════════════════════════════════════
        
        // Extract all classDefs for hoisting to end
        const classDefs = [];
        clean = clean.replace(/^\s*classDef\s+.+$/gm, (match) => {
            let def = match.trim();
            // Ensure proper CSS syntax
            def = def.replace(/stroke-width\s*(?!:)/gi, "stroke-width:");
            def = def.replace(/stroke-dasharray\s+(\d+)/gi, "stroke-dasharray:$1");
            // Ensure semicolon at end
            if (!def.endsWith(';')) def += ';';
            classDefs.push(def);
            return '';
        });
        
        clean = clean.replace(/^\s*class\s+([A-Za-z0-9_,\s]+)\s+(\w+)\s*;?$/gm, (match, nodes, className) => {
            // "class A, B, C active;" → "class A active;\nclass B active;\nclass C active;"
            const nodeList = nodes.split(',').map(n => n.trim()).filter(n => n);
            return nodeList.map(n => `class ${n} ${className};`).join('\n');
        });
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 6.5: REMOVE EMPTY EDGE LABELS
        // ═══════════════════════════════════════════════════════════════
        
        const beforeEmptyLabels = clean;
        
        // Remove empty labels like -->\"|\"\"| or -->|''|
        clean = clean.replace(/(-+>?)\|[\"\'\s]*[\"\']/g, "$1");
        clean = clean.replace(/(<-+)\|[\"\'\s]*[\"\']/g, "$1");
        clean = clean.replace(/([=<>-]+)\|[\"\'\s]*[\"\']/g, "$1");
        


        // ═══════════════════════════════════════════════════════════════
        // PHASE 6.75: REMOVE MALFORMED LINKSTYLE STATEMENTS
        // ═══════════════════════════════════════════════════════════════

        const beforeLinkStyleFix = clean;

        // Remove linkStyle with corrupted unicode or invalid hex colors
        // Valid: linkStyle 0 stroke:#FBBF24
        // Invalid: linkStyle 0 stroke:ﬂ°FBBF24¶ß (corrupted characters)
        clean = clean.replace(/^\s*linkStyle\s+.*[^\x00-\x7F]+.*$/gm, '');

        // Remove linkStyle with malformed color codes (missing # or invalid chars)
        clean = clean.replace(/^\s*linkStyle\s+\d+\s+stroke:[^#\s][^\s;]*\s*;?\s*$/gm, '');

        // Optional: Remove ALL linkStyle statements since CSS handles edge styling
        clean = clean.replace(/^\s*linkStyle\s+.*$/gm, '');

        // ═══════════════════════════════════════════════════════════════
        // PHASE 7: FIX CSS-LIKE PROPERTIES
        // ═══════════════════════════════════════════════════════════════
        
        // Fix orphaned stroke-width
        clean = clean.replace(/stroke-width\s*(?:;|$)/gi, "stroke-width:2px;");
        
        // Fix colors without hash
        clean = clean.replace(/(fill|stroke|color):\s*([0-9a-fA-F]{6})(?![0-9a-fA-F])/gi, "$1:#$2");
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 8: ENSURE SEMICOLONS & LINE BREAKS
        // ═══════════════════════════════════════════════════════════════

        // CRITICAL FIX: Ensure newlines after graph statements BEFORE splitting
        // This prevents run-on statements like "A --> B;C --> D;" from becoming "GraphA --> B;C --> D;"
        clean = clean.replace(/;([A-Za-z0-9_]+)/g, ';\n$1');

        // Split into lines for processing
        const beforeSplit = clean;
        let lines = clean.split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length === 0) {
            console.error('[AXIOM:SANITIZER] All lines were filtered out');
            // Fallback: don't filter empty lines, just trim
            lines = beforeSplit.split('\n').map(l => l.trim());
        }
        
        lines = lines.map(line => {
            // Skip certain lines
            if (/^(flowchart|graph|subgraph|end|direction)/i.test(line)) {
                return line;
            }
            // Add semicolon if missing (for nodes, links, class, style)
            if (!line.endsWith(';') && !line.endsWith('{')) {
                return line + ';';
            }
            return line;
        });
        
        clean = lines.join('\n');
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 9: UNMASK STRINGS & APPEND CLASSDEFS
        // ═══════════════════════════════════════════════════════════════
        
        // Restore masked strings
        tokenMap.forEach((val, key) => {
            clean = clean.replace(new RegExp(key, 'g'), val);
        });
        
        // Append hoisted classDefs at the end
        if (classDefs.length > 0) {
            clean += '\n' + [...new Set(classDefs)].join('\n');
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 10: FINAL CLEANUP
        // ═══════════════════════════════════════════════════════════════
        
        // Remove double semicolons
        clean = clean.replace(/;+/g, ';');
        
        // Remove empty lines
        const beforeEmptyRemoval = clean;
        clean = clean.split('\n').filter(l => l.trim()).join('\n');

        if ((clean.match(/\n/g) || []).length < 3) {
            console.error('[AXIOM:SANITIZER] Very few newlines in output - possible stripping bug');
        }

        return clean;
    }
    
    // =========================================================================
    // LLM JSON REPAIR
    // =========================================================================
    
    function repairLLMJson(rawString) {
        let clean = rawString.trim();

        // 1. Remove Markdown Code Blocks (if mistakenly included)
        clean = clean.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "");

        // 2. FIX: The "Single Quote Escape" Trap
        // JSON does not allow \' (it only allows \"). LLMs often screw this up.
        clean = clean.replace(/\\'/g, "'");

        // 3. FIX: The "Bad Escape" Trap (The specific error you saw)
        // Find backslashes that are NOT followed by valid JSON escape characters.
        // Double-escape them so they become literal backslashes.
        // Valid: " \ / b f n r t u
        clean = clean.replace(/\\(?![/u"\\bfnrt])/g, "\\\\");

        // 4. FIX: Double-Escaped Quotes (Recursive fix)
        // Sometimes LLMs give us \\" which breaks things.
        clean = clean.replace(/\\\\"/g, '\\"');

        return clean;
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.sanitizer = {
        sanitizeMermaidString,
        repairLLMJson
    };
    
})();