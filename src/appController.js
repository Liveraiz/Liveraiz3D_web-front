import { renderNrrdMesh } from './features/viewer/renderNrrdMesh.js';
import {
  labelColorMap1
} from './features/viewer/colorMaps.js';

import { uploadAndInferDicomBundle } from './features/upload/uploadAndInferDicomBundle.js';

import { LassoEditor } from './features/editor/lassoEditor.js';

import {
  buildVolumeTable,
} from './features/volumeInfoTable.js';

import {
  fitCameraToMeshes,
  animate,
  initThreeJS,
} from './features/viewer/meshViewer.js'

import {
  MeshController
} from './features/meshControlTable.js';

import {
  showMultiVolumeView,
  createTopLeftFromAnotherView,
  showTopVolumeOnly
} from './features/viewer/niiViewer.js'

import {
  activateMaskEdit
} from './features/editor/maskEditor.js'

// ✅ API 엔드포인트 설정 (기본: localhost 개발 서버)
const DEFAULT_API_BASE = 'https://evhd5jap7y.ap-northeast-1.awsapprunner.com';
// const DEFAULT_API_BASE = 'http://localhost:5051';
const API_BASE = (window.NIIVUE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
const buildApiUrl = (path) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
window.NIIVUE_API_BASE = API_BASE;

const originalWarn = console.warn;

console.warn = (...args) => {
  if (args[0] && args[0].includes("niivue-warn")) {
    return; // Niivue 관련 경고는 무시
  }
  originalWarn(...args); // 다른 경고는 그대로 출력
};

let threeMeshes = [];
let meshMap = {};
let selectedMesh = null;
let meshController = null;

const canvas = document.getElementById('threeCanvas');
let nvMulti = null;     // 멀티플레인 뷰어
let niiUrl = null;

let {scene, renderer, camera, controls} = initThreeJS(canvas);
// loadTestVolumes();

export async function renderVolumeMeshAndSlices(niiUrl, nrrdUrl, scene, camera, renderer, controls) {
  // ✅ 메시 생성 및 threeMeshes 전역 설정
  const meshes = await renderNrrdMesh(scene, camera, renderer, nrrdUrl);

  initMeshMap(meshes);
  addMeshsToScene(meshes);
  fitCameraToMeshes(meshes, camera, controls, renderer, scene);

  const bottomView = await showMultiVolumeView(niiUrl, nrrdUrl, labelColorMap1);
  nvMulti = bottomView;
  
  if (!bottomView || bottomView.volumes.length < 2) {
    console.warn("⚠️ Niivue에 볼륨이 로드되지 않았습니다.");
  } else {
    console.log("✅ 볼륨 로드 완료:", bottomView.volumes.map(v => v.name));
  }

  const topLeftView = await createTopLeftFromAnotherView(bottomView);
  bottomView.broadcastTo([topLeftView], { "2d": true, "3d": true });
  topLeftView.broadcastTo([bottomView], { "2d": true, "3d": true });

  animate(controls, renderer, scene, camera);
  const nvRender = await showTopVolumeOnly(bottomView);

  lassoEditor.setRenderInstance(nvRender);
  lassoEditor.setMultiInstance(bottomView);
  lassoEditor.setTopLeftView(topLeftView);

  // 볼륨의 공간상의 위치가 잘 되어있는지 확인을 위한 바운딩 박스
  // showVolumeBoundingBox(nvRender.volumes[0], scene, lassoEditor);
  // logVolumeAndMeshStats(nvRender, camera, controls);
  meshController = new MeshController(meshes, scene, lassoEditor, camera);
  meshController.buildMeshControllers(bottomView.volumes[1]);

  // buildVolumeTable(meshes, bottomView.volumes[1], scene);
  return meshes;
}

const status = document.getElementById('status');

let meshes = [];

export async function handleDicomFiles(fileList) {
  try {
    const { niiUrl, nrrdUrl } = await uploadAndInferDicomBundle(
      fileList,
      buildApiUrl('/infer-dicom-bundle'),
      (msg) => status.textContent = msg
    );
    meshes = await renderVolumeMeshAndSlices(niiUrl, nrrdUrl, scene, camera, renderer, controls, lassoEditor);
  } catch (err) {
    console.error(err);
    status.textContent = `❌ 오류: ${err.message}`;
  }
}

export async function loadTestVolumes() {
  const [niiBlob, nrrdBlob] = await Promise.all([
    fetch('/features/data/converted.nii.gz').then(res => res.blob()),
    fetch('/features/data/inferred.nrrd').then(res => res.blob())
  ]);

  const nrrdUrl = URL.createObjectURL(nrrdBlob);
  niiUrl = URL.createObjectURL(niiBlob);

  meshes = await renderVolumeMeshAndSlices(niiUrl, nrrdUrl, scene, camera, renderer, controls);
}

function initMeshMap(meshes) {
  meshMap = {};
  meshes.forEach(m => {
    meshMap[m.userData.label] = m;
  });
}

window.initMeshMap = initMeshMap;
window.buildVolumeTable = buildVolumeTable;

function addMeshsToScene(meshes) {
  meshes.forEach(mesh => {
    if (!mesh.material) return;

    scene.add(mesh);
  });
}

window.addMeshsToScene = addMeshsToScene;
window.bindMeshControllers = () => meshController.bindMeshControllers;

function getMeshByLabel(label) {
  return meshMap[label];
}
window.getMeshByLabel = getMeshByLabel;

const lassoEditor = new LassoEditor(canvas, camera, renderer, scene, controls);
window.lassoEditor = lassoEditor;

export function handleUndoClick() {
  if (lassoEditor.selectedMesh) {
    lassoEditor.undoManager.undo(lassoEditor.selectedMesh);
  }
}

const editorBtn = document.getElementById('editorBtn');
const editModeBtn = document.getElementById('editModeBtn');
const scissorIcon = document.getElementById('scissorIcon');

// ✅ 편집 모드 전환 버튼
export function handleEditModeToggle() {
  lassoEditor.volumeEditFullMode = !lassoEditor.volumeEditFullMode;

  if (!lassoEditor.volumeEditFullMode) {
    editModeBtn.textContent = '🎯 부분';
    editModeBtn.style.background = '#0066cc';
  } else {
    editModeBtn.textContent = '🌍 전체';
    editModeBtn.style.background = '#222';
  }
}

export function handleEditorToggle() {
  const isActive = !lassoEditor.editMode;
  lassoEditor.toggleEditMode(isActive);

  if (isActive) {
    editorBtn.textContent = '✅ 편집 중 (클릭해서 종료)';
    editorBtn.classList.add('edit-active');
    scissorIcon.style.display = 'block';

    // ✅ selectedMesh가 없으면 첫 번째 메쉬 자동 선택
    if (!selectedMesh && threeMeshes.length > 0) {
      selectMesh(threeMeshes[0]); // 내부적으로 highlight 처리
    } else if (selectedMesh) {
      highlightSelectedMesh(selectedMesh);
    }
  } else {
    editorBtn.textContent = '✂️ 편집 모드';
    editorBtn.classList.remove('edit-active');
    scissorIcon.style.display = 'none';
    meshController.clearAllHighlights();
  }
}

export function handleDrawClick() {
  activateMaskEdit(nvMulti, lassoEditor);
}

const meshSidebarEl = document.getElementById('meshSidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

const setSidebarOpen = (isOpen) => {
  if (!meshSidebarEl) return;
  meshSidebarEl.classList.toggle('open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
};

export function handleSidebarToggle() {
  const willOpen = !meshSidebarEl.classList.contains('open');
  setSidebarOpen(willOpen);
}

export function handleSidebarClose() {
  setSidebarOpen(false);
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) {
    setSidebarOpen(false);
  }
});

window.addEventListener('orientationchange', () => {
  if (window.innerWidth > 900) {
    setSidebarOpen(false);
  }
});
