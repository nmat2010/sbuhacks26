# Push-to-talk in the chat

Branch `tuan/push-to-talk`, made from `main` after the chat-voice merge.

## Finding
Nothing in the app captured the microphone. The main process has `voice-audio-in` for voice mode's realtime speech-to-text, but no window ever sent audio, so voice mode's always-on listening never actually worked. Push-to-talk doesn't depend on it.

## Built
- **🎤 button** left of the chat input: hold to talk, let go to send.
  - Red and pulsing while recording; the placeholder says "Listening... let go to send", then "Getting your words...".
- **`usePushToTalk` (overlay):**
  - **Recording:** `getUserMedia` (mono, echo cancellation, noise suppression) into a `MediaRecorder` producing WebM/Opus.
  - **Limits:** a tap under 0.4 s isn't a recording (it shows a "hold to talk" tip); recording stops automatically after 60 s.
  - **Wolfie's voice:** pressing stops him talking.
  - **One send per recording:** it's sent once from the recorder's `onstop`, however the recording ends (release, the 60 s limit, or the mic track ending).
  - **Closing the chat** drops a recording in progress.
- **Main:**
  - `voice-mic-ready`: asks macOS for microphone access the first time, and opens Privacy settings if it was denied.
  - `voice-transcribe`: `voice/clip-stt.ts` sends the clip to ElevenLabs `/v1/speech-to-text` (`scribe_v2`, override with `ELEVENLABS_PTT_MODEL`). It refuses clips over 4 MB, has a 20 s timeout, and its friendly errors never contain the key. It logs `voice.ptt {ok, bytes}`.
- **The words are sent with `chat-send`**, exactly like typed text: they appear in the chat as the student's message, follow-ups to hints work, and the answer is read aloud.

## Bug found while testing
- The recorder could stop by itself (its audio track ended) before the button was released. The "recording finished" handler was only attached at release, so the clip was lost and the button stayed red.
- **Fix:** `onstop` is attached when recording starts.

## Verified
- **ElevenLabs batch STT, live:** `scribe_v2` and `scribe_v1` both transcribed a TTS clip of "What is overfitting?" exactly, in about 0.5 s.
- **Real app on a scratch profile (`WOLFIE_SMOKE_PTT=<audio>`, the clip standing in for the mic, real press and release):**
  - a 22 KB WebM clip was transcribed as "What is overfitting?";
  - it appeared in the chat as the user message;
  - Gemini answered in 1.0 s;
  - the sprite went thinking, then talking (read aloud).
- **Tests:** 680 pass (new: clip-stt request, errors, limits). Typecheck and lint are clean.

## Notes
- **Cost:** ElevenLabs bills speech-to-text by audio length; each press is one short request.
- Voice mode's always-on mic (realtime STT) still has no audio capture; that's separate work if wanted.
