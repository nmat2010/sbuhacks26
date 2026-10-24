import type { Observation, SourceKind, WatchModeKind } from './types.js';

// Session memory for Watch mode: what the student looked at this session, kept in memory as text
// only (never frames). It is what lets Wolfie answer "how did the prof change the transformer?"
// without the student restating anything.

export interface SourceEntry {
  key: string;
  kind: SourceKind;
  title: string;
  /** Paper or video URL from the extension, when known. */
  url: string | null;
  /** Library paper id once the paper has been imported (reading pipeline). */
  paperId: string | null;
  firstSeen: number;
  lastSeen: number;
  /** Approximate time on this source, from watcher intervals. */
  seconds: number;
  /** Recent sections / pages / timestamps seen, newest last. */
  locators: string[];
  /** Facts worth remembering, newest last. */
  points: string[];
}

export interface TimelineEntry {
  ts: number;
  activity: Observation['activity'];
  mode: WatchModeKind;
  subject: string;
  sourceKey: string;
  summary: string;
}

export interface ObservationContext {
  ts: number;
  appName: string;
  windowTitle: string | null;
  contentUrl: string | null;
  /** Time since the previous observation, credited to this source (capped by the caller). */
  elapsedMs: number;
}

const MAX_SOURCES = 20;
const MAX_TIMELINE = 60;
const MAX_POINTS = 12;
const MAX_LOCATORS = 6;

export class SessionMemory {
  private sources = new Map<string, SourceEntry>();
  private timeline: TimelineEntry[] = [];
  private last: { obs: Observation; ts: number; sourceKey: string } | null = null;
  /** Papers imported before their source was first recorded (the import can beat the first look). */
  private pendingPapers = new Map<string, { paperId: string; title?: string }>();

  record(obs: Observation, ctx: ObservationContext): SourceEntry {
    const title = (obs.source.title ?? ctx.windowTitle ?? obs.subject ?? ctx.appName).trim() || ctx.appName;
    const key = sourceKey(obs.source.kind, title, ctx.contentUrl);
    let entry = this.sources.get(key);
    if (!entry) {
      entry = {
        key,
        kind: obs.source.kind,
        title,
        url: ctx.contentUrl,
        paperId: null,
        firstSeen: ctx.ts,
        lastSeen: ctx.ts,
        seconds: 0,
        locators: [],
        points: []
      };
      const pending = ctx.contentUrl ? this.pendingPapers.get(ctx.contentUrl) : undefined;
      if (pending) {
        entry.paperId = pending.paperId;
        if (pending.title && entry.kind === 'paper') entry.title = pending.title;
      }
      this.sources.set(key, entry);
      this.evictSources();
    }
    entry.lastSeen = ctx.ts;
    entry.seconds += Math.max(0, Math.round(ctx.elapsedMs / 1000));
    if (obs.source.title && entry.title !== obs.source.title && entry.title === ctx.appName) entry.title = obs.source.title;
    if (obs.source.locator) pushUnique(entry.locators, obs.source.locator.trim(), MAX_LOCATORS);
    for (const p of obs.key_points) pushUnique(entry.points, p.trim(), MAX_POINTS);

    this.timeline.push({
      ts: ctx.ts,
      activity: obs.activity,
      mode: obs.mode,
      subject: obs.subject,
      sourceKey: key,
      summary: obs.summary
    });
    if (this.timeline.length > MAX_TIMELINE) this.timeline.splice(0, this.timeline.length - MAX_TIMELINE);
    this.last = { obs, ts: ctx.ts, sourceKey: key };
    return entry;
  }

  /** The reading pipeline finished importing the paper behind `url`. */
  attachPaper(url: string, paperId: string, title?: string): void {
    this.pendingPapers.set(url, { paperId, title });
    for (const entry of this.sources.values()) {
      if (entry.url === url) {
        entry.paperId = paperId;
        if (title && entry.kind === 'paper') entry.title = title;
      }
    }
  }

  latest(): { obs: Observation; ts: number; source: SourceEntry | null } | null {
    if (!this.last) return null;
    return { obs: this.last.obs, ts: this.last.ts, source: this.sources.get(this.last.sourceKey) ?? null };
  }

  /** Most recently seen first. */
  listSources(): SourceEntry[] {
    return [...this.sources.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /** Library papers seen this session, most recent first. */
  paperIds(): string[] {
    return this.listSources()
      .map((s) => s.paperId)
      .filter((id): id is string => !!id);
  }

  /** YouTube videos seen this session, most recent first. */
  videos(): SourceEntry[] {
    return this.listSources().filter((s) => s.kind === 'video' && !!s.url && /youtube\.com\/watch/.test(s.url));
  }

  recentTimeline(n: number): TimelineEntry[] {
    return this.timeline.slice(-n);
  }

  isEmpty(): boolean {
    return this.timeline.length === 0;
  }

  /**
   * The session as prompt text, newest information last, within `maxChars`: the sources with
   * what was learned from each, then the recent timeline.
   */
  toPromptText(maxChars = 6000, now = Date.now()): string {
    if (this.isEmpty()) return '';
    const ago = (ts: number) => {
      const min = Math.round((now - ts) / 60_000);
      return min <= 0 ? 'just now' : `${min} min ago`;
    };
    // Newest sources first, so when the budget runs out it is the oldest that get dropped
    const blocks: string[] = [];
    let used = 0;
    const sourceBudget = Math.floor(maxChars * 0.7);
    for (const s of this.listSources().slice(0, 8)) {
      const head = `- [${s.kind}] ${s.title}${s.url ? ` <${s.url}>` : ''} (last seen ${ago(s.lastSeen)}, ~${Math.max(1, Math.round(s.seconds / 60))} min${s.locators.length ? `, at ${s.locators.join(', ')}` : ''})`;
      const lines = [head, ...s.points.slice(-6).map((p) => `    • ${p}`)];
      while (lines.length > 1 && used + lines.join('\n').length + 1 > sourceBudget) lines.pop();
      const block = lines.join('\n');
      if (used + block.length + 1 > sourceBudget) break;
      blocks.unshift(block);
      used += block.length + 1;
    }
    const header = `Sources this session (oldest to newest):\n${blocks.join('\n')}\n\nRecent activity:`;
    // Then as much of the recent timeline as fits, newest kept
    const recent: string[] = [];
    let room = maxChars - header.length;
    for (const t of [...this.timeline].reverse().slice(0, 10)) {
      const line = `\n- ${ago(t.ts)}: ${t.summary}`;
      if (line.length > room) break;
      recent.unshift(line);
      room -= line.length;
    }
    return (header + recent.join('')).slice(0, maxChars);
  }

  clear(): void {
    this.pendingPapers.clear();
    this.sources.clear();
    this.timeline = [];
    this.last = null;
  }

  private evictSources(): void {
    if (this.sources.size <= MAX_SOURCES) return;
    const oldest = [...this.sources.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (oldest) this.sources.delete(oldest.key);
  }
}

function sourceKey(kind: SourceKind, title: string, url: string | null): string {
  return url ? `url:${url}` : `${kind}:${title.toLowerCase().replace(/\s+/g, ' ').slice(0, 120)}`;
}

function pushUnique(list: string[], value: string, max: number): void {
  if (!value) return;
  const i = list.findIndex((v) => v.toLowerCase() === value.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  list.push(value);
  if (list.length > max) list.splice(0, list.length - max);
}
