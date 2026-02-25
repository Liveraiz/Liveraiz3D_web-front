import React from 'react';

const SummaryField = ({ label, value }) => (
  <div className="dicom-summary-field">
    <span className="dicom-summary-label">{label}</span>
    <span className="dicom-summary-value">{value}</span>
  </div>
);

export function DicomSummaryPanel({
  summary,
  isParsing,
  error,
  selectedSeriesKey,
  onSelectSeries,
}) {
  if (isParsing) {
    return <p className="dicom-summary-message">파일을 읽고 있습니다...</p>;
  }

  if (error) {
    return <p className="dicom-summary-message">파싱 실패: {error}</p>;
  }

  if (!summary) {
    return <p className="dicom-summary-message">파일을 선택하면 파싱 결과가 여기에 표시됩니다.</p>;
  }

  return (
    <>
      <div className="dicom-summary-section">
        <h4>Patient / Study</h4>
        <SummaryField label="Patient Name" value={summary.patientName} />
        <SummaryField label="Patient ID" value={summary.patientId} />
        <SummaryField label="Study Date" value={summary.studyDate} />
        <SummaryField label="Study Desc" value={summary.studyDescription} />
      </div>

      <div className="dicom-summary-section">
        <h4>Volume List ({summary.series.length})</h4>
        {summary.series.length === 0 ? (
          <p className="dicom-summary-message">파싱된 Series 정보가 없습니다.</p>
        ) : (
          <table className="dicom-series-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Description</th>
                <th>Modality</th>
                <th>Instances</th>
              </tr>
            </thead>
            <tbody>
              {summary.series.map((item, index) => {
                const isSelected = selectedSeriesKey === item.seriesKey;
                return (
                  <tr
                    key={item.seriesKey}
                    className={isSelected ? 'dicom-series-row is-selected' : 'dicom-series-row'}
                    onClick={() => onSelectSeries?.(item.seriesKey)}
                  >
                    <td>{item.seriesNumber == null ? index + 1 : item.seriesNumber}</td>
                    <td>{item.seriesDescription || '-'}</td>
                    <td>{item.modality || '-'}</td>
                    <td>{item.instances}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {summary.failures.length > 0 && (
        <div className="dicom-summary-section">
          <h4>파싱 실패 파일</h4>
          <ul className="dicom-failure-list">
            {summary.failures.slice(0, 5).map((failure) => (
              <li key={`${failure.fileName}-${failure.reason}`}>
                {failure.fileName} ({failure.reason})
              </li>
            ))}
          </ul>
          {summary.failures.length > 5 && (
            <p className="dicom-summary-message">외 {summary.failures.length - 5}개</p>
          )}
        </div>
      )}
    </>
  );
}
