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
  computeLabelVolumesDict 
} from './viewer/niiViewer.js';

export function buildVolumeTable(meshes, volume, scene) {
  const meshListDiv = document.getElementById('volumeTableContent');
  meshListDiv.innerHTML = '';

  console.log(meshListDiv.children);

  const volumeValues = computeLabelVolumesDict(volume);

  meshes.forEach((mesh, idx) => {
    if (!mesh.material) return;

    // UI 행 추가
    const labelKey = parseInt(mesh.userData.label);
    const computedVolume = volumeValues[labelKey];
    console.log('===', labelKey, computedVolume, volumeValues);
    const row = createVolumeRow(mesh, computedVolume);
    meshListDiv.appendChild(row);
  });
}

export function createLeftLabelSection(mesh, labelText) {
  const color = mesh.material.color || new THREE.Color(0.5, 0.5, 0.5);

  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    alignItems: 'center',
    flex: '1',
  });

  const colorBox = document.createElement('div');
  Object.assign(colorBox.style, {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 1)`,
    marginRight: '8px',
  });
  container.appendChild(colorBox);

  const label = document.createElement('span');
  label.innerText = labelText;
  Object.assign(label.style, {
    color: '#fff',
    fontSize: '14px',
    flex: '1',
  });
  container.appendChild(label);

  return container;
}

function createVolumeRow(mesh, computedVolumes) {
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

  const left = createLeftLabelSection(mesh, labelText);
  row.appendChild(left);

  const controlPanel = createVolumeValues(computedVolumes);
  row.appendChild(controlPanel);
  return row;
}

export function createVolumeValues(computedVolumes) {
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

  // const valueText = document.createElement('span');
  // valueText.innerText = computedVolumes.mm.toFixed(1);
  // valueText.style.fontSize = '12px';
  // valueText.style.color = 'white';
  // valueText.style.width = '70px';
  // valueText.style.textAlign = 'right';
  // sliderGroup.appendChild(valueText);

  const mLText = document.createElement('span');
  mLText.innerText = computedVolumes.mL.toFixed(2) + 'mL';
  mLText.style.fontSize = '12px';
  mLText.style.color = 'white';
  mLText.style.width = '70px';
  mLText.style.textAlign = 'right';
  sliderGroup.appendChild(mLText);

  container.appendChild(sliderGroup); // 왼쪽

  return container;
}