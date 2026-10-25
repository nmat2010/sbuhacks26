import { useEffect, useState } from 'react';

// "I'm stuck" beside Wolfie: one click gets help with the question on screen right away, instead
// of waiting for Wolfie to notice the pause (watch.stall_seconds). The help steps open the chat.

interface StuckButtonProps {
  /** Take the mouse while over the button (the overlay window ignores it elsewhere). */
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function StuckButton({ onMouseEnter, onMouseLeave }: StuckButtonProps) {
  const [sent, setSent] = useState(false);

  // Briefly show that the press went through (the first hint takes a few seconds)
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 4000);
    return () => clearTimeout(t);
  }, [sent]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // not a mascot click (that toggles the chat)
    if (sent) return;
    setSent(true);
    void window.electronAPI.invoke('help-stuck');
  };

  return (
    <button
      className="stuck-button"
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="Get a hint on what you're working on now"
      style={{
        // Pinned to the window (left of Wolfie's feet), so the hover menu reflowing the mascot's
        // box can't squeeze it; one line, whatever the room
        position: 'fixed',
        left: 54,
        bottom: 52,
        zIndex: 2,
        whiteSpace: 'nowrap',
        width: 'max-content',
        padding: '6px 10px',
        border: 'none',
        borderRadius: 999,
        background: sent ? '#8e8e93' : '#CC0000',
        color: 'white',
        fontSize: 12,
        fontWeight: 600,
        cursor: sent ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        pointerEvents: 'auto',
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
    >
      {sent ? 'On it...' : "🆘 I'm stuck"}
    </button>
  );
}
