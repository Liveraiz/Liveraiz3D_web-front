// Canvas and Overlay Management Module

export class CanvasManager {
    constructor() {
        this.lassoCanvas = null;
        this.ctx = null;
        this.renderOverlay = null;
        this.renderCtx = null;
        this.multiOverlay = null;
        this.multiCtx = null;
    }

    // Initialize lasso canvas
    initializeLassoCanvas() {
        this.lassoCanvas = document.getElementById('lassoCanvas');
        if (this.lassoCanvas) {
            this.ctx = this.lassoCanvas.getContext('2d');
        }
    }

    // Create volume overlays for Niivue viewers
    createVolumeOverlays() {
        // Render viewer overlay
        const renderCanvas = document.getElementById('canvasMulti');
        if (renderCanvas) {
            this.renderOverlay = this.createOverlayCanvas(renderCanvas, 'renderOverlay');
            this.renderCtx = this.renderOverlay.getContext('2d');
        }

        // Multiplane viewer overlay
        const multiCanvas = document.getElementById('canvasTop');
        if (multiCanvas) {
            this.multiOverlay = this.createOverlayCanvas(multiCanvas, 'multiOverlay');
            this.multiCtx = this.multiOverlay.getContext('2d');
        }
    }

    // Create overlay canvas on target canvas
    createOverlayCanvas(targetCanvas, id) {
        const overlay = document.createElement('canvas');
        overlay.id = id;
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '10';
        overlay.width = targetCanvas.width || targetCanvas.clientWidth;
        overlay.height = targetCanvas.height || targetCanvas.clientHeight;

        targetCanvas.parentNode.style.position = 'relative';
        targetCanvas.parentNode.appendChild(overlay);

        return overlay;
    }

    // Resize all canvases
    resizeCanvas(canvas, nvRender, nvMulti) {
        if (this.lassoCanvas && canvas) {
            const rect = canvas.getBoundingClientRect();
            this.lassoCanvas.style.width = rect.width + 'px';
            this.lassoCanvas.style.height = rect.height + 'px';
            this.lassoCanvas.width = rect.width;
            this.lassoCanvas.height = rect.height;
        }

        // Resize render overlay
        if (this.renderOverlay && nvRender) {
            const renderCanvas = document.getElementById('canvasMulti');
            if (renderCanvas) {
                this.renderOverlay.width = renderCanvas.width || renderCanvas.clientWidth;
                this.renderOverlay.height = renderCanvas.height || renderCanvas.clientHeight;
            }
        }

        // Resize multi overlay
        if (this.multiOverlay && nvMulti) {
            const multiCanvas = document.getElementById('canvasTop');
            if (multiCanvas) {
                this.multiOverlay.width = multiCanvas.width || multiCanvas.clientWidth;
                this.multiOverlay.height = multiCanvas.height || multiCanvas.clientHeight;
            }
        }
    }

    // Clear lasso path from all canvases
    clearLassoPath() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.lassoCanvas.width, this.lassoCanvas.height);
        }
        if (this.renderCtx) {
            this.renderCtx.clearRect(0, 0, this.renderOverlay.width, this.renderOverlay.height);
        }
        if (this.multiCtx) {
            this.multiCtx.clearRect(0, 0, this.multiOverlay.width, this.multiOverlay.height);
        }
    }

    // Clear preview on specific canvas
    clearPreview(canvasType) {
        switch (canvasType) {
            case 'render':
                if (this.renderCtx) {
                    this.renderCtx.clearRect(0, 0, this.renderOverlay.width, this.renderOverlay.height);
                }
                break;
            case 'multi':
                if (this.multiCtx) {
                    this.multiCtx.clearRect(0, 0, this.multiOverlay.width, this.multiOverlay.height);
                }
                break;
            default:
                if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.lassoCanvas.width, this.lassoCanvas.height);
                }
        }
    }

    // Get all canvas contexts
    getContexts() {
        return {
            lasso: this.ctx,
            render: this.renderCtx,
            multi: this.multiCtx
        };
    }

    // Get all canvas elements
    getCanvases() {
        return {
            lasso: this.lassoCanvas,
            render: this.renderOverlay,
            multi: this.multiOverlay
        };
    }
}