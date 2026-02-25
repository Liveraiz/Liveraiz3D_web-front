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

export default function App() {
  const mainModuleRef = useRef(null);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [allDicomFiles, setAllDicomFiles] = useState([]);
  const [isConverting3D, setIsConverting3D] = useState(false);
  const [dicomSummary, setDicomSummary] = useState(null);
  const [isDicomParsing, setIsDicomParsing] = useState(false);
  const [dicomParseError, setDicomParseError] = useState('');
  const [selectedSeriesKey, setSelectedSeriesKey] = useState('');
  const [selectedNiftiFile, setSelectedNiftiFile] = useState(null);


  useEffect(() => {
    // Run existing imperative setup after the DOM is mounted
    import('./appController.js').then((mod) => {
      mainModuleRef.current = mod;
    });
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
  const handleSlectedSeriesChanged = async (seriesKey) => {
    setSelectedSeriesKey(seriesKey);

    const selectedSeries = dicomSummary?.series?.find((series) => series.seriesKey === seriesKey);
    const selectedPaths = new Set(selectedSeries?.filePaths || []);
    const selectedDicomFiles = (allDicomFiles ?? []).filter((file) =>
      selectedPaths.has(file.webkitRelativePath || file.name)
    );

    try {
      const dcm2niix = new Dcm2niix();
      await dcm2niix.init();
      const resultFileList = await dcm2niix.input(selectedDicomFiles).run();
      console.log('dcm2niix result', resultFileList);

      const niftiFile = resultFileList.find((f) => /\.nii(\.gz)?$/i.test(f.name));
      if (!niftiFile) throw new Error('NIfTI 결과 파일이 없습니다.');
      setSelectedNiftiFile(niftiFile);

      // Create NiiImage from the converted nifti file.
      // assume second of array is .nii file
      const image = await NVImage.loadFromFile({file: niftiFile}); 
      const topLeft = await setVolumeImageToAxialView(image);
      const bottomView = await setVolumeImageToCoronalAndSagittalView(image);

      bottomView.broadcastTo([topLeft], { "2d": true, "3d": true });
      topLeft.broadcastTo([bottomView], { "2d": true, "3d": true });
    } catch (err) {
      console.error('dcm2niix worker load/convert failed:', err);
    }
  }

  const handleDicomInput = async (files) => {
    const normalizedFiles = Array.from(files || []);
    setAllDicomFiles(normalizedFiles);
    setDicomParseError('');

    const mod = mainModuleRef.current;
    if (!mod?.handleDicomFiles) return;

    const statusEl = document.getElementById('status');

    if (normalizedFiles.length === 0) {
      setDicomSummary(null);
      setSelectedSeriesKey('');
      statusEl && (statusEl.textContent = '진행 중 없음');
      return;
    }

    try {
      setIsDicomParsing(true);
      setDicomSummary(null);
      statusEl && (statusEl.textContent = 'DICOM 파싱 중...');
      const summary = await mod.handleDicomFiles(normalizedFiles);
      setDicomSummary(summary || null);
      setSelectedSeriesKey(summary?.series?.[0]?.seriesKey || '');
      if (summary) {
        statusEl && (statusEl.textContent = `✅ 파싱 완료 (${summary.parsedCount}/${summary.candidateCount})`);
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
    if (!selectedNiftiFile) {
      const statusEl = document.getElementById('status');
      statusEl && (statusEl.textContent = '❌ 먼저 phase를 선택해 NIfTI를 생성하세요.');
      return;
    }
    await appController.handleConvertNiftiTo3D(selectedNiftiFile);
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
          <IconButton
            id="convert3dBtn"
            onClick={handle3DConvert}
            disabled={isConverting3D || isDicomParsing || allDicomFiles.length === 0}
          >
            {isConverting3D ? '변환 중...' : '3D변환'}
          </IconButton>
          <span id="status" style={{ fontSize: 14, color: '#ccc' }}>
            진행 중 없음
          </span>
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
