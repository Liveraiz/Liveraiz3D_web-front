const label_name_mapping = {
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
}

import {
  createLeftLabelSection
} from './volumeInfoTable.js';

import * as THREE from "three";

export class MeshController {
  boundingBoxHelper = undefined;
  undoStack = [];

  constructor(meshes, scene, lassoEditor, camera) {
    this.lassoEditor = lassoEditor;
    this.meshes = meshes;
    this.scene = scene;
    this.selectedMesh = null;
  }

  buildMeshControllers() {
    const meshListDiv = document.getElementById('meshList');
    meshListDiv.innerHTML = '';

    console.log(meshListDiv.children);

    this.meshes.forEach((mesh, idx) => {
      if (!mesh.material) return;

      // UI 행 추가
      const row = this.createMeshRowWithControls(mesh, idx);
      meshListDiv.appendChild(row);
    });
  }

  createMeshRowWithControls(mesh, idx) {
    const labelValue = mesh.label || mesh.userData?.label;
    const labelText = label_name_mapping[labelValue] || `Label ${labelValue}`;
    const row = document.createElement('div');

    row.classList.add('mesh-row');

    // ✅ mesh.uuid를 dataset에 저장
    row.dataset.meshId = mesh.uuid;
    row.dataset.label = labelValue;

    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#1A1A1A',
      borderRadius: '8px',
      padding: '8px 12px',
      marginBottom: '8px',
      cursor: 'pointer',
    });

    row.onclick = () => {
      const mesh = getMeshByLabel(row.dataset.label);
      this.selectMesh(mesh); // ✅ 기존 함수 사용
      this.selectedMesh = mesh;
      this.undoStack = [];

      this.highlightSelectedMesh(mesh);
    };

    const left = createLeftLabelSection(mesh, labelText);
    row.appendChild(left);

    const controlPanel = this.createVisibilityAndOpacityControl(row.dataset);
    row.appendChild(controlPanel);
    return row;
  }

  createVisibilityAndOpacityControl(dataset) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'space-between';
    container.style.gap = '12px';
    container.style.flex = '1';

    // 왼쪽: 슬라이더 + 숫자
    const sliderGroup = document.createElement('div');
    sliderGroup.style.display = 'flex';
    sliderGroup.style.alignItems = 'center';
    sliderGroup.style.gap = '8px';

    console.log("🎛️ dataset:", dataset);
    const mesh = getMeshByLabel(dataset.label);
    const initialOpacity = mesh.material.opacity ?? 1;
    mesh.material.opacity = initialOpacity;

    const slider = document.createElement('input');
    Object.assign(slider, {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      value: initialOpacity,
      title: '투명도 조절',
    });
    slider.style.width = '60px';

    const valueText = document.createElement('span');
    valueText.innerText = initialOpacity.toFixed(2);
    valueText.style.fontSize = '12px';
    valueText.style.color = 'white';
    valueText.style.width = '32px';
    valueText.style.textAlign = 'right';

    slider.oninput = (e) => {
      const targetMesh = getMeshByLabel(dataset.label);
      const val = parseFloat(e.target.value);
      targetMesh.material.opacity = val;
      valueText.innerText = val.toFixed(2);

      if (val < 1.0) {
        Object.assign(targetMesh.material, {
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending
        });
      } else {
        Object.assign(targetMesh.material, {
          transparent: false,
          depthWrite: true,
          side: THREE.DoubleSide,
          blending: THREE.NoBlending
        });
      }

      targetMesh.material.needsUpdate = true;
    };

    sliderGroup.appendChild(slider);
    sliderGroup.appendChild(valueText);

    // 오른쪽: eye 아이콘
    const eye = document.createElement('span');
    eye.style.cursor = 'pointer';
    eye.style.fontSize = '12px';
    eye.style.color = 'white';

    const updateIcon = () => {
      eye.innerHTML = mesh.visible
        ? '<i class="fa-regular fa-eye"></i>'
        : '<i class="fa-regular fa-eye-slash"></i>';
    };

    eye.onclick = (e) => {
      const targetMesh = getMeshByLabel(dataset.label);
      e.stopPropagation();
      targetMesh.visible = !targetMesh.visible;
      updateIcon();
      renderer.render(this.scene, this.camera);
    };

    updateIcon();

    container.appendChild(sliderGroup); // 왼쪽
    container.appendChild(eye);         // 오른쪽

    return container;
  }

  bindMeshControllers(meshes) {
    const meshListDiv = document.getElementById('meshList');
    Array.from(meshListDiv.children).forEach(row => {
      const meshLabel = row.dataset.label;
      const mesh = meshes.find(m => m.userData.label.toString() === meshLabel);
      if (!mesh) {
        console.error("매시가 없습니다.", meshLabel, row.dataset, meshes);
        return;
      }

      // 가시성 토글
      // const visibilityCheckbox = row.querySelector('input[type="checkbox"]');
      // visibilityCheckbox.checked = mesh.visible;
      // visibilityCheckbox.onchange = () => {
      //   mesh.visible = visibilityCheckbox.checked;
      //   renderer.render(scene, camera);
      // };

      // 불투명도 슬라이더
      const opacitySlider = row.querySelector('input[type="range"]');
      mesh.material.opacity = opacitySlider.value;
      mesh.material.transparent = mesh.material.opacity < 1.0;
    });
  }

  highlightSelectedMesh(mesh) {
    this.clearAllHighlights();

    const rows = document.querySelectorAll('.mesh-row');
    rows.forEach(row => {
      if (row.dataset.meshId === mesh.uuid) {
        row.classList.add('selected-row');
      }
    });
  }

  clearAllHighlights() {
    document
      .querySelectorAll('.mesh-row')
      .forEach(el => el.classList.remove('selected-row'));
  }

  selectMesh(mesh) {
    lassoEditor.setSelectedMesh(mesh);
    this.selectedMesh = mesh;

    // create bounding box helper for mesh
    if (this.boundingBoxHelper != undefined) {
      this.scene.remove(this.boundingBoxHelper);
    }
    this.boundingBoxHelper = new THREE.BoxHelper(mesh, 0x00ffff);
    this.scene.add(this.boundingBoxHelper);

    // ✅ UI 항상 초기화
    this.clearAllHighlights();

    // ✅ 편집 모드라면 즉시 강조
    if (lassoEditor.editMode) {
      this.highlightSelectedMesh(mesh);
    }
  }
}
