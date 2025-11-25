// CONFIGURATION
const CONFIG = {
    // TARGET COLORS
    colorBase: new THREE.Color(0x00f3ff), // Cyan
    colorActive: new THREE.Color(0xff8800), // Orange

    // SPEEDS
    speedLobby: 0.002,      
    speedProcessing: 0.035, 
    speedStopped: 0.0,      
    
    // SIZES
    sizeIdle: 6,
    sizeActive: 10,
    particleCount: 6000
};

const canvas = document.getElementById('neural-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 4000);
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(CONFIG.particleCount * 3);
const sphereCoords = new Float32Array(CONFIG.particleCount * 3);
const tunnelCoords = new Float32Array(CONFIG.particleCount * 3);

for(let i=0; i<CONFIG.particleCount; i++) {
    let r = (Math.random()>0.25) ? (60+Math.random()*20) : (100+Math.random()*200);
    let theta = Math.random() * Math.PI * 2;
    let phi = Math.acos(2 * Math.random() - 1);
    
    sphereCoords[i*3] = r * Math.sin(phi) * Math.cos(theta);
    sphereCoords[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    sphereCoords[i*3+2] = r * Math.cos(phi);
    
    tunnelCoords[i*3] = (Math.random()-0.5) * 2000; 
    tunnelCoords[i*3+1] = (Math.random()-0.5) * 2000; 
    tunnelCoords[i*3+2] = Math.random() * 2000; 
    
    positions[i*3] = sphereCoords[i*3];
    positions[i*3+1] = sphereCoords[i*3+1];
    positions[i*3+2] = sphereCoords[i*3+2];
}
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

function createWhiteGlow() {
    const c = document.createElement('canvas'); c.width=64; c.height=64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); 
    g.addColorStop(0.5, 'rgba(240,240,255,0.6)'); 
    g.addColorStop(1, 'transparent');
    ctx.fillStyle=g; ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
}

const pMat = new THREE.PointsMaterial({
    size: CONFIG.sizeIdle, 
    map: createWhiteGlow(), 
    transparent: true, 
    opacity: 0.9, 
    blending: THREE.AdditiveBlending, 
    depthWrite: false,
    color: CONFIG.colorBase // Uses global color now, cleaner look
});
const particles = new THREE.Points(geometry, pMat);
scene.add(particles);
camera.position.z = 200;

let morphProgress = 0; let targetMorph = 0;
let time = 0;
let driftTime = 0; 
let rotationSpeed = CONFIG.speedLobby; 

function animate() {
    requestAnimationFrame(animate);
    
    const isChat = (window.appMode === 'CHAT');
    const isBusy = (window.isProcessing === true);

    // 1. ROTATION SPEED
    let targetSpeed = (!isChat) ? CONFIG.speedLobby : (isBusy ? CONFIG.speedProcessing : CONFIG.speedStopped);
    rotationSpeed += (targetSpeed - rotationSpeed) * 0.02; 
    time += rotationSpeed;
    
    // 2. DRIFT CLOCK (Constant ticking)
    driftTime += 0.005; 

    // 3. GLOBAL VISUALS (Size & Color)
    const targetSize = isBusy ? CONFIG.sizeActive : CONFIG.sizeIdle;
    pMat.size += (targetSize - pMat.size) * 0.05;
    
    const targetColor = isBusy ? CONFIG.colorActive : CONFIG.colorBase;
    pMat.color.lerp(targetColor, 0.05);

    // 4. MORPH
    targetMorph = isChat ? 1 : 0;
    morphProgress += (targetMorph - morphProgress) * 0.02;

    const pos = particles.geometry.attributes.position.array;

    for(let i=0; i<CONFIG.particleCount; i++) {
        const ix = i*3;

        // --- SUBTLE WIGGLE LOGIC ---
        // noiseMult: 2.0 = Gentle Float. (Was 8.0/12.0 before)
        const noiseMult = isBusy ? 4.0 : 2.0; 

        // We use driftTime + index to make each particle move uniquely
        const wiggleX = Math.sin(driftTime + ix * 0.01) * noiseMult;
        const wiggleY = Math.cos(driftTime * 0.8 + ix * 0.02) * noiseMult;
        const wiggleZ = Math.sin(driftTime * 0.5 + ix * 0.03) * noiseMult;

        // Apply wiggle to Base Coords
        let sx = sphereCoords[ix] + wiggleX;
        let sy = sphereCoords[ix+1] + wiggleY;
        let sz = sphereCoords[ix+2] + wiggleZ;
        
        // Rotate
        const rx = sx * Math.cos(time*0.5) - sz * Math.sin(time*0.5);
        const rz = sx * Math.sin(time*0.5) + sz * Math.cos(time*0.5);
        
        // Apply wiggle to Tunnel Coords
        const tx = tunnelCoords[ix] + wiggleX; 
        const ty = tunnelCoords[ix+1] + wiggleY;
        let tz = (tunnelCoords[ix+2] + time * 500) % 2000 - 500; 
        
        // Morph
        let x = rx * (1-morphProgress) + tx * morphProgress;
        let y = sy * (1-morphProgress) + ty * morphProgress;
        let z = rz * (1-morphProgress) + tz * morphProgress;

        pos[ix] = x;
        pos[ix+1] = y;
        pos[ix+2] = z;
    }
    
    particles.geometry.attributes.position.needsUpdate = true;
    
    if(isChat) camera.position.x += (40 - camera.position.x) * 0.05; 
    else camera.position.x += (0 - camera.position.x) * 0.05; 

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});