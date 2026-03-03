import { requestMeshesFromSegmentationNrrdUrl } from './features/viewer/renderNrrdMesh.js';
import {
  labelColorMap1
} from './features/viewer/colorMaps.js';

import { parseDicomFiles } from './features/dicom/parseDicomFiles.js';
import { 
  uploadAndInferDicomBundle,
  uploadAndInferNiftiBundle
 } from './features/upload/uploadAndInferDicomBundle.js';

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
  addVolumesToBottomView,
  createTopLeftFromAnotherView,
  showTopVolumeOnly,
  setSegmentationMaskToAxialView,
  setSegmentationMaskToCoronalAndSagittalView
} from './features/viewer/niiViewer.js'

import {
  activateMaskEdit
} from './features/editor/maskEditor.js'

import {
  NVImage,
  cmapper
} from "@niivue/niivue";

import {computeLabelVolumesDict} from './features/viewer/niiViewer.js';

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

function makeNiivueColormapFromLabelColorMap(labelColorMap) {
  const I = [], R = [], G = [], B = [], A = [];

  for (let i = 0; i <= 255; i++) {
    I.push(i);
    if (labelColorMap[i]) {
      const [r, g, b, a] = labelColorMap[i];
      R.push(r);
      G.push(g);
      B.push(b);
      A.push(a);
    } else {
      R.push(0);
      G.push(0);
      B.push(0);
      A.push(0);
    }
  }

  console.log("🧩 완성된 Colormap:", { I, R: R.slice(0, 16), G: G.slice(0, 16), B: B.slice(0, 16), A: A.slice(0, 16) });
  return { I, R, G, B, A };
}

export async function renderMeshFromNrrdUrl(nrrdUrl) {
  const meshes = await requestMeshesFromSegmentationNrrdUrl(nrrdUrl);
  initMeshMap(meshes);
  addMeshsToScene(meshes);
  fitCameraToMeshes(meshes, camera, controls, renderer, scene);
  animate(controls, renderer, scene, camera);

  return meshes;
}

export async function renderVolumeMeshAndSlices(niiUrl, nrrdUrl, scene, camera, renderer, controls) {
  const meshes = await renderMeshFromNrrdUrl(nrrdUrl);

    // ✅ 서버 색상 기반 Niivue colormap 생성
  const segCmap = makeNiivueColormapFromLabelColorMap(labelColorMap1);
  cmapper.addColormap("seg", segCmap);

  // ✅ 최대 라벨 값 계산
  const maxLabelValue = Math.max(...Object.keys(labelColorMap1).map(Number));
  const labelLUT = cmapper.makeLabelLut(segCmap, maxLabelValue);

  const niiImage = await NVImage.loadFromUrl({
    url: niiUrl, 
    name: "CT.nii.gz",
    colormap: "gray",
    opacity: 1,
    visible: true
  });

  const nrrdImage = await NVImage.loadFromUrl({
    url: nrrdUrl,
    name: "Seg.nrrd",
    colormap: "seg",       // ✅ 커스텀 컬러맵
    indexedColors: true,
    cal_min: labelLUT.min,
    cal_max: labelLUT.max,
    opacity: 0.8,
    alphaThreshold: 0.0,
    visible: true,
  });

  nrrdImage.lut = labelLUT.lut;
  nrrdImage.cal_min = labelLUT.min;
  nrrdImage.cal_max = labelLUT.max;

  const result = computeLabelVolumesDict(nrrdImage);
  console.log("Volumes: ", result);

  const bottomView = await addVolumesToBottomView(niiImage, nrrdImage);
  nvMulti = bottomView;
  
  if (!bottomView || bottomView.volumes.length < 2) {
    console.warn("⚠️ Niivue에 볼륨이 로드되지 않았습니다.");
  } else {
    console.log("✅ 볼륨 로드 완료:", bottomView.volumes.map(v => v.name));
  }

  const topLeftView = await createTopLeftFromAnotherView(niiImage, nrrdImage);
  bottomView.broadcastTo([topLeftView], { "2d": true, "3d": true });
  topLeftView.broadcastTo([bottomView], { "2d": true, "3d": true });

  
  const nvRender = await showTopVolumeOnly(bottomView);

  lassoEditor.setRenderInstance(nvRender);
  lassoEditor.setMultiInstance(bottomView);
  lassoEditor.setTopLeftView(topLeftView);

  // 볼륨의 공간상의 위치가 잘 되어있는지 확인을 위한 바운딩 박스
  // showVolumeBoundingBox(nvRender.volumes[0], scene, lassoEditor);
  // logVolumeAndMeshStats(nvRender, camera, controls);
  meshController = new MeshController(meshes, scene, lassoEditor, camera);
  meshController.buildMeshControllers(bottomView.volumes[1]);
  return meshes;
}

const status = document.getElementById('status');
const meshListEl = document.getElementById('meshList');

let meshes = [];

export async function handleDicomFiles(fileList) {
  if (!fileList || fileList.length === 0) return null;
  if (meshListEl) {
    meshListEl.innerHTML = '';
  }
  return parseDicomFiles(fileList);
}

export async function handleConvertNiftiTo3D(niftiFile, segmentationModel) {
  const nrrdUrl = await uploadAndInferNiftiBundle(
    niftiFile,
    segmentationModel,
    buildApiUrl('/infer-nifti-bundle'),
    (msg) => { status.textContent = msg; }
  );
  console.log("✅ NRRD URL:", nrrdUrl);

  // ✅ 서버 색상 기반 Niivue colormap 생성
  const segCmap = makeNiivueColormapFromLabelColorMap(labelColorMap1);
  cmapper.addColormap("seg", segCmap);

  // ✅ 최대 라벨 값 계산
  const maxLabelValue = Math.max(...Object.keys(labelColorMap1).map(Number));
  const labelLUT = cmapper.makeLabelLut(segCmap, maxLabelValue);


  const nrrdImage = await NVImage.loadFromUrl({
    url: nrrdUrl,
    name: "Seg.nrrd",
    colormap: "seg",       // ✅ 커스텀 컬러맵
    indexedColors: true,
    cal_min: labelLUT.min,
    cal_max: labelLUT.max,
    opacity: 0.8,
    alphaThreshold: 0.0,
    visible: true,
  });
  nrrdImage.lut = labelLUT.lut;
  nrrdImage.cal_min = labelLUT.min;
  nrrdImage.cal_max = labelLUT.max;

  setSegmentationMaskToAxialView(nrrdImage);
  setSegmentationMaskToCoronalAndSagittalView(nrrdImage);

  renderMeshFromNrrdUrl(nrrdUrl);
}


export async function handleConvertTo3D(fileList) {
  console.log("filesForConvert:", fileList);
  if (!fileList || fileList.length === 0) {
    status.textContent = '❌ 변환할 DICOM 파일을 먼저 선택하세요.';
    return;
  }

  try {
    status.textContent = '3D 변환 요청 중...';
    const { niiUrl: convertedNiiUrl, nrrdUrl } = await uploadAndInferDicomBundle(
      fileList,
      buildApiUrl('/infer-dicom-bundle'),
      (msg) => {
        status.textContent = msg;
      }
    );

    meshes = await renderVolumeMeshAndSlices(convertedNiiUrl, nrrdUrl, scene, camera, renderer, controls);
    niiUrl = convertedNiiUrl;
    status.textContent = '✅ 3D 변환 및 로드 완료';
  } catch (err) {
    console.error(err);
    status.textContent = `❌ 변환 오류: ${err.message}`;
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
