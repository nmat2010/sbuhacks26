import { useState, useEffect } from 'react';
import { Mascot, MascotState } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { useNudge } from './hooks/useNudge';
import { useVoiceIntents } from './hooks/useVoiceIntents';

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [voiceActive, setVoiceActive] = useState(false);

  const { currentNudge, dismissNudge, handleButtonClick } = useNudge();

  // Listen for voice toggle from context menu
  useEffect(() => {
    const handleVoiceToggle = (enabled: boolean) => {
      console.log('[Overlay] Voice mode:', enabled);
      setVoiceActive(enabled);
    };

    window.electronAPI.on('voice-toggle', handleVoiceToggle);

    return () => {
      window.electronAPI.off('voice-toggle', handleVoiceToggle);
    };
  }, []);

  // Voice intents handling
  useVoiceIntents(voiceActive, {
    onHelpRequest: () => {
      console.log('[Voice] Help requested');
      // Will be implemented in Phase 4 with AI hints
    },
    onSnooze: () => {
      console.log('[Voice] Snooze requested');
      window.electronAPI.invoke('nudge-snooze');
      dismissNudge();
    },
    onDismiss: () => {
      console.log('[Voice] Dismiss requested');
      dismissNudge();
    },
    onPause: () => {
      console.log('[Voice] Pause requested');
      window.electronAPI.invoke('nudge-pause');
    },
    onResume: () => {
      console.log('[Voice] Resume requested');
      window.electronAPI.invoke('nudge-resume');
    }
  });

  // Update mascot state based on current nudge
  React.useEffect(() => {
    if (currentNudge) {
      switch (currentNudge.kind) {
        case 'stuck':
          if (currentNudge.level === 1) {
            setMascotState('glance');
          } else if (currentNudge.level === 2) {
            setMascotState('question-mark');
          } else {
            setMascotState('talking');
          }
          break;
        case 'distraction':
        case 'ai_tool':
          setMascotState('alert');
          break;
        case 'streak':
          setMascotState('talking');
          break;
        default:
          setMascotState('talking');
      }
    } else {
      setMascotState('idle');
    }
  }, [currentNudge]);

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

  const handleMascotClick = () => {
    // Request hint manually (will be implemented in Phase 4)
    console.log('Mascot clicked - hint requested');
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        position: 'relative'
      }}
    >
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault();
          // Context menu handled by main process
        }}
        style={{
          pointerEvents: 'auto',
          WebkitAppRegion: 'no-drag',
          position: 'relative'
        }}
      >
        <Mascot
          state={mascotState}
          voiceActive={voiceActive}
          onClick={handleMascotClick}
        />

        <SpeechBubble
          nudge={currentNudge}
          onButtonClick={handleButtonClick}
          onDismiss={dismissNudge}
        />
      </div>
    </div>
  );
}

export default App;
