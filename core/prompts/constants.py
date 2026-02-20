"""
Mermaid Syntax Rules and Shape Reference
Shared constants used across all difficulty levels
"""

SHAPE_REFERENCE = """
### 8. FLOWCHART SHAPES (USE THESE)

**SUPPORTED SHAPES:**
| Syntax | Shape | Use For |
|--------|-------|---------|
| `A["Text"]` | Rectangle | Standard steps, processes |
| `A["Text"]` | Rectangle | Default node |
| `A("Text")` | Rounded Rectangle | Soft steps, states |
| `A(["Text"])` | Stadium/Pill | Start/End points |
| `A[["Text"]]` | Subroutine | Function calls |
| `A[("Text")]` | Cylinder | Database/Storage |
| `A(("Text"))` | Circle | Decision points |
| `A{"Text"}` | Diamond | Conditionals |
| `A{{"Text"}}` | Hexagon | Preparation steps |
| `A[/"Text"/]` | Parallelogram | Input/Output |
| `A[\\"Text"\\]` | Reverse Parallelogram | Manual input |
| `A>"Text"]` | Flag/Asymmetric | Special signals |

**EXAMPLES:**
```
flowchart LR
    start(["Start"]) --> process["Process Data"]
    process --> decision{"Valid?"}
    decision -->|Yes| db[("Save to DB")]
    decision -->|No| error(("Error"))
    db --> done(["Complete"])
```

**CRITICAL RULES FOR SHAPES:**
1. ALWAYS wrap text in double quotes: `A["Text"]` not `A[Text]`
2. Stadium shape is `(["text"])` NOT `([text])`
3. Diamond is `{"text"}` NOT `{text}`
4. Cylinder is `[("text")]` for database representation
"""

MERMAID_FIX = (
    """
###  THE COMPILER RULES (STRICT SYNTAX ENFORCEMENT)
###  THE SYNTAX FIREWALL (VIOLATION = SYSTEM CRASH)
You are generating a JSON string. The parser is extremely strict.

### 🚨 GRAPH DIRECTION (MANDATORY):
- **ALWAYS** start mermaid code with `flowchart LR` (left-to-right).
- **NEVER** use `flowchart TD`, `flowchart TB`, or `flowchart RL`.
- LR layouts use horizontal space efficiently and prevent vertical cutoff in the viewer.
- The ONLY exception: if the user explicitly requests a top-down layout.

### ⚠️ MOST COMMON CRASH CAUSES (MEMORIZE THESE):
1. `class A, B, C style;` ← NEVER use commas. One node per line.
2. `subgraph 📥 Name` ← NEVER put emojis in IDs. Use `subgraph ID["📥 Name"]`
3. `Node["Text"]Node2` ← ALWAYS use semicolon or newline between statements.
4. Missing `end` for subgraphs ← COUNT your subgraphs and ends.

**CRITICAL FORMATTING RULES:**

1. **NO "SMASHING" COMMANDS:**
   * **FATAL ERROR:** `class A active class B data`
   * **CORRECT:** `class A active;\\nclass B data;`
   * **Structural Keywords** (`subgraph`, `end`) **MUST** be on their own lines.

2. **THE SEMICOLON SAFETY NET (CRITICAL):**
   * End all nodes, links, and style statements with semicolons:
     - **YES:** `NodeA["Label"];` `class A active;` `A --> B;`
     - **NO:** `flowchart LR;` (graph header - no semicolon)
     - **NO:** `subgraph NAME["Title"]` (subgraph header - no semicolon)
     - **YES:** `end;` (end statement - needs semicolon)

3. **NO LITERAL NEWLINES IN STRINGS:**
   * You **MUST** use `\\n` for newlines inside the JSON string values.
   * Inside Node Labels, use `<br/>` for visual line breaks.
   * **BAD:** `Node["List:\\n- Item 1"]`
   * **GOOD:** `Node["List:<br/>• Item 1"]` (Use bullets, not markdown dashes)

4. **QUOTES & WRAPPERS (CRITICAL):**
   * **ALL** Node labels MUST be wrapped in **DOUBLE QUOTES** (`"`).
   * **NO NESTED QUOTES:** Use single quotes `'` inside the label text if needed.
   * **NO INNER BRACKETS:** Use `( )` inside text labels, NEVER `[ ]`.
   * **BAD:** `Loss([ 'Error' ])`
   * **GOOD:** `Loss([ "Error" ]);`

5. **ARROW CONSISTENCY (NO HYBRIDS):**
   * You must NOT mix arrow types in a single link.
   * **BAD:** `-- "Label" ==>` (Thin start, thick end = CRASH)
   * **BAD:** `== "Label" -->` (Thick start, thin end = CRASH)
   * **GOOD:** `-- "Label" -->` (Thin)
   * **GOOD:** `== "Label" ==>` (Thick)

6. **NEVER USE DIRECTION STATEMENTS (CRITICAL!):**
   - DO NOT include `direction LR`, `direction TB`, `direction TD`, `direction BT`, or `direction RL` ANYWHERE
   - The system automatically enforces `flowchart LR` - you don't need to specify direction
   - ESPECIALLY: Never put direction inside subgraphs (this causes parse errors)
   - BAD: subgraph GRAPH[\"Title\"]\n  direction LR\n  A --> B\nend
   - GOOD: subgraph GRAPH[\"Title\"]\n  A --> B\nend"

7. **ATOMIC LINKS (NO RUN-ONS OR CHAINING - CRITICAL):**
   * A link must connect EXACTLY TWO nodes. NO CHAINING ALLOWED.
   * **FATAL:** `A -- B -- C -- D;` (chained links - parser crashes)
   * **FATAL:** `A --> B --> C;` (chained arrows - parser crashes)
   * **CORRECT:** `A -- B;\\nB -- C;\\nC -- D;` (separate statements)
   * **RULE:** For N nodes in sequence, write N-1 separate link statements
   * **BAD:** `A == "Label" ==>;\\nB;` (Do NOT put a semicolon inside the arrow)
   * **GOOD:** `A == "Label" ==> B;`

8. **NO MARKDOWN LISTS IN NODES (CRITICAL):**
   * **FATAL ERROR:** Do NOT use `-` or `*` for lists inside Mermaid nodes. It crashes the renderer.
   * **CORRECT:** Use the bullet character `•` and `<br/>`.
   * **BAD:** `Node["- Item 1\\n- Item 2"]`
   * **GOOD:** `Node["• Item 1<br/>• Item 2"]`

9. **THE "BREATHING ROOM" PROTOCOL (CRITICAL):**
   * The Mermaid parser crashes if elements touch. You MUST follow these spacing rules:
   * **Header Spacing:** ALWAYS put a newline `\\n` after `flowchart LR`.
     - **BAD:** `flowchart LRNodeA`
     - **GOOD:** `flowchart LR\\nNodeA;`
   * **Node Spacing:** ALWAYS put a newline `\\n` between nodes.
     - **BAD:** `NodeA[Text]NodeB[Text]`
     - **GOOD:** `NodeA[Text];\\nNodeB[Text];`
   * **THE BRACKET BARRIER (FATAL ERROR):**
     - **NEVER** let a closing bracket (`]`, `)`, `}`, `>`) touch the next letter.
     - You **MUST** put a semicolon `;` or newline `\\n` after every closing bracket.
     - **FATAL:** `Term1["Val"]Term2`  <-- CRASHES RENDERER
     - **CORRECT:** `Term1["Val"];\\nTerm2`
   * **Subgraph Spacing:** ALWAYS put a newline `\\n` after a subgraph title.
     - **BAD:** `subgraph Title["Text"]NodeA`
     - **GOOD:** `subgraph Title["Text"]\\nNodeA;`

10. **NO RUN-ON STATEMENTS (FATAL ERROR):**
   * **NEVER** put two separate link definitions on the same line.
   * **BAD:** `A-->B C-->D` (The parser crashes when it hits 'C')
   * **GOOD:** `A-->B;\\nC-->D;` (Must use newline or semicolon)
   * **BAD:** `A-->B; C-->D;` (Even with semicolons, separate lines are safer)
   * **GOOD:** `A-->B;\\nC-->D;`

11. **NO GROUPED CLASS ASSIGNMENTS (CRITICAL - CAUSES CRASH):**
    * NEVER use commas in class statements. ONE node per class statement.
    * **FATAL:** `class Client, Server hardware;` ← CRASHES PARSER
    * **FATAL:** `class A, B, C active;` ← CRASHES PARSER
    * **CORRECT:** Each node gets its own line:
```
      class Client hardware;
      class Server hardware;
```
    * **RULE:** If you need to style 5 nodes, write 5 separate `class` statements.

12. **CSS SYNTAX ENFORCEMENT (CRITICAL):**
    * **NO ORPHANED PROPERTIES:** You cannot use `stroke-width` without a value.
    * **BAD:** `stroke-width;` or `stroke-width`
    * **GOOD:** `stroke-width:2px;` or `stroke-width:4px;`
    * **ALWAYS USE COLONS:** `stroke-dasharray: 5 5;` (Not `stroke-dasharray 5 5`)
    * **DEFAULT VALUES:** If unsure, use `stroke-width:2px`.

13. **SUBGRAPH BALANCING (LOGIC CHECK):**
    * **NEVER** write an `end` command unless you have explicitly opened a `subgraph` earlier in that specific block.
    * **COUNT THEM:** If you have 3 `end` commands, you MUST have 3 `subgraph` commands.
    * **BAD:**
      ```
      subgraph A
      Node A
      end
      Node B  <-- Orphaned nodes
      end     <-- CRASH (No subgraph to close)
      ```
    * **GOOD:**
      ```
      subgraph A
      Node A
      end
      subgraph B
      Node B
      end
      ```

14. **NO EMOJIS IN IDENTIFIERS (PARSER CRASH):**
    * Emojis are ONLY allowed inside double-quoted label strings.
    * **FATAL:** `subgraph 📥 Input` or `Node📥["Text"]`
    * **CORRECT:** `subgraph INPUT["📥 Input"]` or `Node["📥 Text"]`
    * Subgraph IDs must be alphanumeric + underscores ONLY: `[A-Za-z0-9_]`

15. **ARROWS MUST NOT SPAN LINES (CRITICAL - CAUSES CRASH):**
    * An arrow and its target node MUST be on the SAME line.
    * **BAD:**
      ```
      A -- "label" -->
      B;
      ```
    * **GOOD:** `A -- "label" --> B;`
    * Never break an arrow statement across multiple lines.
```


      """
    + SHAPE_REFERENCE
)
