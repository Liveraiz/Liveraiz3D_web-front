// editor/undoManager.js
import * as THREE from 'three';

export class UndoManager {
    constructor() {
        this.history = [];
        this.maxHistory = 10;
    }

    pushState(mesh) {
        const clonedMesh = mesh.clone(true);
        clonedMesh.geometry = mesh.geometry.clone();
        this.history.push(clonedMesh);

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    undo(targetMesh) {
        if (this.history.length === 0) return;
        const lastState = this.history.pop();
        targetMesh.geometry = lastState.geometry.clone();
    }

    getLastState() {
        if (this.history.length === 0) return null;
        return this.history[this.history.length - 1];
    }
}