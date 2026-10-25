import React, { useState, useEffect } from 'react';
import { Nudge, NudgeButtonType } from '@wolfie/shared';

interface SpeechBubbleProps {
  nudge: Nudge | null;
  onButtonClick?: (action: string) => void;
  onDismiss?: (action?: 'dismissed' | 'timeout') => void;
}

export function SpeechBubble({ nudge, onButtonClick, onDismiss }: SpeechBubbleProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (nudge) {
      setVisible(true);

      // Auto-dismiss after 10 seconds if no buttons
      if (!nudge.buttons || nudge.buttons.length === 0) {
        const timer = setTimeout(() => {
          handleDismiss('timeout');
        }, 10000);
        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [nudge]);

  const handleDismiss = (action?: 'dismissed' | 'timeout') => {
    setVisible(false);
    setTimeout(() => {
      onDismiss?.(action);
    }, 300); // Wait for fade out animation
  };

  const handleButtonClick = (button: NudgeButtonType) => {
    onButtonClick?.(button.action);
    handleDismiss();
  };

  if (!nudge || !visible) {
    return null;
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '140px',
      left: '50%',
      transform: 'translateX(-50%)',
      minWidth: '200px',
      maxWidth: '300px',
      animation: 'fadeIn 0.3s ease-in-out',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease-in-out'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: '2px solid #3498db',
        position: 'relative',
        // Long text scrolls inside the bubble instead of running out of Wolfie's window
        maxHeight: '300px',
        overflowY: 'auto',
        // The page is a window-drag region (overlay.html); the bubble must take real mouse input
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}>
        {/* Speech bubble pointer */}
        <div style={{
          position: 'absolute',
          bottom: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid white'
        }} />

        {/* Close button */}
        <button
          onClick={() => handleDismiss('dismissed')}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
            color: '#95a5a6'
          }}
        >
          ×
        </button>

        {/* Message text */}
        <div style={{
          fontSize: '14px',
          lineHeight: '1.4',
          color: '#2c3e50',
          marginBottom: nudge.buttons && nudge.buttons.length > 0 ? '12px' : 0,
          paddingRight: '20px'
        }}>
          {nudge.text}
        </div>

        {/* Buttons */}
        {nudge.buttons && nudge.buttons.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {nudge.buttons.map((button, index) => (
              <button
                key={index}
                onClick={() => handleButtonClick(button)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: button.variant === 'primary' ? '#3498db' :
                                  button.variant === 'danger' ? '#e74c3c' : '#ecf0f1',
                  color: button.variant === 'primary' || button.variant === 'danger' ? 'white' : '#2c3e50',
                  transition: 'all 0.2s ease',
                  fontWeight: button.variant === 'primary' ? '600' : '400'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
