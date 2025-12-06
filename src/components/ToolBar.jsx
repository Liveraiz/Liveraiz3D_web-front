import React from 'react';

const toolBarStyle = { display: 'flex', alignItems: 'center' };

export function ToolBar({ children }) {
  return <div style={toolBarStyle}>{children}</div>;
}
