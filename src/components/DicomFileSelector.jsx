import React from 'react';

export function DicomFileSelector({ onChange }) {
  const inputStyle = {
    fontSize: 14,
    backgroundColor: '#000000',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    marginRight: 8,
    cursor: 'pointer',
  };

  return (
    <>
      <input
        type="file"
        id="dicomInput"
        webkitdirectory="true"
        multiple
        style={inputStyle}
        onChange={(e) => onChange?.(e.target.files)}
      />
    </>
  );
}
