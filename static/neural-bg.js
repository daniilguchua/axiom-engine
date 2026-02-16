/**
 * AXIOM Neural Canvas v3.0 — "The Recruiter Magnet"
 *
 * Enhanced particle system with:
 * 1. Custom shader for smooth circular glow particles
 * 2. Simulated bloom layer for cinematic depth
 * 3. Dramatic burst → converge intro sequence
 * 4. Per-particle size variation & animated pulse
 * 5. Rich violet ↔ cyan color cycling
 * 6. Fluid mouse interaction with vortex physics
 * 7. Multi-layer depth (primary + bloom + ambient)
 *
 * @author AXIOM Engine
 * @version 3.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const NEURAL_CONFIG = {
    particles: {
        primary: 3000,       // Main particles (up from 2500)
        ambient: 400,        // Background floaters (up from 300)
        connections: 100     // Connection lines
    },

    colors: {
        primary: 0x8B5CF6,     // Violet
        secondary: 0x60A5FA,   // Blue (matches original palette)
        accent: 0x34D399,      // Green
        highlight: 0xF472B6,   // Pink
        electric: 0x00f3ff,    // Electric cyan
        dim: 0x3a3a4a          // Gray
    },

    timing: {
        introDelay: 0,
        morphDuration: 2000,
        textRevealDuration: 2000,   // Snappy text formation
        pulseInterval: 50
    },

    physics: {
        mouseInfluence: 150,
        mouseStrength: 0.05,
        returnSpeed: 0.06,
        drift: 0.3
    },

    heroText: "AXIOM",
    tagline: "SEE ALGORITHMS THINK"
};

// ═══════════════════════════════════════════════════════════════════════════
// TEXT POINT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

class TextPointGenerator {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    generatePoints(text, fontSize = 160, particleCount = 3000) {
        this.ctx.font = `900 ${fontSize}px "Inter", "SF Pro Display", system-ui, sans-serif`;
        const metrics = this.ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2;

        this.canvas.width = textWidth + 40;
        this.canvas.height = textHeight + 40;

        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = `900 ${fontSize}px "Inter", "SF Pro Display", system-ui, sans-serif`;
        this.ctx.fillStyle = '#fff';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const points = [];

        for (let y = 0; y < this.canvas.height; y += 2) {
            for (let x = 0; x < this.canvas.width; x += 2) {
                const i = (y * this.canvas.width + x) * 4;
                if (data[i] > 128) {
                    points.push({
                        x: x - this.canvas.width / 2,
                        y: -(y - this.canvas.height / 2),
                        z: (Math.random() - 0.5) * 20
                    });
                }
            }
        }

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
// ═══════════════════════════════════════════════════════════════════════════

function generateScatter(count) {
    const coords = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 100 + Math.random() * 300;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        coords[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        coords[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        coords[i * 3 + 2] = r * Math.cos(phi) * 0.3;
    }
    return coords;
}

// ═══════════════════════════════════════════════════════════════════════════
// THREE.JS INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('neural-canvas');
if (!canvas) {
    // Canvas element required for neural background
    throw new Error('Neural canvas element not found');
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
// TEXTURES
// ═══════════════════════════════════════════════════════════════════════════

function createBloomTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.15, 'rgba(220, 200, 255, 0.12)');
    gradient.addColorStop(0.4, 'rgba(139, 92, 246, 0.04)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(c);
}

// ═══════════════════════════════════════════════════════════════════════════
// UI STATE (must be declared before animation loop)
// ═══════════════════════════════════════════════════════════════════════════

let uiState = {
    cardHover: false,
    hoverPosition: { x: 0, y: 0 },
    processingIntensity: 0,
    celebrationActive: false
};

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM — PRIMARY LAYER (Custom ShaderMaterial)
// ═══════════════════════════════════════════════════════════════════════════

const textGenerator = new TextPointGenerator();
const particleCount = NEURAL_CONFIG.particles.primary;

// Position arrays
const positions = new Float32Array(particleCount * 3);
const targetPositions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount * 3);
const originalPositions = new Float32Array(particleCount * 3);

// Per-particle attributes
const colors = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);
const phases = new Float32Array(particleCount);
const alphas = new Float32Array(particleCount);

// Initialize with scattered positions
const scatterCoords = generateScatter(particleCount);
for (let i = 0; i < particleCount * 3; i++) {
    positions[i] = scatterCoords[i];
    targetPositions[i] = scatterCoords[i];
    originalPositions[i] = scatterCoords[i];
    velocities[i] = 0;
}

// Initialize per-particle attributes
for (let i = 0; i < particleCount; i++) {
    // Size: power distribution — mostly small, some large "stars"
    const r = Math.random();
    sizes[i] = 2.5 + Math.pow(r, 3) * 4.5;  // Range: 2.5–7

    // Phase: random offset for staggered pulse animation
    phases[i] = Math.random() * Math.PI * 2;

    // Alpha: slight variation for organic depth
    alphas[i] = 0.7 + Math.random() * 0.3;
}

// Initialize colors (violet → cyan gradient)
const reusableColor = new THREE.Color();
for (let i = 0; i < particleCount; i++) {
    const t = i / particleCount;
    reusableColor.lerpColors(
        new THREE.Color(NEURAL_CONFIG.colors.primary),
        new THREE.Color(NEURAL_CONFIG.colors.secondary),
        t
    );
    colors[i * 3] = reusableColor.r;
    colors[i * 3 + 1] = reusableColor.g;
    colors[i * 3 + 2] = reusableColor.b;
}

// Create geometry with all attributes
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

// Custom ShaderMaterial — smooth circular glow particles
const primaryMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aAlpha;
        attribute vec3 color;

        varying vec3 vColor;
        varying float vAlpha;

        uniform float uTime;
        uniform float uPixelRatio;

        void main() {
            vColor = color;
            vAlpha = aAlpha;

            // Per-particle pulse (staggered by phase)
            float pulse = 1.0 + sin(uTime * 2.0 + aPhase) * 0.12;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * pulse * uPixelRatio * (250.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);

            // Discard outside circle
            if (dist > 0.5) discard;

            // Layered glow: bright core + mid glow + soft halo
            float core = smoothstep(0.12, 0.0, dist);
            float mid = smoothstep(0.35, 0.08, dist) * 0.5;
            float outer = smoothstep(0.5, 0.2, dist) * 0.2;

            float intensity = core + mid + outer;

            // White-hot core, colored glow
            vec3 finalColor = mix(vColor, vec3(1.0), core * 0.5);

            gl_FragColor = vec4(finalColor, intensity * vAlpha);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
});

const particles = new THREE.Points(geometry, primaryMaterial);
scene.add(particles);

// ═══════════════════════════════════════════════════════════════════════════
// BLOOM LAYER — Simulated bloom via larger, softer duplicate
// ═══════════════════════════════════════════════════════════════════════════

const bloomMaterial = new THREE.PointsMaterial({
    size: 14,
    map: createBloomTexture(),
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true
});

// Shares same geometry — positions & colors stay in sync automatically
const bloomParticles = new THREE.Points(geometry, bloomMaterial);
scene.add(bloomParticles);

// ═══════════════════════════════════════════════════════════════════════════
// AMBIENT PARTICLES — BACKGROUND DEPTH LAYER
// ═══════════════════════════════════════════════════════════════════════════

const ambientCount = NEURAL_CONFIG.particles.ambient;
const ambientPositions = new Float32Array(ambientCount * 3);
const ambientVelocities = new Float32Array(ambientCount * 3);
const ambientSizes = new Float32Array(ambientCount);

for (let i = 0; i < ambientCount; i++) {
    ambientPositions[i * 3] = (Math.random() - 0.5) * 2000;
    ambientPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    ambientPositions[i * 3 + 2] = (Math.random() - 0.5) * 1000;

    ambientVelocities[i * 3] = (Math.random() - 0.5) * 0.5;
    ambientVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
    ambientVelocities[i * 3 + 2] = Math.random() * 2;

    // Varying sizes for depth
    ambientSizes[i] = 1 + Math.random() * 2.5;
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
// CONNECTION LINES
// ═══════════════════════════════════════════════════════════════════════════

const connectionMaterial = new THREE.LineBasicMaterial({
    color: NEURAL_CONFIG.colors.primary,
    transparent: true,
    opacity: 0.12,
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

    for (let i = 0; i < maxConnections && i < particleCount; i++) {
        const idx = Math.floor(Math.random() * particleCount);
        const x1 = positions[idx * 3];
        const y1 = positions[idx * 3 + 1];
        const z1 = positions[idx * 3 + 2];

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
// INTRO SEQUENCE — Burst from center → converge to text → scatter
// ═══════════════════════════════════════════════════════════════════════════

function startIntroSequence() {
    const textCoords = textGenerator.generatePoints(NEURAL_CONFIG.heroText, 180, particleCount);

    state.phase = 'intro';
    state.introProgress = 0;

    for (let i = 0; i < particleCount; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;

        // Start compressed at center
        positions[ix] = (Math.random() - 0.5) * 20;
        positions[iy] = (Math.random() - 0.5) * 20;
        positions[iz] = (Math.random() - 0.5) * 20;

        // Target = AXIOM text positions
        targetPositions[ix] = textCoords[ix];
        targetPositions[iy] = textCoords[iy];
        targetPositions[iz] = textCoords[iz];

        // Burst velocity — radial explosion from center
        const angle = Math.random() * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * Math.PI;
        const speed = 6 + Math.random() * 12;

        velocities[ix] = Math.cos(angle) * Math.cos(elevation) * speed;
        velocities[iy] = Math.sin(elevation) * speed;
        velocities[iz] = Math.sin(angle) * Math.cos(elevation) * speed * 0.3;
    }

    // After particles settle into text, transition to 'text' phase
    setTimeout(() => {
        if (state.phase === 'intro') {
            state.phase = 'text';
        }
    }, NEURAL_CONFIG.timing.textRevealDuration);

    // After holding text, scatter to idle
    setTimeout(() => {
        if (state.phase === 'text') {
            const scatterCoords = generateScatter(particleCount);
            for (let i = 0; i < particleCount * 3; i++) {
                targetPositions[i] = scatterCoords[i];
                originalPositions[i] = scatterCoords[i];
            }
            state.phase = 'idle';
            state.currentShape = 'scatter';
        }
    }, NEURAL_CONFIG.timing.textRevealDuration + 3500);
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

    state.time += 0.016;

    const isChat = (window.AXIOM?.state?.appMode === 'CHAT') || (window.appMode === 'CHAT');
    const isBusy = (window.AXIOM?.state?.isProcessing === true) || (window.isProcessing === true);

    // Update shader time uniform
    primaryMaterial.uniforms.uTime.value = state.time;

    // ─────────────────────────────────────────────────────────────────────
    // OPACITY & SIZE based on mode
    // ─────────────────────────────────────────────────────────────────────

    let targetOpacity, bloomTargetOpacity;

    if (state.phase === 'intro') {
        state.introProgress = Math.min(1, state.introProgress + 0.012);
        targetOpacity = state.introProgress * 0.95;
        bloomTargetOpacity = state.introProgress * 0.1;
    } else if (state.phase === 'text') {
        targetOpacity = 0.95;
        bloomTargetOpacity = 0.1;
    } else if (isChat) {
        targetOpacity = isBusy ? 0.65 : 0.45;
        bloomTargetOpacity = isBusy ? 0.08 : 0.04;
    } else {
        targetOpacity = 0.75;
        bloomTargetOpacity = 0.07;
    }

    // Smooth lerp opacity (shader handles per-particle alpha)
    primaryMaterial.opacity += (targetOpacity - primaryMaterial.opacity) * 0.05;
    bloomMaterial.opacity += (bloomTargetOpacity - bloomMaterial.opacity) * 0.05;

    // ─────────────────────────────────────────────────────────────────────
    // COLOR ANIMATION — violet ↔ cyan flow
    // ─────────────────────────────────────────────────────────────────────

    const colorTime = state.time * 0.3;
    const hue1 = 0.75 + Math.sin(colorTime) * 0.08;         // Violet range
    const hue2 = 0.52 + Math.cos(colorTime * 0.7) * 0.05;   // Cyan range

    for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;

        // Each particle blends between violet and cyan with wave pattern
        const blend = Math.sin(t * Math.PI * 4 + colorTime * 1.5 + phases[i]) * 0.5 + 0.5;
        const hue = hue1 + (hue2 - hue1) * blend;
        const sat = 0.7 + Math.sin(t * 8 + colorTime * 2) * 0.12;
        const light = 0.55 + Math.sin(t * 5 + colorTime * 1.5) * 0.08;

        reusableColor.setHSL(hue % 1, sat, light);
        colors[i * 3] = reusableColor.r;
        colors[i * 3 + 1] = reusableColor.g;
        colors[i * 3 + 2] = reusableColor.b;
    }
    geometry.attributes.color.needsUpdate = true;

    // ─────────────────────────────────────────────────────────────────────
    // PARTICLE PHYSICS
    // ─────────────────────────────────────────────────────────────────────

    // Adaptive physics: softer during intro for dramatic convergence
    const returnSpeed = state.phase === 'intro' ? 0.025 : NEURAL_CONFIG.physics.returnSpeed;
    const damping = state.phase === 'intro' ? 0.935 : 0.95;
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

        let x = positions[ix];
        let y = positions[iy];
        let z = positions[iz];

        const tx = targetPositions[ix];
        const ty = targetPositions[iy];
        const tz = targetPositions[iz];

        // Spring force toward target
        let fx = (tx - x) * returnSpeed;
        let fy = (ty - y) * returnSpeed;
        let fz = (tz - z) * returnSpeed;

        // Mouse interaction — repulsion + inner attraction vortex
        if (state.isMouseActive && state.phase !== 'intro') {
            const dx = x - mouseVector.x;
            const dy = y - mouseVector.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < mouseInfluence && dist > 0) {
                const normalDx = dx / dist;
                const normalDy = dy / dist;

                if (dist < 20) {
                    // Inner zone: gentle attraction (vortex)
                    const attract = (1 - dist / 20) * 0.02;
                    fx -= normalDx * attract * 50;
                    fy -= normalDy * attract * 50;
                    // Add tangential force for swirl
                    fx += normalDy * attract * 15;
                    fy -= normalDx * attract * 15;
                } else {
                    // Outer zone: repulsion
                    const force = (1 - dist / mouseInfluence) * mouseStrength;
                    fx += normalDx * force * 50;
                    fy += normalDy * force * 50;
                }
            }
        }

        // Card hover clustering
        if (uiState.cardHover) {
            const hx = uiState.hoverPosition.x;
            const hy = uiState.hoverPosition.y;
            const dx = hx - x;
            const dy = hy - y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 200 && dist > 10) {
                const force = (1 - dist / 200) * 0.02;
                fx += dx * force;
                fy += dy * force;
            }
        }

        // Processing wave pulse
        if (processingIntensity > 0) {
            const distFromCenter = Math.sqrt(x * x + y * y);
            const wave = Math.sin(distFromCenter * 0.05 - waveTime) * processingIntensity;
            fx += (x / (distFromCenter + 1)) * wave * 2;
            fy += (y / (distFromCenter + 1)) * wave * 2;
        }

        // Ambient drift
        const driftMultiplier = isBusy ? 2.5 : 1;
        fx += Math.sin(state.time + i * 0.01) * drift * driftMultiplier;
        fy += Math.cos(state.time * 0.7 + i * 0.02) * drift * driftMultiplier;
        fz += Math.sin(state.time * 0.5 + i * 0.015) * drift * 0.5;

        // Update velocity with damping
        velocities[ix] = velocities[ix] * damping + fx;
        velocities[iy] = velocities[iy] * damping + fy;
        velocities[iz] = velocities[iz] * damping + fz;

        // Update position
        positions[ix] += velocities[ix];
        positions[iy] += velocities[iy];
        positions[iz] += velocities[iz];
    }

    geometry.attributes.position.needsUpdate = true;

    // ─────────────────────────────────────────────────────────────────────
    // AMBIENT PARTICLES
    // ─────────────────────────────────────────────────────────────────────

    for (let i = 0; i < ambientCount; i++) {
        ambientPositions[i * 3] += ambientVelocities[i * 3];
        ambientPositions[i * 3 + 1] += ambientVelocities[i * 3 + 1];
        ambientPositions[i * 3 + 2] += ambientVelocities[i * 3 + 2];

        if (ambientPositions[i * 3 + 2] > 500) {
            ambientPositions[i * 3] = (Math.random() - 0.5) * 2000;
            ambientPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
            ambientPositions[i * 3 + 2] = -1000;
        }
    }
    ambientGeometry.attributes.position.needsUpdate = true;

    // ─────────────────────────────────────────────────────────────────────
    // CONNECTION LINES — pulsing opacity
    // ─────────────────────────────────────────────────────────────────────

    state.connectionTimer += 0.016;
    if (state.connectionTimer > 0.5 && state.phase !== 'intro') {
        state.connectionTimer = 0;
        updateConnections();
    }

    // Pulse connection opacity
    connectionMaterial.opacity = 0.08 + Math.sin(state.time * 1.5) * 0.04;

    // ─────────────────────────────────────────────────────────────────────
    // CAMERA MOVEMENT
    // ─────────────────────────────────────────────────────────────────────

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
    reset() {
        state.phase = 'idle';
        state.currentShape = 'scatter';

        const newCoords = generateScatter(particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = newCoords[i];
            originalPositions[i] = newCoords[i];
        }
    },

    spellText(text) {
        state.phase = 'text';

        const textCoords = textGenerator.generatePoints(text, 140, particleCount);
        for (let i = 0; i < particleCount * 3; i++) {
            targetPositions[i] = textCoords[i];
        }

        setTimeout(() => {
            if (state.phase === 'text') {
                this.reset();
            }
        }, 5000);
    },

    pulse() {
        // Flash all particles brighter
        for (let i = 0; i < particleCount; i++) {
            alphas[i] = Math.min(1, alphas[i] * 1.4);
        }
        geometry.attributes.aAlpha.needsUpdate = true;

        setTimeout(() => {
            for (let i = 0; i < particleCount; i++) {
                alphas[i] = 0.7 + Math.random() * 0.3;
            }
            geometry.attributes.aAlpha.needsUpdate = true;
        }, 400);
    },

    wavePulse() {
        uiState.processingIntensity = 1;
        setTimeout(() => {
            uiState.processingIntensity = 0;
        }, 800);
    },

    celebrate() {
        uiState.celebrationActive = true;

        // Push particles outward with more force
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const force = 50 + Math.random() * 120;
            velocities[i * 3] += Math.cos(angle) * force * 0.12;
            velocities[i * 3 + 1] += Math.sin(angle) * force * 0.12;
        }

        // Flash bright
        for (let i = 0; i < particleCount; i++) {
            alphas[i] = 1.0;
        }
        geometry.attributes.aAlpha.needsUpdate = true;

        setTimeout(() => {
            uiState.celebrationActive = false;
            for (let i = 0; i < particleCount; i++) {
                alphas[i] = 0.7 + Math.random() * 0.3;
            }
            geometry.attributes.aAlpha.needsUpdate = true;
        }, 1500);
    },

    onCardHover(x, y) {
        uiState.cardHover = true;
        uiState.hoverPosition.x = (x / window.innerWidth - 0.5) * 400;
        uiState.hoverPosition.y = -(y / window.innerHeight - 0.5) * 400;
    },

    onCardLeave() {
        uiState.cardHover = false;
    },

    setProcessingMode(intensity) {
        uiState.processingIntensity = intensity;
    },

    playIntro() {
        startIntroSequence();
    },

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
    primaryMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        startIntroSequence();
    }, NEURAL_CONFIG.timing.introDelay);
});

// Start animation loop
animate();
