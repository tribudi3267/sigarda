import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { daftarkanSW } from './lib/pushClient';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker (notifikasi push dan aplikasi terpasang). Hanya pada build terbit: dev dan mode lokal tidak memakainya.
if (import.meta.env.PROD) window.addEventListener('load', () => daftarkanSW(import.meta.env.BASE_URL));
