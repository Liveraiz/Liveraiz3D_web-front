// meshToVolume.js
import * as THREE from "three";

export function meshToVoxel(mesh, dims, spacing) {
    const sizeX = dims[0], sizeY = dims[1], sizeZ = dims[2];
    const voxels = new Uint8Array(sizeX * sizeY * sizeZ);

    const bbox = new THREE.Box3().setFromObject(mesh);
    const min = bbox.min;

    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(1, 0, 0);

    for (let z = 0; z < sizeZ; z++) {
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                const worldX = min.x + x * spacing[0];
                const worldY = min.y + y * spacing[1];
                const worldZ = min.z + z * spacing[2];

                raycaster.set(new THREE.Vector3(worldX, worldY, worldZ), direction);
                const intersects = raycaster.intersectObject(mesh, true);

                if (intersects.length % 2 === 1) {
                    voxels[z * sizeY * sizeX + y * sizeX + x] = 1; // 내부면 1
                }
            }
        }
    }
    return voxels;
}