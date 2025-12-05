// viewer/renderNrrdMesh.js
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { labelColorMap, labelNameMap } from "../viewer/colorMaps.js";

export async function generateMeshFromNrrdBlob(nrrdBlob)
{
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
                        const rgb = labelColorMap[currentLabel] || [255, 255, 255];
                        const colorHex = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

                        // ✅ Material 적용
                        child.material = new THREE.MeshPhongMaterial({
                            color: colorHex,
                            transparent: true,
                            opacity: 1.0,
                            side: THREE.DoubleSide,
                        });

                        child.userData.label = currentLabel;
                        child.userData.name = labelNameMap[currentLabel] || `Label ${currentLabel}`;
                        child.name = child.userData.name;
                        child.geometry.computeVertexNormals();

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
 * 서버에서 NRRD → OBJ 메시 변환 후 JSON 응답을 받아 Three.js 메시로 렌더링
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.WebGLRenderer} renderer
 * @param {string} nrrdBlobUrl - Blob URL (NRRD)
 * @param {number | null} label - 특정 라벨만 요청할 경우
 * @returns {Promise<THREE.Mesh[]>} - 메시 리스트
 */
export async function renderNrrdMesh(scene, camera, renderer, nrrdBlobUrl, label = null) {
    console.log("🚀 renderNrrdMesh 시작");
    console.log("👉 전달된 nrrdBlobUrl:", nrrdBlobUrl);

    // ✅ Blob URL → Blob 변환
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

    return generateMeshFromNrrdBlob(nrrdBlob);
}
