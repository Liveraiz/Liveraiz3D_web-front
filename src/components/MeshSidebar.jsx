import React from 'react';

export function MeshSidebar() {
  return (
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
  );
}
