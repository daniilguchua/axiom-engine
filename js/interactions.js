// js/interactions.js
/**
 * AXIOM Engine - Graph Interactions
 * Zoom, pan, node clicks, and physics helpers.
 */

(function() {
    
    // =========================================================================
    // ZOOM & PAN
    // =========================================================================
    
    function setupZoomPan(wrapper, graphDiv) {
        let scale = 1, panning = false, pointX = 0, pointY = 0, start = { x: 0, y: 0 };
        
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const xs = (mouseX - pointX) / scale;
            const ys = (mouseY - pointY) / scale;
            const delta = -e.deltaY;
            (delta > 0) ? (scale *= 1.1) : (scale /= 1.1);
            scale = Math.min(Math.max(1, scale), 5);
            pointX = mouseX - xs * scale;
            pointY = mouseY - ys * scale;
            graphDiv.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
        });
        
        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('.node') || e.target.closest('.explanation-hud')) return;
            e.preventDefault();
            start = { x: e.clientX - pointX, y: e.clientY - pointY };
            panning = true;
            wrapper.style.cursor = "grabbing";
        });
        
        wrapper.addEventListener('mousemove', (e) => {
            if (!panning) return;
            e.preventDefault();
            pointX = e.clientX - start.x;
            pointY = e.clientY - start.y;
            graphDiv.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
        });
        
        wrapper.addEventListener('mouseup', () => {
            panning = false;
            wrapper.style.cursor = "grab";
        });
        
        wrapper.addEventListener('mouseleave', () => {
            panning = false;
            wrapper.style.cursor = "grab";
        });
    }
    
    // =========================================================================
    // NODE CLICKS
    // =========================================================================
    
    function setupNodeClicks(svg, wrapper) {
        svg.querySelectorAll('.node').forEach(node => {
            node.style.cursor = "pointer";
            node.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const rawId = node.id;
                const idParts = rawId.split('-');
                let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p !== 'graph' && p.length > 1);
                if (!cleanId) cleanId = node.textContent.trim();
                window.mermaidNodeClick(cleanId, wrapper);
            };
        });
    }
    
    // =========================================================================
    // PHYSICS
    // =========================================================================
    
    function attachNodePhysics(wrapperElement) {
        try {
            if (!wrapperElement) return;

            const svg = wrapperElement.querySelector('svg');
            if (!svg) {
                console.warn("No SVG found - skipping physics");
                return;
            }
            const nodes = wrapperElement.querySelectorAll('.node');
            
            nodes.forEach(node => {
                // 1. Get the current position assigned by Mermaid
                const transformAttr = node.getAttribute('transform');
                // Valid formats: "translate(100, 200)" OR "translate(100 200)"
                
                if (transformAttr) {
                    // 2. Robust Regex to catch both comma and space separators
                    const match = transformAttr.match(/translate\(([-\d.]+)[, ]+([-\d.]+)\)/);
                    
                    if (match) {
                        const x = match[1];
                        const y = match[2];

                        // 3. Inject variables
                        node.style.setProperty('--d3-x', x + 'px');
                        node.style.setProperty('--d3-y', y + 'px');
                        
                        // 4. Mark as ready (Prevents CSS from acting too early)
                        node.classList.add('physics-ready');
                    }
                }
            });
        } catch (e) {
            console.warn("Physics attach failed (Graph will still render, just no zoom):", e);
        }
    }
    
    // =========================================================================
    // REATTACH PHYSICS (After repair)
    // =========================================================================
    
    function reattachGraphPhysics(graphDiv, wrapperElement) {
        setTimeout(() => {
            const svg = graphDiv.querySelector('svg');
            if (svg) {
                svg.style.width = "100%";
                svg.style.height = "100%";
                svg.querySelectorAll('.node').forEach(node => {
                    node.style.cursor = "pointer";
                    node.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rawId = node.id;
                        const idParts = rawId.split('-');
                        let cleanId = idParts.find(p => isNaN(p) && p !== 'flowchart' && p.length > 1);
                        if (!cleanId) cleanId = node.textContent.trim();
                        window.mermaidNodeClick(cleanId, wrapperElement);
                    };
                });
            }
        }, 200);
    }
    
    // =========================================================================
    // CARD 3D TILT EFFECT + NEURAL CANVAS INTEGRATION
    // =========================================================================
    
    function setupCardTilt() {
        const cards = document.querySelectorAll('.tech-card');
        
        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                const rotateX = (-y / rect.height) * 10; // Max 10deg rotation
                const rotateY = (x / rect.width) * 10;
                
                card.style.transform = `
                    perspective(1000px) 
                    rotateX(${rotateX}deg) 
                    rotateY(${rotateY}deg)
                    scale(1.02)
                `;
                
                // Notify neural canvas of hover position
                if (window.neuralCanvas && window.neuralCanvas.onCardHover) {
                    window.neuralCanvas.onCardHover(e.clientX, e.clientY);
                }
            });
            
            card.addEventListener('mouseenter', (e) => {
                // Notify neural canvas of card hover start
                if (window.neuralCanvas && window.neuralCanvas.onCardHover) {
                    window.neuralCanvas.onCardHover(e.clientX, e.clientY);
                }
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
                
                // Notify neural canvas hover ended
                if (window.neuralCanvas && window.neuralCanvas.onCardLeave) {
                    window.neuralCanvas.onCardLeave();
                }
            });
        });
    }
    
    // Initialize card tilt when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to ensure cards are rendered after animations
        setTimeout(setupCardTilt, 700);
    });
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.interactions = {
        setupZoomPan,
        setupNodeClicks,
        attachNodePhysics,
        reattachGraphPhysics,
        setupCardTilt
    };
    
    console.log('✅ AXIOM Interactions loaded');
})();