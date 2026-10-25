import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../../../../design/tokens.css';
import '@fontsource/press-start-2p';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '../../../../design/pixel.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
