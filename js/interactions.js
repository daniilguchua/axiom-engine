// js/interactions.js
/**
 * AXIOM Engine - Graph Interactions
 * Zoom, pan, node clicks, and physics helpers.
 */

(function() {
    
    // =========================================================================
    // ZOOM & PAN
    // =========================================================================
    
    /**
     * Wait for SVG to have valid dimensions before centering
     * Uses exponential backoff to detect when SVG is fully painted
     */
    async function waitForSvgDimensions(svg, maxRetries = 20) {
        for (let i = 0; i < maxRetries; i++) {
            // Check multiple dimension sources
            const rect = svg.getBoundingClientRect();
            const hasValidRect = rect.width > 10 && rect.height > 10;
            const hasValidClient = svg.clientWidth > 10 && svg.clientHeight > 10;
            
            if (hasValidRect || hasValidClient) {
                return { width: rect.width || svg.clientWidth, height: rect.height || svg.clientHeight };
            }
            
            // Exponential backoff: 10ms, 20ms, 40ms, 80ms, 160ms...
            const delay = Math.min(10 * Math.pow(2, i), 500);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Last resort: try getBBox
        try {
            const bbox = svg.getBBox();
            if (bbox.width > 10 && bbox.height > 10) {
                console.warn(`⚠️ [ZOOM] Using getBBox fallback: ${bbox.width}x${bbox.height}`);
                return { width: bbox.width, height: bbox.height };
            }
        } catch(e) {
            console.error(`❌ [ZOOM] getBBox failed:`, e);
        }
        
        console.error(`❌ [ZOOM] SVG dimensions never became valid, using defaults`);
        return { width: 800, height: 400 };
    }
    
    function setupZoomPan(wrapper, graphDiv) {
        let scale = 1, panning = false, pointX = 0, pointY = 0, start = { x: 0, y: 0 };
        
        // Center the graph immediately when SVG is ready
        (async () => {
            const svg = graphDiv.querySelector('svg');
            if (!svg) {
                console.warn('[ZOOM] No SVG found in graphDiv, revealing anyway');
                graphDiv.style.opacity = '1';
                if (graphDiv.dataset.safetyTimer) {
                    clearTimeout(Number(graphDiv.dataset.safetyTimer));
                }
                return;
            }
            
            const dimensions = await waitForSvgDimensions(svg);
            
            // Use requestAnimationFrame to ensure layout is complete
            requestAnimationFrame(() => {
                try {
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const svgWidth = dimensions.width;
                    const svgHeight = dimensions.height;

                    // Read actual CSS padding (responsive: 12px default via --graph-internal-padding)
                    const wrapperStyle = getComputedStyle(wrapper);
                    const padLeft = parseFloat(wrapperStyle.paddingLeft) || 0;
                    const padTop = parseFloat(wrapperStyle.paddingTop) || 0;
                    const padRight = parseFloat(wrapperStyle.paddingRight) || 0;
                    const padBottom = parseFloat(wrapperStyle.paddingBottom) || 0;

                    // Content area = wrapper minus padding (graphDiv lives here)
                    const contentWidth = wrapperRect.width - padLeft - padRight;
                    const contentHeight = wrapperRect.height - padTop - padBottom;

                    // Extra breathing room beyond CSS padding so graph doesn't touch edges
                    const breathingRoom = 20;
                    const availWidth = contentWidth - (breathingRoom * 2);
                    const availHeight = contentHeight - (breathingRoom * 2);

                    const scaleX = availWidth / svgWidth;
                    const scaleY = availHeight / svgHeight;

                    // Use smaller scale to fit both dimensions
                    scale = Math.min(scaleX, scaleY);

                    // Constrain to 10%-150% (low min allows wide LR diagrams to fit)
                    scale = Math.max(0.1, Math.min(1.5, scale));

                    // Detect content offset within SVG viewBox (Mermaid often adds asymmetric padding)
                    let contentCorrectionX = 0;
                    let contentCorrectionY = 0;
                    try {
                        const bbox = svg.getBBox();
                        const vb = svg.viewBox?.baseVal;
                        if (vb && vb.width > 0 && vb.height > 0) {
                            const contentCenterX = bbox.x + bbox.width / 2;
                            const contentCenterY = bbox.y + bbox.height / 2;
                            const viewBoxCenterX = vb.x + vb.width / 2;
                            const viewBoxCenterY = vb.y + vb.height / 2;

                            const svgToPixelX = svgWidth / vb.width;
                            const svgToPixelY = svgHeight / vb.height;
                            contentCorrectionX = (contentCenterX - viewBoxCenterX) * svgToPixelX;
                            contentCorrectionY = (contentCenterY - viewBoxCenterY) * svgToPixelY;
                        }
                    } catch (e) {
                        // getBBox can fail on unrendered SVGs — skip correction
                    }

                    // Calculate centered position, correcting for content offset within SVG
                    const scaledWidth = svgWidth * scale;
                    const scaledHeight = svgHeight * scale;
                    pointX = (wrapperRect.width - scaledWidth) / 2 - padLeft - contentCorrectionX * scale;
                    pointY = (wrapperRect.height - scaledHeight) / 2 - padTop - contentCorrectionY * scale;

                    // Apply transform and reveal (graph starts at opacity 0)
                    graphDiv.style.transformOrigin = '0 0';
                    graphDiv.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
                    graphDiv.style.opacity = '1';
                } catch (err) {
                    console.error('[ZOOM] Centering failed, revealing anyway:', err);
                    graphDiv.style.opacity = '1';
                }

                // Cancel safety timer since we've revealed
                if (graphDiv.dataset.safetyTimer) {
                    clearTimeout(Number(graphDiv.dataset.safetyTimer));
                }
            });
        })();
        
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = scale * delta;
            
            // Enforce 10%-300% limits (min matches initial fit constraint)
            if (newScale < 0.1 || newScale > 3.0) {
                return; // Don't zoom beyond limits
            }
            
            // Zoom toward mouse position
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate new position to zoom toward mouse
            const prevScale = scale;
            scale = newScale;
            
            pointX = mouseX - (mouseX - pointX) * (scale / prevScale);
            pointY = mouseY - (mouseY - pointY) * (scale / prevScale);
            
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
                
                // Remove previous highlight
                svg.querySelectorAll('.node-inspecting').forEach(n => n.classList.remove('node-inspecting'));
                
                // Add highlight to clicked node
                node.classList.add('node-inspecting');
                
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
    // FLOATING PANEL MANAGEMENT
    // =========================================================================
    
    function createOrUpdateFloatingPanel(simId, stepIndex, panelContent) {
        const panelId = `floating-panel-${simId}`;
        let panel = document.getElementById(panelId);
        
        if (!panel) {
            // Create new panel
            panel = document.createElement('div');
            panel.id = panelId;
            panel.className = 'floating-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <span class="panel-icon">📊</span>
                    <span class="panel-title">Graph Data - Step ${stepIndex + 1}</span>
                    <button class="panel-btn" onclick="AXIOM.interactions.togglePanelCollapse('${panelId}')">−</button>
                </div>
                <div class="panel-content" id="${panelId}-content">
                    ${panelContent}
                </div>
            `;
            document.body.appendChild(panel);
            
            // Load saved position and state
            const savedState = localStorage.getItem(panelId);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    if (state.top) panel.style.top = state.top;
                    if (state.left) panel.style.left = state.left;
                    if (state.collapsed) panel.classList.add('collapsed');
                } catch (e) {
                    console.warn('[PANEL] Error loading saved state:', e);
                }
            } else {
                // Default position
                panel.style.top = '100px';
                panel.style.right = '30px';
            }
            
            // Make draggable
            makePanelDraggable(panel);
        } else {
            // Update existing panel
            const titleEl = panel.querySelector('.panel-title');
            if (titleEl) titleEl.textContent = `Graph Data - Step ${stepIndex + 1}`;
            const contentEl = panel.querySelector('.panel-content');
            if (contentEl) contentEl.innerHTML = panelContent;
        }
    }
    
    function makePanelDraggable(panel) {
        const header = panel.querySelector('.panel-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        function dragStart(e) {
            // Don't drag if clicking the button
            if (e.target.classList.contains('panel-btn') || e.target.closest('.panel-btn')) {
                return;
            }
            
            isDragging = true;
            
            // Get current position
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            
            // Remove transitions during drag
            panel.style.transition = 'none';
            header.style.cursor = 'grabbing';
            
            // Prevent text selection during drag
            e.preventDefault();
        }
        
        function drag(e) {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;
            
            // Constrain to viewport
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;
            
            panel.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
            panel.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }
        
        function dragEnd() {
            if (!isDragging) return;
            
            isDragging = false;
            panel.style.transition = '';
            header.style.cursor = 'move';
            
            // Save position
            localStorage.setItem(panel.id + '_pos', JSON.stringify({
                left: panel.style.left,
                top: panel.style.top
            }));
        }
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        // Restore saved position on creation
        const savedPos = localStorage.getItem(panel.id + '_pos');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                panel.style.left = pos.left;
                panel.style.top = pos.top;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            } catch (e) {
                console.warn('[PANEL] Failed to restore position:', e);
            }
        }
    }
    
    function togglePanelCollapse(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const btn = panel.querySelector('.panel-btn');
        panel.classList.toggle('collapsed');
        if (btn) btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        
        // Save state
        const currentState = localStorage.getItem(panelId);
        let state = {};
        try {
            state = currentState ? JSON.parse(currentState) : {};
        } catch (e) {
            console.warn('[PANEL] Error parsing saved state:', e);
        }
        state.collapsed = panel.classList.contains('collapsed');
        localStorage.setItem(panelId, JSON.stringify(state));
    }
    
    // =========================================================================
    // EXPORT
    // =========================================================================
    
    AXIOM.interactions = {
        setupZoomPan,
        setupNodeClicks,
        attachNodePhysics,
        reattachGraphPhysics,
        setupCardTilt,
        createOrUpdateFloatingPanel,
        togglePanelCollapse
    };
    

})();