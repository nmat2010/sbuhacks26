import { useState } from 'react';
import { Canvas } from './Canvas';
import { Camera } from './Camera';
import { WolfieWidget } from './WolfieWidget';
import './NotebookScreen.css';

interface NotebookScreenProps {
  connected: boolean;
  sync: any;
  onUnpair: () => void;
}

export function NotebookScreen({ connected, sync, onUnpair }: NotebookScreenProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [showWolfie, setShowWolfie] = useState(true);

  const handleCameraCapture = (_imageDataUrl: string) => {
    console.log('[Notebook] Photo captured');
    setShowCamera(false);
    // TODO: Send to desktop for processing
  };

  const handleAskWolfie = async (question: string) => {
    try {
      await sync.sendHintRequest(question, {
        type: 'handwriting',
        description: 'Student is working on notebook canvas'
      });
    } catch (error) {
      console.error('[Notebook] Failed to send hint request:', error);
    }
  };

  return (
    <div className="notebook-screen">
      {/* Header */}
      <header className="notebook-header">
        <div className="header-left">
          <div className="wolfie-icon">🐺</div>
          <h1>Wolfie Notebook</h1>
        </div>
        <div className="header-right">
          <div className="connection-status">
            <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span>{connected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <button className="btn btn-icon" onClick={() => setShowCamera(true)} title="Take Photo">
            📷
          </button>
          <button className="btn btn-icon" onClick={onUnpair} title="Unpair">
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Canvas */}
      <div className="notebook-main">
        <Canvas onDataChange={() => {/* TODO: Handle canvas data changes */}} />
      </div>

      {/* Wolfie Widget */}
      {showWolfie && (
        <WolfieWidget
          onAsk={handleAskWolfie}
          lastResponse={sync.lastHintResponse}
          onClose={() => setShowWolfie(false)}
        />
      )}

      {/* Floating Action Buttons */}
      {!showWolfie && (
        <button
          className="fab"
          onClick={() => setShowWolfie(true)}
          title="Ask Wolfie"
        >
          🐺
        </button>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <Camera
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
