import { useState, useEffect } from 'react';

export type MascotState = 'idle' | 'talking' | 'alert' | 'sleeping' | 'glance' | 'question-mark';

interface MascotProps {
  state: MascotState;
  voiceActive?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Mascot({ state, voiceActive, onClick, onMouseEnter, onMouseLeave }: MascotProps) {
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    if (state === 'talking' || state === 'alert') {
      setBounce(true);
      const timer = setTimeout(() => setBounce(false), 500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Map states to emoji and styles
  const getStateAppearance = () => {
    switch (state) {
      case 'idle':
        return { emoji: '🐺', animation: 'idle' };
      case 'talking':
        return { emoji: '🐺', animation: 'talking' };
      case 'alert':
        return { emoji: '🐺', animation: 'alert' };
      case 'sleeping':
        return { emoji: '😴', animation: 'sleeping' };
      case 'glance':
        return { emoji: '👀', animation: 'glance' };
      case 'question-mark':
        return { emoji: '❓', animation: 'question' };
      default:
        return { emoji: '🐺', animation: 'idle' };
    }
  };

  const { emoji, animation } = getStateAppearance();

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: '120px',
        height: '120px',
        backgroundColor: state === 'alert' ? '#e74c3c' : '#3498db',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        border: '3px solid',
        borderColor: state === 'alert' ? '#c0392b' : '#2980b9',
        userSelect: 'none',
        position: 'relative',
        transform: bounce ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.3s ease',
        animation: `${animation} 2s ease-in-out infinite`
      }}
      className="mascot"
    >
      <div style={{
        fontSize: '48px',
        userSelect: 'none',
        animation: state === 'talking' ? 'talk 0.5s ease-in-out infinite' : 'none'
      }}>
        {emoji}
      </div>

      {/* Voice active indicator */}
      {voiceActive && (
        <div style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          width: '12px',
          height: '12px',
          backgroundColor: '#27ae60',
          borderRadius: '50%',
          animation: 'pulse 1s ease-in-out infinite'
        }} />
      )}

      {/* Question mark overlay for escalation level 2 */}
      {state === 'question-mark' && (
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          fontSize: '32px',
          animation: 'bounce 0.5s ease-in-out infinite'
        }}>
          ❓
        </div>
      )}
    </div>
  );
}
