import React from 'react';
import { DicomSummaryPanel } from './DicomSummaryPanel.jsx';

export function MeshSidebar({
  dicomSummary,
  isDicomParsing,
  dicomParseError,
  selectedSeriesKey,
  onSelectSeries,
}) {
  return (
    <div id="meshSidebar">
      <button id="closeSidebarBtn" className="mobile-close-btn">
        ✕ 닫기
      </button>
      <div id="meshList"></div>
      <section id="dicomSummary" aria-live="polite">
        <h3 id="dicomSummaryTitle">DICOM Summary</h3>
        <div id="dicomSummaryContent">
          <DicomSummaryPanel
            summary={dicomSummary}
            isParsing={isDicomParsing}
            error={dicomParseError}
            selectedSeriesKey={selectedSeriesKey}
            onSelectSeries={onSelectSeries}
          />
        </div>
      </section>
      <div id="segmentEditControllers">
        <div>Diameter</div>
        <input id="brushSlider" type="range" min="0" max="1" step="0.01" />
      </div>
    </div>
  );
}
