import { useState, useEffect } from 'react';

interface HoverMenuProps {
  visible: boolean;
  onOpenTestPanel?: () => void;
  onSnooze?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
}

export function HoverMenu({
  visible,
  onOpenTestPanel,
  onSnooze,
  onPause,
  onResume,
  isPaused = false
}: HoverMenuProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      // Small delay for smooth appearance
      const timer = setTimeout(() => setShow(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [visible]);

  if (!visible && !show) return null;

  return (
    <div style={{
      minWidth: '180px',
      opacity: show ? 1 : 0,
      transition: 'opacity 0.2s ease-in-out',
      pointerEvents: visible ? 'auto' : 'none',
      marginBottom: '10px'
    }}>
      <div style={{
        backgroundColor: 'rgba(44, 62, 80, 0.95)',
        borderRadius: '8px',
        padding: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <button
          onClick={onOpenTestPanel}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: 'white',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          🧪 Test Panel
        </button>

        <button
          onClick={onSnooze}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: 'white',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          😴 Snooze 30min
        </button>

        {isPaused ? (
          <button
            onClick={onResume}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: '#27ae60',
              textAlign: 'left',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(39, 174, 96, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ▶️ Resume
          </button>
        ) : (
          <button
            onClick={onPause}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: '#e74c3c',
              textAlign: 'left',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ⏸️ Pause
          </button>
        )}
      </div>
    </div>
  );
}
