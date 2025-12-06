import React, { useEffect, useRef, useState } from 'react';
import './styles.css';
import logo from './images/logo.png';
import { IconButton } from './components/IconButton.jsx';
import { MeshSidebar } from './components/MeshSidebar.jsx';
import { ViewerArea } from './components/ViewerArea.jsx';

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

export default function App() {
  const mainModuleRef = useRef(null);
  const [isTestLoading, setIsTestLoading] = useState(false);

  useEffect(() => {
    // Run existing imperative setup after the DOM is mounted
    import('./main.js').then((mod) => {
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

  return (
    <div className="app-shell">
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logo} alt="Liveraizer Logo" style={{ height: 36, objectFit: 'contain', display: 'block' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <IconButton id="undoBtn" onClick={handleUndo}>↩️</IconButton>
          <IconButton id="editorBtn" onClick={handleEditorToggle}>✂️</IconButton>
          <IconButton id="drawBtn" onClick={handleDraw}>🖌️</IconButton>

          <IconButton id="sidebarToggle" className="mobile-toggle-btn" onClick={handleSidebarToggle}>
            📑 목록
          </IconButton>

          <IconButton
            id="editModeBtn"
            style={{ background: '#0066cc', marginLeft: 4 }}
            onClick={handleEditModeToggle}
          >
            🎯 부분
          </IconButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="file" id="dicomInput" webkitdirectory="true" multiple />
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
        </div>
      </header>

      <div id="mainLayout">
        <MeshSidebar />

        <ViewerArea />
      </div>
    </div>
  );
}
