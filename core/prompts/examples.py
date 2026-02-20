"""
One-Shot Examples for Each Difficulty Level
These are embedded in the system prompts to demonstrate expected output quality
"""

EXPLORER_ONE_SHOT = """{
  "type": "simulation_playlist",
  "title": "Dijkstra's Algorithm: Finding Shortest Paths",
  "summary": "### Understanding Shortest Paths\\n\\nDijkstra's algorithm finds the shortest path by always choosing the nearest unvisited node. It's a foundational greedy algorithm.\\n\\n**What you will learn:**\\n\\n- How priority queues enable greedy choices\\n- Why distances guarantee shortest paths\\n- The power of systematic exploration",
  "steps": [
    {
      "step": 0,
      "is_final": false,
      "instruction": "# Initialization\\n\\nWe want to find the shortest path from **A** to **F**.\\n\\n**The Setup:**\\n- Start node A has distance **0**\\n- All other nodes start at distance **∞**\\n- Priority queue contains only A\\n\\n**Initial State:**\\n- Distances: `{A: 0, B: ∞, C: ∞, D: ∞, E: ∞, F: ∞}`\\n- Queue: `[A:0]`\\n- Visited: `{}`\\n\\n**Key Insight:**\\n\\nDijkstra is **greedy** - it always processes the node with the smallest known distance. This guarantees we find the shortest path because once we visit a node, we have already found its optimal distance.\\n\\nNotice how all nodes except A show **∞** - they are undiscovered. The edges show weights that will be used to calculate distances.",
      "mermaid": "flowchart LR\\nA([\\\"A | dist: 0\\\"])\\nB([\\\"B | dist: ∞\\\"])\\nC([\\\"C | dist: ∞\\\"])\\nD([\\\"D | dist: ∞\\\"])\\nE([\\\"E | dist: ∞\\\"])\\nF([\\\"F | Goal\\\"])\\nA -->|\\\"4\\\"| B\\nA -->|\\\"2\\\"| C\\nB -->|\\\"3\\\"| D\\nC -->|\\\"1\\\"| D\\nC -->|\\\"5\\\"| E\\nD -->|\\\"2\\\"| E\\nD -->|\\\"4\\\"| F\\nE -->|\\\"2\\\"| F\\nclassDef start fill:#1a3a2e,stroke:#4ADE80,stroke-width:3px,color:#fff\\nclassDef unvisited fill:#1f1f24,stroke:#A1A1AA,stroke-width:1px,color:#aaa\\nclassDef goal fill:#3a1818,stroke:#FB7185,stroke-width:2px,color:#fff\\nclass A start\\nclass B,C,D,E unvisited\\nclass F goal",
      "data_table": "<div class='graph-data-panel'><h4>Current Node</h4><p><b>A</b> (dist: 0)</p><h4>Distances</h4><p>A: <b>0</b> • B: ∞ • C: ∞ • D: ∞ • E: ∞ • F: ∞</p><h4>Priority Queue</h4><p>[A:0]</p><h4>Status</h4><p>Starting exploration from A</p></div>",
      "step_analysis": {
        "what_changed": "Start node A set to distance 0, all others to infinity",
        "previous_state": "No nodes visited, all distances unknown",
        "current_state": "A:0, B:∞, C:∞, D:∞, E:∞, F:∞, Queue: [A:0]",
        "why_matters": "Foundation of greedy algorithm - always start from a known point"
      }
    },
    {
      "step": 1,
      "is_final": false,
      "instruction": "# First Wave Complete\\n\\nWe explored **A** and discovered its neighbors **C** (distance 2) and **B** (distance 4).\\n\\n**What happened:**\\n1. Dequeued A (distance 0)\\n2. Explored edge A→C (weight 2): distance = 0 + 2 = **2**\\n3. Explored edge A→B (weight 4): distance = 0 + 4 = **4**\\n4. Updated distances and added C and B to queue\\n5. Marked A as **done** (visited)\\n\\n**Current State:**\\n- Distances: `{A: 0, B: 4, C: 2, D: 3, E: 7, F: ∞}`\\n- Queue: `[C:2, D:3, B:4, E:7]`\\n- Current: **C** (distance 2)\\n\\n**Why C is Current:**\\n\\nDijkstra's greedy choice: C has the smallest distance (2) among unvisited nodes, so we process it next. The thick arrows show paths we have explored. Notice how D already has distance 3 because C→D (weight 1) gives a shorter path than B→D would.",
      "mermaid": "flowchart LR\\nA([\\\"A | done\\\"])\\nB([\\\"B | dist: 4\\\"])\\nC([\\\"C | dist: 2\\\"])\\nD([\\\"D | dist: 3\\\"])\\nE([\\\"E | dist: 7\\\"])\\nF([\\\"F | Goal\\\"])\\nA ==>|\\\"4\\\"| B\\nA ==>|\\\"2\\\"| C\\nB -->|\\\"3\\\"| D\\nC ==>|\\\"1\\\"| D\\nC ==>|\\\"5\\\"| E\\nD -->|\\\"2\\\"| E\\nD -->|\\\"4\\\"| F\\nE -->|\\\"2\\\"| F\\nclassDef done fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef current fill:#2d1b4e,stroke:#B4A0E5,stroke-width:3px,color:#fff\\nclassDef discovered fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef unvisited fill:#1f1f24,stroke:#A1A1AA,stroke-width:1px,color:#aaa\\nclassDef goal fill:#3a1818,stroke:#FB7185,stroke-width:2px,color:#fff\\nclass A done\\nclass C current\\nclass B,D,E discovered\\nclass F goal",
      "data_table": "<div class='graph-data-panel'><h4>Current Node</h4><p><b>C</b> (dist: 2) - processing now</p><h4>Distances</h4><p>A: 0 (done) • B: 4 • C: <b>2</b> (current) • D: 3 • E: 7 • F: ∞</p><h4>Priority Queue</h4><p>[C:2] → [D:3, B:4, E:7]</p><h4>Status</h4><p>Greedy choice: C has smallest distance</p></div>",
      "step_analysis": {
        "what_changed": "Visited A, discovered neighbors C (dist 2) and B (dist 4), dequeued C as next",
        "previous_state": "Queue: [A:0], Visited: {}, all nodes except A at ∞",
        "current_state": "Queue: [C:2, D:3, B:4, E:7], Visited: {A}, C is current node",
        "why_matters": "Greedy choice - always pick unvisited node with smallest distance"
      }
    }
  ]
}"""

ENGINEER_ONE_SHOT = """{
  "type": "simulation_playlist",
  "title": "Backpropagation: The Chain Rule in Action",
  "summary": "### Why Neural Networks Learn\\n\\nBackpropagation isn't just math - it's how networks discover what went wrong and how to fix it. The chain rule enables error signals to flow backwards through layers.\\n\\n**What you will learn:**\\n\\n- Why the chain rule makes learning possible\\n- How gradients point toward better weights\\n- The relationship between forward activations and backward sensitivity",
  "steps": [
    {
      "step": 0,
      "is_final": false,
      "instruction": "# Forward Pass Complete\\n\\nAll activations have been computed through the network. Now we have a prediction and can calculate the loss.\\n\\n**Network Structure:**\\n- **2 inputs:** `x1=1.0`, `x2=0.5`\\n- **Hidden Layer 1:** 3 neurons with activations `a=σ(z)`\\n- **Hidden Layer 2:** 2 neurons aggregating from layer 1\\n- **Output:** Single neuron `y=0.82`\\n- **Loss:** `L=0.032` (measuring error)\\n\\n**The WHY:**\\n\\nEach neuron computes **z** (weighted sum) and **a** (activation after sigmoid). These values are crucial because backprop will use them to compute gradients. The activation function introduces nonlinearity - without it, stacking layers would be pointless (just one big linear transformation).\\n\\n**Key Insight:**\\n\\nThe forward pass creates a computational graph. Every operation (multiply, add, sigmoid) will need its derivative during backprop. That's why we store **z** and **a** - they are needed for the chain rule.\\n\\nNotice the thick green arrows showing the forward data flow. Each weight **w** will soon receive a gradient telling it how to adjust.",
      "mermaid": "flowchart LR\\nsubgraph INPUT[Input Layer]\\n  X1[\\\"x1: 1.0\\\"]\\n  X2[\\\"x2: 0.5\\\"]\\nend\\nsubgraph HIDDEN1[Hidden Layer 1]\\n  H1[\\\"h1 | z:0.8 | a:0.69\\\"]\\n  H2[\\\"h2 | z:0.6 | a:0.65\\\"]\\n  H3[\\\"h3 | z:0.4 | a:0.60\\\"]\\nend\\nsubgraph HIDDEN2[Hidden Layer 2]\\n  H4[\\\"h4 | z:1.2 | a:0.77\\\"]\\n  H5[\\\"h5 | z:0.9 | a:0.71\\\"]\\nend\\nsubgraph OUTPUT[Output Layer]\\n  Y1[\\\"y: 0.82\\\"]\\n  LOSS[\\\"Loss: 0.032\\\"]\\nend\\nX1 ==>|\\\"w:0.5\\\"| H1\\nX1 ==>|\\\"w:0.3\\\"| H2\\nX2 ==>|\\\"w:0.4\\\"| H2\\nX2 ==>|\\\"w:0.6\\\"| H3\\nH1 ==>|\\\"w:0.7\\\"| H4\\nH2 ==>|\\\"w:0.5\\\"| H4\\nH2 ==>|\\\"w:0.3\\\"| H5\\nH3 ==>|\\\"w:0.8\\\"| H5\\nH4 ==>|\\\"w:0.6\\\"| Y1\\nH5 ==>|\\\"w:0.4\\\"| Y1\\nY1 ==> LOSS\\nclassDef input fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef hidden fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef output fill:#2d1b4e,stroke:#B4A0E5,stroke-width:3px,color:#fff\\nclassDef loss fill:#3a1818,stroke:#FB7185,stroke-width:2px,color:#fff\\nclass X1,X2 input\\nclass H1,H2,H3,H4,H5 hidden\\nclass Y1 output\\nclass LOSS loss",
      "data_table": "<div class='graph-data-panel'><h4>Forward Pass Results</h4><p>Input: <b>x1=1.0</b>, <b>x2=0.5</b></p><p>Output: <b>y=0.82</b>, Loss: <b>0.032</b></p><h4>Activations</h4><p>H1: z=0.8, a=0.69 • H2: z=0.6, a=0.65 • H3: z=0.4, a=0.60</p><p>H4: z=1.2, a=0.77 • H5: z=0.9, a=0.71</p><h4>Why Store z and a?</h4><p>Backprop needs these for chain rule: ∂a/∂z = a(1-a)</p></div>",
      "step_analysis": {
        "what_changed": "Computed forward pass through all layers, produced output y=0.82 and loss L=0.032",
        "previous_state": "Uninitialized network with random weights",
        "current_state": "All activations computed: H1-H3 (layer 1), H4-H5 (layer 2), y=0.82, Loss=0.032",
        "why_matters": "Forward pass creates computational graph needed for backprop - stores z and a values for chain rule"
      }
    },
    {
      "step": 1,
      "is_final": false,
      "instruction": "# Backward Gradient Flow\\n\\nNow gradients flow **backwards** from the loss through each layer, computing how much each weight contributed to the error.\\n\\n**What Changed:**\\n\\nThe loss **L=0.032** produces initial gradient **∂L/∂y = -0.18**. This error signal propagates backwards:\\n\\n1. **Output → Hidden2:** Gradients flow to H4 and H5\\n   - `∂L/∂h4 = -0.05` (chain rule through output weights)\\n   - `∂L/∂h5 = -0.07`\\n\\n2. **Hidden2 → Hidden1:** Gradients accumulate at H1, H2, H3\\n   - `∂L/∂h1 = -0.02` (from H4's gradient)\\n   - `∂L/∂h2 = -0.03` (from both H4 and H5)\\n   - `∂L/∂h3 = -0.01` (from H5's gradient)\\n\\n3. **Hidden1 → Inputs:** Gradients reach X1 and X2\\n   - These tell us how input sensitivity affects the loss\\n\\n**The WHY:**\\n\\nThe chain rule enables this flow: `∂L/∂w = ∂L/∂a * ∂a/∂z * ∂z/∂w`. Each layer receives error signals from layers ahead, multiplies by local derivatives, and passes signals backward.\\n\\n**Key Insight:**\\n\\nGradients point toward **steeper loss increase**. So we move weights in the **opposite direction** (gradient descent). Notice dotted arrows show gradient flow - they are computationally separate from forward arrows but mathematically dependent on forward activations.",
      "mermaid": "flowchart LR\\nsubgraph INPUT[Input Layer]\\n  X1[\\\"x1: 1.0\\\"]\\n  X2[\\\"x2: 0.5\\\"]\\nend\\nsubgraph HIDDEN1[Hidden Layer 1]\\n  H1[\\\"h1 | ∂:0.02\\\"]\\n  H2[\\\"h2 | ∂:0.03\\\"]\\n  H3[\\\"h3 | ∂:0.01\\\"]\\nend\\nsubgraph HIDDEN2[Hidden Layer 2]\\n  H4[\\\"h4 | ∂:0.05\\\"]\\n  H5[\\\"h5 | ∂:0.07\\\"]\\nend\\nsubgraph OUTPUT[Output Layer]\\n  Y1[\\\"y: 0.82\\\"]\\n  LOSS[\\\"Loss: 0.032\\\"]\\nend\\nsubgraph GRADIENTS[Gradient Flow]\\n  G1[\\\"∂L/∂y: -0.18\\\"]\\n  G2[\\\"∂L/∂h4: -0.05\\\"]\\n  G3[\\\"∂L/∂h1: -0.02\\\"]\\nend\\nX1 -->|\\\"fwd\\\"| H1\\nX1 -->|\\\"fwd\\\"| H2\\nX2 -->|\\\"fwd\\\"| H2\\nX2 -->|\\\"fwd\\\"| H3\\nH1 -->|\\\"fwd\\\"| H4\\nH2 -->|\\\"fwd\\\"| H4\\nH2 -->|\\\"fwd\\\"| H5\\nH3 -->|\\\"fwd\\\"| H5\\nH4 -->|\\\"fwd\\\"| Y1\\nH5 -->|\\\"fwd\\\"| Y1\\nY1 --> LOSS\\nLOSS ==>|\\\"grad\\\"| G1\\nG1 -.->|\\\"-0.11\\\"| H4\\nG1 -.->|\\\"-0.07\\\"| H5\\nG2 -.->|\\\"-0.03\\\"| H1\\nG2 -.->|\\\"-0.02\\\"| H2\\nG3 -.->|\\\"-0.01\\\"| X1\\nclassDef input fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef hidden fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef output fill:#2d1b4e,stroke:#B4A0E5,stroke-width:3px,color:#fff\\nclassDef loss fill:#3a1818,stroke:#FB7185,stroke-width:2px,color:#fff\\nclassDef gradient fill:#2e2414,stroke:#FCD34D,stroke-width:2px,color:#FCD34D\\nclass X1,X2 input\\nclass H1,H2,H3,H4,H5 hidden\\nclass Y1 output\\nclass LOSS loss\\nclass G1,G2,G3 gradient",
      "data_table": "<div class='graph-data-panel'><h4>Gradient Magnitudes</h4><p>∂L/∂y: <b>-0.18</b> (initial error signal)</p><p>∂L/∂h4: <b>-0.05</b> • ∂L/∂h5: <b>-0.07</b></p><p>∂L/∂h1: <b>-0.02</b> • ∂L/∂h2: <b>-0.03</b> • ∂L/∂h3: <b>-0.01</b></p><h4>Chain Rule</h4><p>Each gradient = (upstream gradient) × (local derivative)</p><h4>Weight Update</h4><p>w_new = w_old - learning_rate × gradient</p></div>",
      "step_analysis": {
        "what_changed": "Gradients computed via backprop - error signal flowed from loss through all layers to inputs",
        "previous_state": "Only forward activations available, no gradients computed",
        "current_state": "All gradients computed: ∂L/∂y=-0.18, ∂L/∂h4=-0.05, ∂L/∂h5=-0.07, ∂L/∂h1=-0.02, ∂L/∂h2=-0.03, ∂L/∂h3=-0.01",
        "why_matters": "Chain rule enables gradient flow - each weight now knows how to adjust to reduce loss"
      }
    }
  ]
}"""

ARCHITECT_ONE_SHOT = """{
  "type": "simulation_playlist",
  "title": "Transformer Architecture: Attention Is All You Need",
  "summary": "### Self-Attention at Scale\\n\\nThe transformer's self-attention mechanism solved the sequential bottleneck in RNNs through parallelizable context. Each token attends to all others via Q·K^T, enabling O(1) path length between any two positions at the cost of O(n²) complexity.\\n\\n**What you will learn:**\\n\\n- Why scaled dot-product attention enables parallelism (architectural win over RNNs)\\n- How residual connections prevent vanishing gradients at depth (production necessity for 96+ layer models)\\n- The memory-compute tradeoff: O(n²) attention vs O(n) for 2048-token contexts (systems design)",
  "steps": [
    {
      "step": 0,
      "is_final": false,
      "instruction": "# QKV Projection: The Foundation\\n\\nBefore attention can compute relationships between tokens, we must project input embeddings into **Query**, **Key**, and **Value** spaces.\\n\\n**The Architecture:**\\n\\nWe have 3 input tokens, each with **512-dimensional embeddings**. For 2 attention heads:\\n\\n1. **Token → Q, K, V:** Each token projects to 3 vectors per head\\n   - Projection matrices: `W_Q`, `W_K`, `W_V` (learned weights)\\n   - Output dimension: **64d per head** (512d / 8 heads = 64d typical)\\n\\n2. **Semantic Roles:**\\n   - **Query (Q):** \\"What am I looking for?\\"\\n   - **Key (K):** \\"What do I represent?\\"\\n   - **Value (V):** \\"What information do I carry?\\"\\n\\n**Why This Matters (Research):**\\n\\nRNNs process sequentially: token t depends on t-1, creating O(n) sequential operations. Transformers compute all QKV projections **in parallel** - this is the architectural breakthrough. Every token sees every other token in O(1) steps.\\n\\n**Why This Matters (Systems):**\\n\\nFor GPT-3 (d=12288, 96 heads, n=2048):\\n- QKV projection per layer: `3 × n × d × d_k = 3 × 2048 × 12288 × 128 = 9.6B FLOPs`\\n- Modern GPUs (A100: 312 TFLOPS) handle this in ~30ms\\n- But attention scores are next...\\n\\n**Why This Matters (Production):**\\n\\nProjection is a simple matmul - highly optimized in cuBLAS/cuDNN. This operation scales linearly O(n×d²), not quadratically. The bottleneck comes later.",
      "mermaid": "flowchart LR\\nsubgraph EMBED[Input Embeddings]\\n  T1[\\\"Token 1 | 512d\\\"]\\n  T2[\\\"Token 2 | 512d\\\"]\\n  T3[\\\"Token 3 | 512d\\\"]\\nend\\nsubgraph PROJ[QKV Projection]\\n  Q1[\\\"Q1 | 64d\\\"]\\n  K1[\\\"K1 | 64d\\\"]\\n  V1[\\\"V1 | 64d\\\"]\\n  Q2[\\\"Q2 | 64d\\\"]\\n  K2[\\\"K2 | 64d\\\"]\\n  V2[\\\"V2 | 64d\\\"]\\nend\\nT1 ==>|\\\"W_Q\\\"| Q1\\nT1 ==>|\\\"W_K\\\"| K1\\nT1 ==>|\\\"W_V\\\"| V1\\nT2 ==>|\\\"W_Q\\\"| Q2\\nT2 ==>|\\\"W_K\\\"| K2\\nT2 ==>|\\\"W_V\\\"| V2\\nclassDef embed fill:#1a3a2e,stroke:#4ADE80,stroke-width:3px,color:#fff\\nclassDef proj fill:#2d1b4e,stroke:#B4A0E5,stroke-width:2px,color:#fff\\nclass T1,T2,T3 embed\\nclass Q1,K1,V1,Q2,K2,V2 proj",
      "data_table": "<div class='graph-data-panel'><h4>Projection Dimensions</h4><p>Input: <b>3 tokens × 512d</b></p><p>Output: <b>6 vectors × 64d</b> (2 heads, 3 vectors each)</p><h4>Computation</h4><p>Q = X @ W_Q (matmul: 3×512 @ 512×64)</p><p>Total: <b>3 projections × 3 tokens = 9 matmuls</b></p><h4>Complexity (this example)</h4><p>Time: O(n×d×d_k) = O(3×512×64) = ~98K FLOPs</p><h4>At GPT-3 Scale</h4><p>n=2048, d=12288, d_k=128, 96 heads</p><p>QKV projection: <b>9.6B FLOPs</b></p></div>",
      "step_analysis": {
        "what_changed": "Projected 3 token embeddings (512d each) into Q, K, V vectors (64d per head) for 2 attention heads",
        "previous_state": "Raw token embeddings: 3 tokens × 512d",
        "current_state": "QKV triplets ready: Q1,K1,V1 and Q2,K2,V2 (6 vectors × 64d total)",
        "why_matters": "Creates attention mechanism foundation - Q searches, K matches, V provides information"
      }
    },
    {
      "step": 1,
      "is_final": false,
      "instruction": "# Attention & Residual: The Core Mechanism\\n\\nNow we compute **Q·K^T** to get attention scores, apply them to **V**, concatenate heads, and crucially - **add a residual connection**.\\n\\n**The Attention Computation:**\\n\\n1. **Scores:** `Attention(Q,K,V) = softmax(Q·K^T / √d_k) · V`\\n   - Q·K^T creates **n×n attention matrix** (3×3 in our case)\\n   - Each entry measures token-to-token similarity\\n   - Scaling by √d_k prevents gradients from vanishing\\n\\n2. **Multi-Head Attention:**\\n   - Head 1 score: **0.8** (strong attention)\\n   - Head 2 score: **0.6** (moderate attention)\\n   - Different heads learn different relationships (syntax vs semantics)\\n\\n3. **Concatenation:** Heads combine to **128d** (2 heads × 64d)\\n\\n4. **Residual Connection:** `output = LayerNorm(x + Attention(x))`\\n   - The skip connection (dotted arrow) is **critical**\\n   - Without it, 96-layer models would suffer vanishing gradients\\n\\n**Why This Matters (Research):**\\n\\nAttention is O(n²×d) - quadratic in sequence length. For n=2048:\\n- Attention matrix: **2048² = 4M entries**\\n- Each position attends to all 2048 others\\n- This is why context length is expensive\\n\\n**Why This Matters (Systems):**\\n\\nMemory bottleneck dominates:\\n- Forward pass: store 4M floats (16MB in fp32, 8MB in fp16)\\n- Backward pass: store gradients (another 16MB)\\n- Batch size 8: **128MB per layer** just for attention\\n- 96 layers: **12GB** - hence A100 with 80GB HBM2e\\n\\n**Why This Matters (Production):**\\n\\nResidual connections enable deep networks:\\n- BERT (12-24 layers): moderate depth\\n- GPT-3 (96 layers): deep, needs residuals\\n- Without skip connections: gradients decay exponentially\\n- With residuals: gradients have **highway** to flow backwards",
      "mermaid": "flowchart LR\\nsubgraph EMBED[Input Embeddings]\\n  T1[\\\"Token 1\\\"]\\n  T2[\\\"Token 2\\\"]\\nend\\nsubgraph PROJ[Q, K, V]\\n  Q1[\\\"Q1\\\"]\\n  K1[\\\"K1\\\"]\\n  V1[\\\"V1\\\"]\\n  Q2[\\\"Q2\\\"]\\n  K2[\\\"K2\\\"]\\n  V2[\\\"V2\\\"]\\nend\\nsubgraph ATT[Attention Heads]\\n  A1[\\\"Head 1 | score:0.8\\\"]\\n  A2[\\\"Head 2 | score:0.6\\\"]\\n  CONCAT[\\\"Concat | 128d\\\"]\\nend\\nsubgraph NORM1[Add & Norm]\\n  ADD1[\\\"Residual +\\\"]\\n  LN1[\\\"LayerNorm\\\"]\\nend\\nQ1 ==> A1\\nK1 ==> A1\\nV1 ==> A1\\nQ2 ==> A2\\nK2 ==> A2\\nV2 ==> A2\\nA1 ==> CONCAT\\nA2 ==> CONCAT\\nCONCAT ==> ADD1\\nT1 -.->|\\\"skip\\\"| ADD1\\nADD1 ==> LN1\\nclassDef embed fill:#1a3a2e,stroke:#4ADE80,stroke-width:2px,color:#fff\\nclassDef proj fill:#1a3a2e,stroke:#4ADE80,stroke-width:1px,color:#aaa\\nclassDef attention fill:#2d1b4e,stroke:#B4A0E5,stroke-width:3px,color:#fff\\nclassDef norm fill:#2e2414,stroke:#FCD34D,stroke-width:2px,color:#FCD34D\\nclass T1,T2 embed\\nclass Q1,K1,V1,Q2,K2,V2 proj\\nclass A1,A2,CONCAT attention\\nclass ADD1,LN1 norm",
      "data_table": "<div class='graph-data-panel'><h4>Attention Scores</h4><p>Head 1: <b>0.8</b> (strong context) • Head 2: <b>0.6</b> (moderate)</p><p>Computation: softmax(Q·K^T / √64)</p><h4>Output Dimensions</h4><p>Concat: <b>128d</b> (2 heads × 64d)</p><p>After residual: <b>512d</b> (matches input)</p><h4>Complexity (this example)</h4><p>Attention matrix: <b>3×3 = 9 entries</b></p><p>Q·K^T: O(n²×d_k) = O(9×64) = ~576 FLOPs</p><h4>At GPT-3 Scale</h4><p>Attention matrix: <b>2048² = 4.2M entries</b></p><p>Memory: 16MB (fp32) per layer</p><p>96 layers: <b>1.5GB</b> attention matrices</p><h4>Residual Connection</h4><p>Enables gradient flow through 96 layers</p></div>",
      "step_analysis": {
        "what_changed": "Computed multi-head attention (2 heads), concatenated outputs (128d), added residual connection, applied LayerNorm",
        "previous_state": "Separate Q,K,V vectors for each head, no attention computed",
        "current_state": "Attention matrix computed (3×3), heads concatenated (128d), residual added, normalized output (512d)",
        "why_matters": "Attention creates token relationships (Q·K^T), residuals enable deep networks (96 layers possible)"
      }
    }
  ]
}"""
