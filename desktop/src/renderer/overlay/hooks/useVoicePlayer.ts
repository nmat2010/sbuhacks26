import { useEffect, useState } from 'react';

// Plays Wolfie's voice: the main process streams ElevenLabs audio as 16-bit little-endian mono PCM
// chunks ('voice-audio-out'); each chunk is scheduled right after the previous one, so playback
// starts with the first chunk. 'voice-stop-playback' (barge-in, "stop", chat closed) silences it
// at once. Returns whether Wolfie is audibly speaking, for the talking sprite.

const DEFAULT_RATE = 16_000;

export function useVoicePlayer(): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let sources: AudioBufferSourceNode[] = [];
    let nextStart = 0;
    let utterance = -1;

    const stopAll = () => {
      for (const s of sources) {
        s.onended = null;
        try {
          s.stop();
        } catch {
          /* not started yet */
        }
      }
      sources = [];
      nextStart = 0;
      setSpeaking(false);
    };

    const offAudio = window.electronAPI.on('voice-audio-out', ({ utteranceId, mimeType, chunk }) => {
      // A new utterance replaces whatever was still playing
      if (utteranceId !== utterance) {
        stopAll();
        utterance = utteranceId;
      }
      const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1]) || DEFAULT_RATE;
      ctx ??= new AudioContext();
      void ctx.resume();
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBufferLike);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const samples = Math.floor(bytes.byteLength / 2);
      if (!samples) return;
      const buffer = ctx.createBuffer(1, samples, rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = view.getInt16(i * 2, true) / 32768;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const start = Math.max(ctx.currentTime + 0.02, nextStart);
      source.start(start);
      nextStart = start + buffer.duration;
      sources.push(source);
      setSpeaking(true);
      source.onended = () => {
        sources = sources.filter((s) => s !== source);
        // The last chunk finished and no more is queued: done talking
        if (!sources.length) setSpeaking(false);
      };
    });

    const offStop = window.electronAPI.on('voice-stop-playback', ({ utteranceId }) => {
      if (utteranceId === utterance) stopAll();
    });

    return () => {
      offAudio();
      offStop();
      stopAll();
      void ctx?.close();
    };
  }, []);

  return speaking;
}
