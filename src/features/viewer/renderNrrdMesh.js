import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { getLabelMapByModel, getColorMapByModel } from "../viewer/colorMaps.js";

/**
 * Convert a segmentation NRRD blob to labeled Three.js meshes via backend.
 *
 * Coordinate contract (inferred from current client code):
 * - Vertices are consumed exactly as provided in backend OBJ (`item.objData`).
 * - This function does not apply per-mesh transform (`position/rotation/scale`) or
 *   a shared world matrix; returned meshes stay in OBJ/local coordinates.
 * - Callers currently add meshes directly to scene root, so alignment between meshes
 *   relies on backend exporting all labels in one shared frame.
 * - Exact medical frame metadata (LPS/RAS, unit, affine) is not included in this
 *   response contract; downstream code that maps mesh<->volume may require extra
 *   correction logic.
 *
 * @param {Blob} nrrdBlob - Segmentation labelmap NRRD payload.
 * @returns {Promise<THREE.Mesh[]>} Labeled meshes in backend-exported shared coordinates.
 */
export async function generateMeshFromNrrdBlob(nrrdBlob, modelName) {
    // ✅ FormData 구성
    const formData = new FormData();
    formData.append("file", nrrdBlob, "inferred.nrrd");
    console.log("📦 FormData 구성 완료");

    // ✅ 서버 요청
    try {
        const defaultBase = "http://127.0.0.1:5051";
        const base = (globalThis.NIIVUE_API_BASE ?? defaultBase).replace(/\/$/, "");
        const url = `${base}/generate-mesh`;
        const res = await fetch(url, {
            method: "POST",
            body: formData,
        });

        console.log("📡 응답 상태 코드:", res.status);
        const contentType = res.headers.get("content-type");
        console.log("📡 응답 Content-Type:", contentType);

        if (!res.ok) {
            const errText = await res.text();
            console.error("❌ 서버 오류 응답:", errText);
            throw new Error(`❌ 서버 오류: ${res.status} - ${errText}`);
        }

        if (!contentType || !contentType.includes("application/json")) {
            const unexpected = await res.text();
            console.error("❌ 예상치 못한 Content-Type:", contentType, "응답:", unexpected.substring(0, 500));
            throw new Error(`예상치 못한 서버 응답 형식: ${contentType}`);
        }

        const jsonResponse = await res.json();
        console.log("✅ JSON 응답:", jsonResponse);

        if (!jsonResponse.success) {
            throw new Error(`서버 처리 실패: ${jsonResponse.message}`);
        }
        if (!jsonResponse.meshes || !Array.isArray(jsonResponse.meshes)) {
            console.warn("⚠️ 'meshes' 배열이 없음");
            return [];
        }

        const meshes = [];
        const objLoader = new OBJLoader();

        for (const item of jsonResponse.meshes) {
            if (!item.objData) {
                console.warn(`⚠️ Label ${item.label}에 objData 없음`);
                continue;
            }

            try {
                const loadedObject = objLoader.parse(item.objData);

                loadedObject.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        const currentLabel = item.label;
                        const colorMap = getColorMapByModel(modelName);
                        const rgb = colorMap[currentLabel] || [255, 255, 255];
                        const colorHex = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

                        // ✅ Material 적용
                        child.material = new THREE.MeshPhongMaterial({
                            color: colorHex,
                            transparent: true,
                            opacity: 0.7,
                            side: THREE.DoubleSide,
                        });

                        child.userData.label = currentLabel;
                        const labelMap = getLabelMapByModel(modelName);
                        child.userData.name = labelMap[currentLabel] || `Label ${currentLabel}`;
                        child.name = child.userData.name;
                        child.geometry.computeVertexNormals();
                        console.log("Labeled Mesh: ", child);

                        meshes.push(child);
                    }
                });
            } catch (err) {
                console.error(`❌ Label ${item.label} OBJ 파싱 실패:`, err);
            }
        }

        return meshes;
    } catch (e) {
        console.error("❌ fetch 또는 메시 생성 실패:", e);
        throw e;
    }
}

/**
 * Request labeled meshes from a segmentation NRRD blob URL.
 *
 * Coordinate contract is identical to `generateMeshFromNrrdBlob`:
 * - Returned meshes are not world-aligned per mesh by this function.
 * - Meshes are expected to share one backend-defined coordinate frame.
 *
 * @param {string} nrrdBlobUrl - Blob URL that resolves to a segmentation labelmap NRRD.
 * @returns {Promise<THREE.Mesh[]>} Labeled meshes in backend-exported shared coordinates.
 */
export async function requestMeshesFromSegmentationNrrdUrl(nrrdBlobUrl, modelName) {
    let nrrdBlob;
    try {
        const response = await fetch(nrrdBlobUrl);
        console.log("✅ fetch 응답 상태:", response.status);
        nrrdBlob = await response.blob();
        console.log("✅ Blob 변환 완료 (size):", nrrdBlob.size);
    } catch (e) {
        console.error("❌ Blob URL fetch 실패:", e);
        throw e;
    }
    return await generateMeshFromNrrdBlob(nrrdBlob, modelName);
}
