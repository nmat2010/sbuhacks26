interface EffectProps {
  visible: boolean;
}

export function ThoughtBubble({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '-60px',
      right: '20px',
      fontSize: '40px',
      animation: 'float 2s ease-in-out infinite',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s'
    }}>
      💭
    </div>
  );
}

export function QuestionMark({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '-70px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '50px',
      animation: 'bounce 0.6s ease-in-out infinite',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s'
    }}>
      ❓
    </div>
  );
}

export function ExclamationMark({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '-70px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '50px',
      animation: 'shake 0.5s ease-in-out infinite',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s'
    }}>
      ❗
    </div>
  );
}

export function Lightbulb({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '-80px',
      right: '10px',
      fontSize: '50px',
      animation: 'popIn 0.5s ease-out, glow 1s ease-in-out infinite',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s',
      filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.8))'
    }}>
      💡
    </div>
  );
}

export function Sparkles({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <>
      <div style={{
        position: 'absolute',
        top: '-40px',
        left: '-20px',
        fontSize: '30px',
        animation: 'twinkle 1s ease-in-out infinite',
        animationDelay: '0s',
        opacity: visible ? 1 : 0
      }}>
        ✨
      </div>
      <div style={{
        position: 'absolute',
        top: '-60px',
        right: '-10px',
        fontSize: '35px',
        animation: 'twinkle 1s ease-in-out infinite',
        animationDelay: '0.3s',
        opacity: visible ? 1 : 0
      }}>
        ✨
      </div>
      <div style={{
        position: 'absolute',
        top: '50px',
        left: '-30px',
        fontSize: '25px',
        animation: 'twinkle 1s ease-in-out infinite',
        animationDelay: '0.6s',
        opacity: visible ? 1 : 0
      }}>
        ⭐
      </div>
      <div style={{
        position: 'absolute',
        top: '40px',
        right: '-20px',
        fontSize: '28px',
        animation: 'twinkle 1s ease-in-out infinite',
        animationDelay: '0.9s',
        opacity: visible ? 1 : 0
      }}>
        ⭐
      </div>
    </>
  );
}

export function SleepZzz({ visible }: EffectProps) {
  if (!visible) return null;

  return (
    <>
      <div style={{
        position: 'absolute',
        top: '-30px',
        right: '40px',
        fontSize: '30px',
        animation: 'floatUp 2s ease-in-out infinite',
        animationDelay: '0s',
        opacity: visible ? 0.7 : 0
      }}>
        💤
      </div>
      <div style={{
        position: 'absolute',
        top: '-50px',
        right: '30px',
        fontSize: '25px',
        animation: 'floatUp 2s ease-in-out infinite',
        animationDelay: '0.5s',
        opacity: visible ? 0.5 : 0
      }}>
        💤
      </div>
    </>
  );
}
