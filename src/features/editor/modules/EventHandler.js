// Event Handling Module

export class EventHandler {
    constructor(lassoEditor) {
        this.lassoEditor = lassoEditor;
        this.boundOnMouseDown = null;
        this.boundOnMouseMove = null;
        this.boundOnMouseUp = null;
    }

    // Add event listeners to canvases
    addEventListeners() {
        // Bind event handlers
        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);

        // Add to lasso canvas
        this.lassoEditor.lassoCanvas.addEventListener('mousedown', this.boundOnMouseDown);
        window.addEventListener('mousemove', this.boundOnMouseMove);
        window.addEventListener('mouseup', this.boundOnMouseUp);

        // Add to render overlay if exists
        if (this.lassoEditor.renderOverlay) {
            this.lassoEditor.renderOverlay.style.pointerEvents = 'auto';
            this.lassoEditor.renderOverlay.addEventListener('mousedown', this.boundOnMouseDown);
        }

        // Add to multi overlay if exists
        if (this.lassoEditor.multiOverlay) {
            this.lassoEditor.multiOverlay.style.pointerEvents = 'auto';
            this.lassoEditor.multiOverlay.addEventListener('mousedown', this.boundOnMouseDown);
        }
    }

    // Remove event listeners from canvases
    removeEventListeners() {
        // Remove from lasso canvas
        this.lassoEditor.lassoCanvas.removeEventListener('mousedown', this.boundOnMouseDown);
        window.removeEventListener('mousemove', this.boundOnMouseMove);
        window.removeEventListener('mouseup', this.boundOnMouseUp);

        // Remove from render overlay
        if (this.lassoEditor.renderOverlay) {
            this.lassoEditor.renderOverlay.style.pointerEvents = 'none';
            this.lassoEditor.renderOverlay.removeEventListener('mousedown', this.boundOnMouseDown);
        }

        // Remove from multi overlay
        if (this.lassoEditor.multiOverlay) {
            this.lassoEditor.multiOverlay.style.pointerEvents = 'none';
            this.lassoEditor.multiOverlay.removeEventListener('mousedown', this.boundOnMouseDown);
        }
    }

    // Handle mouse down event
    onMouseDown(e) {
        this.lassoEditor.isDrawing = true;
        this.lassoEditor.resetAllPoints();

        // Determine which canvas was clicked
        if (e.target.id === 'lassoCanvas') {
            this.lassoEditor.currentCanvas = 'lassoCanvas';
        } else if (e.target.id === 'renderOverlay') {
            this.lassoEditor.currentCanvas = 'renderOverlay';
        } else if (e.target.id === 'multiOverlay') {
            this.lassoEditor.currentCanvas = 'multiOverlay';
        }

        const pos = this.getMousePosition(e);

        switch (this.lassoEditor.currentCanvas) {
            case 'lassoCanvas':
                this.lassoEditor.points.push(pos);
                break;
            case 'renderOverlay':
                this.lassoEditor.renderPoints.push(pos);
                break;
            case 'multiOverlay':
                this.lassoEditor.multiPoints.push(pos);
                break;
        }
    }

    // Handle mouse move event
    onMouseMove(e) {
        if (!this.lassoEditor.isDrawing || !this.lassoEditor.currentCanvas) return;

        const pos = this.getMousePosition(e);

        switch (this.lassoEditor.currentCanvas) {
            case 'lassoCanvas':
                this.lassoEditor.points.push(pos);
                break;
            case 'renderOverlay':
                this.lassoEditor.renderPoints.push(pos);
                break;
            case 'multiOverlay':
                this.lassoEditor.multiPoints.push(pos);
                break;
        }

        this.lassoEditor.clearLassoPath();
        this.lassoEditor.drawLasso();

        // Show edit preview if enabled
        if (this.lassoEditor.showEditPreview) {
            const currentTime = Date.now();
            if (currentTime - this.lassoEditor.lastUpdateTime > 100) {
                this.lassoEditor.lastUpdateTime = currentTime;
                // Preview logic would go here
            }
        }
    }

    // Handle mouse up event
    onMouseUp() {
        if (!this.lassoEditor.isDrawing || !this.lassoEditor.currentCanvas) return;

        this.lassoEditor.isDrawing = false;

        let currentPoints;
        switch (this.lassoEditor.currentCanvas) {
            case 'lassoCanvas':
                currentPoints = this.lassoEditor.points;
                break;
            case 'renderOverlay':
                currentPoints = this.lassoEditor.renderPoints;
                break;
            case 'multiOverlay':
                currentPoints = this.lassoEditor.multiPoints;
                break;
        }

        if (currentPoints.length < 3) {
            this.lassoEditor.resetAllPoints();
            this.lassoEditor.clearLassoPath();
            return;
        }

        // Apply the lasso edit
        if (this.lassoEditor.volumeEditMode) {
            if (!this.lassoEditor.nvMulti || !this.lassoEditor.nvMulti.volumes || 
                this.lassoEditor.nvMulti.volumes.length < 2 || !this.lassoEditor.nvMulti.volumes[1]?.img) {
                console.warn("No segmentation volume loaded for editing");
                this.lassoEditor.resetAllPoints();
                this.lassoEditor.clearLassoPath();
                return;
            }
            this.lassoEditor.applyLassoEdit();
        } else {
            const editedVertices = this.lassoEditor.applyLassoCutAndGetVertices();
            if (editedVertices.length > 0) {
                console.log(`Edited ${editedVertices.length} vertices`);
            }
        }

        this.lassoEditor.clearLassoPath();
        this.lassoEditor.resetAllPoints();
        this.lassoEditor.currentCanvas = null;
    }

    // Get mouse position relative to canvas
    getMousePosition(e) {
        const target = e.target;
        const rect = target.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
}