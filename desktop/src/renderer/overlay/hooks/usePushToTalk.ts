import { useCallback, useEffect, useRef, useState } from 'react';

// Push-to-talk: record while the mic button is held, then have the clip transcribed (main,
// ElevenLabs) and hand the text to the chat like a typed message. Pressing also stops Wolfie
// talking. A quick tap (under MIN_MS) is not a recording; a held button stops after MAX_MS.

export type PushToTalkState = 'idle' | 'recording' | 'transcribing';

const MIN_MS = 400;
const MAX_MS = 60_000;
const MIME = 'audio/webm;codecs=opus';

interface Recording {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  startedAt: number;
  /** Let go before the mic was ready. */
  release: boolean;
}

export function usePushToTalk(onText: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<PushToTalkState>('idle');
  const rec = useRef<Recording | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  const finish = useCallback(async (chunks: Blob[], heldMs: number, mimeType: string) => {
    if (heldMs < MIN_MS) {
      setState('idle');
      handlers.current.onError('Hold the mic button while you talk, then let go.');
      return;
    }
    setState('transcribing');
    try {
      const audio = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
      const res = await window.electronAPI.invoke('voice-transcribe', { audio, mimeType });
      if (res.success) handlers.current.onText(res.text);
      else handlers.current.onError(res.error);
    } catch {
      handlers.current.onError("I couldn't understand that. Try again, or type instead.");
    } finally {
      setState('idle');
    }
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    // Released before the mic was ready: stop as soon as it starts
    if (!r.recorder) {
      r.release = true;
      return;
    }
    // The recorder's onstop (set when it started) sends the clip
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current || state !== 'idle') return;
    const r: Recording = { recorder: null, stream: null, chunks: [], startedAt: Date.now(), release: false };
    rec.current = r;
    setState('recording');
    void window.electronAPI.invoke('voice-stop-speaking'); // the student talks: Wolfie stops
    try {
      const ready = await window.electronAPI.invoke('voice-mic-ready');
      if (!ready.granted) throw new Error(ready.error ?? 'The microphone is not allowed for Wolfie.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(MIME) ? { mimeType: MIME } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size) r.chunks.push(e.data);
      };
      // However the recording ends (let go, the 60 s limit, or the mic itself stopping, e.g.
      // unplugged), the clip is sent once
      recorder.onstop = () => {
        if (rec.current === r) rec.current = null;
        if (maxTimer.current) clearTimeout(maxTimer.current);
        stream.getTracks().forEach((t) => t.stop());
        void finish(r.chunks, Date.now() - r.startedAt, recorder.mimeType || MIME);
      };
      Object.assign(r, { recorder, stream, startedAt: Date.now() });
      recorder.start(250);
      maxTimer.current = setTimeout(stop, MAX_MS);
      if (r.release) stop();
    } catch (error) {
      rec.current = null;
      setState('idle');
      handlers.current.onError(error instanceof Error && /allow|not allowed/i.test(error.message) ? error.message : "I can't use the microphone right now.");
    }
  }, [state, stop]);

  // Closing the chat mid-recording drops the recording
  useEffect(
    () => () => {
      const r = rec.current;
      rec.current = null;
      if (maxTimer.current) clearTimeout(maxTimer.current);
      if (r?.recorder && r.recorder.state !== 'inactive') {
        r.recorder.onstop = null;
        r.recorder.stop();
      }
      r?.stream?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  return { state, start, stop };
}
