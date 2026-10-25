import React, { useState, useEffect } from 'react';
import { Mascot, MascotState } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { HoverMenu } from './components/HoverMenu';
import { HintConversation } from './components/HintConversation';
import { StuckButton } from './components/StuckButton';
import { useNudge } from './hooks/useNudge';
import { useVoiceIntents } from './hooks/useVoiceIntents';
import type { MascotStateType } from '@wolfie/shared';

/** Main's escalation states drawn with Thu's sprites (glance and "?" are thinking, alert is angry). */
function spriteFor(state: MascotStateType): MascotState {
  switch (state) {
    case 'glance':
    case 'question-mark':
      return 'thinking';
    case 'alert':
      return 'angry';
    case 'talking':
    case 'sleeping':
      return state;
    default:
      return 'idle';
  }
}

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [showHoverMenu, setShowHoverMenu] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showHintConversation, setShowHintConversation] = useState(false);

  const { currentNudge, dismissNudge, handleButtonClick } = useNudge();
  // Sprite state pushed by main when no bubble is showing (escalation glance / "?", sleeping)
  const [baseState, setBaseState] = useState<MascotStateType>('idle');

  useEffect(() => window.electronAPI.on('overlay-state', setBaseState), []);

  // While the chat is open it takes the mouse, and help steps are shown in it instead of a bubble
  const chatOpenRef = React.useRef(false);
  useEffect(() => {
    chatOpenRef.current = showHintConversation;
    window.electronAPI.setIgnoreMouseEvents(!showHintConversation, { forward: true });
    void window.electronAPI.invoke('overlay-expand', showHintConversation);
  }, [showHintConversation]);
  // Help answers (an explanation or hint step, or anything long) open the chat, where they can be
  // scrolled; short prompts like the "Want a hint?" offer stay a bubble
  useEffect(() => {
    if (currentNudge?.kind !== 'stuck') return;
    if (showHintConversation) {
      dismissNudge();
      return;
    }
    const helpActions = ['another_hint', 'explain_simpler', 'show_answer', 'got_it'];
    const isHelpAnswer = currentNudge.text.length > 140 || (currentNudge.buttons ?? []).some((b) => helpActions.includes(b.action));
    if (isHelpAnswer) {
      // The answer is already in the chat history (recorded by the main process)
      setShowHintConversation(true);
      dismissNudge();
    }
  }, [showHintConversation, currentNudge, dismissNudge]);
  const releaseMouse = () => {
    if (!isDragging && !chatOpenRef.current) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
  };

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
  useEffect(() => {
    if (currentNudge) {
      switch (currentNudge.kind) {
        case 'stuck':
          if (currentNudge.level === 1 || currentNudge.level === 2) {
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
      setMascotState(spriteFor(baseState));
    }
  }, [currentNudge, baseState]);

  const handleMouseEnter = () => {
    // Disable click-through when hovering over mascot
    window.electronAPI.setIgnoreMouseEvents(false);
    // Show hover menu
    setShowHoverMenu(true);
  };

  const handleMouseLeave = () => {
    // Re-enable click-through when not hovering (not while the chat is open)
    releaseMouse();
    // Hide hover menu
    setShowHoverMenu(false);
  };

  const handleBubbleEnter = () => {
    window.electronAPI.setIgnoreMouseEvents(false);
  };

  const handleBubbleLeave = () => {
    releaseMouse();
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (!chatOpenRef.current) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
  };

  // Clicking Wolfie opens (or closes) the chat; help starts from its "Help me with this" button
  const handleMascotClick = () => {
    setShowHintConversation((open) => !open);
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

  // Hover-menu buttons to try each sprite for 3 s (Thu)
  const testSprite = (state: MascotState) => {
    setMascotState(state);
    setShowHoverMenu(false);
    setTimeout(() => setMascotState('idle'), 3000);
  };

  const handleResume = () => {
    window.electronAPI.invoke('nudge-resume');
    setIsPaused(false);
    setShowHoverMenu(false);
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        // Mascot sits at the bottom of the window so bubbles have room above it
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: '12px',
        boxSizing: 'border-box',
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
          position: 'relative'
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
            onTestIdle={() => testSprite('idle')}
            onTestTalking={() => testSprite('talking')}
            onTestAngry={() => testSprite('angry')}
            onTestSleeping={() => testSprite('sleeping')}
            onTestThinking={() => testSprite('thinking')}
            onTestHintModal={() => {
              setShowHintConversation(true);
              setShowHoverMenu(false);
            }}
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

        {!showHintConversation && <StuckButton onMouseEnter={handleBubbleEnter} onMouseLeave={handleBubbleLeave} />}

        {/* The window ignores the mouse outside hover areas; take clicks while over the bubble */}
        <div onMouseEnter={handleBubbleEnter} onMouseLeave={handleBubbleLeave}>
          <SpeechBubble
            nudge={currentNudge}
            onButtonClick={handleButtonClick}
            onDismiss={dismissNudge}
          />
        </div>
      </div>

      {/* Hint Conversation Modal */}
      {showHintConversation && (
        <HintConversation
          onClose={() => setShowHintConversation(false)}
          voiceMode={voiceActive}
        />
      )}
    </div>
  );
}

export default App;
