let drawMode = false;
let isDrawing = false;

export function activateMaskEdit(nvMulti, lassoEditor) {
  drawMode = !drawMode;
  console.log(drawMode);

  const segmentEditController = document.getElementById('segmentEditControllers');

  if (drawMode === true) {
    console.log(nvMulti.volumes);
    segmentEditController.style.display = 'flex';

    drawBtn.classList.add('edit-active');

    nvMulti.opts.penSize = 10;
    nvMulti.drawRimOpacity = 0.6;

    const nv = nvMulti;

    nv.setDrawingEnabled(true);
    nv.setRadiologicalConvention(true);
    nv.setDrawOpacity(0.6); // 보이도록
    // 핵심: 기본 드래그 행동을 "콜백만"으로 전환
    if (typeof nv.setDragMode === 'function') {
      nv.setDragMode(nv.dragModes.callbackOnly);
    } else {
      // 구버전 대비 안전망
      nv.opts.dragMode = nv.dragModes.callbackOnly;
      nv.drawScene();
    }

    // 2) 초기화(선택)
    const mask = nv.drawBitmap;
    mask.fill(0);
    nv.refreshDrawing(); // 드로잉 텍스처 갱신 (updateGLVolume 아님)

    const canvas = nv.gl?.canvas || nv.canvas;
    canvas.addEventListener('pointerdown', () => { isDrawing = true; });
    canvas.addEventListener('pointerup', () => { 
      isDrawing = false;
      const vol = nv.volumes[1]; // 첫 번째 볼륨
      const mask = nv.drawBitmap; // 현재 drawing 결과 (Uint8Array 형태)

      // mask와 vol.data를 조합해서 적용
      for (let i = 0; i < vol.img.length; i++) {
        if (mask[i] > 0) {
          vol.img[i] = 3; // 원하는 intensity나 라벨 값으로 변경
        }
      }
      nv.updateGLVolume();
      lassoEditor.updateBothViewers();
    });

    canvas.addEventListener('pointerleave', () => { isDrawing = false; });

    nv.onLocationChange = (loc) => {
      if (!isDrawing) return;
      drawOn(nv, loc, mask);
      nv.refreshDrawing(); // 텍스처 갱신 (필수)
    };
  } else {
    segmentEditController.style.display = 'none';
    drawBtn.classList.remove('edit-active');
    nvMulti.setDrawingEnabled(false);

    const draw = nvMulti.drawBitmap;
    draw.fill(0);         // 모든 voxel 값 0으로
    nvMulti.refreshDrawing();
  }
}

function drawOn(nv, loc, mask) {
  // voxel 좌표
  const x = Math.floor(loc.vox[0]);
  const y = Math.floor(loc.vox[1]);
  const z = Math.floor(loc.vox[2]);

  // 배경 볼륨 크기
  const dims = nv.volumes[0].hdr.dims; // [_, nx, ny, nz, ...]
  const nx = dims[1], ny = dims[2], nz = dims[3];
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return;

  // 브러시 반지름(보xel 단위)
  const r = nv.opts.penSize | 0; // 예: 3
  for (let dz = -r; dz <= r; dz++) {
    const zz = z + dz; if (zz < 0 || zz >= nz) continue;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= ny) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= nx) continue;
        if (dx * dx + dy * dy + dz * dz > r * r) continue; // 구형 브러시 내부만

        const idx = xx + yy * nx + zz * nx * ny; // 1D 인덱싱
        mask[idx] = 3; // 원하는 라벨 값
      }
    }
  }
}