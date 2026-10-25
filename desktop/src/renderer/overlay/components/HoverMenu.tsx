import { useState, useEffect } from 'react';

interface HoverMenuProps {
  visible: boolean;
  onOpenTestPanel?: () => void;
  onSnooze?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onTestIdle?: () => void;
  onTestTalking?: () => void;
  onTestAngry?: () => void;
  onTestSleeping?: () => void;
  onTestThinking?: () => void;
  onTestHintModal?: () => void;
  onHide?: () => void;
  isPaused?: boolean;
}

export function HoverMenu({
  visible,
  onOpenTestPanel,
  onSnooze,
  onPause,
  onResume,
  onTestIdle,
  onTestTalking,
  onTestAngry,
  onTestSleeping,
  onTestThinking,
  onTestHintModal,
  onHide,
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
    <div
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: '180px',
        opacity: show ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        pointerEvents: visible ? 'auto' : 'none',
        marginBottom: '10px',
        zIndex: 10
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

        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          margin: '8px 0',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.5)',
          textAlign: 'center',
          padding: '4px 0'
        }}>
          Animations
        </div>

        <button
          onClick={onTestIdle}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#95a5a6',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(149, 165, 166, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          😊 Idle
        </button>

        <button
          onClick={onTestTalking}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#3498db',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          💬 Talking
        </button>

        <button
          onClick={onTestAngry}
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
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          😠 Angry
        </button>

        <button
          onClick={onTestSleeping}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#7f8c8d',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(127, 140, 141, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          😴 Sleeping
        </button>

        <button
          onClick={onTestThinking}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#9b59b6',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(155, 89, 182, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          🤔 Test Thinking
        </button>

        <button
          onClick={onTestHintModal}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#3498db',
            textAlign: 'left',
            transition: 'background-color 0.2s',
            marginBottom: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          💬 Test Hint Modal
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
              transition: 'background-color 0.2s',
              marginBottom: '4px'
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
              transition: 'background-color 0.2s',
              marginBottom: '4px'
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

        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          margin: '4px 0'
        }}></div>

        <button
          onClick={onHide}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#95a5a6',
            textAlign: 'left',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(149, 165, 166, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          👁️ Hide Wolfie
        </button>
      </div>
    </div>
  );
}
