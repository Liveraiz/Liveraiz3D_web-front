export function logNiivueVolumeInfo(nvInstance) {
  try {
    const segVolume = nvInstance?.volumes?.[1];
    if (!segVolume) {
      console.warn("⚠️ Niivue Segmentation Volume 없음");
      return;
    }

    console.log("===== [Niivue HDR 로그] =====");
    console.log("dims:", segVolume.hdr.dims);
    console.log("pixDims:", segVolume.hdr.pixDims);
    console.log("srow_x:", segVolume.hdr.srow_x);
    console.log("srow_y:", segVolume.hdr.srow_y);
    console.log("srow_z:", segVolume.hdr.srow_z);
    console.log("mmCenter:", segVolume.mmCenter);
  } catch (err) {
    console.error("❌ Niivue HDR 로그 출력 실패:", err);
  }
}

export function logVolumeAndMeshStats(nvInstance, threeCamera, controls) {
  // threeMeshes는 전역에 있는 것으로 가정
  if (!threeMeshes || threeMeshes.length === 0) {
    console.warn("⚠️ 전역 threeMeshes가 비어있음");
    return;
  }

  // --- Niivue Volume Bounding Box (수동 계산) ---
  try {
    console.log("Number of Volumes", nvInstance?.volumes?.length);
    const vol = nvInstance?.volumes?.[0];
    if (vol?.hdr?.dims && vol?.hdr?.pixDims) {
      const dims = vol.hdr.dims;      // [dim0, x, y, z]
      const pixDims = vol.hdr.pixDims; // [_, dx, dy, dz]

      console.log("unit mm per voxel", pixDims);

      const sizeNii = {
        x: dims[1] * pixDims[1],
        y: dims[2] * pixDims[2],
        z: dims[3] * pixDims[3],
      };
      console.log("📦 Niivue Volume Size (manual)");
      // Niivue 기준 중심점
      console.log("🧭 Niivue volume.mmCenter:", vol.mmCenter);

      console.log("  ↪️ dims:", dims.slice(1));
      console.log("  ↪️ pixDims:", pixDims.slice(1));
      console.log("  ↪️ size (mm):", sizeNii);
    } else {
      console.warn("⚠️ Niivue 볼륨 정보 없음 또는 불완전");
    }
  } catch (e) {
    console.warn("⚠️ Niivue BoundingBox 계산 오류:", e.message);
  }

  // --- Three.js Mesh Bounding Box ---
  try {
    const fullBox = new THREE.Box3();
    threeMeshes.forEach(obj => {
      if (obj instanceof THREE.Object3D) {
        fullBox.expandByObject(obj);
      }
    });
    const sizeMesh = new THREE.Vector3();
    fullBox.getSize(sizeMesh);
  } catch (e) {
    console.warn("⚠️ Three.js BoundingBox 오류:", e.message);
  }

  // --- Niivue 카메라 거리 / 스케일 ---
  if (nvInstance?.scene) {
    console.log("📷 Niivue 카메라 정보");
    console.log("  ↪️ cameraDistance:", nvInstance.scene.cameraDistance);
    console.log("  ↪️ volScaleMultiplier:", nvInstance.scene.volScaleMultiplier?.toFixed(3));
  }

  // --- Three.js 카메라 위치 ---
  if (threeCamera) {
    const eye = threeCamera.position;
    console.log("📷 Three.js 카메라 eye:", eye.toArray());
  }

  // --- Three.js 컨트롤 타겟 위치 ---
  if (controls?.target) {
    console.log("📷 controls.target:", controls.target.toArray());
  } else {
    console.warn("⚠️ controls.target 정보 없음");
  }
}
