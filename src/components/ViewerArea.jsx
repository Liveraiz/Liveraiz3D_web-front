import React from 'react';

export function ViewerArea() {
  return (
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
  );
}
