import * as niivue from "@niivue/niivue";

import {
  labelColorMap1
} from './colorMaps.js'

let topLeftView = null;
let bottomView = null;

async function initTopLeftView() {
  const topLeftView = new niivue.Niivue({
    sliceType: niivue.SLICE_TYPE.AXIAL,
    backColor: [0, 0, 0, 1],
    dragAndDropEnabled: false,
    isOrientCube: true,
  });
  topLeftView.setRadiologicalConvention(true);
  await topLeftView.attachTo("leftTop");
  return topLeftView;
}

async function initBottomView() {
  const nvMulti = new niivue.Niivue({
    sliceType: niivue.SLICE_TYPE.MULTIPLANE,
    backColor: [0, 0, 0, 1],
    dragAndDropEnabled: false,
    isOrientCube: true,
  });

  const customLayout = [
    { sliceType: niivue.SLICE_TYPE.CORONAL, position: [0.0, 0, 0.5, 1.0] },
    { sliceType: niivue.SLICE_TYPE.SAGITTAL, position: [0.5, 0, 0.5, 1.0] },
  ];
  nvMulti.setCustomLayout(customLayout);
  nvMulti.setRadiologicalConvention(true);
  await nvMulti.attachTo("canvasTop");
  return nvMulti;
}

// 다른 niivue 의 volume 들을 사용하여 새로운 Niivue 를 만든다.
export async function createTopLeftFromAnotherView(niiImage, nrrdImage) {
  if (!topLeftView) {
    topLeftView = await initTopLeftView();
  } else {
    topLeftView.loadVolumes([]);
  }

  topLeftView.addVolume(niiImage);
  topLeftView.addVolume(nrrdImage);
  
  return topLeftView;
}

export async function addVolumesToBottomView(niiImage, nrrdImage) {
  if (!bottomView) {
    bottomView = await initBottomView();
  } else {
    bottomView.loadVolumes([]); // 기존 볼륨 제거
  }

  await bottomView.addVolume(niiImage);
  await bottomView.addVolume(nrrdImage);

  bottomView.updateGLVolume();
  bottomView.drawScene();
  return bottomView;
}

// load volumne image to axial view (leftTop)
// The axial view shows horizontal cross-sections through the volume, 
// as if looking down from above. This is the traditional 
// "slice-by-slice" view familiar from CT and MRI scans.
export async function setVolumeImageToAxialView(niiImage) {
  if (!topLeftView) {
    topLeftView = await initTopLeftView();
  } else {
    await topLeftView.loadVolumes([]); // 기존 볼륨 제거
  }
  topLeftView.addVolume(niiImage);
  return topLeftView;
}

export async function setSegmentationMaskToAxialView(nrrdImage) {
  if (!topLeftView) {
    topLeftView = await initTopLeftView();
  }
  topLeftView.addVolume(nrrdImage);
  return topLeftView;
}

export async function setSegmentationMaskToCoronalAndSagittalView(nrrdImage) {
  if (!bottomView) {
    bottomView = await initBottomView();
  }
  bottomView.addVolume(nrrdImage);
  return bottomView;
}

export async function setVolumeImageToCoronalAndSagittalView(niiImage) {
  if (!bottomView) {
    bottomView = await initBottomView();
  } else {
    bottomView.loadVolumes([]); // 기존 볼륨 제거
  }
  await bottomView.addVolume(niiImage);
  return bottomView;
}

export async function showTopVolumeOnly(volumeView) {
  const nvRender = new niivue.Niivue({
    sliceType: niivue.SLICE_TYPE.RENDER,
    backColor: [0, 0, 0, 1],
    dragAndDropEnabled: false,
    isOrientCube: true,
  });

  await nvRender.attachTo("canvasMulti");

  // Niivue 기본 방향 설정
  nvRender.scene.renderAzimuth = 180;

  nvRender.addVolume(volumeView.volumes[1])

  nvRender.updateGLVolume();
  nvRender.drawScene();

  return nvRender;
}

export function computeLabelVolumesDict(vol) {
  const data = vol.img;
  const pd = vol.hdr.pixDims;                    // [0, sx, sy, sz, ...]
  const voxelMM3 = Math.abs(pd[1] * pd[2] * pd[3]); // mm³/voxel

  const counts = new Map();
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === 0) continue;                       // 0(배경) 제외
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const out = {};
  for (const [label, vox] of counts) {
    const mm = vox * voxelMM3;
    out[label] = { mm, mL: mm / 1000, numberOfVoxel: vox };
  }
  return out;
}




