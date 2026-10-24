import type { SettingsKey, SettingsValues } from '@wolfie/shared';
import type { BResult, WatchMemoryView, WatchPatch, WatchStatus } from '../../common/ipc-intelligence.js';
import type { EventType } from '../events.js';
import { TypedEmitter } from '../typed-emitter.js';
import type { SessionMemory } from './memory.js';
import type { Watcher, WatcherState } from './watcher.js';

// Watch mode on/off, consent, and the session lifecycle (WATCH_MODE.md §4). Watching runs only
// when the student turned it on AND accepted the consent screen, during a session, not paused.
// Memory is per session: it is summarized into the event log and cleared when the session ends.

export interface WatchControllerDeps {
  now: () => number;
  getSetting: <K extends SettingsKey>(key: K) => SettingsValues[K];
  setSetting: <K extends SettingsKey>(key: K, value: SettingsValues[K]) => void;
  getSession: () => { id: string } | null;
  isPaused: () => boolean;
  memory: SessionMemory;
  watcher: Pick<Watcher, 'start' | 'stop' | 'reset' | 'getState'>;
  /** Import a PDF/arXiv paper the student opened; resolves to the library paper. */
  importPaper: (url: string) => Promise<{ paperId: string; title: string } | null>;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

const PAPER_URL = /\.pdf$|arxiv\.org\/(abs|pdf)\//i;

export class WatchController {
  readonly events = new TypedEmitter<{ status: [status: WatchStatus] }>();
  private sessionId: string | null = null;
  /** URLs already imported (or tried) this session, so each paper is fetched once. */
  private seenUrls = new Set<string>();
  /** Bumped whenever memory is cleared, so an import that finishes later can't refill it. */
  private memoryEpoch = 0;

  constructor(private readonly deps: WatchControllerDeps) {}

  /** Watch mode should be looking right now. */
  isActive(): boolean {
    const { deps } = this;
    return this.isOn() && deps.getSession() !== null && !deps.isPaused();
  }

  /** Turned on and consented (whether or not a session is running). */
  isOn(): boolean {
    return this.deps.getSetting('watch.enabled') && this.deps.getSetting('watch.consented_at') !== null;
  }

  status(): WatchStatus {
    const { deps } = this;
    const enabled = deps.getSetting('watch.enabled');
    const consented = deps.getSetting('watch.consented_at') !== null;
    const latest = deps.memory.latest();
    return {
      enabled,
      consented,
      state: !enabled ? 'off' : !consented ? 'needs_consent' : !this.isActive() ? 'idle' : mapState(deps.watcher.getState()),
      mode: latest?.obs.mode ?? null,
      activity: latest?.obs.activity ?? null,
      subject: latest?.obs.subject ?? null,
      lastObservedAt: latest?.ts ?? null,
      note: this.note(),
      intervalSeconds: deps.getSetting('watch.interval_seconds'),
      autoImportPapers: deps.getSetting('watch.auto_import_papers'),
      excludedApps: deps.getSetting('watch.excluded_apps')
    };
  }

  private note(): string | null {
    const { deps } = this;
    if (!this.isActive()) return null;
    const state = deps.watcher.getState();
    if (state === 'no_permission') return 'Allow Screen Recording for Wolfie in System Settings so I can see your screen.';
    if (state === 'limit_reached') return "I've reached today's watching limit; I'll pick up again tomorrow.";
    if (state === 'skipping' && !deps.getSetting('monitoring.capture_window_titles')) {
      return 'Turn on window titles in Settings so I can follow browser pages.';
    }
    if (state === 'skipping') return 'Not looking: this window is private, excluded, or I can\'t tell which tab it is.';
    return null;
  }

  set(patch: WatchPatch): BResult<WatchStatus> {
    const { deps } = this;
    if (patch.intervalSeconds !== undefined) {
      if (!Number.isFinite(patch.intervalSeconds) || patch.intervalSeconds < 5 || patch.intervalSeconds > 120) {
        return { success: false, error: 'The interval must be between 5 and 120 seconds.' };
      }
      deps.setSetting('watch.interval_seconds', Math.round(patch.intervalSeconds));
    }
    if (patch.autoImportPapers !== undefined) deps.setSetting('watch.auto_import_papers', !!patch.autoImportPapers);
    if (patch.excludedApps !== undefined) {
      const apps = [...new Set(patch.excludedApps.map((a) => String(a).trim()).filter(Boolean))].slice(0, 200);
      deps.setSetting('watch.excluded_apps', apps);
    }
    if (patch.enabled !== undefined) {
      if (patch.enabled && deps.getSetting('watch.consented_at') === null) {
        return { success: false, error: 'Please read and accept the Watch mode consent first.', data: this.status() };
      }
      deps.setSetting('watch.enabled', patch.enabled);
      deps.log(patch.enabled ? 'watch.enabled' : 'watch.disabled', {});
    }
    this.refresh();
    return { success: true, data: this.status() };
  }

  consent(accepted: boolean): WatchStatus {
    const { deps } = this;
    if (accepted) {
      deps.setSetting('watch.consented_at', deps.now());
      deps.log('watch.consented', {});
    } else {
      deps.setSetting('watch.consented_at', null);
      deps.setSetting('watch.enabled', false);
      this.clearMemory();
      deps.log('watch.consent_declined', {});
    }
    this.refresh();
    return this.status();
  }

  memoryView(): WatchMemoryView {
    const { memory } = this.deps;
    return {
      sources: memory.listSources().map((s) => ({
        kind: s.kind,
        title: s.title,
        url: s.url,
        paperId: s.paperId,
        lastSeen: s.lastSeen,
        minutes: Math.round(s.seconds / 60),
        locators: [...s.locators],
        points: [...s.points]
      })),
      recent: memory.recentTimeline(20).map((t) => ({ ts: t.ts, activity: t.activity, mode: t.mode, summary: t.summary }))
    };
  }

  clearMemory(): WatchStatus {
    this.memoryEpoch++;
    this.deps.memory.clear();
    this.deps.watcher.reset();
    this.seenUrls.clear();
    this.emit();
    return this.status();
  }

  /**
   * Call on session start/stop, pause/resume, and settings changes: starts or stops the watcher,
   * and ends the previous session's memory when the session changes.
   */
  refresh(): void {
    const { deps } = this;
    const session = deps.getSession();
    const id = session?.id ?? null;
    if (id !== this.sessionId) {
      this.endSessionMemory();
      this.sessionId = id;
    }
    if (this.isActive()) deps.watcher.start();
    else deps.watcher.stop();
    this.emit();
  }

  /** The watcher saw a paper or video URL. Papers are imported once, in the background. */
  onContentUrl(url: string): void {
    const { deps } = this;
    if (this.seenUrls.has(url)) return;
    this.seenUrls.add(url);
    if (!PAPER_URL.test(url) || !deps.getSetting('watch.auto_import_papers')) return;
    const epoch = this.memoryEpoch;
    void deps
      .importPaper(url)
      .then((paper) => {
        if (!paper || epoch !== this.memoryEpoch) return;
        deps.memory.attachPaper(url, paper.paperId, paper.title);
        deps.log('watch.paper_imported', {});
      })
      .catch((error) => console.error('[watch] paper import failed:', (error as Error).message));
  }

  /** Watcher state changed (watching / skipping / no permission ...). */
  onWatcherState(_state: WatcherState): void {
    this.emit();
  }

  private endSessionMemory(): void {
    const { deps } = this;
    if (!deps.memory.isEmpty()) {
      // Only counts go to the log; the session's content stays in memory and is discarded
      const sources = deps.memory.listSources();
      deps.log('watch.session_summary', {
        sources: sources.length,
        papers: sources.filter((s) => s.kind === 'paper').length,
        videos: sources.filter((s) => s.kind === 'video').length,
        minutes: Math.round(sources.reduce((t, s) => t + s.seconds, 0) / 60)
      });
    }
    this.memoryEpoch++;
    deps.memory.clear();
    deps.watcher.reset();
    this.seenUrls.clear();
  }

  private emit(): void {
    this.events.emit('status', this.status());
  }
}

function mapState(state: WatcherState): WatchStatus['state'] {
  return state === 'idle' ? 'watching' : state;
}
