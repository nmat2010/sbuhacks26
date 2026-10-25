import { useState, useEffect } from 'react';
import wolfieMascotImage from '../assets/wolfie_static.png';
import wolfieIdleSprite from '../assets/wolfie_idle.png';
import wolfieTalkingSprite from '../assets/wolfie_talking.png';
import wolfieSleepingSprite from '../assets/wolfie_sleeping.png';
import wolfieAngrySprite from '../assets/wolfie_angry.png';
import wolfieThinkingSprite from '../assets/wolfie_thinking.png';
import { SpriteAnimation } from './SpriteAnimation';

export type MascotState = 'idle' | 'talking' | 'angry' | 'sleeping' | 'thinking';

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
    if (state === 'talking' || state === 'angry') {
      setBounce(true);
      const timer = setTimeout(() => setBounce(false), 500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Use sprite animation for all states
  const usesSpriteAnimation = ['idle', 'talking', 'angry', 'sleeping', 'thinking'].includes(state);

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
        transition: 'all 0.3s ease'
      }}
      className="mascot"
    >
      {/* Sprite Animations for all animated states */}
      {state === 'idle' && (
        <SpriteAnimation
          src={wolfieIdleSprite}
          frames={4}
          fps={2}
          loop={true}
          size={220}
        />
      )}

      {state === 'talking' && (
        <SpriteAnimation
          src={wolfieTalkingSprite}
          frames={4}
          fps={4}
          loop={true}
          size={220}
        />
      )}

      {state === 'angry' && (
        <SpriteAnimation
          src={wolfieAngrySprite}
          frames={4}
          fps={6}
          loop={true}
          size={220}
        />
      )}

      {state === 'sleeping' && (
        <SpriteAnimation
          src={wolfieSleepingSprite}
          frames={4}
          fps={2}
          loop={true}
          size={220}
        />
      )}

      {state === 'thinking' && (
        <SpriteAnimation
          src={wolfieThinkingSprite}
          frames={4}
          fps={3}
          loop={true}
          size={220}
        />
      )}

      {/* Static Wolfie Mascot for normal states */}
      {!usesSpriteAnimation && (
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
      )}

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
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
        }} />
      )}
    </div>
  );
}
