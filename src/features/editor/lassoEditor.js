import * as THREE from "three";
import { UndoManager } from './undoManager.js';
import { generateMeshFromNrrdBlob } from '../viewer/renderNrrdMesh.js';
import { serialize } from "./nrrd.js";
import {computeLabelVolumesDict} from '../viewer/niiViewer.js';

export class LassoEditor {
    constructor(canvas, camera, renderer, scene, controls, nvRender = null, nvMulti = null) {
        this.canvas = canvas;
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.controls = controls;
        this.nvMulti = nvMulti;
        this.topLeftView = null;

        this.volumeEditMode = true;
        this.editRange = 2;
        this.showAllLasso = true;

        // ✅ Niivue 인스턴스 추가
        this.nvRender = nvRender;
        this.nvMulti = nvMulti;

        this.lassoCanvas = document.getElementById('lassoCanvas');
        this.ctx = this.lassoCanvas.getContext('2d');
        this.scissorIcon = document.getElementById('scissorIcon');

        // ✅ Niivue 볼륨 뷰어용 라쏘 캔버스 생성
        this.createVolumeOverlays();

        this.editMode = false;
        this.selectedMesh = null;
        this.undoManager = new UndoManager();

        // ✅ 볼륨 편집 옵션 추가
        this.volumeEditFullMode = false; // true: 전체 편집, false: 부분 편집

        // ✅ 각 캔버스별로 독립적인 points 저장
        this.points = [];
        this.renderPoints = [];
        this.multiPoints = [];
        this.isDrawing = false;
        this.currentCanvas = null; // 현재 그리고 있는 캔버스 추적

        // ✅ 볼륨 편집을 위한 상태 관리
        this.volumeEditHistory = [];
        this.originalVolumeData = null;

        // ✅ 시각적 피드백 설정
        this.showEditPreview = false; // 실시간 편집 미리보기
        this.previewOpacity = 0.3; // 미리보기 투명도
        this.lastUpdateTime = 0; // 성능 최적화용

        // ✅ 좌표계 보정 설정
        const offset = {
            x: 0,    // = -103.3
            y: 0,   // = -112.5
            z: 0, // = -136.4
        };
        this.coordinateOffset = offset;
        this.useLPSToRASConversion = false;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // ✅ 이벤트 핸들러 고정 (removeEventListeners 문제 해결)
        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
    }

    // ✅ 메시와 볼륨의 좌표 시스템 상세 분석
    logCoordinateSystemDetails(mesh) {
        if (this.nvRender.volumes && this.nvRender.volumes[0]) {
            const vol = this.nvRender.volumes[0];
            console.log("📦 Render 볼륨 dims:", vol.hdr.dims.slice(1, 4));
            console.log("📦 Render 볼륨 pixDims:", vol.hdr.pixDims.slice(1, 4));
            console.log("📦 Render 볼륨 mmCenter:", vol.mmCenter);
            console.log("📦 Render 볼륨 mmCenter:", vol.mmCenter || "— (Niivue는 별도 API로 center를 계산해야 할 수 있음)");
        }

        console.log("=".repeat(80));
        console.log("🔍 좌표 시스템 상세 분석");
        console.log("=".repeat(80));

        // matrixWorld 분해
        const worldMat = mesh.matrixWorld;
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        worldMat.decompose(pos, quat, scl);
        console.log("📐 Mesh 위치:", pos.toArray().map(v => v.toFixed(2)));
        console.log("📐 Mesh 회전(quaternion):", quat.toArray().map(v => v.toFixed(3)));
        console.log("📐 Mesh 스케일:", scl.toArray().map(v => v.toFixed(2)));
        // 로컬 축 방향
        const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
        const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
        console.log("🧭 로컬 X축 방향:", xAxis.toArray().map(v => v.toFixed(2)));
        console.log("🧭 로컬 Y축 방향:", yAxis.toArray().map(v => v.toFixed(2)));
        console.log("🧭 로컬 Z축 방향:", zAxis.toArray().map(v => v.toFixed(2)));

        // 메시 정보
        if (mesh && mesh.geometry) {
            const geometry = mesh.geometry;
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            console.log("메시 BB Min:", bbox.min, "Max:", bbox.max, "Center:", center);
            console.log("📦 [메시 정보]");
            console.log(`  이름: ${mesh.name || mesh.userData?.labelName || 'Unknown'}`);
            console.log(`  라벨: ${this.getSelectedMeshLabel()}`);
            console.log(`  바운딩박스 Min: (${bbox.min.x.toFixed(2)}, ${bbox.min.y.toFixed(2)}, ${bbox.min.z.toFixed(2)})`);
            console.log(`  바운딩박스 Max: (${bbox.max.x.toFixed(2)}, ${bbox.max.y.toFixed(2)}, ${bbox.max.z.toFixed(2)})`);
            console.log(`  바운딩박스 Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
            console.log(`  바운딩박스 Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
            console.log(`  정점 개수: ${geometry.attributes.position.count}`);

            // 몇 개 샘플 정점 좌표
            const positions = geometry.attributes.position.array;
            console.log("  샘플 정점들:");
            for (let i = 0; i < Math.min(5, positions.length / 3); i++) {
                const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
                console.log(`    정점 ${i}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
            }
        }

        // 볼륨 정보
        this.logVolumeDetails();
        // this.logAxisDirection()
        // 좌표 변환 테스트 및 검증
        this.testCoordinateTransforms(mesh);
        this.validateMeshVolumeAlignment(mesh);
    }

    setRenderInstance(nvRender) {
        this.nvRender = nvRender;
    }

    setMultiInstance(nvMulti) {
        this.nvMulti = nvMulti;
    }

    setTopLeftView(topLeftView) {
        this.topLeftView = topLeftView;
    }

    // ✅ Niivue 볼륨 뷰어 위에 오버레이 캔버스 생성
    createVolumeOverlays() {
        // 렌더 뷰어용 오버레이
        const renderCanvas = document.getElementById('canvasMulti');
        if (renderCanvas) {
            this.renderOverlay = this.createOverlayCanvas(renderCanvas, 'renderOverlay');
            this.renderCtx = this.renderOverlay.getContext('2d');
        }

        // 멀티플레인 뷰어용 오버레이
        const multiCanvas = document.getElementById('canvasTop');
        if (multiCanvas) {
            this.multiOverlay = this.createOverlayCanvas(multiCanvas, 'multiOverlay');
            this.multiCtx = this.multiOverlay.getContext('2d');
        }
    }

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

    // ✅ Niivue 인스턴스 업데이트 메서드
    updateNiivueInstances(nvRender, nvMulti) {
        this.nvRender = nvRender;
        this.nvMulti = nvMulti;
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();

        // ✅ 라쏘 캔버스의 내부 픽셀 크기 설정
        this.lassoCanvas.width = rect.width;
        this.lassoCanvas.height = rect.height;

        // ✅ CSS 스타일 크기도 맞춰줌
        this.lassoCanvas.style.width = `${rect.width}px`;
        this.lassoCanvas.style.height = `${rect.height}px`;

        // ✅ 볼륨 오버레이 캔버스도 동일하게 조정
        if (this.renderOverlay && this.nvRender) {
            const renderCanvas = document.getElementById('canvasMulti');
            const rRect = renderCanvas.getBoundingClientRect();
            this.renderOverlay.width = rRect.width;
            this.renderOverlay.height = rRect.height;
            this.renderOverlay.style.width = `${rRect.width}px`;
            this.renderOverlay.style.height = `${rRect.height}px`;
        }

        if (this.multiOverlay && this.nvMulti) {
            const multiCanvas = document.getElementById('canvasTop');
            const mRect = multiCanvas.getBoundingClientRect();
            this.multiOverlay.width = mRect.width;
            this.multiOverlay.height = mRect.height;
            this.multiOverlay.style.width = `${mRect.width}px`;
            this.multiOverlay.style.height = `${mRect.height}px`;
        }
    }

    toggleEditMode(state) {
        this.editMode = state;

        if (this.editMode) {
            this.lassoCanvas.style.pointerEvents = 'auto';
            this.canvas.classList.add('crosshair');
            this.scissorIcon.style.display = 'block';

            // ✅ 볼륨 뷰어들도 크로스헤어 커서 적용
            if (this.renderOverlay) {
                this.renderOverlay.style.cursor = 'crosshair';
                this.renderOverlay.style.pointerEvents = 'auto';
            }
            if (this.multiOverlay) {
                this.multiOverlay.style.cursor = 'crosshair';
                this.multiOverlay.style.pointerEvents = 'auto';
            }

            this.addEventListeners();

            // ✅ controls null 체크 추가
            if (this.controls) {
                this.controls.enabled = false;
            }

            // ✅ 볼륨 원본 데이터 백업
            this.backupVolumeData();

            console.log("✂️ 편집 모드 ON");
        } else {
            this.lassoCanvas.style.pointerEvents = 'none';
            this.canvas.classList.remove('crosshair');
            this.scissorIcon.style.display = 'none';

            // ✅ 볼륨 뷰어 오버레이 정리
            if (this.renderOverlay) {
                this.renderOverlay.style.cursor = 'default';
                this.renderOverlay.style.pointerEvents = 'none';
                this.renderCtx.clearRect(0, 0, this.renderOverlay.width, this.renderOverlay.height);
            }
            if (this.multiOverlay) {
                this.multiOverlay.style.cursor = 'default';
                this.multiOverlay.style.pointerEvents = 'none';
                this.multiCtx.clearRect(0, 0, this.multiOverlay.width, this.multiOverlay.height);
            }

            this.removeEventListeners();
            this.clearLassoPath();
            this.resetAllPoints();

            // ✅ controls null 체크 추가
            if (this.controls) {
                this.controls.enabled = true;
            }

            this.isDrawing = false;
            this.currentCanvas = null;

            if (this.selectedMesh) {
                this.originalMesh = this.selectedMesh.clone(true);
                console.log("✅ 원본 메쉬 클론 저장:", this.originalMesh.name || this.originalMesh.uuid);
            }
            console.log("✂️ 편집 모드 OFF");
        }
    }

    // ✅ 볼륨 데이터 백업
    backupVolumeData() {
        try {
            if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[1]) {
                const segVolume = this.nvMulti.volumes[1];
                if (segVolume.img && segVolume.img.length > 0) {
                    this.originalVolumeData = new Uint8Array(segVolume.img);
                    console.log("✅ 볼륨 데이터 백업 완료:", this.originalVolumeData.length);

                    // 🔍 NRRD 파일의 기존 라벨 분포 분석
                    const labelCounts = {};
                    for (let i = 0; i < segVolume.img.length; i++) {
                        const label = segVolume.img[i];
                        labelCounts[label] = (labelCounts[label] || 0) + 1;
                    }

                    console.log("📊 NRRD 라벨 분포 분석:");
                    const sortedLabels = Object.keys(labelCounts).sort((a, b) => parseInt(a) - parseInt(b));
                    for (const label of sortedLabels) {
                        const count = labelCounts[label];
                        const percentage = (count / segVolume.img.length * 100).toFixed(2);
                        console.log(`   라벨 ${label}: ${count}개 복셀 (${percentage}%)`);
                    }
                    console.log(`   총 복셀 수: ${segVolume.img.length}`);

                    // 🎨 백엔드 색상 매핑 적용
                    console.log("🔄 1초 후 백엔드 색상 적용 예약...");
                    setTimeout(() => {
                        console.log("⏰ 시간 도달, 백엔드 색상 적용 시작");
                        this.updateVolumeColorsFromBackend();
                    }, 1000); // 볼륨 로딩 완료 후 적용
                }
            }
        } catch (error) {
            console.warn("⚠️ 볼륨 데이터 백업 실패:", error);
        }
    }

    setSelectedMesh(mesh) {
        const worldMat = mesh.matrixWorld;
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        worldMat.decompose(pos, quat, scl);

        console.log("📐 Mesh 위치:", pos.toArray().map(v => v.toFixed(2)));
        console.log("📐 Mesh 회전(quaternion):", quat.toArray().map(v => v.toFixed(3)));
        console.log("📐 Mesh 스케일:", scl.toArray().map(v => v.toFixed(2)));
        console.log("📍 setSelectedMesh: 메시 선택 완료 — 축 방향 확인 시작");
        this.selectedMesh = mesh;
        console.log(`선택된 메시: ${mesh.name || 'Unnamed Mesh'}`);
        this.logAxisDirection();   // ← 여기에!

        // ✅ 메시와 볼륨의 좌표 시스템 상세 로깅
        // this.logCoordinateSystemDetails(mesh);

        // ✅ UI 하이라이트 적용
        document.querySelectorAll('.mesh-row').forEach(el => el.classList.remove('selected-row'));
        const meshListDiv = document.getElementById('meshList');
        const rows = meshListDiv.querySelectorAll('.mesh-row');
        rows.forEach(row => {
            if (row.textContent.includes(mesh.userData.labelName || mesh.name)) {
                row.classList.add('selected-row');
            }
        });

        // setSelectedMesh 안이나 logCoordinateSystemDetails 직후에 추가
        const center = new THREE.Vector3();
        mesh.geometry.boundingBox.getCenter(center);
        mesh.localToWorld(center);

        // 로컬 축 단위벡터
        const axes = {
        "+X": new THREE.Vector3(1,0,0),
        "-X": new THREE.Vector3(-1,0,0),
        "+Y": new THREE.Vector3(0,1,0),
        "-Y": new THREE.Vector3(0,-1,0),
        "+Z": new THREE.Vector3(0,0,1),
        "-Z": new THREE.Vector3(0,0,-1),
        };

        for (const [name, dir] of Object.entries(axes)) {
        // 메시의 회전(quaternion)을 반영한 방향
        const worldDir = dir.clone().applyQuaternion(mesh.quaternion);
        const testPos = center.clone().add(worldDir.multiplyScalar(10)); // 10mm 이동

        console.log(`▶ Direction ${name} worldPos:`, testPos.toArray().map(v=>v.toFixed(2)));

        // world→voxel
        const vox = this.worldToVoxelWithRAS(testPos, this.nvMulti.volumes[1]);
        console.log(`   → voxel indices: (${vox.x}, ${vox.y}, ${vox.z})`);
        }
    }


    // ✅ 볼륨 상세 정보 로깅
    logVolumeDetails() {
        console.log("\n📊 [볼륨 정보]");

        if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[0]) {
            const volume = this.nvMulti.volumes[0];
            const dims = volume.hdr.dims.slice(1, 4);
            const pixDims = volume.hdr.pixDims.slice(1, 4);
            const center = volume.mmCenter || [0, 0, 0];

            console.log("  CT 볼륨 (volumes[0]):");
            console.log(`    Dimensions: [${dims.join(', ')}]`);
            console.log(`    Pixel Dimensions: [${pixDims.map(p => p.toFixed(3)).join(', ')}]`);
            console.log(`    Center (mmCenter): [${center.map(c => c.toFixed(2)).join(', ')}]`);
            console.log(`    Physical Size: [${(dims[0] * pixDims[0]).toFixed(2)}, ${(dims[1] * pixDims[1]).toFixed(2)}, ${(dims[2] * pixDims[2]).toFixed(2)}]`);

            // 볼륨 바운딩박스 계산
            const volBbox = {
                min: [
                    center[0] - (dims[0] * pixDims[0]) / 2,
                    center[1] - (dims[1] * pixDims[1]) / 2,
                    center[2] - (dims[2] * pixDims[2]) / 2
                ],
                max: [
                    center[0] + (dims[0] * pixDims[0]) / 2,
                    center[1] + (dims[1] * pixDims[1]) / 2,
                    center[2] + (dims[2] * pixDims[2]) / 2
                ]
            };
            console.log("CT 볼륨 Bounding Box Min/Max:", volBbox.min, volBbox.max);
            console.log(`    Bounding Box Min: [${volBbox.min.map(v => v.toFixed(2)).join(', ')}]`);
            console.log(`    Bounding Box Max: [${volBbox.max.map(v => v.toFixed(2)).join(', ')}]`);

            // 변환 행렬 정보
            if (volume.matRAS) {
                console.log("    RAS 변환 행렬:");
                for (let i = 0; i < 16; i += 4) {
                    console.log(`      [${volume.matRAS.slice(i, i + 4).map(v => v.toFixed(3)).join(', ')}]`);
                }
            }
        }

        if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[1]) {
            const segVolume = this.nvMulti.volumes[1];
            console.log("\n  세그멘테이션 볼륨 (volumes[1]):");
            console.log(`    Dimensions: [${segVolume.hdr.dims.slice(1, 4).join(', ')}]`);
            console.log(`    Pixel Dimensions: [${segVolume.hdr.pixDims.slice(1, 4).map(p => p.toFixed(3)).join(', ')}]`);
            console.log(`    Center: [${(segVolume.mmCenter || [0, 0, 0]).map(c => c.toFixed(2)).join(', ')}]`);

            if (segVolume.img) {
                const selectedLabel = this.getSelectedMeshLabel();
                const labelVoxels = Array.from(segVolume.img).filter(v => v === selectedLabel).length;
                const totalVoxels = segVolume.img.length;
                console.log(`    총 복셀 수: ${totalVoxels}`);
                console.log(`    라벨 ${selectedLabel} 복셀 수: ${labelVoxels} (${(labelVoxels / totalVoxels * 100).toFixed(2)}%)`);
            }
        }
    }

    // ✅ 좌표 변환 테스트
    testCoordinateTransforms(mesh) {
        if (!mesh || !mesh.geometry) return;

        console.log("\n🔄 [좌표 변환 테스트]");

        // 메시 중심점을 각 뷰어에 투영
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const meshCenter = new THREE.Vector3();
        geometry.boundingBox.getCenter(meshCenter);

        console.log(`메시 중심점: (${meshCenter.x.toFixed(2)}, ${meshCenter.y.toFixed(2)}, ${meshCenter.z.toFixed(2)})`);

        // Three.js 투영
        if (this.camera) {
            const threeScreenPos = this.projectMeshVertexToScreen(meshCenter, 'threeJS');
            console.log(`Three.js 스크린 좌표: ${threeScreenPos ? `(${threeScreenPos.x.toFixed(2)}, ${threeScreenPos.y.toFixed(2)})` : 'null'}`);
        }

        // NiiVue Render 투영
        if (this.nvRender) {
            const renderScreenPos = this.projectMeshVertexToScreen(meshCenter, 'niivueRender');
            console.log(`NiiVue Render 스크린 좌표: ${renderScreenPos ? `(${renderScreenPos.x.toFixed(2)}, ${renderScreenPos.y.toFixed(2)})` : 'null'}`);
        }

        // NiiVue Multi 투영
        if (this.nvMulti) {
            const multiScreenPos = this.projectMeshVertexToScreen(meshCenter, 'niivueMulti');
            console.log(`NiiVue Multi 스크린 좌표: ${multiScreenPos ? `(${multiScreenPos.x.toFixed(2)}, ${multiScreenPos.y.toFixed(2)})` : 'null'}`);
        }

        // 볼륨 복셀 인덱스 변환
        if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[1]) {
            const volume = this.nvMulti.volumes[1];
            const dims = volume.hdr.dims.slice(1, 4);
            const pixDims = volume.hdr.pixDims.slice(1, 4);
            const center = volume.mmCenter || [0, 0, 0];

            // ✅ 백엔드 메시 변환 역변환 적용
            const correctedMeshCenter = this.applyBackendMeshTransformReverse(meshCenter);
            console.log(`변환된 메시 중심점: (${correctedMeshCenter.x.toFixed(2)}, ${correctedMeshCenter.y.toFixed(2)}, ${correctedMeshCenter.z.toFixed(2)})`);

            // RAS 행렬을 고려한 변환 테스트
            const voxelIndices = this.worldToVoxelIndices(correctedMeshCenter, dims, pixDims, center, volume);
            if (voxelIndices) {
                const { x, y, z } = voxelIndices;
                const idx = x + y * dims[0] + z * dims[0] * dims[1];
                const voxelValue = idx < volume.img.length ? volume.img[idx] : 'out of bounds';

                console.log(`복셀 인덱스: (${x}, ${y}, ${z})`);
                console.log(`복셀 값: ${voxelValue}`);
                console.log(`예상 라벨: ${this.getSelectedMeshLabel()}`);

                // 역변환 테스트 (복셀 -> 월드)
                const backToWorld = this.voxelToWorldCoordinates(x, y, z, volume);
                const distance = meshCenter.distanceTo(backToWorld);
                console.log(`역변환 결과: (${backToWorld.x.toFixed(2)}, ${backToWorld.y.toFixed(2)}, ${backToWorld.z.toFixed(2)})`);
                console.log(`변환 오차: ${distance.toFixed(3)}mm`);

                if (voxelValue !== this.getSelectedMeshLabel() && voxelValue !== 'out of bounds') {
                    console.warn(`⚠️ 메시 중심점의 복셀 값(${voxelValue})이 메시 라벨(${this.getSelectedMeshLabel()})과 다릅니다!`);

                    // 주변 복셀들 검사해서 올바른 라벨 찾기
                    console.log("🔍 주변 복셀 검사:");
                    for (let dz = -2; dz <= 2; dz++) {
                        for (let dy = -2; dy <= 2; dy++) {
                            for (let dx = -2; dx <= 2; dx++) {
                                const nx = x + dx, ny = y + dy, nz = z + dz;
                                if (nx >= 0 && nx < dims[0] && ny >= 0 && ny < dims[1] && nz >= 0 && nz < dims[2]) {
                                    const nIdx = nx + ny * dims[0] + nz * dims[0] * dims[1];
                                    if (nIdx < volume.img.length && volume.img[nIdx] === this.getSelectedMeshLabel()) {
                                        console.log(`  라벨 ${this.getSelectedMeshLabel()} 발견: (${nx}, ${ny}, ${nz}), 거리: ${Math.abs(dx) + Math.abs(dy) + Math.abs(dz)}`);
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                console.warn("⚠️ 볼륨 복셀 인덱스 변환 실패");
            }
        }

        console.log("=".repeat(80));
    }





    // ✅ 메시-볼륨 좌표 정렬 검증 (새로 추가)
    validateMeshVolumeAlignment(mesh) {
        console.log("💡 적용된 coordinateOffset:", this.coordinateOffset,
            "useLPSToRASConversion:", this.useLPSToRASConversion);
        if (!mesh || !this.nvMulti || !this.nvMulti.volumes || !this.nvMulti.volumes[1]) {
            console.warn("⚠️ 메시 또는 볼륨이 없어 정렬 검증을 건너뜁니다.");
            return;
        }

        console.log("\n🔍 [메시-볼륨 정렬 검증]");

        const volume = this.nvMulti.volumes[1];
        const meshLabel = this.getSelectedMeshLabel();

        // 볼륨 크기 정보
        const dims = volume.hdr.dims.slice(1, 4);
        // const pixDims = volume.hdr.pixDims.slice(1, 4);

        // 메시 정점 정보
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position.array;
        const vertexCount = positions.length / 3;

        // 샘플링할 정점 수 설정 (최대 1000개)
        const sampleCount = Math.min(10, vertexCount);
        const sampleIndices = [];
        for (let i = 0; i < sampleCount; i++) {
            const idx = Math.floor((i * vertexCount) / sampleCount);
            sampleIndices.push(idx);
        }

        // 이웃 검사 함수 (3×3×3 주변)
        function hasNeighborLabel(x, y, z, target, vol) {
            for (let dz = -1; dz <= 1; dz++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy, nz = z + dz;
                        if (nx >= 0 && nx < dims[0] &&
                            ny >= 0 && ny < dims[1] &&
                            nz >= 0 && nz < dims[2]) {
                            const nIdx = nx + ny * dims[0] + nz * dims[0] * dims[1];
                            if (vol.img[nIdx] === target) return true;
                        }
                    }
                }
            }
            return false;
        }

        let alignedCount = 0;
        let totalSamples = 0;

        console.log(`📊 정점 샘플링: 총 ${vertexCount}개 정점 중 ${sampleCount}개 샘플 테스트`);

        for (const i of sampleIndices) {
            if (i < 0 || i >= vertexCount) continue;

            // 메시 정점 월드 좌표
            const vertexPos = new THREE.Vector3(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );

            // 백엔드 메시 변환 역적용
            const correctedVertexPos = this.applyBackendMeshTransformReverse(vertexPos);

            // world → voxel 인덱스로 변환
            const voxelPos = this.worldToVoxelWithRAS(correctedVertexPos, volume);
            if (!voxelPos) continue;

            const idx = voxelPos.x + voxelPos.y * dims[0] + voxelPos.z * dims[0] * dims[1];
            if (idx < 0 || idx >= volume.img.length) continue;

            const voxelValue = volume.img[idx];

            // 직접 값 또는 이웃 검사로 매칭 여부 결정
            const match = (voxelValue === meshLabel)
                || hasNeighborLabel(voxelPos.x, voxelPos.y, voxelPos.z, meshLabel, volume);

            console.log(
                `정점 ${i}: 메시(${vertexPos.x.toFixed(1)}, ${vertexPos.y.toFixed(1)}, ${vertexPos.z.toFixed(1)})` +
                ` → 복셀(${voxelPos.x}, ${voxelPos.y}, ${voxelPos.z}) = 값 ${voxelValue}` +
                (match ? " (OK)" : " (miss)")
            );

            if (match) alignedCount++;
            totalSamples++;
        }

        const alignmentRate = totalSamples > 0
            ? (alignedCount / totalSamples * 100)
            : 0;

        console.log(`정렬률: ${alignmentRate.toFixed(1)}% (${alignedCount}/${totalSamples})`);

        if (alignmentRate < 50) {
            console.warn("⚠️ 메시-볼륨 정렬률이 낮습니다! 좌표 변환에 문제가 있을 수 있습니다.");
            this.analyzeMisalignmentCause(mesh, volume, meshLabel);
        } else {
            console.log("✅ 메시-볼륨 정렬이 양호합니다.");
        }
    }

    // ✅ 정렬 불일치 원인 분석
    analyzeMisalignmentCause(mesh, volume, meshLabel) {
        console.log("\n🔬 [정렬 불일치 원인 분석]");

        // RAS 행렬 상태 확인
        if (volume.matRAS && volume.matRAS.length >= 16) {
            console.log("RAS 행렬 존재 확인:", volume.matRAS.slice(0, 12).map(v => v.toFixed(3)).join(', '));
        } else {
            console.warn("⚠️ RAS 행렬이 없습니다. 기본 변환을 사용합니다.");
        }

        // 메시와 볼륨의 좌표계 범위 비교
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const meshBbox = geometry.boundingBox;

        const dims = volume.hdr.dims.slice(1, 4);
        const pixDims = volume.hdr.pixDims.slice(1, 4);
        const center = volume.mmCenter || [0, 0, 0];

        const volumeBbox = {
            min: [
                center[0] - (dims[0] * pixDims[0]) / 2,
                center[1] - (dims[1] * pixDims[1]) / 2,
                center[2] - (dims[2] * pixDims[2]) / 2
            ],
            max: [
                center[0] + (dims[0] * pixDims[0]) / 2,
                center[1] + (dims[1] * pixDims[1]) / 2,
                center[2] + (dims[2] * pixDims[2]) / 2
            ]
        };

        console.log(`메시 범위: (${meshBbox.min.x.toFixed(1)}, ${meshBbox.min.y.toFixed(1)}, ${meshBbox.min.z.toFixed(1)}) ~ (${meshBbox.max.x.toFixed(1)}, ${meshBbox.max.y.toFixed(1)}, ${meshBbox.max.z.toFixed(1)})`);
        console.log(`볼륨 범위: (${volumeBbox.min.map(v => v.toFixed(1)).join(', ')}) ~ (${volumeBbox.max.map(v => v.toFixed(1)).join(', ')})`);

        // 범위 겹침 확인
        const overlapX = Math.max(0, Math.min(meshBbox.max.x, volumeBbox.max[0]) - Math.max(meshBbox.min.x, volumeBbox.min[0]));
        const overlapY = Math.max(0, Math.min(meshBbox.max.y, volumeBbox.max[1]) - Math.max(meshBbox.min.y, volumeBbox.min[1]));
        const overlapZ = Math.max(0, Math.min(meshBbox.max.z, volumeBbox.max[2]) - Math.max(meshBbox.min.z, volumeBbox.min[2]));

        console.log(`좌표 범위 겹침: X=${overlapX.toFixed(1)}, Y=${overlapY.toFixed(1)}, Z=${overlapZ.toFixed(1)}`);

        if (overlapX === 0 || overlapY === 0 || overlapZ === 0) {
            console.error("❌ 메시와 볼륨의 좌표 범위가 겹치지 않습니다! 좌표계 불일치 의심");
        }

        // 실제 라벨 3 복셀들이 어디에 위치하는지 확인
        this.findLabelVoxelPositions(volume, meshLabel);
    }

    // ✅ 특정 라벨의 복셀 위치 찾기 (좌표계 분석용)
    findLabelVoxelPositions(volume, targetLabel) {
        console.log(`\n🔍 [라벨 ${targetLabel} 복셀 위치 분석]`);

        const dims = volume.hdr.dims.slice(1, 4);
        const foundVoxels = [];

        // 첫 10개 라벨 복셀의 위치 찾기
        for (let z = 0; z < dims[2] && foundVoxels.length < 10; z++) {
            for (let y = 0; y < dims[1] && foundVoxels.length < 10; y++) {
                for (let x = 0; x < dims[0] && foundVoxels.length < 10; x++) {
                    const idx = x + y * dims[0] + z * dims[0] * dims[1];
                    if (idx < volume.img.length && volume.img[idx] === targetLabel) {
                        // 복셀 좌표 → 월드 좌표 변환
                        const worldPos = this.voxelToWorldCoordinates(x, y, z, volume);
                        foundVoxels.push({
                            voxel: { x, y, z },
                            world: worldPos,
                            idx: idx
                        });
                    }
                }
            }
        }

        console.log(`발견된 라벨 ${targetLabel} 복셀들:`);
        for (const voxel of foundVoxels) {
            console.log(`  복셀(${voxel.voxel.x}, ${voxel.voxel.y}, ${voxel.voxel.z}) → 월드(${voxel.world.x.toFixed(1)}, ${voxel.world.y.toFixed(1)}, ${voxel.world.z.toFixed(1)})`);
        }

        if (foundVoxels.length > 0) {
            // 라벨 복셀들의 중심점 계산
            const centerWorld = foundVoxels.reduce((acc, voxel) => {
                acc.x += voxel.world.x;
                acc.y += voxel.world.y;
                acc.z += voxel.world.z;
                return acc;
            }, { x: 0, y: 0, z: 0 });

            centerWorld.x /= foundVoxels.length;
            centerWorld.y /= foundVoxels.length;
            centerWorld.z /= foundVoxels.length;

            console.log(`라벨 ${targetLabel} 복셀들의 중심점: (${centerWorld.x.toFixed(1)}, ${centerWorld.y.toFixed(1)}, ${centerWorld.z.toFixed(1)})`);

            // 메시 중심점과 비교
            if (this.selectedMesh) {
                const meshCenter = new THREE.Vector3();
                this.selectedMesh.geometry.computeBoundingBox();
                this.selectedMesh.geometry.boundingBox.getCenter(meshCenter);

                const distance = Math.sqrt(
                    Math.pow(centerWorld.x - meshCenter.x, 2) +
                    Math.pow(centerWorld.y - meshCenter.y, 2) +
                    Math.pow(centerWorld.z - meshCenter.z, 2)
                );

                console.log(`메시 중심점과의 거리: ${distance.toFixed(1)}mm`);

                if (distance > 50) {
                    console.error(`❌ 메시와 볼륨 라벨이 ${distance.toFixed(1)}mm 떨어져 있습니다! 좌표계 불일치 확실`);

                    // ✅ LPS ↔ RAS 좌표계 변환 시도
                    console.log("🔄 LPS ↔ RAS 좌표계 변환 시도...");

                    // LPS → RAS: X와 Y를 반전 (Z는 그대로)
                    const rasConvertedCenter = {
                        x: -centerWorld.x,
                        y: -centerWorld.y,
                        z: centerWorld.z
                    };

                    const rasDistance = Math.sqrt(
                        Math.pow(rasConvertedCenter.x - meshCenter.x, 2) +
                        Math.pow(rasConvertedCenter.y - meshCenter.y, 2) +
                        Math.pow(rasConvertedCenter.z - meshCenter.z, 2)
                    );

                    console.log(`LPS→RAS 변환 후 거리: ${rasDistance.toFixed(1)}mm`);
                    console.log(`변환된 중심점: (${rasConvertedCenter.x.toFixed(1)}, ${rasConvertedCenter.y.toFixed(1)}, ${rasConvertedCenter.z.toFixed(1)})`);

                    if (rasDistance < distance * 0.5) {
                        // LPS → RAS 변환이 효과적인 경우
                        console.log("✅ LPS → RAS 변환이 효과적입니다. 좌표계 변환 적용");
                        this.useLPSToRASConversion = true;
                        this.coordinateOffset = {
                            x: rasConvertedCenter.x - meshCenter.x,
                            y: rasConvertedCenter.y - meshCenter.y,
                            z: rasConvertedCenter.z - meshCenter.z
                        };
                    } else {
                        // 단순 오프셋 보정
                        console.log("💡 단순 오프셋 보정 적용");
                        this.useLPSToRASConversion = false;
                        const offset = {
                            x: centerWorld.x - meshCenter.x,
                            y: centerWorld.y - meshCenter.y,
                            z: centerWorld.z - meshCenter.z
                        };
                        this.coordinateOffset = offset;
                    }

                    console.log(`💡 적용된 좌표 보정값: (${this.coordinateOffset.x.toFixed(1)}, ${this.coordinateOffset.y.toFixed(1)}, ${this.coordinateOffset.z.toFixed(1)})`);

                    // 보정값 저장 (라쏘 편집 시 사용)
                    // this.coordinateOffset = offset;
                } else {
                    // 좌표계가 일치하면 보정값 제거
                    this.coordinateOffset = { x: 0, y: 0, z: 0 };
                }
            }
        } else {
            console.warn(`⚠️ 라벨 ${targetLabel} 복셀을 찾을 수 없습니다.`);
        }
    }

    // ✅ 기존 함수 완전히 교체
    worldToVoxelIndices(worldPos, dims, pixDims, center, volume = null) {
        try {
            // 디버깅 로그 (필요시만 활성화)
            console.log("=== [worldToVoxelIndices 호출] ===");
            console.log("🌍 World Pos:", worldPos);
            console.log("📦 dims:", dims);
            console.log("📏 pixDims:", pixDims);
            console.log("🎯 center:", center);

            let voxelX, voxelY, voxelZ;

            if (volume && volume.matRAS && volume.matRAS.length >= 16) {
                // ✅ worldToVoxelWithRAS와 동일한 방식 사용
                const result = this.worldToVoxelWithRAS(worldPos, volume);
                if (result) {
                    voxelX = result.x;
                    voxelY = result.y;
                    voxelZ = result.z;
                    console.log(`✅ RAS 기반 변환: (${voxelX.toFixed(2)}, ${voxelY.toFixed(2)}, ${voxelZ.toFixed(2)})`);
                }
            }

            // ✅ fallback
            if (voxelX === undefined || isNaN(voxelX)) {
                voxelX = (worldPos.x - center[0]) / pixDims[0] + dims[0] / 2;
                voxelY = (worldPos.y - center[1]) / pixDims[1] + dims[1] / 2;
                voxelZ = (worldPos.z - center[2]) / pixDims[2] + dims[2] / 2;
            }

            // ✅ 반올림 + 클램핑
            voxelX = Math.round(voxelX);
            voxelY = Math.round(voxelY);
            voxelZ = Math.round(voxelZ);

            const clampedX = Math.max(0, Math.min(dims[0] - 1, voxelX));
            const clampedY = Math.max(0, Math.min(dims[1] - 1, voxelY));
            const clampedZ = Math.max(0, Math.min(dims[2] - 1, voxelZ));

            if (voxelX !== clampedX || voxelY !== clampedY || voxelZ !== clampedZ) {
                console.warn(`⚠️ 범위 초과 → 클램핑: (${voxelX}, ${voxelY}, ${voxelZ}) → (${clampedX}, ${clampedY}, ${clampedZ})`);
            }

            console.log(`🎯 최종 Voxel 좌표: (${clampedX}, ${clampedY}, ${clampedZ})`);
            return { x: clampedX, y: clampedY, z: clampedZ };
        } catch (error) {
            console.error("❌ worldToVoxelIndices 변환 실패:", error);
            return null;
        }
    }

    // testMeshVolumeAlignment(mesh, segVolume) {
    //     const dims = segVolume.hdr.dims.slice(1, 4);
    //     const pixDims = segVolume.hdr.pixDims.slice(1, 4);
    //     const center = segVolume.mmCenter || [0, 0, 0];

    //     mesh.geometry.computeBoundingBox();
    //     const meshCenter = new THREE.Vector3();
    //     mesh.geometry.boundingBox.getCenter(meshCenter);

    //     console.log("=== Alignment 테스트 ===");
    //     console.log(`Mesh Center: (${meshCenter.x.toFixed(2)}, ${meshCenter.y.toFixed(2)}, ${meshCenter.z.toFixed(2)})`);

    //     const voxel = this.worldToVoxelIndices(meshCenter, dims, pixDims, center, segVolume);
    //     const idx = voxel.x + voxel.y * dims[0] + voxel.z * dims[0] * dims[1];
    //     const voxelValue = idx < segVolume.img.length ? segVolume.img[idx] : 'out of bounds';

    //     console.log(`Voxel Index: (${voxel.x}, ${voxel.y}, ${voxel.z}), Value: ${voxelValue}`);
    //     console.log(`선택 메시 라벨: ${this.getSelectedMeshLabel()}`);
    // }

    // ✅ RAS 행렬을 이용한 월드 -> 복셀 역변환 (수정됨)
    worldToVoxelWithRAS(worldPos, volume) {
        try {
            console.log("🔍 [worldToVoxelWithRAS] RAS 행렬 3×3 회전부:",
                volume.matRAS?.slice(0, 3),
                volume.matRAS?.slice(4, 7),
                volume.matRAS?.slice(8, 11)
            );
            if (!volume.matRAS || volume.matRAS.length < 16) {
                console.warn("⚠️ RAS 행렬이 없습니다. 기본 변환 사용");
                return this.worldToVoxelIndices(worldPos,
                    volume.hdr.dims.slice(1, 4),
                    volume.hdr.pixDims.slice(1, 4),
                    volume.mmCenter || [0, 0, 0],
                    volume
                );
            }

            const mat = volume.matRAS;

            // Three.js의 Matrix4를 사용하여 역행렬 계산
            const matrix = new THREE.Matrix4();
            matrix.set(
                mat[0], mat[1], mat[2], mat[3],
                mat[4], mat[5], mat[6], mat[7],
                mat[8], mat[9], mat[10], mat[11],
                0, 0, 0, 1
            );

            const invMatrix = matrix.clone().invert();
            const invMat = invMatrix.elements;

            // ✅ 백엔드 메시 변환 역변환 적용
            const backendCorrected = this.applyBackendMeshTransformReverse(worldPos);

            // ✅ 좌표계 보정 적용 (역방향)
            let adjustedX = backendCorrected.x;
            let adjustedY = backendCorrected.y;
            let adjustedZ = backendCorrected.z;

            if (this.coordinateOffset) {
                adjustedX += this.coordinateOffset.x;
                adjustedY += this.coordinateOffset.y;
                adjustedZ += this.coordinateOffset.z;
            }

            // ✅ RAS → LPS 좌표계 변환 적용 (역방향)
            if (this.useLPSToRASConversion) {
                adjustedX = -adjustedX; // X 반전
                adjustedY = -adjustedY; // Y 반전
                // Z는 그대로
            }

            // 월드 좌표를 복셀 좌표로 변환
            const voxelX = invMat[0] * adjustedX + invMat[4] * adjustedY + invMat[8] * adjustedZ + invMat[12];
            const voxelY = invMat[1] * adjustedX + invMat[5] * adjustedY + invMat[9] * adjustedZ + invMat[13];
            const voxelZ = invMat[2] * adjustedX + invMat[6] * adjustedY + invMat[10] * adjustedZ + invMat[14];

            return {
                x: Math.round(voxelX),
                y: Math.round(voxelY),
                z: Math.round(voxelZ)
            };

        } catch (error) {
            console.warn("⚠️ RAS 역변환 실패:", error);
            // 폴백: 기본 변환 사용
            return this.worldToVoxelIndices(worldPos,
                volume.hdr.dims.slice(1, 4),
                volume.hdr.pixDims.slice(1, 4),
                volume.mmCenter || [0, 0, 0],
                volume
            );
        }
    }

    addEventListeners() {
        // ✅ 모든 뷰어에서 라쏘 편집 가능하도록 복원
        this.lassoCanvas.addEventListener('mousedown', this.boundOnMouseDown);
        this.lassoCanvas.addEventListener('mousemove', this.boundOnMouseMove);
        this.lassoCanvas.addEventListener('mouseup', this.boundOnMouseUp);

        // ✅ 볼륨 뷰어 오버레이 이벤트 리스너 복원
        if (this.renderOverlay) {
            this.renderOverlay.addEventListener('mousedown', this.boundOnMouseDown);
            this.renderOverlay.addEventListener('mousemove', this.boundOnMouseMove);
            this.renderOverlay.addEventListener('mouseup', this.boundOnMouseUp);
        }

        if (this.multiOverlay) {
            this.multiOverlay.addEventListener('mousedown', this.boundOnMouseDown);
            this.multiOverlay.addEventListener('mousemove', this.boundOnMouseMove);
            this.multiOverlay.addEventListener('mouseup', this.boundOnMouseUp);
        }

        console.log("✅ 모든 뷰어에 라쏘 편집 이벤트 리스너 추가됨");
    }

    removeEventListeners() {
        // ✅ 모든 뷰어에서 이벤트 리스너 제거
        this.lassoCanvas.removeEventListener('mousedown', this.boundOnMouseDown);
        this.lassoCanvas.removeEventListener('mousemove', this.boundOnMouseMove);
        this.lassoCanvas.removeEventListener('mouseup', this.boundOnMouseUp);

        if (this.renderOverlay) {
            this.renderOverlay.removeEventListener('mousedown', this.boundOnMouseDown);
            this.renderOverlay.removeEventListener('mousemove', this.boundOnMouseMove);
            this.renderOverlay.removeEventListener('mouseup', this.boundOnMouseUp);
        }

        if (this.multiOverlay) {
            this.multiOverlay.removeEventListener('mousedown', this.boundOnMouseDown);
            this.multiOverlay.removeEventListener('mousemove', this.boundOnMouseMove);
            this.multiOverlay.removeEventListener('mouseup', this.boundOnMouseUp);
        }

        console.log("✅ 모든 뷰어에서 라쏘 편집 이벤트 리스너 제거됨");
    }

    onMouseDown(e) {
        // ✅ 현재 캔버스 식별
        this.currentCanvas = e.target.id;
        console.log("🎯 라쏘 시작 - 캔버스:", this.currentCanvas);

        this.resetAllPoints();
        this.clearLassoPath();

        const mousePos = this.getMousePosition(e);

        // ✅ 캔버스별로 포인트 저장
        switch (this.currentCanvas) {
            case 'lassoCanvas':
                this.points.push(mousePos);
                break;
        }

        this.isDrawing = true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.currentCanvas) return;

        const mousePos = this.getMousePosition(e);

        // ✅ 현재 캔버스의 포인트 배열에 추가
        switch (this.currentCanvas) {
            case 'lassoCanvas':
                this.points.push(mousePos);
                break;
        }

        // ✅ 실시간으로 라쏘 그리기 및 동기화
        this.drawLasso();

        // ✅ 실시간 편집 영역 미리보기 (선택적)
        if (this.showEditPreview) {
            this.showLassoPreview();
        }

        // ✅ 가위 아이콘 이동 (어느 캔버스에서든)
        const rect = e.target.getBoundingClientRect();
        this.scissorIcon.style.left = `${e.clientX - rect.left + 10}px`;
        this.scissorIcon.style.top = `${e.clientY - rect.top + 10}px`;
    }


    onMouseUp() {
        if (!this.isDrawing || !this.currentCanvas) return;
        this.isDrawing = false;

        // ✅ 현재 Lasso 상태 로그
        console.log("=== [Lasso onMouseUp 상태 확인] ===");
        console.log("this.currentCanvas:", this.currentCanvas);
        console.log("this.nvMulti:", this.nvMulti);
        console.log("this.nvMulti.volumes:", this.nvMulti?.volumes);
        console.log("this.selectedMesh:", this.selectedMesh);
        console.log("this.editRange:", this.editRange);

        let currentPoints;
        switch (this.currentCanvas) {
            case 'lassoCanvas': currentPoints = this.points; break;
            default: currentPoints = [];
        }

        if (currentPoints.length < 3) {
            console.log("⚠️ 라쏘 선택이 너무 짧습니다.");
            this.clearLassoPath();
            this.resetAllPoints();
            this.currentCanvas = null;
            return;
        }

        console.log(`✅ 라쏘 영역 닫음 (${this.currentCanvas}): ${currentPoints.length}개 포인트`);

        // ✅ 볼륨 데이터 준비 상태 확인
        if (!this.nvMulti || !this.nvMulti.volumes || this.nvMulti.volumes.length < 2 || !this.nvMulti.volumes[1]?.img) {
            console.warn("⚠️ 볼륨 데이터가 준비되지 않았습니다. 볼륨 편집을 건너뜁니다.");
        } else {
            // ✅ 메시 잘라내기 + 편집된 정점 반환
            const editedVertices = this.applyLassoCutAndGetVertices();
            console.log("🎯 editedVertices 개수:", editedVertices.length);

            // 🎯 테스트: 정점 개수와 관계없이 무조건 볼륨 편집 실행
            console.log("🎯 테스트 모드: 정점과 관계없이 볼륨 전체 편집 실행");
            // this.applyVolumeEditFromVertices([]); // 빈 배열 전달해도 볼륨 전체 편집됨
            // this.forceVolumeRefresh(); // ✅ GPU 텍스처 재적용

            if (editedVertices.length > 0) {
                this.applyVolumeEditFromVertices(editedVertices); // 빈 배열 전달해도 볼륨 전체 편집됨
                this.forceVolumeRefresh(); // ✅ GPU 텍스처 재적용
                this.highlightEditedRegion(editedVertices); // ✅ 먼저 시각적으로 표시
            } else {
                console.warn("⚠️ 라쏘 결과에서 편집할 정점이 없지만 테스트 모드로 볼륨 편집 실행됨");
            }
        }

        this.clearLassoPath();
        this.clearPreview();
        this.resetAllPoints();
        this.forceUpdateAllViewers();
        this.currentCanvas = null;

        console.log("✅ 라쏘 편집 완료 및 모든 뷰어 동기화됨");
    }

    getMousePosition(e) {
        // ✅ 어느 캔버스에서 이벤트가 발생했는지 확인
        const rect = e.target.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            target: e.target.id // 어느 캔버스인지 식별
        };
    }

    resetAllPoints() {
        this.points = [];
        this.renderPoints = [];
        this.multiPoints = [];
    }

    // ✅ 현재 캔버스에 해당하는 라쏘 포인트 가져오기
    getCurrentLassoPoints() {
        return this.points;
        switch (this.currentCanvas) {
            case 'lassoCanvas':
                return this.points;
            case 'renderOverlay':
                return this.renderPoints;
            case 'multiOverlay':
                return this.multiPoints;
            default:
                return this.points; // 기본값
        }
    }

    // ✅ 점이 다각형(라쏘 영역) 내부에 있는지 확인 (Ray Casting Algorithm)
    pointInPolygon(point, polygon) {
        const x = point.x, y = point.y;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    drawLasso() {
        // ✅ 시각적 동기화 복원 - 모든 뷰어에서 라쏘 그리기
        if (this.currentCanvas === 'lassoCanvas' && this.points.length > 1) {
            this.drawLassoOnCanvas(this.ctx, this.lassoCanvas, this.points);
        }
    }

    drawLassoOnCanvas(ctx, canvas, points) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (points.length < 2) return;

        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]); // 점선 효과
        ctx.shadowColor = 'rgba(255, 68, 68, 0.5)';
        ctx.shadowBlur = 3;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        // ✅ 실시간으로 시작점과 연결하여 닫힌 영역 표시
        if (points.length > 2) {
            ctx.lineTo(points[0].x, points[0].y);
            ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
            ctx.fill();
        }

        ctx.stroke();

        // 스타일 리셋
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }

    clearLassoPath() {
        this.ctx.clearRect(0, 0, this.lassoCanvas.width, this.lassoCanvas.height);

        // ✅ 볼륨 뷰어 오버레이도 클리어
        if (this.renderCtx) {
            this.renderCtx.clearRect(0, 0, this.renderOverlay.width, this.renderOverlay.height);
        }

        if (this.multiCtx) {
            this.multiCtx.clearRect(0, 0, this.multiOverlay.width, this.multiOverlay.height);
        }
    }

    // 🎨 백엔드 라벨 색상 매핑 (백엔드 app.py와 동일)
    getBackendLabelColorMapping() {
        return {
            1: [238 / 255, 112 / 255, 70 / 255],   // Liver
            2: [238 / 255, 112 / 255, 70 / 255],   // Rt.lobe  
            3: [218 / 255, 108 / 255, 110 / 255],  // RAS
            4: [138 / 255, 117 / 255, 231 / 255],  // RPS
            5: [211 / 255, 255 / 255, 51 / 255],   // Lt.lobe
            6: [255 / 255, 147 / 255, 77 / 255],   // LLS
            7: [185 / 255, 202 / 255, 99 / 255],   // LMS
            8: [79 / 255, 255 / 255, 174 / 255],   // Spigelian
            9: [193 / 255, 157 / 255, 255 / 255],  // PV
            10: [139 / 255, 186 / 255, 255 / 255], // HV
            11: [234 / 255, 36 / 255, 36 / 255],   // Cancer
            12: [95 / 255, 170 / 255, 127 / 255],  // BD
            255: [1.0, 1.0, 1.0]                   // 편집된 부분 - 하얀색
        };
    }

    // 🎨 백엔드 라벨 이름 매핑 (백엔드 app.py와 동일)
    getBackendLabelNameMapping() {
        return {
            1: "Liver",
            2: "Rt.lobe",
            3: "RAS",
            4: "RPS",
            5: "Lt.lobe",
            6: "LLS",
            7: "LMS",
            8: "Spigelian",
            9: "PV",
            10: "HV",
            11: "Cancer",
            12: "BD"
        };
    }

    // 🎨 볼륨 LUT를 백엔드 색상으로 업데이트
    updateVolumeColorsFromBackend() {
        console.log("🎨 updateVolumeColorsFromBackend 호출됨");

        const colorMapping = this.getBackendLabelColorMapping();
        const nameMapping = this.getBackendLabelNameMapping();

        console.log("🎨 백엔드 색상 매핑으로 볼륨 LUT 업데이트 시작");
        // console.log("📋 색상 매핑 데이터:", colorMapping);

        if (!this.nvMulti || !this.nvMulti.volumes || !this.nvMulti.volumes[1]) {
            console.error("❌ 세그멘테이션 볼륨을 찾을 수 없습니다!");
            return;
        }

        const segVolume = this.nvMulti.volumes[1];

        if (!segVolume.lut) {
            console.error("❌ LUT가 없습니다!");
            return;
        }

        // console.log(`📦 현재 LUT 길이: ${segVolume.lut.length}`);
        // console.log(`📦 LUT 타입: ${segVolume.lut.constructor.name}`);
        // console.log(`📦 LUT 처음 값: [${Array.from(segVolume.lut.slice(0, 16)).join(', ')}]`);

        // ✅ 1. LUT 확장 필요 여부 확인
        const maxLabel = Math.max(...Object.keys(colorMapping).map(Number));
        const requiredSize = (maxLabel + 1) * 4;

        if (segVolume.lut.length < requiredSize) {
            console.warn(`⚠️ LUT 확장: 기존 ${segVolume.lut.length} → ${requiredSize}`);
            const newLut = new Uint8Array(requiredSize);
            newLut.set(segVolume.lut); // 기존 LUT 값 복사
            segVolume.lut = newLut;
        }

        let updatedCount = 0;

        // ✅ 2. 색상 업데이트
        for (const [label, color] of Object.entries(colorMapping)) {
            const labelNum = parseInt(label);
            const lutIndex = labelNum * 4;

            if (lutIndex + 3 >= segVolume.lut.length) {
                console.warn(`⚠️ 라벨 ${labelNum}: LUT 인덱스 ${lutIndex} 범위 초과 (길이: ${segVolume.lut.length})`);
                continue;
            }

            const oldRGBA = [
                segVolume.lut[lutIndex],
                segVolume.lut[lutIndex + 1],
                segVolume.lut[lutIndex + 2],
                segVolume.lut[lutIndex + 3]
            ];

            // ✅ RGB 적용 (0-1 → 0-255 변환)
            segVolume.lut[lutIndex] = Math.round(color[0] * 255);
            segVolume.lut[lutIndex + 1] = Math.round(color[1] * 255);
            segVolume.lut[lutIndex + 2] = Math.round(color[2] * 255);
            segVolume.lut[lutIndex + 3] = 255; // Alpha

            const labelName = nameMapping[labelNum] || `Label ${labelNum}`;
            // console.log(`✅ 라벨 ${labelNum} (${labelName}): RGB(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`);
            // console.log(`   이전: RGBA(${oldRGBA.join(', ')})`);
            // console.log(`   이후: RGBA(${segVolume.lut[lutIndex]}, ${segVolume.lut[lutIndex + 1]}, ${segVolume.lut[lutIndex + 2]}, ${segVolume.lut[lutIndex + 3]})`);

            updatedCount++;
        }

        console.log(`🎨 총 ${updatedCount}개 라벨 색상 업데이트 완료`);
        console.log("🔄 볼륨 새로고침 시작...");

        // ✅ 3. Niivue 뷰어 업데이트
        this.forceUpdateAllViewers();
        console.log("✅ 색상 업데이트 프로세스 완료");
    }

    // ✅ 백엔드 메시 변환을 역으로 적용 (메시 → 볼륨 매핑용)
    applyBackendMeshTransformReverse(pos) {
        console.log("🔄 원본 메시 월드 좌표:", pos);
        const reversed = new THREE.Vector3(-pos.x, pos.z, pos.y);
        console.log("🔄 역변환 후 메시 좌표:", reversed);
        return reversed;
    }

    // ✅ 3D 메시 좌표를 각 뷰어의 2D 스크린 좌표로 변환
    projectMeshVertexToScreen(vertex, canvasType) {
        const pos = vertex.clone();

        switch (canvasType) {
            case 'threeJS':
                // ✅ camera null 체크 추가
                if (!this.camera || !this.camera.matrixWorldInverse) {
                    console.warn("⚠️ Three.js 카메라가 준비되지 않음");
                    return null;
                }

                // Three.js 3D → 2D 변환
                pos.project(this.camera);
                return {
                    x: ((pos.x + 1) / 2) * this.lassoCanvas.width,
                    y: ((-pos.y + 1) / 2) * this.lassoCanvas.height
                };

            case 'niivueRender':
                // Niivue Render 뷰어용 변환
                if (!this.nvRender || !this.renderOverlay) return null;
                return this.projectToNiivueRender(pos);

            case 'niivueMulti':
                // Niivue 멀티플레인 뷰어용 변환
                if (!this.nvMulti || !this.multiOverlay) return null;
                return this.projectToNiivueMulti(pos);

            default:
                return null;
        }
    }

    // ✅ Niivue Render 뷰어 좌표 변환
    projectToNiivueRender(worldPos) {
        try {
            console.log(this.nvRender.scene);
            // console.log(Object.keys(this.nvRender.scene.camera));
            const nvCam = this.nvRender.scene.camera;

            // // ↓ 여기를 추가: 카메라 객체 확인
            // console.log("🔍 [nvCam 전체]", nvCam);

            // // 그 후에 올바른 프로퍼티로 대체
            const mvpArr = nvCam.projViewMatrix    // 예시: 실제 이름으로 바꾸세요
                || nvCam.proj_matrix       // 다른 버전에서 쓰는 이름일 수 있습니다
                || nvCam.projectionMatrix; // 또다른 후보
            if (!mvpArr) throw new Error("MVP 행렬 프로퍼티를 찾을 수 없습니다");

            // console.log("🔍 [MVP 배열 첫 요소들]", mvpArr.slice(0, 16));
            const mvpMatrix = new THREE.Matrix4().fromArray(mvpArr);

            const clipPos = worldPos.clone().applyMatrix4(mvpMatrix);
            const w = this.renderOverlay.width, h = this.renderOverlay.height;
            const sx = ((clipPos.x + 1) / 2) * w;
            const sy = ((-clipPos.y + 1) / 2) * h;
            return { x: sx, y: sy };
        }
        catch (e) {
            console.warn("❌ Niivue Render 투영 실패:", e);
            return null;
        }
    }

    // ✅ Niivue 멀티플레인 뷰어 좌표 변환
    projectToNiivueMulti(worldPos) {
        try {
            // 멀티플레인 뷰어는 여러 슬라이스를 동시에 보여주므로
            // 현재 활성 슬라이스 또는 중앙 슬라이스 기준으로 변환
            const volume = this.nvMulti.volumes[0];
            if (!volume) return null;

            // 볼륨의 중심점과 크기 정보 사용
            const center = volume.mmCenter || [0, 0, 0];
            const dims = volume.hdr.dims.slice(1, 4); // [x, y, z]
            const pixDims = volume.hdr.pixDims.slice(1, 4); // [dx, dy, dz]

            // 월드 좌표를 볼륨 좌표계로 변환
            const volPos = worldPos.clone().sub(new THREE.Vector3(...center));

            // 각 축별로 정규화된 좌표 계산
            const normalizedX = (volPos.x / (dims[0] * pixDims[0]) + 0.5);
            const normalizedY = (volPos.y / (dims[1] * pixDims[1]) + 0.5);

            // 멀티플레인 뷰어의 레이아웃에 따른 스크린 좌표 계산
            // (보통 4분할 또는 3분할 레이아웃)
            return {
                x: normalizedX * this.multiOverlay.width * 0.5, // 절반 크기 가정
                y: normalizedY * this.multiOverlay.height * 0.5
            };
        } catch (error) {
            console.warn("⚠️ Niivue Multi 좌표 변환 실패:", error);
            return null;
        }
    }

    // ✅ 라쏘 영역 상세 분석
    analyzeLassoRegion(lassoPoints, volume) {
        if (lassoPoints.length < 3) return;

        console.log("\n🔍 [라쏘 영역 분석]");

        // 스크린 영역 바운딩박스
        const lassoBbox = this.calculateLassoBoundingBox(lassoPoints);
        console.log(`스크린 바운딩박스: (${lassoBbox.minX.toFixed(1)}, ${lassoBbox.minY.toFixed(1)}) - (${lassoBbox.maxX.toFixed(1)}, ${lassoBbox.maxY.toFixed(1)})`);
        console.log(`스크린 영역 크기: ${(lassoBbox.maxX - lassoBbox.minX).toFixed(1)} x ${(lassoBbox.maxY - lassoBbox.minY).toFixed(1)} 픽셀`);

        // 라쏘 중심점의 월드 좌표 변환
        const centerScreen = {
            x: (lassoBbox.minX + lassoBbox.maxX) / 2,
            y: (lassoBbox.minY + lassoBbox.maxY) / 2
        };

        // 현재 캔버스에 따른 역변환
        let worldPoints = [];
        try {
            worldPoints = this.convertScreenToWorldPoints([centerScreen], this.currentCanvas);
            if (worldPoints.length > 0) {
                const worldCenter = worldPoints[0];
                console.log(`라쏘 중심 월드 좌표: (${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}, ${worldCenter.z.toFixed(2)})`);

                // 해당 위치의 복셀 값 확인
                const dims = volume.hdr.dims.slice(1, 4);
                const pixDims = volume.hdr.pixDims.slice(1, 4);
                const center = volume.mmCenter || [0, 0, 0];
                const voxelIndices = this.worldToVoxelIndices(worldCenter, dims, pixDims, center, volume);

                if (voxelIndices) {
                    const idx = voxelIndices.x + voxelIndices.y * dims[0] + voxelIndices.z * dims[0] * dims[1];
                    const voxelValue = idx < volume.img.length ? volume.img[idx] : 'out of bounds';
                    console.log(`라쏘 중심 복셀 값: ${voxelValue} (예상: ${this.getSelectedMeshLabel()})`);
                }
            }
        } catch (error) {
            console.warn("⚠️ 라쏘 중심점 분석 실패:", error);
        }
    }

    // ✅ 라쏘 편집 실패 원인 분석
    diagnoseLassoEditFailure(lassoPoints, volume, targetLabel) {
        console.log("\n🔍 [편집 실패 원인 분석]");

        const dims = volume.hdr.dims.slice(1, 4);
        const pixDims = volume.hdr.pixDims.slice(1, 4);
        const center = volume.mmCenter || [0, 0, 0];
        const closedLasso = [...lassoPoints, lassoPoints[0]];

        let totalVoxelsChecked = 0;
        let targetLabelVoxels = 0;
        let voxelsInLasso = 0;

        // 현재 슬라이스 범위에서 샘플링 검사
        const currentSliceRange = this.getCurrentSliceRange();
        const sampleSize = Math.min(1000, (currentSliceRange.max - currentSliceRange.min + 1) * 50);

        for (let i = 0; i < sampleSize; i++) {
            const z = Math.floor(Math.random() * (currentSliceRange.max - currentSliceRange.min + 1)) + currentSliceRange.min;
            const y = Math.floor(Math.random() * dims[1]);
            const x = Math.floor(Math.random() * dims[0]);

            const idx = x + y * dims[0] + z * dims[0] * dims[1];
            if (idx >= volume.img.length) continue;

            totalVoxelsChecked++;

            const voxelValue = volume.img[idx];
            if (voxelValue === targetLabel) {
                targetLabelVoxels++;

                // 이 복셀이 라쏘 영역에 있는지 확인
                const worldPos = this.voxelToWorldCoordinates(x, y, z, volume);
                console.log("world pos", worldPos);
                
                let screenPos = null;

                switch (this.currentCanvas) {
                    case 'lassoCanvas':
                        screenPos = this.projectMeshVertexToScreen(worldPos, 'threeJS');
                        break;
                    case 'renderOverlay':
                        screenPos = this.projectMeshVertexToScreen(worldPos, 'niivueRender');
                        break;
                    case 'multiOverlay':
                        screenPos = this.projectMeshVertexToScreen(worldPos, 'niivueMulti');
                        break;
                }

                if (screenPos && this.isPointInPolygon(screenPos, closedLasso)) {
                    voxelsInLasso++;
                }
            }
        }

        console.log(`샘플 검사 결과 (${totalVoxelsChecked}개 복셀):`);
        console.log(`  라벨 ${targetLabel} 복셀: ${targetLabelVoxels}개`);
        console.log(`  라쏘 영역 내 라벨 ${targetLabel} 복셀: ${voxelsInLasso}개`);

        if (targetLabelVoxels === 0) {
            console.warn("⚠️ 현재 슬라이스 범위에 해당 라벨의 복셀이 없습니다.");
        } else if (voxelsInLasso === 0) {
            console.warn("⚠️ 라쏘 영역과 볼륨 라벨 영역이 겹치지 않습니다. 좌표 변환 문제일 수 있습니다.");
        }
    }

    // ✅ 라쏘 영역 내의 볼륨 복셀 편집 (개선된 좌표 변환)
    editVolumeWithLasso(volume, lassoPoints, targetLabel) {
        const dims = volume.hdr.dims.slice(1, 4); // [x, y, z]
        const pixDims = volume.hdr.pixDims.slice(1, 4); // [dx, dy, dz]
        const center = volume.mmCenter || [0, 0, 0];

        let editedCount = 0;
        const closedLasso = [...lassoPoints, lassoPoints[0]]; // 라쏘 닫기

        // 현재 표시 중인 슬라이스 범위 계산
        const currentSliceRange = this.getCurrentSliceRange();

        // 선택된 메시의 라벨 정보 정확히 가져오기
        const meshLabel = this.getSelectedMeshLabel();
        console.log(`🏷️ 편집 대상 라벨: ${meshLabel} (메시: ${this.selectedMesh?.name || 'Unknown'})`);

        // 볼륨 편집 모드에 따른 범위 결정
        const editRange = this.volumeEditMode ? this.editRange : 1;
        const actualSliceRange = {
            min: Math.max(0, currentSliceRange.min - editRange),
            max: Math.min(dims[2] - 1, currentSliceRange.max + editRange)
        };

        console.log(`📐 편집 범위: 슬라이스 ${actualSliceRange.min}-${actualSliceRange.max} (총 ${actualSliceRange.max - actualSliceRange.min + 1}개)`);

        // 성능 최적화: 라쏘 영역의 바운딩박스 계산
        const lassoBbox = this.calculateLassoBoundingBox(closedLasso);

        const pointsInWorldCoord = [];

        for (let z = actualSliceRange.min; z <= actualSliceRange.max; z++) {
            for (let y = 0; y < dims[1]; y++) {
                for (let x = 0; x < dims[0]; x++) {
                    const idx = x + y * dims[0] + z * dims[0] * dims[1];

                    if (idx >= volume.img.length) continue;

                    // 현재 복셀의 라벨 값
                    const currentVoxelLabel = volume.img[idx];

                    // 편집 대상인지 확인 (선택된 메시의 라벨과 일치하는 복셀만)
                    if (currentVoxelLabel !== meshLabel && currentVoxelLabel !== 0) continue;

                    // 배경(0)이 아닌 경우, 타겟 라벨과 일치해야 편집 가능
                    if (currentVoxelLabel !== 0 && currentVoxelLabel !== meshLabel) continue;

                    // ✅ RAS 행렬을 고려한 정확한 월드 좌표 계산
                    const worldPos = this.voxelToWorldCoordinates(x, y, z, volume);
                    pointsInWorldCoord.push(worldPos);


                    // 현재 캔버스 타입에 따라 스크린 좌표 변환
                    let screenPos = null;
                    switch (this.currentCanvas) {
                        case 'lassoCanvas':
                            screenPos = this.projectMeshVertexToScreen(worldPos, 'threeJS');
                            break;
                        case 'renderOverlay':
                            screenPos = this.projectMeshVertexToScreen(worldPos, 'niivueRender');
                            break;
                        case 'multiOverlay':
                            screenPos = this.projectMeshVertexToScreen(worldPos, 'niivueMulti');
                            break;
                    }

                    // 성능 최적화: 바운딩박스 체크 먼저
                    if (screenPos && this.isPointInBoundingBox(screenPos, lassoBbox)) {
                        // 라쏘 영역 내부에 있는지 정확히 확인
                        if (this.isPointInPolygon(screenPos, closedLasso)) {
                            // ✅ 편집 방식 개선: 라쏘 영역의 모든 복셀을 메시 라벨로 설정
                            if (currentVoxelLabel !== meshLabel) {
                                // 처음 10개 로그 출력 (라쏘 편집 확인용)
                                if (editedCount < 10) {
                                    console.log(`🎯 라쏘 복셀 편집: (${x},${y},${z}) ${currentVoxelLabel} → ${meshLabel}`);
                                }
                                volume.img[idx] = meshLabel;
                                editedCount++;
                            }
                        }
                    }
                }
            }
        }
        console.log("볼륨의 월드 좌표들", pointsInWorldCoord);

        console.log(`✂️ 볼륨 편집 완료: ${editedCount}개 복셀 수정 (라벨 ${meshLabel})`);
        return editedCount;
    }

    // ✅ RAS 행렬을 고려한 복셀 -> 월드 좌표 변환 (수정됨)
    voxelToWorldCoordinates(voxelX, voxelY, voxelZ, volume) {
        // console.log("🔁 [voxelToWorld] 입력 voxel:", { voxelX, voxelY, voxelZ });
        // console.log("🔁 matRAS 사용여부:", !!volume.matRAS);
        // console.log("🔁 RAS 행렬:", volume.matRAS?.slice(0, 12));
        const dims = volume.hdr.dims.slice(1, 4);
        const pixDims = volume.hdr.pixDims.slice(1, 4);
        const center = volume.mmCenter || [0, 0, 0]; // NVImage 에서 mmCenter 속성은 존재하지 않음.


        // RAS 행렬이 있으면 우선 사용
        if (volume.matRAS && volume.matRAS.length >= 16) {
            const mat = volume.matRAS;

            // 복셀 좌표를 직접 RAS 행렬로 변환
            // [x y z 1] * matRAS = [worldX worldY worldZ 1]
            // -209.6519928 , -131.20599365, -191.88299561
            let worldX = mat[0] * voxelX + mat[1] * voxelY + mat[2] * voxelZ + (-209.6519928);
            let worldY = mat[4] * voxelX + mat[5] * voxelY + mat[6] * voxelZ + (-131.20599365);
            let worldZ = mat[8] * voxelX + mat[9] * voxelY + mat[10] * voxelZ + (-191.88299561);

            // ✅ LPS → RAS 좌표계 변환 적용
            // if (this.useLPSToRASConversion) {
            //     worldX = -worldX; // X 반전
            //     worldY = -worldY; // Y 반전
            //     // Z는 그대로
            // }

            // ✅ 좌표계 보정 적용
            // if (this.coordinateOffset) {
            //     worldX -= this.coordinateOffset.x;
            //     worldY -= this.coordinateOffset.y;
            //     worldZ -= this.coordinateOffset.z;
            // }

            return new THREE.Vector3(worldX, worldY, worldZ);
        }

        // RAS 행렬이 없으면 기본 변환 사용
        let worldX = (voxelX) * pixDims[0]
        let worldY = (voxelY) * pixDims[1]
        let worldZ = (voxelZ) * pixDims[2]

        // ✅ LPS → RAS 좌표계 변환 적용
        if (this.useLPSToRASConversion) {
            worldX = -worldX; // X 반전
            worldY = -worldY; // Y 반전
            // Z는 그대로
        }

        // ✅ 좌표계 보정 적용
        // if (this.coordinateOffset) {
        //     worldX -= this.coordinateOffset.x;
        //     worldY -= this.coordinateOffset.y;
        //     worldZ -= this.coordinateOffset.z;
        // }

        const world = new THREE.Vector3(worldX, worldY, worldZ);
        // 최종 보정값 적용 이후
        console.log(
            "[voxel→world 최종]",
            "voxel:", voxelX, voxelY, voxelZ,
            "→ world:", world.toArray(),
            "useLPSToRAS:", this.useLPSToRASConversion,
            "offset:", this.coordinateOffset
        );

        return new THREE.Vector3(worldX, worldY, worldZ);
    }

    // ✅ 라쏘 영역의 바운딩박스 계산 (성능 최적화용)
    calculateLassoBoundingBox(lassoPoints) {
        if (lassoPoints.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const point of lassoPoints) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        return { minX, minY, maxX, maxY };
    }

    // ✅ 점이 바운딩박스 내부에 있는지 빠른 체크
    isPointInBoundingBox(point, bbox) {
        if (!bbox) return true; // 바운딩박스가 없으면 항상 true

        return point.x >= bbox.minX && point.x <= bbox.maxX &&
            point.y >= bbox.minY && point.y <= bbox.maxY;
    }

    // ✅ 선택된 메시의 라벨 값을 정확히 가져오기
    getSelectedMeshLabel() {
        if (!this.selectedMesh) return 1;

        // 다양한 라벨 속성에서 값 찾기
        const mesh = this.selectedMesh;

        // userData에서 라벨 찾기
        if (mesh.userData) {
            if (mesh.userData.label !== undefined) return mesh.userData.label;
            if (mesh.userData.labelValue !== undefined) return mesh.userData.labelValue;
            if (mesh.userData.labelName !== undefined) {
                // 라벨 이름에서 숫자 추출
                const match = mesh.userData.labelName.match(/\d+/);
                if (match) return parseInt(match[0]);
            }
        }

        // 직접 라벨 속성
        if (mesh.label !== undefined) return mesh.label;
        if (mesh.labelValue !== undefined) return mesh.labelValue;

        // 메시 이름에서 라벨 추출
        if (mesh.name) {
            const match = mesh.name.match(/label[_-]?(\d+)/i) || mesh.name.match(/(\d+)/);
            if (match) return parseInt(match[1] || match[0]);
        }

        // 기본값
        console.warn("⚠️ 메시 라벨을 찾을 수 없어 기본값 1 사용");
        return 1;
    }

    // ✅ 볼륨 편집 범위 설정
    setVolumeEditRange(range) {
        this.editRange = Math.max(1, Math.min(10, range));
        console.log(`📐 볼륨 편집 범위: ±${this.editRange} 슬라이스`);
    }

    // ✅ 모든 뷰어 동기화 강제 업데이트
    forceUpdateAllViewers() {
        try {
            if (this.nvMulti) {
                console.log("  forceUpdateAllViewers: nvMulti 강제 업데이트");
                try {
                    // ✅ 세그멘테이션이 오버레이 볼륨일 가능성이 높으므로 index 지정
                    const segIndex = this.nvMulti.volumes.length - 1; // 마지막 볼륨(오버레이)
                    this.nvMulti.updateGLVolume(segIndex);
                    console.log(`  ✅ nvMulti updateGLVolume 성공 (index: ${segIndex})`);
                } catch (error) {
                    console.warn("  ⚠️ nvMulti updateGLVolume 실패, drawScene으로 대체");
                }
                this.nvMulti.drawScene(); // ✅ 항상 호출
            }

            if (this.nvRender) {
                console.log("  forceUpdateAllViewers: nvRender 강제 업데이트");
                try {
                    this.nvRender.updateGLVolume(); // render는 보통 단일 볼륨
                    console.log("  ✅ nvRender updateGLVolume 성공");
                } catch (error) {
                    console.warn("  ⚠️ nvRender updateGLVolume 실패, drawScene으로 대체");
                }
                this.nvRender.drawScene(); // ✅ 항상 호출
            }

            if (this.topLeftView) {
                this.topLeftView.updateGLVolume();
                this.topLeftView.drawScene();
            }

            console.log("🔄 모든 뷰어 동기화 완료");
        } catch (error) {
            console.warn("⚠️ 뷰어 동기화 실패:", error);
        }
    }

    // 💪 강력한 볼륨 새로고침
    async forceVolumeRefresh() {
        try {
            console.log("💪 강력한 볼륨 새로고침 시도...");

            // ✅ 두 인스턴스를 배열로 관리
            const viewers = [this.nvMulti, this.nvRender];

            for (let viewer of viewers) {
                if (!viewer || !viewer.volumes || viewer.volumes.length < 2) continue;

                const segVolume = viewer.volumes[1]; // index 1: segmentation
                if (segVolume && segVolume.img) {
                    console.log(`🔄 볼륨 GPU 업데이트 (${viewer === this.nvMulti ? 'nvMulti' : 'nvRender'})`);

                    // ✅ 1단계: dirty 플래그로 GPU 동기화 요청
                    segVolume.dirty = true;

                    // ✅ 2단계: GPU 텍스처 강제 갱신
                    try {
                        viewer.updateGLVolume(1);
                    } catch (e) {
                        console.warn("⚠️ updateGLVolume 실패, 대체 방식 시도");
                    }

                    // ✅ 3단계: 화면 강제 재렌더링
                    viewer.drawScene();

                    // ✅ 선택적: replaceVolume 사용 (더 강력, 메모리 부담 가능)
                    // await viewer.replaceVolume(1, segVolume.img);

                    console.log(`✅ 볼륨 새로고침 완료 (${viewer === this.nvMulti ? 'nvMulti' : 'nvRender'})`);
                }
            }
        } catch (error) {
            console.warn("⚠️ 강력한 볼륨 새로고침 실패:", error);
        }
    }

    // ✅ 현재 표시 중인 슬라이스 범위 계산
    getCurrentSliceRange() {
        try {
            if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[0]) {
                const volume = this.nvMulti.volumes[0];
                const dims = volume.hdr.dims.slice(1, 4);

                // 현재 슬라이스 위치 기반으로 편집 범위 계산
                const scene = this.nvMulti.scene;
                const currentSlice = {
                    sagittal: Math.round(scene.crosshairPos[0] * dims[0]),
                    coronal: Math.round(scene.crosshairPos[1] * dims[1]),
                    axial: Math.round(scene.crosshairPos[2] * dims[2])
                };

                // 편집 범위를 현재 슬라이스 ± 몇 슬라이스로 제한
                const editRange = 2; // 편집할 슬라이스 범위

                return {
                    min: Math.max(0, currentSlice.axial - editRange),
                    max: Math.min(dims[2] - 1, currentSlice.axial + editRange)
                };
            }
        } catch (error) {
            console.warn("⚠️ 슬라이스 범위 계산 실패:", error);
        }

        // 기본값: 전체 볼륨 편집
        const volume = this.nvMulti?.volumes?.[0];
        const dims = volume?.hdr?.dims?.slice(1, 4) || [100, 100, 100];
        return { min: 0, max: dims[2] - 1 };
    }

    // ✅ 메시 편집을 수행하고 편집된 정점들을 반환
    applyLassoCutAndGetVertices() {
        if (!this.selectedMesh || this.points.length < 3) return [];

        if (this.selectedMesh.type === "Group") {
            console.warn("⚠️ Group 메시에는 직접 편집 불가. 병합 후 처리 필요");
            return [];
        }

        // ✅ 원본 상태 저장
        this.undoManager.pushState(this.selectedMesh);

        const geom = this.selectedMesh.geometry.clone();
        if (!geom.attributes.position) {
            console.warn("⚠️ geometry에 position 없음");
            return [];
        }

        const positions = geom.attributes.position.array;

        if (!geom.index) {
            const vertexCount = positions.length / 3;
            const newIndexArray = Array.from({ length: vertexCount }, (_, i) => i);
            geom.setIndex(newIndexArray);
        }

        const index = Array.from(geom.index.array);
        const newIndex = [];
        const editedVertices = []; // 편집된 정점들 저장

        // ✅ 라쏘 영역 닫기
        const closedPoints = [...this.points, this.points[0]];

        // ✅ 버텍스가 라쏘 내부에 있는지 확인하는 함수

        const vertexies = [];
        const vertsInLasso = (vertexIndex) => {
            const vx = positions[vertexIndex * 3];
            const vy = positions[vertexIndex * 3 + 1];
            const vz = positions[vertexIndex * 3 + 2];

            const worldVertex = new THREE.Vector3(vx, vy, vz);
            vertexies.push(worldVertex);
            const screenPos = this.projectMeshVertexToScreen(worldVertex, 'threeJS');

            if (!screenPos) return false;

            return this.isPointInPolygon(screenPos, closedPoints);
        };


        
        // ✅ 삼각형 필터링 및 편집된 정점 수집
        for (let i = 0; i < index.length; i += 3) {
            const a = index[i], b = index[i + 1], c = index[i + 2];

            const aInLasso = vertsInLasso(a);
            const bInLasso = vertsInLasso(b);
            const cInLasso = vertsInLasso(c);

            if (i < 3) {
                console.log(`삼각형 ${i / 3}: 정점 ${a} (${positions[a * 3]}, ${positions[a * 3 + 1]}, ${positions[a * 3 + 2]})`);
                console.log(`삼각형 ${i / 3}: 정점 ${b} (${positions[b * 3]}, ${positions[b * 3 + 1]}, ${positions[b * 3 + 2]})`);
                console.log(`삼각형 ${i / 3}: 정점 ${c} (${positions[c * 3]}, ${positions[c * 3 + 1]}, ${positions[c * 3 + 2]})`);
            }

            // 라쏘 영역에 있는 정점들을 편집된 정점 리스트에 추가
            if (aInLasso) editedVertices.push(new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]));
            if (bInLasso) editedVertices.push(new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]));
            if (cInLasso) editedVertices.push(new THREE.Vector3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]));

            // 라쏘 영역 밖의 삼각형만 유지
            if (!(aInLasso || bInLasso || cInLasso)) {
                newIndex.push(a, b, c);
            }
        }

        console.log("매시의 월드기준 정점 좌표들", vertexies);

        console.log(`✂️ 메시 편집: ${index.length / 3}개 → ${newIndex.length / 3}개 삼각형`);
        console.log(`📍 편집된 정점: ${editedVertices.length}개`);

        geom.setIndex(newIndex);
        geom.computeVertexNormals();
        this.selectedMesh.geometry = geom;

        // 중복 정점 제거
        const uniqueVertices = this.removeDuplicateVertices(editedVertices);
        console.log(`📍 고유 편집 정점: ${uniqueVertices.length}개`);

        return uniqueVertices;
    }

    // ✅ 중복 정점 제거
    removeDuplicateVertices(vertices, tolerance = 0.01) {
        const unique = [];

        for (const vertex of vertices) {
            let isDuplicate = false;
            for (const existing of unique) {
                if (vertex.distanceTo(existing) < tolerance) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                unique.push(vertex);
            }
        }

        return unique;
    }

    // ✅ 단일 볼륨 데이터 편집
    editSingleVolumeData(volume, viewerName) {
        if (!volume.img || volume.img.length === 0) {
            console.warn(`⚠️ ${viewerName} 볼륨 데이터가 없습니다.`);
            return;
        }

        const editModeText = this.volumeEditFullMode ? "볼륨 전체" : "라쏘 영역 내";

        let changedVoxels = 0;

        if (this.volumeEditFullMode) {
            // ✅ 전체 편집 모드: 모든 비배경 복셀을 255로 변경
            console.log("🔧 전체 편집 모드: 모든 비배경 복셀을 255로 변경");
            for (let i = 0; i < volume.img.length; i++) {
                if (volume.img[i] !== 0) { // 배경이 아닌 복셀만 변경
                    volume.img[i] = 255; // 편집된 부분으로 변경
                    changedVoxels++;
                }
            }
        } else {
            // ✅ 부분 편집 모드: 라쏘 영역 내 복셀만 255로 변경
            console.log("🔧 부분 편집 모드: 라쏘 영역 내 복셀만 변경");

            // 라쏘 포인트 가져오기 - 현재 캔버스에 따라 다른 포인트 사용
            const currentPoints = this.getCurrentLassoPoints();
            console.log("📍 현재 라쏘 포인트 개수:", currentPoints.length);
            console.log("📍 현재 캔버스:", this.currentCanvas);

            // 라쏘 포인트 샘플 출력
            console.log("📍 라쏘 포인트 샘플 (처음 5개):");
            for (let i = 0; i < Math.min(5, currentPoints.length); i++) {
                console.log(`  포인트 ${i}: (${currentPoints[i].x.toFixed(1)}, ${currentPoints[i].y.toFixed(1)})`);
            }

            if (currentPoints.length < 3) {
                console.warn("⚠️ 라쏘 포인트가 부족합니다 (최소 3개 필요)");
                return;
            }

            const dims = volume.hdr.dims.slice(1, 4);
            const pixDims = volume.hdr.pixDims.slice(1, 4);
            const center = volume.mmCenter || [0, 0, 0];

            console.log("📐 볼륨 정보:");
            console.log("  - dims:", dims);
            console.log("  - pixDims:", pixDims);
            console.log("  - center:", center);
            console.log("  - 총 복셀 수:", dims[0] * dims[1] * dims[2]);

            // 각 복셀을 확인하여 라쏘 영역 내에 있으면 255로 변경
            let totalChecked = 0;

            console.log("🔍 복셀 스캔 시작...");

            const worldPos = this.voxelToWorldCoordinates(0, 0, 0, volume);
            console.log("첫번째 볼셀 월드 좌표 ",this.currentCanvas,  worldPos);
            console.log("rat 행렬 값", volume.matRAS);
            console.log("오프셋 좌표", this.coordinateOffset);
            console.log("화면 좌표", this.projectMeshVertexToScreen(worldPos, 'threeJS'));

            console.log('복셀 중간 좌표');
            const centerVoxel = [Math.floor(dims[0] / 2), Math.floor(dims[1] / 2), Math.floor(dims[2] / 2)];
            console.log(`중간 복셀 좌표: (${centerVoxel[0]}, ${centerVoxel[1]}, ${centerVoxel[2]})`);
            const centerWorldPos = this.voxelToWorldCoordinates(centerVoxel[0], centerVoxel[1], centerVoxel[2], volume);
            console.log(`중간 복셀 월드 좌표: `, centerWorldPos);
            const centerScreenPos = this.projectMeshVertexToScreen(centerWorldPos, this.currentCanvas);
            console.log(`중간 복셀 스크린 좌표: `, centerScreenPos);
            

            for (let z = 0; z < dims[2]; z++) {
                for (let y = 0; y < dims[1]; y++) {
                    for (let x = 0; x < dims[0]; x++) {
                        const idx = x + y * dims[0] + z * dims[0] * dims[1];

                        if (idx >= volume.img.length || volume.img[idx] === 0) continue;

                        totalChecked++;

                        // 복셀을 월드 좌표로 변환
                        const worldPos = this.voxelToWorldCoordinates(x, y, z, volume);

                        // 현재 캔버스에 따라 스크린 좌표로 변환
                        const screenPos = this.projectMeshVertexToScreen(worldPos, 'threeJS');
                        if (screenPos) {

                            // 라쏘 영역 내에 있는지 확인
                            
                            const isInside = this.pointInPolygon(screenPos, currentPoints);

                            if (isInside && this.selectedMesh.userData.label == volume.img[idx]) {
                                volume.img[idx] = 0; // 편집된 부분으로 변경
                                changedVoxels++;
                            }
                        } else if (totalChecked <= 5) {
                            console.log(`❌ 좌표 변환 실패 ${totalChecked}: 복셀(${x},${y},${z}) → 월드(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)}) → 스크린: null`);
                        }
                    }
                }
            }

            console.log("📊 부분 편집 통계:");
            console.log(`  - 총 검사한 복셀: ${totalChecked}개`);
            console.log(`  - 변경된 복셀: ${changedVoxels}개`);
        }

        console.log(`✅ ${viewerName} 테스트 완료: ${changedVoxels}개 복셀을 투명(0)으로 변경했습니다.`);

        // LUT에서 0번 인덱스 색상 확인 (투명)
        if (volume.lut && volume.lut.length > 0) {
            const lutIndex = 0 * 4;
            console.log(`🎨 ${viewerName} LUT[0] 색상 확인 (투명):`);
            console.log(`  R: ${volume.lut[lutIndex]}`);
            console.log(`  G: ${volume.lut[lutIndex + 1]}`);
            console.log(`  B: ${volume.lut[lutIndex + 2]}`);
            console.log(`  A: ${volume.lut[lutIndex + 3]}`);
        } else {
            console.warn(`⚠️ ${viewerName} LUT가 없습니다.`);
        }

        // 강제로 indexedColors 활성화 및 속성 재설정
        console.log(`🔧 ${viewerName} 볼륨 속성 강제 재설정...`);
        volume.indexedColors = true;
        volume.colormap = "seg";
        volume.cal_min = 0;
        volume.cal_max = 255;
        volume.alphaThreshold = 0.0;
        volume.opacity = 1.0;

        // 강제로 텍스처 재생성을 위해 속성 변경
        volume.needsUpdate = true;
        if (volume.gl) {
            volume.gl.deleteTexture(volume.gl.volumeTexture);
            volume.gl.volumeTexture = null;
        }

        console.log(`📦 ${viewerName} 재설정 후 볼륨 상태:`);
        console.log("  - indexedColors:", volume.indexedColors);
        console.log("  - colormap:", volume.colormap);
        console.log("  - needsUpdate:", volume.needsUpdate);
        console.log("  - opacity:", volume.opacity);
    }

    // LassoEditor 클래스 내부에 추가
    logAxisDirection() {
        if (!this.selectedMesh || !this.camera) {
            console.warn("⚠️ 메시나 카메라가 없어 방향 로그를 건너뜁니다.");
            return;
        }

        console.log("\n🔍 [축 방향 매핑 확인]");

        // 메시 로컬축(메시 중심 기준)
        const axes = {
            "로컬 +X (Right)": new THREE.Vector3(1, 0, 0),
            "로컬 –X (Left)": new THREE.Vector3(-1, 0, 0),
            "로컬 +Y (Up)": new THREE.Vector3(0, 1, 0),
            "로컬 –Y (Down)": new THREE.Vector3(0, -1, 0),
            "로컬 +Z (Front)": new THREE.Vector3(0, 0, 1),
            "로컬 –Z (Back)": new THREE.Vector3(0, 0, -1),
        };

        // 메시 중심 월드 좌표
        const center = new THREE.Vector3();
        this.selectedMesh.geometry.computeBoundingBox();
        this.selectedMesh.geometry.boundingBox.getCenter(center);
        this.selectedMesh.localToWorld(center);

        for (const [name, dir] of Object.entries(axes)) {
            // 축 방향 단위 벡터를 메시 중심에서 멀리 뽑아낸 점
            const worldPoint = center.clone().add(dir.clone().multiplyScalar(10));
            // Three.js 뷰(screen) 좌표
            const screenThree = this.projectMeshVertexToScreen(worldPoint, 'threeJS');
            // Niivue Render 뷰(screen) 좌표
            const screenRender = this.projectMeshVertexToScreen(worldPoint, 'niivueRender');
            // Niivue Multi 뷰(screen) 좌표
            const screenMulti = this.projectMeshVertexToScreen(worldPoint, 'niivueMulti');

            console.log(`${name} → Three.js: ${screenThree ? `(${screenThree.x.toFixed(1)},${screenThree.y.toFixed(1)})` : "null"}, ` +
                `Render: ${screenRender ? `(${screenRender.x.toFixed(1)},${screenRender.y.toFixed(1)})` : "null"}, ` +
                `Multi: ${screenMulti ? `(${screenMulti.x.toFixed(1)},${screenMulti.y.toFixed(1)})` : "null"}`);
        }
    }

    // ✅ 두 뷰어 모두 업데이트
    updateBothViewers() {
        console.log("🔄 두 뷰어 업데이트 시작...");

        // 멀티플레인 뷰어 강제 updateGLVolume 호출
        try {
            console.log("🔧 멀티플레인 뷰어 강제 updateGLVolume 호출...");
            this.nvMulti.updateGLVolume();
            console.log("✅ 멀티플레인 updateGLVolume 성공");
        } catch (error) {
            console.warn("⚠️ 멀티플레인 updateGLVolume 실패:", error);
        }

        // 렌더 뷰어 강제 updateGLVolume 호출
        if (this.nvRender) {
            try {
                console.log("🔧 렌더 뷰어 강제 updateGLVolume 호출...");
                this.nvRender.updateGLVolume();
                console.log("✅ 렌더 뷰어 updateGLVolume 성공");
            } catch (error) {
                console.warn("⚠️ 렌더 뷰어 updateGLVolume 실패:", error);
            }
        }


        // 화면 다시 그리기
        this.nvMulti.drawScene();
        if (this.nvRender) {
            this.nvRender.drawScene();
        }
        console.log("✅ 모든 볼륨 뷰어 업데이트 완료");
    }

    clearPreview() {
        if (this.previewMesh) {
            this.scene.remove(this.previewMesh);
            this.previewMesh.geometry.dispose();
            this.previewMesh.material.dispose();
            this.previewMesh = null;
        }
    }

    // ✅ 볼륨 투명도 업데이트 (편집된 영역 시각화)
    updateVolumeTransparency(editedVoxels) {
        if (editedVoxels === 0) return;

        try {
            const selectedLabel = this.getSelectedMeshLabel();

            // 편집 결과를 명확하게 시각화 (투명도 대신 완전 제거/추가)
            console.log(`🎨 편집된 영역: ${editedVoxels}개 복셀 추가/제거됨`);

            // 투명도 업데이트 건너뛰고 직접적인 편집 결과로 시각화
            this.updateLabelTransparency(selectedLabel, 0.1);

            console.log(`🔍 라벨 ${selectedLabel} 투명도 업데이트 (편집된 영역 시각화)`);

        } catch (error) {
            console.warn("⚠️ 볼륨 투명도 업데이트 실패:", error);
        }
    }

    // ✅ 특정 라벨의 투명도 업데이트
    updateLabelTransparency(label, opacity) {
        const alphaValue = Math.round(opacity * 255);
        console.log(`🎨 투명도 업데이트: 라벨 ${label}, 투명도 ${opacity} (알파값: ${alphaValue})`);

        // 멀티플레인 뷰어 업데이트
        if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[1]) {
            const segVolume = this.nvMulti.volumes[1];
            console.log(`📦 nvMulti segVolume LUT 길이: ${segVolume.lut ? segVolume.lut.length : 'null'}`);

            if (segVolume.lut) {
                const lutIndex = label * 4 + 3;
                console.log(`📍 LUT 인덱스 ${lutIndex} (라벨 ${label} 알파 채널)`);

                if (lutIndex < segVolume.lut.length) {
                    const oldValue = segVolume.lut[lutIndex];
                    segVolume.lut[lutIndex] = alphaValue;
                    console.log(`✅ nvMulti LUT[${lutIndex}]: ${oldValue} → ${alphaValue}`);

                    // LUT 변경 후 볼륨 설정 확인
                    console.log(`📊 볼륨 설정: opacity=${segVolume.opacity}, colormapInvert=${segVolume.colormapInvert}`);
                } else {
                    console.warn(`⚠️ nvMulti LUT 인덱스 ${lutIndex}가 범위를 벗어남 (길이: ${segVolume.lut.length})`);
                }
            }
        }

        // 렌더 뷰어 업데이트
        if (this.nvRender && this.nvRender.volumes && this.nvRender.volumes[0]) {
            const renderVolume = this.nvRender.volumes[0];
            console.log(`📦 nvRender volume LUT 길이: ${renderVolume.lut ? renderVolume.lut.length : 'null'}`);

            if (renderVolume.lut) {
                const lutIndex = label * 4 + 3;
                if (lutIndex < renderVolume.lut.length) {
                    const oldValue = renderVolume.lut[lutIndex];
                    renderVolume.lut[lutIndex] = alphaValue;
                    console.log(`✅ nvRender LUT[${lutIndex}]: ${oldValue} → ${alphaValue}`);
                } else {
                    console.warn(`⚠️ nvRender LUT 인덱스 ${lutIndex}가 범위를 벗어남 (길이: ${renderVolume.lut.length})`);
                }
            }
        }

        // 💡 대안: 볼륨 전체 투명도 조정 시도
        if (this.nvMulti && this.nvMulti.volumes && this.nvMulti.volumes[1]) {
            const segVolume = this.nvMulti.volumes[1];
            console.log(`💡 볼륨 전체 투명도 시도: 현재 opacity=${segVolume.opacity}`);

            // 편집된 라벨의 영역만 투명하게 하기 위해 전체 볼륨 투명도 조정
            if (segVolume.opacity === undefined || segVolume.opacity === 1.0) {
                segVolume.opacity = 0.8; // 전체적으로 약간 투명하게
                console.log(`💡 볼륨 전체 투명도 조정: opacity → 0.8`);
            }
        }

        // 💪 강력한 볼륨 업데이트 시도
        this.forceVolumeRefresh();

        // 강제로 볼륨 업데이트
        this.forceUpdateAllViewers();
    }

    // ✅ 편집된 영역 하이라이트
    highlightEditedRegion(editedVertices) {
        if (!editedVertices || editedVertices.length === 0) return;

        try {
            // 편집된 영역을 표시하는 임시 포인트 클라우드 생성
            const highlightGeometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];

            for (const vertex of editedVertices) {
                positions.push(vertex.x, vertex.y, vertex.z);
                colors.push(1, 0, 0); // 빨간색으로 하이라이트
            }

            highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            highlightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const highlightMaterial = new THREE.PointsMaterial({
                size: 5,
                vertexColors: true,
                transparent: true,
                opacity: 0.8
            });

            // 기존 하이라이트 제거
            if (this.editHighlight) {
                this.scene.remove(this.editHighlight);
                this.editHighlight.geometry.dispose();
                this.editHighlight.material.dispose();
            }

            this.editHighlight = new THREE.Points(highlightGeometry, highlightMaterial);
            this.scene.add(this.editHighlight);

            // 3초 후 자동 제거
            setTimeout(() => {
                this.clearEditHighlight();
            }, 3000);

            console.log(`✨ 편집 영역 하이라이트: ${editedVertices.length}개 정점`);

        } catch (error) {
            console.warn("⚠️ 편집 영역 하이라이트 실패:", error);
        }
    }

    // ✅ 편집 하이라이트 정리
    clearEditHighlight() {
        if (this.editHighlight) {
            this.scene.remove(this.editHighlight);
            this.editHighlight.geometry.dispose();
            this.editHighlight.material.dispose();
            this.editHighlight = null;
        }
    }

    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // ✅ 볼륨 편집 실행 취소
    undoVolumeEdit() {
        if (this.originalVolumeData && this.nvMulti && this.nvMulti.volumes[1]) {
            try {
                const segVolume = this.nvMulti.volumes[1];
                segVolume.img = new Uint8Array(this.originalVolumeData);

                console.log("  undoVolumeEdit: updateGLVolume 건너뛰기");
                this.nvMulti.drawScene();

                if (this.nvRender) {
                    console.log("  undoVolumeEdit: nvRender updateGLVolume 건너뛰기");
                    this.nvRender.drawScene();
                }

                console.log("↩️ 볼륨 편집 실행 취소 완료");
            } catch (error) {
                console.error("❌ 볼륨 실행 취소 실패:", error);
            }
        }
    }

    // ✅ 호환성을 위한 applyLassoEdit 메서드 (기존 코드가 호출하는 경우 대비)
    applyLassoEdit(currentPoints) {
        console.log("🔄 applyLassoEdit 호출됨 - 기존 메서드들로 처리");
        // 실제 편집은 이미 applyLassoCut()과 applyVolumeEdit()에서 처리됨
        // 이 메서드는 호환성을 위한 빈 메서드
    }

    applyVolumeEditFromVertices(editedVertices) {
        // 멀티플레인 뷰어의 세그멘테이션 볼륨 편집
        if (!this.nvMulti || !this.nvMulti.volumes || !this.nvMulti.volumes[1]) {
            console.warn("⚠️ 멀티플레인 편집할 볼륨이 없습니다.");
            return;
        }

        const segVolume = this.nvMulti.volumes[1];
        if (!segVolume.img || segVolume.img.length === 0) {
            console.warn("⚠️ 멀티플레인 볼륨 데이터가 없습니다.");
            return;
        }

        console.log("멀티플레인 볼륨 편집 시작...");
        console.log("선택된 매시:", this.selectedMesh);
        this.editSingleVolumeData(segVolume, "멀티플레인");
        const resultVolumes = computeLabelVolumesDict(segVolume);
        console.log("Edited volumes: ", resultVolumes);
        
        const editedNrrdBlob = this.createNrrdBlobFrom(segVolume);
        generateMeshFromNrrdBlob(editedNrrdBlob)
            .then((newMeshes) => {
                this.scene.children
                    .filter(obj => obj.isMesh)
                    .forEach(mesh => {
                        this.scene.remove(mesh);
                        mesh.geometry.dispose();
                        if (mesh.material.dispose) mesh.material.dispose();
                    });

                window.initMeshMap(newMeshes);
                window.addMeshsToScene(newMeshes);
                window.bindMeshControllers(newMeshes);
                // window.buildVolumeTable(newMeshes, segVolume, this.scene);
            });
        this.updateBothViewers();
    }

    createNrrdBlobFrom(volume) {
        const TYPE_FROM_TA = {
            Uint8Array:  "uchar",
            Int8Array:   "char",
            Int16Array:  "short",
            Uint16Array: "ushort",
            Int32Array:  "int",
            Uint32Array: "uint",
            Float32Array:"float",
            Float64Array:"double",
            };

            // numpy/TypedArray 섞임 방지 → 일반 JS 배열 변환
            const toPlain = (v) =>
            ArrayBuffer.isView(v) ? Array.from(v)
                : Array.isArray(v)   ? v.map(toPlain)
                : v;

        console.log("Volume", volume);

        const type = TYPE_FROM_TA[volume.img?.constructor?.name] || "float";

        // NVImage hdr에서 크기·spacing·origin 추출
        const sizes           = toPlain(volume.hdr.dims.slice(1, 4));    // [nx, ny, nz]
        const pix             = toPlain(volume.hdr.pixDims.slice(1, 4)); // [sx, sy, sz]
        const space           = "left-posterior-superior";
        const spaceDirections = [[pix[0],0,0],[0,pix[1],0],[0,0,pix[2]]];

        // origin은 srow_x/y/z가 있으면 거기서 추출, 없으면 0,0,0
        let spaceOrigin = [-209.6519928, -131.20599365, -191.88299561];
        if (volume.hdr.srow_x && volume.hdr.srow_y && volume.hdr.srow_z) {
            const ox = parseFloat(volume.hdr.srow_x.split(" ")[3]);
            const oy = parseFloat(volume.hdr.srow_y.split(" ")[3]);
            const oz = parseFloat(volume.hdr.srow_z.split(" ")[3]);
            spaceOrigin = [-209.6519928, -131.20599365, -191.88299561];
        }

        const endian          = "little";
        const encoding        = "raw";

        // 검증: data length와 sizes product 일치 여부
        const total = sizes[0] * sizes[1] * sizes[2];
        if (!sizes) throw new Error("NRRD header: sizes 누락");
        if (volume.img.length !== total) {
        throw new Error(`data.length(${volume.img.length}) != sizes product(${total})`);
        }

        // serialize( nrrdObj ) 형식
        const nrrdObj = {
            type,
            dimension: 3,
            sizes,
            endian,
            encoding,
            space,
            spaceDirections,
            spaceOrigin,
            data: volume.img
        };

        console.log('nrrd obj', nrrdObj);
        const buffer = serialize(nrrdObj);

        // Blob 생성
        return new Blob([buffer], { type: "application/octet-stream" });
    }
}
