import React from 'react';
import logo from '../images/logo.png';

const logoImgStyle = { height: 36, objectFit: 'contain', display: 'block' };

export function LiveraizLogo() {
  return <img src={logo} alt="Liveraizer Logo" style={logoImgStyle} />;
}
