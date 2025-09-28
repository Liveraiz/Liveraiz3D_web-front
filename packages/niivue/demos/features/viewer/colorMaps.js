// viewer/colorMaps.js

// 1. 라벨별 색상 테마 모음
export const themes = {
    default: {
            1: [238, 112, 70],
            2: [238, 112, 70],
            3: [218, 108, 110],
            4: [138, 117, 231],
            5: [211, 255, 51],
            6: [255, 147, 77],
            7: [185, 202, 99],
            8: [79, 255, 174],
            9: [193, 157, 255],
            10: [139, 186, 255],
            11: [234, 36, 36],
            12: [95, 170, 127]
    },
    pastel: {
        1: [255, 191, 128], 2: [255, 239, 128], 3: [191, 128, 255],
        4: [128, 223, 255], 5: [128, 255, 191], 6: [128, 255, 255],
        7: [255, 128, 191], 8: [224, 224, 224], 9: [255, 160, 160],
        10: [160, 255, 160], 11: [192, 128, 128], 12: [128, 128, 192]
    },
    high_contrast: {
        1: [255, 0, 0], 2: [0, 255, 0], 3: [0, 0, 255],
        4: [255, 255, 0], 5: [0, 255, 255], 6: [255, 0, 255],
        7: [255, 255, 255], 8: [0, 0, 0], 9: [255, 128, 0],
        10: [128, 0, 255], 11: [128, 255, 0], 12: [0, 128, 255]
    }
};

// 2. 라벨-이름 매핑
export const labelNameMap = {
    1: "Liver", 2: "Rt.lobe", 3: "RAS", 4: "RPS",
    5: "Lt.lobe", 6: "LLS", 7: "LMS", 8: "Spigelian",
    9: "PV", 10: "HV", 11: "Cancer", 12: "BD"
};

// 3. 현재 사용 테마/색상맵 (초기값)
export let labelColorMap = { ...themes.default };

// 4. 테마 전환
export function applyColorTheme(theme) {
    labelColorMap = { ...themes[theme] };
    return labelColorMap;
}

// 5. Niivue용 LUT 생성
export function createNiivueLUT() {
    const lut = new Uint8Array(256 * 4);
    lut.fill(0);
    Object.entries(labelColorMap).forEach(([label, rgb]) => {
        const idx = parseInt(label, 10);
        lut[idx * 4 + 0] = rgb[0];
        lut[idx * 4 + 1] = rgb[1];
        lut[idx * 4 + 2] = rgb[2];
        lut[idx * 4 + 3] = rgb[3];
    });
    return lut;
}

// 6. Three.js 메쉬 색상 일괄 적용
export function applyMeshColors(meshes) {
    if (!meshes) return;
    meshes.forEach(mesh => {
        const label = mesh.userData?.label || mesh.label;
        if (label && labelColorMap[label]) {
            const [r, g, b] = labelColorMap[label];
            mesh.material.color.setRGB(r / 255, g / 255, b / 255);
            mesh.material.needsUpdate = true;
        }
    });
}

export const labelColorMap1 = {
  1: [238, 112, 70, 255],   // Liver - 붉은 주황
  2: [238, 112, 70, 255],   // Rt.lobe
  3: [218, 108, 110, 255],  // RAS - 연붉은색
  4: [138, 117, 231, 255],  // RPS - 보라
  5: [211, 255, 51, 255],   // Lt.lobe - 노랑
  6: [255, 50, 50, 255],   // ✅ LLS - 강한 주황 (기존보다 붉은 톤)
  7: [40, 255, 120, 255],    // ✅ LMS - 진한 연두 → 채도 강화
  8: [50, 230, 120, 255],   // ✅ Spigelian - 민트보다 진한 초록
  9: [193, 157, 255, 255],  // PV - 연보라
  10: [139, 186, 255, 255], // HV - 하늘색
  11: [234, 36, 36, 255],   // Cancer - 강렬한 빨강
  12: [50, 230, 120, 255],    // ✅ BD - 강한 녹색 (갈색 느낌 제거)
  // 255: [255, 255, 255, 255]  // 편집된 부분 - 하얀색
  255: [1.0, 1.0, 1.0, 0.0]   // 편집된 부분 - 투명
};