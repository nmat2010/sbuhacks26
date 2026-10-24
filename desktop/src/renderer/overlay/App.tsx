import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Mascot, MascotState } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { HoverMenu } from './components/HoverMenu';
import { HintConversation, HintLevel } from './components/HintConversation';
import { useNudge } from './hooks/useNudge';
import { useVoiceIntents } from './hooks/useVoiceIntents';

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [showHoverMenu, setShowHoverMenu] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showHintConversation, setShowHintConversation] = useState(false);
  const [hoverMenuTimeout, setHoverMenuTimeout] = useState<NodeJS.Timeout | null>(null);

  // Mascot position - load from localStorage or use default (bottom center)
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('wolfie-position');
    if (saved) {
      return JSON.parse(saved);
    }
    return { x: window.innerWidth / 2 - 110, y: window.innerHeight - 250 };
  });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const { currentNudge, dismissNudge, handleButtonClick } = useNudge();
  // Sprite state pushed by main when no bubble is showing (escalation glance / "?", sleeping)
  const [baseState, setBaseState] = useState<MascotState>('idle');

  useEffect(() => window.electronAPI.on('overlay-state', setBaseState), []);

  // Cleanup hover menu timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverMenuTimeout) {
        clearTimeout(hoverMenuTimeout);
      }
    };
  }, [hoverMenuTimeout]);

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

  // Disable click-through when hint modal is open
  useEffect(() => {
    if (showHintConversation) {
      console.log('[App] Modal opened, disabling click-through');
      window.electronAPI.setIgnoreMouseEvents(false);
    } else {
      console.log('[App] Modal closed, re-enabling click-through');
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [showHintConversation]);

  // Update mascot state based on current nudge
  useEffect(() => {
    if (currentNudge) {
      switch (currentNudge.kind) {
        case 'stuck':
          if (currentNudge.level === 1) {
            setMascotState('thinking');
          } else if (currentNudge.level === 2) {
            setMascotState('thinking');
          } else {
            setMascotState('talking');
          }
          break;
        case 'distraction':
        case 'ai_tool':
          setMascotState('angry');
          break;
        case 'streak':
          setMascotState('talking');
          break;
        default:
          setMascotState('talking');
      }
    } else {
      setMascotState(baseState);
    }
  }, [currentNudge, baseState]);

  const handleMouseEnter = () => {
    // Disable click-through when hovering over mascot
    window.electronAPI.setIgnoreMouseEvents(false);

    // Only show hover menu after a delay (to allow dragging without menu appearing)
    const timeout = setTimeout(() => {
      if (!isDragging && !hasMoved) {
        setShowHoverMenu(true);
      }
    }, 300); // 300ms delay before showing menu
    setHoverMenuTimeout(timeout);
  };

  const handleMouseLeave = () => {
    // Clear any pending hover menu timeout
    if (hoverMenuTimeout) {
      clearTimeout(hoverMenuTimeout);
      setHoverMenuTimeout(null);
    }

    // Re-enable click-through when not hovering
    if (!isDragging) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
    // Hide hover menu
    setShowHoverMenu(false);
  };

  const handleBubbleEnter = () => {
    window.electronAPI.setIgnoreMouseEvents(false);
  };

  const handleBubbleLeave = () => {
    if (!isDragging) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Store initial position to detect if it's a drag or a click
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    setIsDragging(true);
    setHasMoved(false);

    // Clear hover menu timeout if clicking
    if (hoverMenuTimeout) {
      clearTimeout(hoverMenuTimeout);
      setHoverMenuTimeout(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setHasMoved(false);
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    // Save position to localStorage
    localStorage.setItem('wolfie-position', JSON.stringify(position));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      // Mark that we've moved (user is dragging, not just clicking)
      setHasMoved(true);

      // Hide hover menu while dragging
      setShowHoverMenu(false);

      // Calculate new position
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;

      // Constrain to window bounds (mascot is ~220px wide)
      const mascotWidth = 220;
      const mascotHeight = 220;
      newX = Math.max(0, Math.min(newX, window.innerWidth - mascotWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - mascotHeight));

      setPosition({ x: newX, y: newY });
    }
  };

  const handleMascotClick = () => {
    // Manual hint entry point (SPEC 4d); main routes it to the escalation engine
    window.electronAPI.invoke('mascot-click');
    // Disabled for now - modal was auto-opening
    // setShowHintConversation(true);
  };

  const handleRequestHint = (level: HintLevel) => {
    console.log(`Requesting hint level ${level}`);
    // TODO: Call IPC to get actual hint from LLM
    // await window.electronAPI.invoke('request-hint', { level, context });
  };

  const handleDismissHint = (action: 'got-it' | 'not-needed' | 'show-answer') => {
    console.log(`Hint dismissed with action: ${action}`);
    // TODO: Log to database
    setTimeout(() => {
      setShowHintConversation(false);
    }, 500);
  };

  const handleOpenTestPanel = () => {
    window.electronAPI.invoke('open-test-panel');
    setShowHoverMenu(false);
  };

  const handleSnooze = () => {
    window.electronAPI.invoke('nudge-snooze');
    setShowHoverMenu(false);
  };

  const handlePause = () => {
    window.electronAPI.invoke('nudge-pause');
    setIsPaused(true);
    setShowHoverMenu(false);
  };

  const handleResume = () => {
    window.electronAPI.invoke('nudge-resume');
    setIsPaused(false);
    setShowHoverMenu(false);
  };

  const handleTestThinking = () => {
    // Set mascot to thinking state for testing
    setMascotState('thinking');
    setShowHoverMenu(false);
    // Reset to idle after 3 seconds (4 frames at 3fps = 1.33s, give it time to loop)
    setTimeout(() => {
      setMascotState('idle');
    }, 3000);
  };

  const handleTestHintModal = () => {
    // Open hint conversation modal for testing
    setShowHintConversation(true);
    setShowHoverMenu(false);
  };

  const handleTestIdle = () => {
    setMascotState('idle');
    setShowHoverMenu(false);
    setTimeout(() => setMascotState('idle'), 3000);
  };

  const handleTestTalking = () => {
    setMascotState('talking');
    setShowHoverMenu(false);
    setTimeout(() => setMascotState('idle'), 3000);
  };

  const handleTestAngry = () => {
    setMascotState('angry');
    setShowHoverMenu(false);
    setTimeout(() => setMascotState('idle'), 3000);
  };

  const handleTestSleeping = () => {
    setMascotState('sleeping');
    setShowHoverMenu(false);
    setTimeout(() => setMascotState('idle'), 3000);
  };

  return (
    <>
      <div
        onMouseMove={handleMouseMove}
        style={{
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          position: 'relative'
        }}
      >
        <div
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => {
            e.preventDefault();
            // Context menu handled by main process
          }}
          style={{
            pointerEvents: 'auto',
            WebkitAppRegion: 'no-drag',
            position: 'absolute',
            left: `${position.x}px`,
            top: `${position.y}px`,
            cursor: isDragging ? 'grabbing' : 'grab'
          } as React.CSSProperties}
        >
          {/* Hover area that includes both mascot and menu */}
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <HoverMenu
              visible={showHoverMenu}
              onOpenTestPanel={handleOpenTestPanel}
              onTestIdle={handleTestIdle}
              onTestTalking={handleTestTalking}
              onTestAngry={handleTestAngry}
              onTestSleeping={handleTestSleeping}
              onTestThinking={handleTestThinking}
              onTestHintModal={handleTestHintModal}
              onSnooze={handleSnooze}
              onPause={handlePause}
              onResume={handleResume}
              isPaused={isPaused}
            />

            <Mascot
              state={mascotState}
              voiceActive={voiceActive}
              onClick={handleMascotClick}
            />
          </div>

          {/* The window ignores the mouse outside hover areas; take clicks while over the bubble */}
          <div onMouseEnter={handleBubbleEnter} onMouseLeave={handleBubbleLeave}>
            <SpeechBubble
              nudge={currentNudge}
              onButtonClick={handleButtonClick}
              onDismiss={dismissNudge}
            />
          </div>
        </div>
      </div>

      {/* Hint Conversation Modal - Rendered via Portal to bypass pointer-events: none */}
      {showHintConversation && ReactDOM.createPortal(
        <HintConversation
          onClose={() => {
            console.log('[App] Closing hint conversation');
            setShowHintConversation(false);
          }}
          onRequestHint={handleRequestHint}
          onDismiss={handleDismissHint}
          voiceMode={voiceActive}
          contextPreview={{
            type: 'page',
            description: 'I can see you\'re working on a data structures problem about linked lists.'
          }}
        />,
        document.body
      )}
    </>
  );
}

export default App;
