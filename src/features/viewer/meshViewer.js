import * as THREE from "three";

import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

export function initThreeJS(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  const ro = new ResizeObserver(() => adjustMeshCanvasSize(canvas, renderer, camera));
  ro.observe(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 5000);
  camera.position.set(500, 500, 500);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  adjustMeshCanvasSize(canvas, renderer, camera);

  // ✅ AmbientLight: 전체적인 기본 밝기
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  // ✅ HemisphereLight: 자연스러운 상/하 방향 조명
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  // ✅ DirectionalLight: 카메라 기준 동기화 (메인 라이트)
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(0, 200, 200);
  scene.add(mainLight);

  // ✅ 라이트 헬퍼 (개발용)
  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(50, 100, 50);
  scene.add(light);

  // ✅ 헬퍼 추가 (크기 5)
  const helper = new THREE.DirectionalLightHelper(light, 5);
  scene.add(helper);

  // ✅ TrackballControls 설정
  const controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 4.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;

  // ✅ 카메라 움직임 → 라이트 위치 동기화
  controls.addEventListener('change', () => {
    mainLight.position.copy(camera.position.clone().add(new THREE.Vector3(0, 100, 100)));
    mainLight.lookAt(scene.position);
  });

  // ✅ 축 표시 + 라벨
  addAxis(scene);

  return {
    scene, renderer, camera, controls
  }
}

export function adjustMeshCanvasSize(canvas, renderer, camera) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;        // Perspective
  camera.updateProjectionMatrix();
}

export function makeLabel(text, color, position) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 64;
  canvas.height = 64;
  ctx.fillStyle = color;
  ctx.font = 'bold 100px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(20, 20, 1);
  sprite.position.copy(position);
  return sprite;
};

// 이 위치 (또는 적절한 다른 위치)에 추가하세요.
export function fitCameraToMeshes(meshes, camera, controls, renderer, scene) {
  if (meshes.length <= 0) {
    return;
  }

  if (!meshes || meshes.length === 0) {
    console.warn("fitCameraToMeshes: 카메라를 맞출 메시가 없습니다.");
    return;
  }

  const bbox = new THREE.Box3();
  meshes.forEach(mesh => {
    // 메시가 THREE.Object3D의 인스턴스이고 geometry를 가지고 있는지 확인
    if (mesh instanceof THREE.Object3D && mesh.geometry) {
      // 메시의 바운딩 박스를 계산하고 월드 변환을 적용하여 전체 바운딩 박스에 통합
      // (OBJLoader가 Group을 반환하고 그 안에 Mesh가 있는 경우를 고려하여 traverse 사용을 고려할 수도 있지만,
      // 여기서는 이미 개별 Mesh 객체들을 'meshes' 배열에 담았다고 가정합니다.)
      mesh.geometry.computeBoundingBox();
      // mesh.matrixWorld는 Object3D의 전역 위치, 회전, 스케일을 반영합니다.
      // 이것은 mesh가 Group 안에 있을 때 특히 중요합니다.
      bbox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
  });

  if (bbox.isEmpty()) {
    console.warn("fitCameraToMeshes: 바운딩 박스가 비어 있습니다. 카메라를 맞출 수 없습니다.");
    return;
  }

  const center = new THREE.Vector3();
  bbox.getCenter(center);
  controls.target.copy(center); // OrbitControls/TrackballControls의 시점(lookAt)을 메시의 중심으로 설정

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z); // 메시의 가장 큰 차원

  // 카메라의 FOV(시야각)를 고려하여 메시 전체가 보이도록 카메라 Z 위치 계산
  const fov = camera.fov * (Math.PI / 180); // FOV를 라디안으로 변환
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

  // 약간의 여유 공간(버퍼)을 두어 메시가 너무 가득 차 보이지 않도록 함
  cameraZ *= 1.5; // 이 값은 메시 크기에 따라 조절할 수 있습니다 (1.2 ~ 2.0 정도).

  // 카메라 위치를 메시의 중심을 기준으로 설정
  camera.position.copy(center);
  camera.position.z += cameraZ;
  camera.position.y += cameraZ * 0.5; // 약간 위에서 내려다보는 느낌
  camera.position.x += cameraZ * 0.5; // 약간 옆에서 바라보는 느낌

  camera.lookAt(center); // 카메라가 메시의 중심을 바라보도록 설정
  controls.update(); // 컨트롤러 업데이트 (카메라 위치 변경을 컨트롤러에 반영)
  renderer.render(scene, camera); // 씬 렌더링
  console.log("✅ 메시에 카메라 맞춤 완료.");
}

export function animate(controls, renderer, scene, camera) {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(() => animate(controls, renderer, scene, camera));
}

export function addAxis(scene) {
  const axisGroup = new THREE.Group();
  const axesHelper = new THREE.AxesHelper(500);
  axisGroup.add(axesHelper);

  scene.add(makeLabel('X', 'red', new THREE.Vector3(500, 0, 0)));   // +X (Right)
  scene.add(makeLabel('Y', 'blue', new THREE.Vector3(0, 500, 0))); // +y (Anterior)
  scene.add(makeLabel('Z', 'green', new THREE.Vector3(0, 0, 500))); // +Z (Superior)

  scene.add(makeLabel('L', 'red', new THREE.Vector3(250, 0, 0)));   // +X (Right)
  scene.add(makeLabel('P', 'blue', new THREE.Vector3(0, 250, 0))); // +y (Anterior)
  scene.add(makeLabel('S', 'green', new THREE.Vector3(0, 0, 250))); // +Z (Superior)
  scene.add(axisGroup);
}

export function showVolumeBoundingBox(volume, scene, lassoEditor) {
  const origin = lassoEditor.voxelToWorldCoordinates(0, 0, 0, volume);
  const maxDims = volume.hdr.dims.slice(1);
  const boundingMax = lassoEditor.voxelToWorldCoordinates(
    maxDims[0], maxDims[1], maxDims[2],
    volume);

  const box = new THREE.Box3(
    origin,
    boundingMax
  );
  const helper = new THREE.Box3Helper(box, 0x00ffcc);
  scene.add(helper);
}

