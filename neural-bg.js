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
        primary: 2500,      // Main text particles (denser for readability)
        ambient: 300,       // Background floating particles (reduced noise)
        connections: 80     // Connection line count (fewer, cleaner)
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
        textRevealDuration: 1500,  // ms for initial text reveal (slower)
        pulseInterval: 50          // ms between pulse waves
    },
    
    // Physics (smoother, less klunky)
    physics: {
        mouseInfluence: 120,    // Tighter mouse radius
        mouseStrength: 0.04,    // Gentler mouse push
        returnSpeed: 0.06,      // Faster snap-back to position
        drift: 0.3              // Less ambient wobble
    },
    
    // Text to display
    heroText: "AXIOM",
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
    generatePoints(text, fontSize = 160, particleCount = 2500) {
        // Size canvas to fit text - use heavier font for better readability
        this.ctx.font = `900 ${fontSize}px "Inter", "SF Pro Display", system-ui, sans-serif`;
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2;
        
        this.canvas.width = textWidth + 40;
        this.canvas.height = textHeight + 40;
        
        // Clear and render text
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.font = `900 ${fontSize}px "Inter", "SF Pro Display", system-ui, sans-serif`;
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
// SHAPE GENERATOR (Simplified - only scatter for idle state)
// ═══════════════════════════════════════════════════════════════════════════

function generateScatter(count) {
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
const scatterCoords = generateScatter(particleCount);
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
    size: 5,
    map: createGlowTexture(),
    transparent: true,
    opacity: 0.6,  // Start visible for better readability
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
    phase: 'intro',           // 'intro', 'text', 'idle'
    time: 0,
    introProgress: 0,
    currentShape: 'scatter',
    mouseX: 0,
    mouseY: 0,
    isMouseActive: false,
    connectionTimer: 0
};

// ═══════════════════════════════════════════════════════════════════════════
// INTRO SEQUENCE - The "WOW" moment
// ═══════════════════════════════════════════════════════════════════════════

function startIntroSequence() {
    // Generate text points for "AXIOM" with larger font for visibility
    const textCoords = textGenerator.generatePoints(NEURAL_CONFIG.heroText, 180, particleCount);
    
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
            const scatterCoords = generateScatter(particleCount);
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
    
    // Processing wave effect
    const waveTime = state.time * 3;
    const processingIntensity = uiState.processingIntensity;
    
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
        
        // Card hover clustering effect
        if (uiState.cardHover) {
            const hx = uiState.hoverPosition.x;
            const hy = uiState.hoverPosition.y;
            const dx = hx - x;
            const dy = hy - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 200 && dist > 10) {
                // Gentle attraction toward hover point
                const force = (1 - dist / 200) * 0.02;
                fx += dx * force;
                fy += dy * force;
            }
        }
        
        // Processing wave pulse effect
        if (processingIntensity > 0) {
            const distFromCenter = Math.sqrt(x * x + y * y);
            const wave = Math.sin(distFromCenter * 0.05 - waveTime) * processingIntensity;
            fx += (x / (distFromCenter + 1)) * wave * 2;
            fy += (y / (distFromCenter + 1)) * wave * 2;
        }
        
        // Add ambient drift (increased during processing)
        const driftMultiplier = isBusy ? 2.5 : 1;
        fx += Math.sin(state.time + i * 0.01) * drift * driftMultiplier;
        fy += Math.cos(state.time * 0.7 + i * 0.02) * drift * driftMultiplier;
        fz += Math.sin(state.time * 0.5 + i * 0.015) * drift * 0.5;
        
        // Update velocity with higher damping for smoother motion
        velocities[ix] = velocities[ix] * 0.95 + fx;
        velocities[iy] = velocities[iy] * 0.95 + fy;
        velocities[iz] = velocities[iz] * 0.95 + fz;
        
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

// Track UI interaction state
let uiState = {
    cardHover: false,
    hoverPosition: { x: 0, y: 0 },
    processingIntensity: 0,
    celebrationActive: false
};

window.neuralCanvas = {
    /**
     * Reset to scattered idle state
     */
    reset() {
        state.phase = 'idle';
        state.currentShape = 'scatter';
        
        const newCoords = generateScatter(particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = newCoords[i];
            originalPositions[i] = newCoords[i];
        }
    },
    
    /**
     * Spell out custom text with particles
     * @param {string} text - Text to display
     */
    spellText(text) {
        console.log(`✨ Spelling: ${text}`);
        state.phase = 'text';
        
        const textCoords = textGenerator.generatePoints(text, 140, particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = textCoords[i];
        }
        
        // Return to idle after 5 seconds
        setTimeout(() => {
            if (state.phase === 'text') {
                this.reset();
            }
        }, 5000);
    },
    
    /**
     * Pulse effect (call when simulation step completes)
     */
    pulse() {
        material.size *= 1.5;
        material.opacity = Math.min(1, material.opacity * 1.3);
        setTimeout(() => {
            material.size /= 1.5;
        }, 300);
    },
    
    /**
     * Trigger wave pulse from center (for processing states)
     */
    wavePulse() {
        uiState.processingIntensity = 1;
        setTimeout(() => {
            uiState.processingIntensity = 0;
        }, 800);
    },
    
    /**
     * Celebration effect - particles scatter outward then settle
     */
    celebrate() {
        uiState.celebrationActive = true;
        
        // Push particles outward
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const force = 50 + Math.random() * 100;
            velocities[i * 3] += Math.cos(angle) * force * 0.1;
            velocities[i * 3 + 1] += Math.sin(angle) * force * 0.1;
        }
        
        // Brighten
        material.opacity = Math.min(1, material.opacity * 1.5);
        
        setTimeout(() => {
            uiState.celebrationActive = false;
        }, 1500);
    },
    
    /**
     * Notify of card hover (for particle clustering)
     */
    onCardHover(x, y) {
        uiState.cardHover = true;
        // Convert screen coordinates to 3D space
        uiState.hoverPosition.x = (x / window.innerWidth - 0.5) * 400;
        uiState.hoverPosition.y = -(y / window.innerHeight - 0.5) * 400;
    },
    
    /**
     * Notify of card hover end
     */
    onCardLeave() {
        uiState.cardHover = false;
    },
    
    /**
     * Set processing mode intensity (0-1)
     */
    setProcessingMode(intensity) {
        uiState.processingIntensity = intensity;
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
        return { ...state, ui: uiState };
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

// Start the intro sequence on DOM load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        startIntroSequence();
    }, NEURAL_CONFIG.timing.introDelay);
});

// Start animation loop
animate();

console.log('🧠 AXIOM Neural Canvas v2.1 — Polished Edition initialized');
console.log('💡 Try: neuralCanvas.spellText("AXIOM") or neuralCanvas.playIntro()');