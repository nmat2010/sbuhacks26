import { useState, useRef } from 'react';

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const mascotRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    // Disable click-through when hovering over mascot
    window.electronAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    // Re-enable click-through when not hovering
    if (!isDragging) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div
        ref={mascotRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{
          width: '120px',
          height: '120px',
          backgroundColor: '#e74c3c',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          WebkitAppRegion: 'no-drag',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '3px solid #c0392b',
          userSelect: 'none'
        }}
      >
        <div style={{
          fontSize: '48px',
          userSelect: 'none'
        }}>
          🐺
        </div>
      </div>
    </div>
  );
}

export default App;
