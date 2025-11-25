// js/config.js
/**
 * AXIOM Engine - Configuration & Global State
 * Central store for all application state and constants.
 */

window.AXIOM = window.AXIOM || {};

// --- Api Configuration ---

AXIOM.API_URL = window.location.origin;

// --- Session State ---

AXIOM.currentSessionId = 'user_' + Date.now();

// --- Application State ---

AXIOM.state = {
    appMode: 'LOBBY',
    isProcessing: false,
    lastBotMessageDiv: null,
    isSimulationUpdate: false,
    lastUserMessage: null,
    lastPromptedForDifficulty: null,
    lastPromptedLobbyInput: null
};

// --- Simulation State ---

AXIOM.simulation = {
    store: {},           // simId -> steps array
    state: {},           // simId -> current index
    currentStepIndex: 0,
    activeSimId: null,
    validatedSteps: new Set(),
    lastWorkingMermaid: {},
    inputData: {}        // simId -> input data object
};

// --- Repair State ---

AXIOM.repair = {
    attempts: 0,
    isRepairing: false,
    isActive: false,
    phase: null,
    attempt: 0,
    startTime: null,
    wrapper: null,
    timerInterval: null,
    lastTick: null
};

// --- Repair Configuration ---

AXIOM.RepairConfig = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 8000,
    RENDER_TIMEOUT_MS: 5000
};

AXIOM.RepairPhase = {
    DIAGNOSING: 'DIAGNOSING',
    // Tier 1: Python sanitizer only (fast, free)
    TIER1_PYTHON: 'TIER1_PYTHON',
    // Tier 2: Python + JS sanitizer (fast, free)
    TIER2_PYTHON_JS: 'TIER2_PYTHON_JS',
    // Tier 3: LLM repair + Python sanitizer (slow, costs $)
    TIER3_LLM: 'TIER3_LLM',
    // Tier 4: LLM + Python + JS sanitizer
    TIER4_LLM_JS: 'TIER4_LLM_JS',
    // Legacy phases (kept for compatibility)
    CONTACTING_LLM: 'CONTACTING_LLM',
    APPLYING_FIX: 'APPLYING_FIX',
    VERIFYING: 'VERIFYING',
    SUCCESS: 'SUCCESS',
    FALLBACK: 'FALLBACK',
    FATAL: 'FATAL'
};

// --- Default Templates ---

AXIOM.DEFAULT_MERMAID_TEMPLATE = `flowchart LR
subgraph INIT["Initialization"]
    direction TB
    start(["Start"])
    config["Configuration"]
    start --> config
end
subgraph PROCESS["Processing"]
    direction TB
    step1["Step 1"]
    step2["Step 2"]
    step1 --> step2
end
subgraph OUTPUT["Result"]
    direction TB
    result(["Output"])
end
INIT --> PROCESS
PROCESS --> OUTPUT
classDef active fill:#bc13fe,stroke:#fff,stroke-width:2px,color:#fff;
classDef process fill:#001a33,stroke:#00aaff,stroke-width:2px,color:#fff;
classDef data fill:#003311,stroke:#00ff9f,stroke-width:2px,color:#fff;
class start,result data;
class step1,step2,config process;
class PROCESS active;`;

// --- Mermaid Initialization ---

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
        background: 'transparent',
        mainBkg: 'transparent',
        primaryColor: '#000000',
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#00f3ff',
        lineColor: '#00f3ff',
        clusterBkg: 'transparent',
        clusterBorder: '#bc13fe',
        fontFamily: 'JetBrains Mono',
        fontSize: '12px',
        nodePadding: '16px',
        edgeLabelBackground: '#030305'
    },
    flowchart: {
        curve: 'linear',
        htmlLabels: true,
        useMaxWidth: false,
        rankSpacing: 80,
        nodeSpacing: 60,
        padding: 25,
        subGraphTitleMargin: {
            top: 10,
            bottom: 10
        },
        wrappingWidth: 300
    }
});

// --- Dom Element References (Populated by Main.js) ---

AXIOM.elements = {};

// --- Utility: Escape Html ---

AXIOM.escapeHtml = function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// --- Utility: Delay ---

AXIOM.delay = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

