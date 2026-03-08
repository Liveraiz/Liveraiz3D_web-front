import React, { useEffect, useRef, useState } from 'react';
import './styles.css';
import { IconButton } from './components/IconButton.jsx';
import { MeshSidebar } from './components/MeshSidebar.jsx';
import { ViewerArea } from './components/ViewerArea.jsx';
import { DicomFileSelector } from './components/DicomFileSelector.jsx';
import { LiveraizLogo } from './components/LiveraizLogo.jsx';
import { ToolBar } from './components/ToolBar.jsx';
import { Dcm2niix } from '@niivue/dcm2niix'

import {
  NVImage
} from "@niivue/niivue";

import {
  setVolumeImageToAxialView,
  setVolumeImageToCoronalAndSagittalView
} from './features/viewer/niiViewer.js'

const NIFTI_EXT_REGEX = /\.nii(\.gz)?$/i;
const JSON_EXT_REGEX = /\.json$/i;
const HEALTH_CHECK_URL = 'https://smc-ssiso-ai.ngrok.app/health';
// const HEALTH_CHECK_URL = 'http://localhost:8000/health';

const HEALTH_CHECK_INTERVAL_MS = 1000;
const HEALTH_CHECK_TIMEOUT_MS = 500;

const stripNiftiExtension = (name) => name.replace(NIFTI_EXT_REGEX, '');
const stripJsonExtension = (name) => name.replace(JSON_EXT_REGEX, '');

const sortByBaseNameLength = (a, b) => (
  stripNiftiExtension(a.name).length - stripNiftiExtension(b.name).length
  || a.name.localeCompare(b.name)
);

function pickPrimaryNiftiFile(resultFileList) {
  const niftiFiles = resultFileList.filter((file) => NIFTI_EXT_REGEX.test(file.name));
  if (niftiFiles.length === 0) return null;
  if (niftiFiles.length === 1) return niftiFiles[0];

  const jsonBaseNames = new Set(
    resultFileList
      .filter((file) => JSON_EXT_REGEX.test(file.name))
      .map((file) => stripJsonExtension(file.name))
  );

  const matchedWithJson = niftiFiles.filter(
    (file) => jsonBaseNames.has(stripNiftiExtension(file.name))
  );

  if (matchedWithJson.length > 0) {
    return [...matchedWithJson].sort(sortByBaseNameLength)[0];
  }

  return [...niftiFiles].sort(sortByBaseNameLength)[0];
}

export default function App() {
  const mainModuleRef = useRef(null);
  const healthCheckInFlightRef = useRef(false);
  const segmentationModels = [
    'HCC-CT-PP30',
    'HCC-MR20min',
    'HCC-MRPP',
    'LDLT-MRCP3Dgrase',
    'LDLT-Recip70',
    'PDAC-Pancreas',
    'PS-Flap100',
    'Kidney-CT-AP',
    'Liver-PV-5section',
  ];
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [allDicomFiles, setAllDicomFiles] = useState([]);
  const [isConverting3D, setIsConverting3D] = useState(false);
  const [dicomSummary, setDicomSummary] = useState(null);
  const [isDicomParsing, setIsDicomParsing] = useState(false);
  const [dicomParseError, setDicomParseError] = useState('');
  const [selectedSeriesKey, setSelectedSeriesKey] = useState('');
  const [selectedNiftiFile, setSelectedNiftiFile] = useState(null);
  const [selectedSegmentationModel, setSelectedSegmentationModel] = useState(segmentationModels[0]);
  const [inferenceServerStatus, setInferenceServerStatus] = useState('busy');


  useEffect(() => {
    // Run existing imperative setup after the DOM is mounted
    import('./appController.js').then((mod) => {
      mainModuleRef.current = mod;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    let intervalId = null;

    const checkHealth = async () => {
      if (healthCheckInFlightRef.current) return;
      healthCheckInFlightRef.current = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const startedAt = performance.now();

      try {
        const response = await fetch(HEALTH_CHECK_URL, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const elapsedMs = performance.now() - startedAt;
        const isReady = response.ok && elapsedMs <= HEALTH_CHECK_TIMEOUT_MS;
        if (isMounted) {
          setInferenceServerStatus(isReady ? 'ready' : 'busy');
        }
      } catch (err) {
        if (isMounted) {
          setInferenceServerStatus('busy');
        }
      } finally {
        clearTimeout(timeoutId);
        healthCheckInFlightRef.current = false;
      }
    };

    checkHealth();
    intervalId = window.setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const callMainHandler = (fnName) => () => {
    const mod = mainModuleRef.current;
    if (mod && typeof mod[fnName] === 'function') {
      mod[fnName]();
    }
  };

  const handleUndo = callMainHandler('handleUndoClick');
  const handleEditorToggle = callMainHandler('handleEditorToggle');
  const handleDraw = callMainHandler('handleDrawClick');
  const handleSidebarToggle = callMainHandler('handleSidebarToggle');
  const handleEditModeToggle = callMainHandler('handleEditModeToggle');

  const handleTestLoad = async () => {
    if (!mainModuleRef.current?.loadTestVolumes) return;
    const statusEl = document.getElementById('status');
    try {
      setIsTestLoading(true);
      statusEl && (statusEl.textContent = '로딩 중... ⏳');
      const meshes = await mainModuleRef.current.loadTestVolumes();
      statusEl && (statusEl.textContent = '✅ 테스트 볼륨 로드 완료');
      return meshes;
    } catch (err) {
      console.error(err);
      statusEl && (statusEl.textContent = `❌ 오류: ${err.message}`);
    } finally {
      setIsTestLoading(false);
      setTimeout(() => {
        statusEl && (statusEl.textContent = '진행 중 없음');
      }, 1500);
    }
  };

  // 로드된 DICOM Series 중 사용자가 선택한 볼륨을 선택했을 때 호출 된다.
  const handleSlectedSeriesChanged = async (seriesKey, options = {}) => {
    const summarySource = options.summary ?? dicomSummary;
    const filesSource = options.files ?? allDicomFiles;
    const mod = mainModuleRef.current;
    const statusEl = document.getElementById('status');
    setSelectedSeriesKey(seriesKey);
    setSelectedNiftiFile(null);

    try {
      if (typeof mod?.resetWorkspaceForNewInput === 'function') {
        await mod.resetWorkspaceForNewInput();
      }
    } catch (err) {
      console.error('workspace reset failed on series change:', err);
    }

    const selectedSeries = summarySource?.series?.find((series) => series.seriesKey === seriesKey);
    if (!selectedSeries) return;

    const selectedPaths = new Set(selectedSeries?.filePaths || []);
    const selectedDicomFiles = (filesSource ?? []).filter((file) =>
      selectedPaths.has(file.webkitRelativePath || file.name)
    );

    try {
      const dcm2niix = new Dcm2niix();
      await dcm2niix.init();
      statusEl && (statusEl.textContent = '선택한 Series 로드 중...');
      const resultFileList = await dcm2niix.input(selectedDicomFiles).run();
      console.log('dcm2niix result', resultFileList);

      const niftiFile = pickPrimaryNiftiFile(resultFileList);
      if (!niftiFile) throw new Error('NIfTI 결과 파일이 없습니다.');
      console.log('selected primary nifti:', niftiFile.name);
      setSelectedNiftiFile(niftiFile);

      // Create NiiImage from the converted nifti file.
      // assume second of array is .nii file
      const image = await NVImage.loadFromFile({file: niftiFile}); 
      const topLeft = await setVolumeImageToAxialView(image);
      const bottomView = await setVolumeImageToCoronalAndSagittalView(image);

      bottomView.broadcastTo([topLeft], { "2d": true, "3d": true });
      topLeft.broadcastTo([bottomView], { "2d": true, "3d": true });
      statusEl && (statusEl.textContent = 'nii has been loaded.');
    } catch (err) {
      console.error('dcm2niix worker load/convert failed:', err);
      statusEl && (statusEl.textContent = `❌ Series 로드 실패: ${err.message}`);
    }
  }

  const handleDicomInput = async (files) => {
    const normalizedFiles = Array.from(files || []);
    setAllDicomFiles(normalizedFiles);
    setDicomParseError('');
    setSelectedNiftiFile(null);
    setSelectedSeriesKey('');
    setDicomSummary(null);
    setIsConverting3D(false);

    const mod = mainModuleRef.current;
    if (!mod?.handleDicomFiles) return;

    const statusEl = document.getElementById('status');

    try {
      if (typeof mod.resetWorkspaceForNewInput === 'function') {
        await mod.resetWorkspaceForNewInput();
      }
    } catch (err) {
      console.error('workspace reset failed:', err);
    }

    if (normalizedFiles.length === 0) {
      statusEl && (statusEl.textContent = '진행 중 없음');
      return;
    }

    try {
      setIsDicomParsing(true);
      setDicomSummary(null);
      statusEl && (statusEl.textContent = 'DICOM 파싱 중...');
      const summary = await mod.handleDicomFiles(normalizedFiles);
      setDicomSummary(summary || null);
      const firstSeriesKey = summary?.series?.[0]?.seriesKey || '';
      setSelectedSeriesKey(firstSeriesKey);
      if (summary) {
        statusEl && (statusEl.textContent = `✅ 파싱 완료 (${summary.parsedCount}/${summary.candidateCount})`);
        if (summary.series.length === 1 && firstSeriesKey) {
          statusEl && (statusEl.textContent = '단일 Series 자동 선택 중...');
          await handleSlectedSeriesChanged(firstSeriesKey, { summary, files: normalizedFiles });
        }
      } else {
        statusEl && (statusEl.textContent = '진행 중 없음');
      }
    } catch (err) {
      console.error(err);
      setDicomSummary(null);
      setDicomParseError(err.message);
      setSelectedSeriesKey('');
      statusEl && (statusEl.textContent = `❌ 파싱 오류: ${err.message}`);
    } finally {
      setIsDicomParsing(false);
    }
  };

  const handle3DConvert = async () => {
    const appController = mainModuleRef.current;
    const statusEl = document.getElementById('status');

    if (!selectedNiftiFile) {
      statusEl && (statusEl.textContent = '❌ 먼저 phase를 선택해 NIfTI를 생성하세요.');
      return;
    }

    try {
      setIsConverting3D(true);
      statusEl && (statusEl.textContent = 'Auto-Segmentation 진행 중...');
      await appController.handleConvertNiftiTo3D(selectedNiftiFile, selectedSegmentationModel);
      statusEl && (statusEl.textContent = '✅ Auto-Segmentation 완료');
    } catch (err) {
      console.error(err);
      statusEl && (statusEl.textContent = `❌ Auto-Segmentation 오류: ${err.message}`);
    } finally {
      setIsConverting3D(false);
    }
  };

  return (
    <div className="app-shell">
      <header style={headerStyle}>
        <LiveraizLogo />
        <ToolBar>
          <IconButton id="undoBtn" onClick={handleUndo}>
            ↩️
          </IconButton>
          <IconButton id="editorBtn" onClick={handleEditorToggle}>
            ✂️
          </IconButton>
          <IconButton id="drawBtn" onClick={handleDraw}>
            🖌️
          </IconButton>
          <IconButton id="sidebarToggle" className="mobile-toggle-btn" onClick={handleSidebarToggle}>
            📑 목록
          </IconButton>
          <IconButton
            id="editModeBtn"
            style={{ background: '#0066cc', marginLeft: 4 }}
            onClick={handleEditModeToggle}>
            🎯 부분
          </IconButton>
          <DicomFileSelector onChange={(files) => handleDicomInput(files)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, color: '#ccc', fontSize: 13 }}>
            Segmentation Model:
            <select
              id="segmentationModelSelect"
              value={selectedSegmentationModel}
              onChange={(event) => setSelectedSegmentationModel(event.target.value)}
              style={{
                minWidth: 180,
                height: 34,
                background: '#1a1a1a',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: 6,
                padding: '8px 8px',
                marginRight: 8,
              }}
            >
              {segmentationModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <IconButton
            id="convert3dBtn"
            onClick={handle3DConvert}
            disabled={isConverting3D || isDicomParsing || allDicomFiles.length === 0}
          >
            {isConverting3D ? 'Processing...' : 'Auto-Segment'}
          </IconButton>
          <div className="server-health-indicator" role="status" aria-live="polite">
            <span
              className={`server-health-dot ${inferenceServerStatus === 'ready' ? 'is-ready' : 'is-busy'}`}
              aria-hidden="true"
            />
            <span className="server-health-text">
              {inferenceServerStatus === 'ready' ? 'Standby' : 'Busy'}
            </span>
          </div>
          <div className={`status-indicator ${isConverting3D ? 'is-busy' : ''}`}>
            <span id="status" style={{ fontSize: 14, color: '#ccc' }}>
              진행 중 없음
            </span>
            {isConverting3D && (
              <div
                className="status-progress"
                role="progressbar"
                aria-label="Auto-Segmentation 진행 중"
                aria-valuetext="진행률을 계산할 수 없는 처리입니다"
              >
                <div className="status-progress-bar" />
              </div>
            )}
          </div>
          <IconButton
            style={{ marginLeft: 8 }}
            onClick={handleTestLoad}
            disabled={isTestLoading}
          >
            {isTestLoading ? '로딩 중... ⏳' : '🧪 테스트 볼륨 로드'}
          </IconButton>
        </ToolBar>
      </header>

      <div id="mainLayout">
        <MeshSidebar
          dicomSummary={dicomSummary}
          isDicomParsing={isDicomParsing}
          dicomParseError={dicomParseError}
          selectedSeriesKey={selectedSeriesKey}
          onSelectSeries={handleSlectedSeriesChanged}
        />
        <ViewerArea />
      </div>
    </div>
  );
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 20px',
  backgroundColor: '#111',
  borderBottom: '1px solid #444',
  color: 'white',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  boxSizing: 'border-box',
};
