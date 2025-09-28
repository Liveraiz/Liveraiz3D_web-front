
export function setCameraSyncronizer(nvRender) {
  let drawCount = 0;
  const drawInterval = setInterval(() => {
    nvRender.drawScene();
    drawCount++;

    const cam = nvRender.scene?.camera;

    if ((cam?.eye && cam?.lookAt) || drawCount > 30) {
      clearInterval(drawInterval);

      if (!cameraAlreadySynced) {
        syncCameraZoomFromThreeToNiivue(nvRender, camera, controls);
        cameraAlreadySynced = true;
      }

      controls.addEventListener("change", () => {
        syncCameraZoomFromThreeToNiivue(nvRender, camera, controls);
      });

    }
  }, 200);
}

function syncCameraZoomFromThreeToNiivue(nvInstance, threeCamera, controls) {
  const eye = threeCamera.position.clone();
  const lookAt = controls.target.clone();
  const dir = eye.clone().sub(lookAt).normalize();

  const azimuth = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
  const elevation = Math.asin(dir.y) * (180 / Math.PI);
  const distance = eye.distanceTo(lookAt); // Three.js 카메라 거리

  // ✅ Niivue 카메라 설정
  nvInstance.scene.renderAzimuth = (360 - azimuth + 360) % 360;
  nvInstance.scene.renderElevation = elevation;
  nvInstance.scene.cameraDistance = distance;

  // ✅ 볼륨 줌(크기) 보정 (거리 기준으로 역비례, 조정 가능)
  const referenceDistance = 600; // 기준 거리 (조정 가능)
  const multiplier = referenceDistance / distance;
  nvInstance.scene.volScaleMultiplier = multiplier;

  // ✅ camera.eye, lookAt 수동 설정
  nvInstance.scene.camera = {
    eye: [eye.x, eye.y, eye.z],
    lookAt: [lookAt.x, lookAt.y, lookAt.z],
  };

  // ✅ 뷰 갱신
  nvInstance.drawScene();
}