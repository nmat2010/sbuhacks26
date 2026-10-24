import { useState, useEffect } from 'react';
import { Nudge } from '@wolfie/shared';

export function useNudge() {
  const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    // Listen for nudges from main process
    const handleNudge = (nudge: Nudge) => {
      console.log('[Overlay] Received nudge:', nudge);
      setCurrentNudge(nudge);
    };

    window.electronAPI.on('nudge-show', handleNudge);

    return () => {
      window.electronAPI.off('nudge-show', handleNudge);
    };
  }, []);

  const dismissNudge = () => {
    setCurrentNudge(null);
  };

  const handleButtonClick = (action: string) => {
    console.log('[Overlay] Button clicked:', action);

    // Report every answer to main so it is logged and reaches the rule / hint owner
    if (currentNudge?.id) {
      window.electronAPI.invoke('nudge-response', { id: currentNudge.id, action, via: 'button' });
    }

    // Handle common actions
    switch (action) {
      case 'snooze':
        window.electronAPI.invoke('nudge-snooze');
        break;
      case 'decline':
        // Just dismiss
        break;
      case 'accept_hint':
        // Will be implemented in Phase 4
        console.log('Hint requested');
        break;
      default:
        console.log('Unknown action:', action);
    }

    dismissNudge();
  };

  return {
    currentNudge,
    dismissNudge,
    handleButtonClick
  };
}
