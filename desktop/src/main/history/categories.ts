import { isBrowserApp } from '../monitor/browsers.js';
import { PAUSED_APP } from '../monitor/monitor.js';
import { matchForeground, type RuleLists } from '../rules/matcher.js';

// Time categories shared by History (A10) and the streak (A9): work / AI tools / distraction /
// idle, plus 'paused' for the time between a pause marker and the next row (never counted).

export type TimeCategory = 'work' | 'ai_tool' | 'distraction' | 'idle' | 'paused';

export interface AppEventRow {
  ts: number;
  app_name: string;
  window_title: string | null;
  url_domain: string | null;
  is_idle: number;
}

export function categorizeEvent(ev: AppEventRow, lists: RuleLists): TimeCategory {
  if (ev.app_name === PAUSED_APP) return 'paused';
  if (ev.is_idle) return 'idle';
  const match = matchForeground(
    { appName: ev.app_name, windowTitle: ev.window_title, domain: ev.url_domain, isBrowser: isBrowserApp(ev.app_name) },
    lists
  );
  return match ? match.kind : 'work';
}

export interface Interval {
  start: number;
  end: number;
  category: TimeCategory;
}

/**
 * Turns a session's app_events into intervals: each row lasts until the next row; the last one
 * until `sessionEnd`. Zero or negative lengths are dropped.
 */
export function intervalsFromEvents(events: AppEventRow[], sessionEnd: number, lists: RuleLists): Interval[] {
  const out: Interval[] = [];
  for (let i = 0; i < events.length; i++) {
    const start = events[i].ts;
    const end = i + 1 < events.length ? events[i + 1].ts : sessionEnd;
    if (end > start) out.push({ start, end, category: categorizeEvent(events[i], lists) });
  }
  return out;
}
