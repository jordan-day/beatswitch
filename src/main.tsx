import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MobileApp } from './mobile/MobileApp';
import './index.css';

/**
 * Phones get the trimmed-down mobile version: a touch screen whose short side is phone-sized.
 * (Uses the device's screen, not the window, so rotating a phone doesn't swap versions, and a
 * narrow desktop window or a tablet still gets the full app.)
 */
const isPhone =
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches &&
  Math.min(window.screen.width, window.screen.height) < 600;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{isPhone ? <MobileApp /> : <App />}</React.StrictMode>);
