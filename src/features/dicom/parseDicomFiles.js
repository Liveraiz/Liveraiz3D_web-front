import * as dicomParser from 'dicom-parser';

const DICOM_FILE_EXTENSIONS = ['.dcm', '.dicom'];

const toSafeString = (dataSet, tag) => (dataSet.string(tag) || '').trim();

const toSafeNumber = (dataSet, tag) => {
  const raw = toSafeString(dataSet, tag);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDicomDate = (value) => {
  if (!value || value.length !== 8) return value || '-';
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return `${year}-${month}-${day}`;
};

const isLikelyDicomFile = (file) => {
  const name = file?.name?.toLowerCase?.() || '';
  if (!name) return false;
  if (DICOM_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return !name.includes('.');
};

async function parseSingleDicomFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  return {
    patientName: toSafeString(dataSet, 'x00100010'),
    patientId: toSafeString(dataSet, 'x00100020'),
    studyDate: formatDicomDate(toSafeString(dataSet, 'x00080020')),
    studyDescription: toSafeString(dataSet, 'x00081030'),
    modality: toSafeString(dataSet, 'x00080060'),
    seriesInstanceUid: toSafeString(dataSet, 'x0020000e'),
    seriesNumber: toSafeNumber(dataSet, 'x00200011'),
    seriesDescription: toSafeString(dataSet, 'x0008103e'),
    instanceNumber: toSafeNumber(dataSet, 'x00200013'),
    sopInstanceUid: toSafeString(dataSet, 'x00080018'),
  };
}

const sortSeries = (seriesList) => {
  const score = (series) => (series.seriesNumber == null ? Number.MAX_SAFE_INTEGER : series.seriesNumber);
  return seriesList.sort((a, b) => {
    if (score(a) !== score(b)) return score(a) - score(b);
    return (a.seriesDescription || '').localeCompare(b.seriesDescription || '');
  });
};

export async function parseDicomFiles(fileList) {
  const files = Array.from(fileList || []);
  const candidates = files.filter(isLikelyDicomFile);
  const failures = [];
  const parsed = [];

  for (const file of candidates) {
    try {
      const meta = await parseSingleDicomFile(file);
      parsed.push({
        fileName: file.name,
        filePath: file.webkitRelativePath || file.name,
        ...meta,
      });
    } catch (error) {
      failures.push({
        fileName: file.name,
        reason: error?.message || 'DICOM 파싱 실패',
      });
    }
  }

  const seriesMap = new Map();
  parsed.forEach((item) => {
    const seriesKey = item.seriesInstanceUid || `unknown-${item.seriesNumber || '-'}-${item.seriesDescription || '-'}`;
    if (!seriesMap.has(seriesKey)) {
      seriesMap.set(seriesKey, {
        seriesKey,
        seriesInstanceUid: item.seriesInstanceUid || '-',
        seriesNumber: item.seriesNumber,
        seriesDescription: item.seriesDescription || '-',
        modality: item.modality || '-',
        instances: 0,
        filePaths: [],
      });
    }
    const target = seriesMap.get(seriesKey);
    target.instances += 1;
    target.filePaths.push(item.filePath);
  });

  const representative = parsed[0] || {};
  const series = sortSeries(Array.from(seriesMap.values()));

  return {
    totalSelected: files.length,
    candidateCount: candidates.length,
    parsedCount: parsed.length,
    failedCount: failures.length,
    skippedCount: files.length - candidates.length,
    patientName: representative.patientName || '-',
    patientId: representative.patientId || '-',
    studyDate: representative.studyDate || '-',
    studyDescription: representative.studyDescription || '-',
    series,
    failures,
  };
}
