import { useState, useEffect } from 'react';
import wolfieMascotImage from '../assets/wolfie_mascot.png';

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

  // Map states to animation
  const getAnimation = () => {
    switch (state) {
      case 'idle': return 'idle';
      case 'talking': return 'talking';
      case 'alert': return 'alert';
      case 'sleeping': return 'sleeping';
      case 'glance': return 'glance';
      case 'question-mark': return 'question';
      default: return 'idle';
    }
  };

  const animation = getAnimation();

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        transform: bounce ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.3s ease',
        animation: `${animation} 2s ease-in-out infinite`
      }}
      className="mascot"
    >
      {/* Wolfie Mascot */}
      <img
        src={wolfieMascotImage}
        alt="Wolfie Mascot"
        style={{
          width: '220px',
          height: 'auto',
          userSelect: 'none',
          pointerEvents: 'none',
          opacity: state === 'sleeping' ? 0.7 : 1
        }}
      />

      {/* Voice active indicator */}
      {voiceActive && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '16px',
          height: '16px',
          backgroundColor: '#27ae60',
          borderRadius: '50%',
          border: '2px solid white',
          animation: 'pulse 1s ease-in-out infinite',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
        }} />
      )}
    </div>
  );
}
