import type { SttProvider, SttSession } from './types.js';

// Keeps the STT session in step with "mic may be live": session active AND voice mode on AND not
// paused (SPEC 7: the mic is only ever live during an active session with voice mode on, and
// pausing mutes it). Call refresh() whenever any of those change. Mic capture itself is the
// renderer's job (Thu); it sends PCM frames, which land in write().

export interface VoiceControllerDeps {
  stt: () => SttProvider;
  shouldListen: () => boolean;
  onPartial: (text: string) => void;
  onTranscript: (text: string) => void;
  /** Called after reconnects are exhausted, so the UI can say "voice is having trouble". */
  onTrouble: (error: Error) => void;
  /** For the green "mic is live" dot. */
  onMicLive?: (live: boolean) => void;
}

export class VoiceController {
  private session: SttSession | null = null;
  private starting = false;
  private generation = 0;

  constructor(private readonly deps: VoiceControllerDeps) {}

  get micLive(): boolean {
    return this.session !== null;
  }

  async refresh(): Promise<void> {
    const want = this.deps.shouldListen();
    if (want && !this.session && !this.starting) await this.open();
    else if (!want && (this.session || this.starting)) this.close();
  }

  /** PCM from the renderer. Dropped unless the mic is supposed to be live. */
  write(pcm: Uint8Array): void {
    if (this.session && this.deps.shouldListen()) this.session.write(pcm);
  }

  stop(): void {
    this.close();
  }

  private async open(): Promise<void> {
    this.starting = true;
    const generation = ++this.generation;
    try {
      const session = await this.deps.stt().start({
        onPartial: (t) => this.deps.shouldListen() && this.deps.onPartial(t),
        onTranscript: (t) => this.deps.shouldListen() && this.deps.onTranscript(t),
        onError: (e) => {
          if (generation !== this.generation) return;
          this.session = null;
          this.deps.onMicLive?.(false);
          this.deps.onTrouble(e);
        }
      });
      // Closed while connecting (paused, session ended): discard.
      if (generation !== this.generation || !this.deps.shouldListen()) {
        session.close();
        return;
      }
      this.session = session;
      this.deps.onMicLive?.(true);
    } catch (error) {
      this.deps.onTrouble(error as Error);
    } finally {
      this.starting = false;
    }
  }

  private close(): void {
    this.generation++;
    const session = this.session;
    this.session = null;
    this.starting = false;
    if (session) {
      session.close();
      this.deps.onMicLive?.(false);
    }
  }
}
