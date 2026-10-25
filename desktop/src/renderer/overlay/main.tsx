import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LaunchProvider } from './components/LaunchTransition';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LaunchProvider>
      <App />
    </LaunchProvider>
  </React.StrictMode>
);
