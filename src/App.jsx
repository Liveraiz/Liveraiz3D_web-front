import React, { useEffect, useRef, useState } from 'react';
import './styles.css';
import logo from './images/logo.png';
import { IconButton } from './components/IconButton.jsx';

export default function App() {
  const mainModuleRef = useRef(null);
  const [isTestLoading, setIsTestLoading] = useState(false);

  useEffect(() => {
    // Run existing imperative setup after the DOM is mounted
    import('./main.js').then((mod) => {
      mainModuleRef.current = mod;
    });
  }, []);

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
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 20px',
          backgroundColor: '#111',
          borderBottom: '1px solid #444',
          color: 'white',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logo} alt="Liveraizer Logo" style={{ height: 36, objectFit: 'contain', display: 'block' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <IconButton id="undoBtn">↩️</IconButton>
          <IconButton id="editorBtn">✂️</IconButton>
          <IconButton id="drawBtn">🖌️</IconButton>

          <button
            id="sidebarToggle"
            className="mobile-toggle-btn"
            style={{
              padding: '6px 12px',
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #666',
              background: '#222',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            📑 목록
          </button>

          <button
            id="editModeBtn"
            style={{
              padding: '6px 12px',
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #666',
              background: '#0066cc',
              color: 'white',
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            🎯 부분
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="file" id="dicomInput" webkitdirectory="true" multiple />
          <span id="status" style={{ fontSize: 14, color: '#ccc' }}>
            진행 중 없음
          </span>
          <button
            style={{
              padding: '6px 12px',
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #666',
              background: '#222',
              color: 'white',
              cursor: 'pointer',
              marginLeft: 8,
            }}
            onClick={handleTestLoad}
            disabled={isTestLoading}
          >
            {isTestLoading ? '로딩 중... ⏳' : '🧪 테스트 볼륨 로드'}
          </button>
        </div>
      </header>

      <div id="mainLayout">
        <div id="meshSidebar">
          <button id="closeSidebarBtn" className="mobile-close-btn">
            ✕ 닫기
          </button>
          <div id="meshList"></div>
          <div id="segmentEditControllers">
            <div>Diameter</div>
            <input id="brushSlider" type="range" min="0" max="1" step="0.01" />
          </div>
        </div>

        <div id="viewerArea">
          <div id="viewerContentArea" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="viewport-top">
              <div id="leftTopContainer">
                <canvas id="leftTop"></canvas>
              </div>

              <div id="bottomHalf" style={{ position: 'relative' }}>
                <div id="labelContainer" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 20 }}></div>
                <canvas id="threeCanvas"></canvas>
                <canvas id="lassoCanvas" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}></canvas>
                <div id="scissorIcon" style={{ position: 'absolute', zIndex: 100, pointerEvents: 'none', display: 'none', fontSize: 20 }}>
                  ✂️
                </div>
              </div>
            </div>

            <div id="topViewer" style={{ height: 300 }}>
              <canvas id="canvasTop" style={{ width: '100%', height: '100%' }}></canvas>
              <canvas id="canvasMulti" style={{ width: '100%', height: '100%' }}></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
