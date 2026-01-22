/**
 * AXIOM Neural Canvas — "The Recruiter Magnet"
 * 
 * A stunning particle system that:
 * 1. Spells out "AXIOM" on initial load with a dramatic reveal
 * 2. Morphs into data structures based on user input
 * 3. Responds to mouse movement with fluid physics
 * 4. Creates depth with multiple particle layers
 * 5. Has smooth transitions between all states
 * 
 * @author AXIOM Engine
 * @version 2.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const NEURAL_CONFIG = {
    // Particle counts for different layers
    particles: {
        primary: 2000,      // Main text/shape particles
        ambient: 500,       // Background floating particles  
        connections: 150    // Connection line count
    },
    
    // Colors
    colors: {
        primary: 0x8B5CF6,     // Violet
        secondary: 0x60A5FA,   // Blue
        accent: 0x34D399,      // Green
        highlight: 0xF472B6,   // Pink
        dim: 0x3a3a4a          // Gray
    },
    
    // Animation timing
    timing: {
        introDelay: 0,           // ms before text appears
        morphDuration: 2000,       // ms for shape transitions
        textRevealDuration: 1000,  // ms for initial text reveal
        pulseInterval: 50          // ms between pulse waves
    },
    
    // Physics
    physics: {
        mouseInfluence: 150,    // Mouse attraction radius
        mouseStrength: 0.08,    // How strongly particles follow mouse
        returnSpeed: 0.03,      // How fast particles return to position
        drift: 0.5              // Ambient drift amount
    },
    
    // Text to display (can be customized!)
    heroText: "HELLOTHERE",
    tagline: "SEE ALGORITHMS THINK"
};

// ═══════════════════════════════════════════════════════════════════════════
// TEXT POINT GENERATOR
// Using canvas to render text and extract points
// ═══════════════════════════════════════════════════════════════════════════

class TextPointGenerator {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }
    
    /**
     * Generate point cloud from text string
     * @param {string} text - Text to render
     * @param {number} fontSize - Font size in pixels
     * @param {number} particleCount - Number of points to generate
     * @returns {Float32Array} - Array of x,y,z coordinates
     */
    generatePoints(text, fontSize = 120, particleCount = 2000) {
        // Size canvas to fit text
        this.ctx.font = `bold ${fontSize}px "Space Grotesk", "Inter", sans-serif`;
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2;
        
        this.canvas.width = textWidth + 40;
        this.canvas.height = textHeight + 40;
        
        // Clear and render text
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.font = `bold ${fontSize}px "Space Grotesk", "Inter", sans-serif`;
        this.ctx.fillStyle = '#fff';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
        
        // Sample points from the rendered text
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const points = [];
        
        // Collect all white pixels
        for (let y = 0; y < this.canvas.height; y += 2) {
            for (let x = 0; x < this.canvas.width; x += 2) {
                const i = (y * this.canvas.width + x) * 4;
                if (data[i] > 128) {  // White pixel = part of text
                    points.push({
                        x: x - this.canvas.width / 2,
                        y: -(y - this.canvas.height / 2),
                        z: (Math.random() - 0.5) * 20
                    });
                }
            }
        }
        
        // Randomly sample to get desired particle count
        const coords = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            const pt = points[Math.floor(Math.random() * points.length)] || { x: 0, y: 0, z: 0 };
            coords[i * 3] = pt.x;
            coords[i * 3 + 1] = pt.y;
            coords[i * 3 + 2] = pt.z;
        }
        
        return coords;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE GENERATORS
// Each returns Float32Array of [x, y, z] coordinates
// ═══════════════════════════════════════════════════════════════════════════

const ShapeGenerators = {
    // Scattered random sphere (idle state)
    scatter(count) {
        const coords = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = 100 + Math.random() * 300;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            coords[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            coords[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            coords[i * 3 + 2] = r * Math.cos(phi) * 0.3;  // Flatten z
        }
        return coords;
    },
    
    // Neural network layers
    neural(count) {
        const coords = new Float32Array(count * 3);
        const layers = [6, 12, 12, 8, 4];
        const layerSpacing = 100;
        const totalWidth = (layers.length - 1) * layerSpacing;
        
        for (let i = 0; i < count; i++) {
            const layerIdx = Math.floor(Math.random() * layers.length);
            const nodesInLayer = layers[layerIdx];
            const nodeIdx = Math.floor(Math.random() * nodesInLayer);
            
            const x = (layerIdx * layerSpacing) - totalWidth / 2 + (Math.random() - 0.5) * 20;
            const y = (nodeIdx - nodesInLayer / 2 + 0.5) * 40 + (Math.random() - 0.5) * 15;
            const z = (Math.random() - 0.5) * 30;
            
            coords[i * 3] = x;
            coords[i * 3 + 1] = y;
            coords[i * 3 + 2] = z;
        }
        return coords;
    },
    
    // Binary tree structure
    tree(count) {
        const coords = new Float32Array(count * 3);
        const levels = 6;
        const spread = 300;
        
        for (let i = 0; i < count; i++) {
            const level = Math.floor(Math.random() * levels);
            const nodesAtLevel = Math.pow(2, level);
            const nodeIndex = Math.floor(Math.random() * nodesAtLevel);
            
            const x = (nodeIndex - nodesAtLevel / 2 + 0.5) * (spread / nodesAtLevel) + (Math.random() - 0.5) * 20;
            const y = (levels / 2 - level) * 60 + (Math.random() - 0.5) * 15;
            const z = (Math.random() - 0.5) * 25;
            
            coords[i * 3] = x;
            coords[i * 3 + 1] = y;
            coords[i * 3 + 2] = z;
        }
        return coords;
    },
    
    // Graph with connected nodes
    graph(count) {
        const coords = new Float32Array(count * 3);
        const nodes = 12;
        const rings = 2;
        
        for (let i = 0; i < count; i++) {
            const ring = Math.floor(Math.random() * rings);
            const nodeIdx = Math.floor(Math.random() * nodes);
            const angle = (nodeIdx / nodes) * Math.PI * 2;
            const radius = 80 + ring * 70;
            
            coords[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 30;
            coords[i * 3 + 1] = Math.sin(angle) * radius + (Math.random() - 0.5) * 30;
            coords[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        return coords;
    },
    
    // Sorted array visualization
    array(count) {
        const coords = new Float32Array(count * 3);
        const boxes = 16;
        const boxWidth = 35;
        const totalWidth = boxes * boxWidth;
        
        for (let i = 0; i < count; i++) {
            const boxIdx = Math.floor(Math.random() * boxes);
            const height = (boxIdx / boxes) * 100 + 30;  // Bars of increasing height
            
            coords[i * 3] = (boxIdx - boxes / 2 + 0.5) * boxWidth + (Math.random() - 0.5) * 25;
            coords[i * 3 + 1] = (Math.random() - 0.5) * height;
            coords[i * 3 + 2] = (Math.random() - 0.5) * 15;
        }
        return coords;
    },
    
    // Stack structure
    stack(count) {
        const coords = new Float32Array(count * 3);
        const layers = 10;
        const layerHeight = 30;
        
        for (let i = 0; i < count; i++) {
            const layer = Math.floor(Math.random() * layers);
            
            coords[i * 3] = (Math.random() - 0.5) * 80;
            coords[i * 3 + 1] = (layer - layers / 2) * layerHeight + (Math.random() - 0.5) * 15;
            coords[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        return coords;
    },
    
    // DNA helix (for algorithms/bio)
    helix(count) {
        const coords = new Float32Array(count * 3);
        const turns = 3;
        const height = 300;
        const radius = 80;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * turns * Math.PI * 2;
            const y = (i / count - 0.5) * height;
            const strand = Math.random() > 0.5 ? 0 : Math.PI;
            
            coords[i * 3] = Math.cos(t + strand) * radius + (Math.random() - 0.5) * 20;
            coords[i * 3 + 1] = y + (Math.random() - 0.5) * 10;
            coords[i * 3 + 2] = Math.sin(t + strand) * radius * 0.3;
        }
        return coords;
    },
    
    // Infinity symbol (for continuous processes)
    infinity(count) {
        const coords = new Float32Array(count * 3);
        const scale = 150;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * Math.PI * 2;
            // Parametric equation for infinity/lemniscate
            const x = scale * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
            const y = scale * Math.sin(t) * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
            
            coords[i * 3] = x + (Math.random() - 0.5) * 30;
            coords[i * 3 + 1] = y + (Math.random() - 0.5) * 30;
            coords[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        return coords;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD DETECTION
// Maps user input to appropriate visualization
// ═══════════════════════════════════════════════════════════════════════════

function detectShapeFromText(text) {
    if (!text) return 'scatter';
    const lower = text.toLowerCase();
    
    const patterns = {
        neural: /neural|network|backprop|layer|perceptron|gradient|deep.?learning|ai|machine.?learning/,
        tree: /tree|binary|bst|heap|trie|avl|red.?black|decision/,
        graph: /graph|dijkstra|bfs|dfs|path|network|vertex|edge|shortest/,
        array: /array|list|sorting|sort|search|binary.?search|merge|quick|bubble/,
        stack: /stack|push|pop|lifo|recursion|call.?stack|undo|bracket/,
        helix: /dna|genetic|biology|recursion|spiral|crypto/,
        infinity: /loop|infinite|continuous|stream|pipeline|flow/
    };
    
    for (const [shape, pattern] of Object.entries(patterns)) {
        if (pattern.test(lower)) return shape;
    }
    
    return 'scatter';
}

// ═══════════════════════════════════════════════════════════════════════════
// THREE.JS INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('neural-canvas');
if (!canvas) {
    console.error('Neural canvas element not found!');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    alpha: true, 
    antialias: true,
    powerPreference: "high-performance"
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

camera.position.z = 400;

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM - PRIMARY LAYER
// ═══════════════════════════════════════════════════════════════════════════

const textGenerator = new TextPointGenerator();
const particleCount = NEURAL_CONFIG.particles.primary;

// Position arrays
const positions = new Float32Array(particleCount * 3);
const targetPositions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount * 3);
const originalPositions = new Float32Array(particleCount * 3);

// Colors per particle
const colors = new Float32Array(particleCount * 3);

// Initialize with scattered positions
const scatterCoords = ShapeGenerators.scatter(particleCount);
for (let i = 0; i < particleCount * 3; i++) {
    positions[i] = scatterCoords[i];
    targetPositions[i] = scatterCoords[i];
    originalPositions[i] = scatterCoords[i];
    velocities[i] = 0;
}

// Initialize colors (gradient from violet to blue)
for (let i = 0; i < particleCount; i++) {
    const t = i / particleCount;
    const color = new THREE.Color().lerpColors(
        new THREE.Color(NEURAL_CONFIG.colors.primary),
        new THREE.Color(NEURAL_CONFIG.colors.secondary),
        t
    );
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
}

// Create geometry
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Create glow texture
function createGlowTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(200, 180, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    return new THREE.CanvasTexture(canvas);
}

const material = new THREE.PointsMaterial({
    size: 4,
    map: createGlowTexture(),
    transparent: true,
    opacity: 0,  // Start invisible for reveal
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

// ═══════════════════════════════════════════════════════════════════════════
// AMBIENT PARTICLES - BACKGROUND LAYER
// ═══════════════════════════════════════════════════════════════════════════

const ambientCount = NEURAL_CONFIG.particles.ambient;
const ambientPositions = new Float32Array(ambientCount * 3);
const ambientVelocities = new Float32Array(ambientCount * 3);

for (let i = 0; i < ambientCount; i++) {
    ambientPositions[i * 3] = (Math.random() - 0.5) * 2000;
    ambientPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    ambientPositions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
    
    ambientVelocities[i * 3] = (Math.random() - 0.5) * 0.5;
    ambientVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
    ambientVelocities[i * 3 + 2] = Math.random() * 2;  // Move toward camera
}

const ambientGeometry = new THREE.BufferGeometry();
ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));

const ambientMaterial = new THREE.PointsMaterial({
    size: 2,
    color: NEURAL_CONFIG.colors.dim,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const ambientParticles = new THREE.Points(ambientGeometry, ambientMaterial);
scene.add(ambientParticles);

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION LINES (optional, adds depth)
// ═══════════════════════════════════════════════════════════════════════════

const connectionMaterial = new THREE.LineBasicMaterial({
    color: NEURAL_CONFIG.colors.primary,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending
});

let connectionLines = null;

function updateConnections() {
    if (connectionLines) {
        scene.remove(connectionLines);
        connectionLines.geometry.dispose();
    }
    
    const linePositions = [];
    const maxConnections = NEURAL_CONFIG.particles.connections;
    const maxDist = 80;
    
    // Find nearby particles and connect them
    for (let i = 0; i < maxConnections && i < particleCount; i++) {
        const idx = Math.floor(Math.random() * particleCount);
        const x1 = positions[idx * 3];
        const y1 = positions[idx * 3 + 1];
        const z1 = positions[idx * 3 + 2];
        
        // Find nearest neighbor
        let nearestDist = Infinity;
        let nearestIdx = -1;
        
        for (let j = 0; j < 50; j++) {
            const jdx = Math.floor(Math.random() * particleCount);
            if (jdx === idx) continue;
            
            const dx = positions[jdx * 3] - x1;
            const dy = positions[jdx * 3 + 1] - y1;
            const dz = positions[jdx * 3 + 2] - z1;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < nearestDist && dist < maxDist) {
                nearestDist = dist;
                nearestIdx = jdx;
            }
        }
        
        if (nearestIdx >= 0) {
            linePositions.push(x1, y1, z1);
            linePositions.push(
                positions[nearestIdx * 3],
                positions[nearestIdx * 3 + 1],
                positions[nearestIdx * 3 + 2]
            );
        }
    }
    
    if (linePositions.length > 0) {
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        connectionLines = new THREE.LineSegments(lineGeometry, connectionMaterial);
        scene.add(connectionLines);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = {
    phase: 'intro',           // 'intro', 'text', 'idle', 'shape'
    time: 0,
    morphProgress: 0,
    targetShape: 'scatter',
    currentShape: 'scatter',
    introProgress: 0,
    mouseX: 0,
    mouseY: 0,
    isMouseActive: false,
    lastInputText: '',
    connectionTimer: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// INTRO SEQUENCE - The "WOW" moment
// ═══════════════════════════════════════════════════════════════════════════

function startIntroSequence() {
    // Generate text points for "AXIOM"
    const textCoords = textGenerator.generatePoints(NEURAL_CONFIG.heroText, 140, particleCount);
    
    // Start with particles scattered
    for (let i = 0; i < particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 1500;
        targetPositions[i] = textCoords[i];
    }
    
    // Fade in
    state.phase = 'intro';
    state.introProgress = 0;
    
    // After text is formed, hold for a moment then scatter
    setTimeout(() => {
        if (state.phase === 'intro') {
            state.phase = 'text';
        }
    }, NEURAL_CONFIG.timing.textRevealDuration);
    
    setTimeout(() => {
        if (state.phase === 'text') {
            // Scatter to idle state
            const scatterCoords = ShapeGenerators.scatter(particleCount);
            for (let i = 0; i < particleCount * 3; i++) {
                targetPositions[i] = scatterCoords[i];
                originalPositions[i] = scatterCoords[i];
            }
            state.phase = 'idle';
            state.currentShape = 'scatter';
        }
    }, NEURAL_CONFIG.timing.textRevealDuration + 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// MOUSE INTERACTION
// ═══════════════════════════════════════════════════════════════════════════

let mouseVector = new THREE.Vector3();
let raycaster = new THREE.Raycaster();

document.addEventListener('mousemove', (e) => {
    state.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    state.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    state.isMouseActive = true;
    
    // Convert to 3D coordinates
    mouseVector.set(state.mouseX, state.mouseY, 0.5);
    mouseVector.unproject(camera);
    mouseVector.sub(camera.position).normalize();
    const distance = -camera.position.z / mouseVector.z;
    mouseVector.multiplyScalar(distance).add(camera.position);
});

document.addEventListener('mouseleave', () => {
    state.isMouseActive = false;
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════════════════

function animate() {
    requestAnimationFrame(animate);
    
    state.time += 0.016;  // ~60fps
    
    const isChat = (window.AXIOM?.state?.appMode === 'CHAT') || (window.appMode === 'CHAT');
    const isBusy = (window.AXIOM?.state?.isProcessing === true) || (window.isProcessing === true);
    
    // ─────────────────────────────────────────────────────────────────────────
    // OPACITY & SIZE based on mode
    // ─────────────────────────────────────────────────────────────────────────
    
    let targetOpacity, targetSize;
    
    if (state.phase === 'intro') {
        state.introProgress = Math.min(1, state.introProgress + 0.01);
        targetOpacity = state.introProgress * 0.9;
        targetSize = 4 + state.introProgress * 2;
    } else if (state.phase === 'text') {
        targetOpacity = 0.9;
        targetSize = 6;
    } else if (isChat) {
        targetOpacity = isBusy ? 0.6 : 0.4;
        targetSize = isBusy ? 5 : 3;
    } else {
        targetOpacity = 0.7;
        targetSize = 4;
    }
    
    material.opacity += (targetOpacity - material.opacity) * 0.05;
    material.size += (targetSize - material.size) * 0.1;
    
    // ─────────────────────────────────────────────────────────────────────────
    // COLOR ANIMATION
    // ─────────────────────────────────────────────────────────────────────────
    
    const colorTime = state.time * 0.5;
    const baseHue = 0.75 + Math.sin(colorTime) * 0.1;  // Oscillate between violet/blue
    
    for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;
        const hue = baseHue + t * 0.15;
        const color = new THREE.Color().setHSL(hue % 1, 0.7, 0.6);
        
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geometry.attributes.color.needsUpdate = true;
    
    // ─────────────────────────────────────────────────────────────────────────
    // PARTICLE PHYSICS
    // ─────────────────────────────────────────────────────────────────────────
    
    const returnSpeed = NEURAL_CONFIG.physics.returnSpeed;
    const mouseInfluence = NEURAL_CONFIG.physics.mouseInfluence;
    const mouseStrength = NEURAL_CONFIG.physics.mouseStrength;
    const drift = NEURAL_CONFIG.physics.drift;
    
    for (let i = 0; i < particleCount; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;
        
        // Current position
        let x = positions[ix];
        let y = positions[iy];
        let z = positions[iz];
        
        // Target position
        const tx = targetPositions[ix];
        const ty = targetPositions[iy];
        const tz = targetPositions[iz];
        
        // Calculate return force (spring to target)
        let fx = (tx - x) * returnSpeed;
        let fy = (ty - y) * returnSpeed;
        let fz = (tz - z) * returnSpeed;
        
        // Mouse interaction (repulsion/attraction)
        if (state.isMouseActive && state.phase !== 'intro') {
            const dx = x - mouseVector.x;
            const dy = y - mouseVector.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < mouseInfluence && dist > 0) {
                const force = (1 - dist / mouseInfluence) * mouseStrength;
                fx += (dx / dist) * force * 50;
                fy += (dy / dist) * force * 50;
            }
        }
        
        // Add ambient drift
        fx += Math.sin(state.time + i * 0.01) * drift * (isBusy ? 2 : 1);
        fy += Math.cos(state.time * 0.7 + i * 0.02) * drift * (isBusy ? 2 : 1);
        fz += Math.sin(state.time * 0.5 + i * 0.015) * drift * 0.5;
        
        // Update velocity with damping
        velocities[ix] = velocities[ix] * 0.9 + fx;
        velocities[iy] = velocities[iy] * 0.9 + fy;
        velocities[iz] = velocities[iz] * 0.9 + fz;
        
        // Update position
        positions[ix] += velocities[ix];
        positions[iy] += velocities[iy];
        positions[iz] += velocities[iz];
    }
    
    geometry.attributes.position.needsUpdate = true;
    
    // ─────────────────────────────────────────────────────────────────────────
    // AMBIENT PARTICLES
    // ─────────────────────────────────────────────────────────────────────────
    
    for (let i = 0; i < ambientCount; i++) {
        ambientPositions[i * 3] += ambientVelocities[i * 3];
        ambientPositions[i * 3 + 1] += ambientVelocities[i * 3 + 1];
        ambientPositions[i * 3 + 2] += ambientVelocities[i * 3 + 2];
        
        // Wrap around
        if (ambientPositions[i * 3 + 2] > 500) {
            ambientPositions[i * 3] = (Math.random() - 0.5) * 2000;
            ambientPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
            ambientPositions[i * 3 + 2] = -1000;
        }
    }
    ambientGeometry.attributes.position.needsUpdate = true;
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONNECTION LINES (periodic update)
    // ─────────────────────────────────────────────────────────────────────────
    
    state.connectionTimer += 0.016;
    if (state.connectionTimer > 0.5 && state.phase !== 'intro') {
        state.connectionTimer = 0;
        updateConnections();
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // CAMERA MOVEMENT
    // ─────────────────────────────────────────────────────────────────────────
    
    // Gentle camera sway
    const camX = Math.sin(state.time * 0.2) * 20 + (isChat ? 30 : 0);
    const camY = Math.cos(state.time * 0.15) * 10;
    camera.position.x += (camX - camera.position.x) * 0.02;
    camera.position.y += (camY - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
    
    renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════════════════
// EASING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

window.neuralCanvas = {
    /**
     * Morph particles into a specific shape
     * @param {string} shapeName - One of: scatter, neural, tree, graph, array, stack, helix, infinity
     */
    morphToShape(shapeName) {
        if (!ShapeGenerators[shapeName]) {
            console.warn(`Unknown shape: ${shapeName}, using scatter`);
            shapeName = 'scatter';
        }
        
        if (shapeName === state.currentShape) return;
        
        console.log(`🎨 Morphing to: ${shapeName}`);
        state.targetShape = shapeName;
        state.currentShape = shapeName;
        state.phase = 'shape';
        
        const newCoords = ShapeGenerators[shapeName](particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = newCoords[i];
            originalPositions[i] = newCoords[i];
        }
    },
    
    /**
     * Detect shape from text and morph
     * @param {string} text - User input text
     */
    detectAndMorph(text) {
        if (text === state.lastInputText) return;
        state.lastInputText = text;
        
        const shape = detectShapeFromText(text);
        this.morphToShape(shape);
    },
    
    /**
     * Spell out custom text with particles
     * @param {string} text - Text to display
     */
    spellText(text) {
        console.log(`✨ Spelling: ${text}`);
        state.phase = 'text';
        
        const textCoords = textGenerator.generatePoints(text, 100, particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = textCoords[i];
        }
        
        // Return to idle after 4 seconds
        setTimeout(() => {
            if (state.phase === 'text') {
                this.morphToShape('scatter');
            }
        }, 4000);
    },
    
    /**
     * Reset to default scattered state
     */
    reset() {
        this.morphToShape('scatter');
    },
    
    /**
     * Pulse effect (call when simulation step completes)
     */
    pulse() {
        material.size *= 1.5;
        setTimeout(() => {
            material.size /= 1.5;
        }, 300);
    },
    
    /**
     * Trigger the intro sequence again
     */
    playIntro() {
        startIntroSequence();
    },
    
    /**
     * Get current state for debugging
     */
    getState() {
        return { ...state };
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Listen to lobby input for shape detection
document.addEventListener('DOMContentLoaded', () => {
    const lobbyInput = document.getElementById('lobby-input');
    if (lobbyInput) {
        let debounceTimer;
        lobbyInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                window.neuralCanvas.detectAndMorph(e.target.value);
            }, 300);
        });
    }
    
    // Start the intro sequence
    setTimeout(() => {
        startIntroSequence();
    }, NEURAL_CONFIG.timing.introDelay);
});

// Start animation loop
animate();

console.log('🧠 AXIOM Neural Canvas v2.0 — "The Recruiter Magnet" initialized');
console.log('💡 Try: neuralCanvas.spellText("HIRE ME") or neuralCanvas.morphToShape("neural")');