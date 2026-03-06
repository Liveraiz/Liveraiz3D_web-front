import JSZip from 'jszip';

/**
 * DICOM 파일을 서버로 업로드하고, 반환된 zip 파일에서 .nii.gz와 .nrrd Blob URL을 생성합니다.
 *
 * @param {FileList} fileList - <input type="file" webkitdirectory multiple>로 선택한 파일 목록
 * @param {string} endpoint - 서버 API 주소 (예: http://127.0.0.1:5000/infer-dicom-bundle)
 * @param {function} [onStatus] - 상태 메시지를 갱신하는 콜백 (예: (msg) => console.log(msg))
 * @returns {Promise<{ niiUrl: string, nrrdUrl: string }>} Blob URL 객체
 */
export async function uploadAndInferDicomBundle(fileList, endpoint, onStatus) {
    const files = Array.from(fileList);
    if (!files.length) throw new Error("DICOM(.dcm) 파일이 없습니다.");

    const folderName = files[0].webkitRelativePath?.split('/')?.[0] || `upload-${Date.now()}`;
    onStatus?.(`📤 'Segmentation is processing...'`);

    const formData = new FormData();
    files.forEach(f => formData.append('dicomFiles', f));
    formData.append('folder', folderName);

    console.log("🚀 POST 요청 준비 중...", endpoint);
    console.log("📁 전송 파일 수:", files.length);
    console.log("🗂️ 업로드 폴더 이름:", folderName);

    const res = await fetch(endpoint, {
        method: "POST",
        body: formData
    });

    console.log("📡 서버 응답 상태:", res.status);
    console.log("📡 응답 헤더:", [...res.headers.entries()]);

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
        if (contentType.includes("application/json")) {
            const errorJson = await res.json();
            throw new Error(errorJson.message || `서버 오류 (${res.status})`);
        } else {
            const errorText = await res.text();
            throw new Error(`서버 오류: ${res.status} - ${errorText.slice(0, 100)}`);
        }
    }

    const zipBlob = await res.blob();
    onStatus?.("📥 zip 파일 수신 완료 → 해제 중...");

    const zip = await JSZip.loadAsync(zipBlob);

    // zip 내부 파일 목록 출력
    const zipFiles = Object.keys(zip.files);
    console.log("📦 ZIP 내부 파일 목록:", zipFiles);
    onStatus?.(`📦 ZIP 내부 파일 수: ${zipFiles.length}`);

    const niiEntry = zip.file("converted.nii.gz");
    const nrrdEntry = zip.file("inferred.nrrd");

    if (!niiEntry || !nrrdEntry) {
        console.error("❌ zip 파일에 누락된 항목이 있습니다.");
        if (!niiEntry) console.error("⛔ 'converted.nii.gz' 없음");
        if (!nrrdEntry) console.error("⛔ 'inferred.nrrd' 없음");

        onStatus?.("❌ zip 파일에 필요한 파일이 없습니다.");
        throw new Error("압축 파일 내 'converted.nii.gz' 또는 'inferred.nrrd' 파일이 없습니다.");
    }

    onStatus?.("📄 NIfTI, NRRD 파일 추출 중...");

    const niiBlob = await niiEntry.async("blob");
    const nrrdBlob = await nrrdEntry.async("blob");

    const niiUrl = URL.createObjectURL(niiBlob);
    const nrrdUrl = URL.createObjectURL(nrrdBlob);

    console.log("✅ Blob URL 생성 완료:", { niiUrl, nrrdUrl });
    onStatus?.("✅ Blob URL 생성 완료");

    return { niiUrl, nrrdUrl };
}

export async function uploadAndInferNiftiBundle(niftiFile, segmentationModel, endpoint, onStatus) {
    if (!(niftiFile instanceof File)) {
        throw new Error("niftiFile은 File 객체여야 합니다.");
    }
    
    onStatus?.(`📤 'Segmentation is processing...'`);

    const formData = new FormData();
    formData.append('niftiFile', niftiFile, niftiFile.name);
    if (segmentationModel) {
        formData.append('segmentationModel', segmentationModel);
    }

    console.log("🚀 POST 요청 준비 중...", endpoint);
    if (segmentationModel) {
        console.log("🧠 선택된 Segmentation Model:", segmentationModel);
    }
    const res = await fetch(endpoint, {
        method: "POST",
        body: formData
    });

    console.log("📡 서버 응답 상태:", res.status);
    console.log("📡 응답 헤더:", [...res.headers.entries()]);

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
        if (contentType.includes("application/json")) {
            const errorJson = await res.json();
            throw new Error(errorJson.message || `서버 오류 (${res.status})`);
        } else {
            const errorText = await res.text();
            throw new Error(`서버 오류: ${res.status} - ${errorText.slice(0, 100)}`);
        }
    }

    const zipBlob = await res.blob();
    onStatus?.("📥 zip 파일 수신 완료 → 해제 중...");

    const zip = await JSZip.loadAsync(zipBlob);

    // zip 내부 파일 목록 출력
    const zipFiles = Object.keys(zip.files);
    console.log("📦 ZIP 내부 파일 목록:", zipFiles);
    onStatus?.(`📦 ZIP 내부 파일 수: ${zipFiles.length}`);

    const nrrdEntry = zip.file("inferred.nrrd");

    if (!nrrdEntry) {
        console.error("⛔ 'inferred.nrrd' 없음");
        onStatus?.("❌ zip 파일에 필요한 파일이 없습니다.");
        throw new Error("압축 파일 내 'inferred.nrrd' 파일이 없습니다.");
    }
    onStatus?.("📄 NIfTI, NRRD 파일 추출 중...");
    
    const nrrdBlob = await nrrdEntry.async("blob");
    const nrrdUrl = URL.createObjectURL(nrrdBlob);

    console.log("✅ Blob URL 생성 완료:", nrrdUrl);
    onStatus?.("✅ Blob URL 생성 완료");

    return nrrdUrl;
}
