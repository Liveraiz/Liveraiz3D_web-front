import React from 'react';

const baseStyle = {
  padding: '6px 12px',
  fontSize: 14,
  borderRadius: 4,
  border: '1px solid #666',
  background: '#222',
  color: 'white',
  cursor: 'pointer',
};

export function IconButton({ id, children, style, ...rest }) {
  return (
    <button id={id} style={{ ...baseStyle, ...style }} {...rest}>
      {children}
    </button>
  );
}
