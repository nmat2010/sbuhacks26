import { useEffect, useRef, useCallback } from 'react';

interface VoiceIntentsCallbacks {
  onHelpRequest?: () => void;
  onSnooze?: () => void;
  onDismiss?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export function useVoiceIntents(
  enabled: boolean,
  callbacks: VoiceIntentsCallbacks
) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);

  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    const transcript = event.results[event.results.length - 1][0].transcript
      .toLowerCase()
      .trim();

    console.log('[Voice] Recognized:', transcript);

    // Match local intents
    if (transcript.includes('help') || transcript.includes('hint')) {
      console.log('[Voice] Intent: help request');
      callbacks.onHelpRequest?.();
    } else if (transcript.includes('snooze')) {
      console.log('[Voice] Intent: snooze');
      callbacks.onSnooze?.();
    } else if (transcript.includes('dismiss') || transcript.includes('close')) {
      console.log('[Voice] Intent: dismiss');
      callbacks.onDismiss?.();
    } else if (transcript.includes('pause')) {
      console.log('[Voice] Intent: pause');
      callbacks.onPause?.();
    } else if (transcript.includes('resume') || transcript.includes('continue')) {
      console.log('[Voice] Intent: resume');
      callbacks.onResume?.();
    } else {
      console.log('[Voice] No matching intent for:', transcript);
    }
  }, [callbacks]);

  useEffect(() => {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[Voice] Speech Recognition not supported');
      return;
    }

    if (enabled && !recognitionRef.current) {
      // Initialize recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = handleResult;

      recognition.onerror = (event) => {
        console.error('[Voice] Recognition error:', event.error);

        // Auto-restart on error (except on abort)
        if (event.error !== 'aborted' && isListeningRef.current) {
          console.log('[Voice] Restarting recognition...');
          setTimeout(() => {
            try {
              recognition.start();
            } catch (err) {
              console.error('[Voice] Failed to restart:', err);
            }
          }, 1000);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still enabled
        if (enabled && isListeningRef.current) {
          console.log('[Voice] Recognition ended, restarting...');
          try {
            recognition.start();
          } catch (err) {
            console.error('[Voice] Failed to restart:', err);
          }
        }
      };

      recognitionRef.current = recognition;
    }

    if (enabled && recognitionRef.current && !isListeningRef.current) {
      // Start listening
      console.log('[Voice] Starting recognition...');
      try {
        recognitionRef.current.start();
        isListeningRef.current = true;
      } catch (err) {
        console.error('[Voice] Failed to start recognition:', err);
      }
    } else if (!enabled && recognitionRef.current && isListeningRef.current) {
      // Stop listening
      console.log('[Voice] Stopping recognition...');
      isListeningRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('[Voice] Failed to stop recognition:', err);
      }
    }

    return () => {
      // Cleanup on unmount
      if (recognitionRef.current && isListeningRef.current) {
        isListeningRef.current = false;
        try {
          recognitionRef.current.stop();
        } catch (err) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [enabled, handleResult]);

  return {
    isListening: isListeningRef.current
  };
}
