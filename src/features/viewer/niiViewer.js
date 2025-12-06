import * as niivue from "@niivue/niivue";

import {
  labelColorMap1
} from './colorMaps.js'

export async function showMultiVolumeView(niiUrl, nrrdUrl) {
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

  await nvMulti.attachTo("canvasTop");

  // ✅ 서버 색상 기반 Niivue colormap 생성
  const segCmap = makeNiivueColormapFromLabelColorMap(labelColorMap1);
  niivue.cmapper.addColormap("seg", segCmap);

  // ✅ 최대 라벨 값 계산
  const maxLabelValue = Math.max(...Object.keys(labelColorMap1).map(Number));
  const labelLUT = niivue.cmapper.makeLabelLut(segCmap, maxLabelValue);

  console.log("🚀 labelLUT:", labelLUT);

  const volumeList = [
    {
      url: niiUrl,
      name: "CT.nii.gz",
      colormap: "gray",
      opacity: 1,
      visible: true,
    },
    {
      url: nrrdUrl,
      name: "Seg.nrrd",
      colormap: "seg",       // ✅ 커스텀 컬러맵
      indexedColors: true,
      cal_min: labelLUT.min,
      cal_max: labelLUT.max,
      opacity: 0.8,
      alphaThreshold: 0.0,
      visible: true,
    },
  ];

  await nvMulti.loadVolumes(volumeList);
  const descriptive = nvMulti.getDescriptives({});
  console.log("Descriptive: ", nvMulti.getDescriptives({}));

  const result = computeLabelVolumesDict(nvMulti.volumes[1]);
  console.log("Volumes: ", result);

  // ✅ LUT 적용
  const segVolume = nvMulti.volumes[1];
  segVolume.lut = labelLUT.lut;
  segVolume.cal_min = labelLUT.min;
  segVolume.cal_max = labelLUT.max;

  nvMulti.setRadiologicalConvention(true);
  nvMulti.updateGLVolume();
  nvMulti.drawScene();

  console.log("✅ 멀티플레인 뷰어 로딩 완료");
  return nvMulti;
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

// 다른 niivue 의 volume 들을 사용하여 새로운 Niivue 를 만든다.
export async function createTopLeftFromAnotherView(niiVue) {
  const leftTopPlane = new niivue.Niivue({
    sliceType: niivue.SLICE_TYPE.AXIAL,
    backColor: [0, 0, 0, 1],
    dragAndDropEnabled: false,
    isOrientCube: true,
  });

  await leftTopPlane.attachTo("leftTop");

  leftTopPlane.addVolume(niiVue.volumes[0]);
  leftTopPlane.addVolume(niiVue.volumes[1]);
  leftTopPlane.setRadiologicalConvention(true);

  return leftTopPlane;
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
