# Chat voice: Wolfie reads his replies aloud (ElevenLabs), talking sprite while he speaks

Branch `tuan/chat-voice`, made from `main` after the Watch-mode merge.

## Finding
Nothing in the app played voice audio. The main process streamed ElevenLabs PCM as `voice-audio-out`, but no window listened (the comment said Thu would add the player). That's why the earlier hardware notes said there was no voice.

## Built
- **Player (`overlay/hooks/useVoicePlayer.ts`):**
  - plays the streamed 16-bit mono PCM through Web Audio, each chunk right after the previous one;
  - `voice-stop-playback` silences it at once;
  - it returns `speaking`.
- **Sprite (`App.tsx`):** order is thinking > talking (while audio plays) > bubble > base state.
- **What is read (`voice/read-aloud.ts`), setting `voice.read_replies` (default on):**
  - **Read:** answers to typed and spoken questions, and help steps and explanations (`attachChatLog` `onReply`).
  - **Not read:** the automatic "Want a hint?" offer (`isUnaskedOffer`).
  - **Length:** long replies are read up to a sentence boundary within 900 chars (ElevenLabs bills per character); the label paragraph isn't read.
  - **Voice mode:** when reading is on, voice mode no longer speaks the same help step or answer again (the `attachNudgeSpeech` skip; the voice-answer bubble has no `spokenText`).
- **No idle blink:** Wolfie keeps thinking until the reply's first audio chunk, then switches straight to talking.
- **Controls:**
  - 🔊/🔇 in the chat header saves `voice.read_replies` and stops speech when muted;
  - closing the chat stops speech (`voice-stop-speaking`);
  - a new typed question stops reading the last answer.
- **Separate from voice mode:** reading replies doesn't turn on the microphone (that is still `voice.enabled`).

## Verified
- **Real Gemini + real ElevenLabs, scratch profile (`WOLFIE_SMOKE_SPEAK`):** "In one short sentence, what is underfitting?"
  - Sprite: thinking@0s, then talking@2.0s, then idle@11.7s.
  - 262 audio chunks played.
  - Before the no-blink change there was an idle@1.0s gap; it's gone.
- **Demo smoke:** chat, scroll, "I'm stuck" and the 🔊 button in the header all work.
- **Tests:** 677 pass (new: read-aloud, offer filter, chat onReply, speech skip). Typecheck and lint are clean.

## Notes
- **Cost:** each spoken reply uses ElevenLabs characters (up to 900); the free tier is about 10k a month. Mute with 🔇.
- `Mascot.tsx` (Thu) gained `data-state={state}`, so tests can see the sprite state.
