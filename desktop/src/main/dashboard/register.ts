import { shell } from 'electron';
import { broadcast, handle } from '../ipc.js';
import { getDatabase } from '../db/index.js';
import { brightspaceEvents, getBrightspaceMaterials, ensureBrightspaceSchema } from '../brightspace/index.js';
import { getActiveSession, startSession } from '../session/index.js';
import { getSetting, setSetting } from '../settings.js';
import { getExtensionLink } from '../sensing/register.js';
import type { DashMaterial } from '../../common/ipc-dashboard.js';
import {
  DEFAULT_PREFS,
  detectTopic,
  ensureDashboardSchema,
  getPracticePlan,
  getSessionProblems,
  getSessions,
  getSummary,
  getTopicScores,
  logProblem,
  mergePrefs,
  readPrefs,
  slugTopic,
  topicCoursesFrom,
  writePrefs
} from './queries.js';

// Dashboard IPC (reports, topic scores, Brightspace material, prefs, problem logging).

const stops: Array<() => void> = [];
const lists = () => ({ aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') });

function materials(): DashMaterial[] {
  const db = getDatabase();
  const base = getBrightspaceMaterials(db);
  const scores = getTopicScores(db, Date.now(), topicCoursesFrom(base.map((m) => ({ ...m, matchesWeakSpot: false }))));
  const weak = new Set(scores.filter((t) => t.band === 'weak').map((t) => t.topic));
  return base.map((m) => ({ ...m, matchesWeakSpot: !!m.topic && weak.has(m.topic) }));
}

export function registerDashboard(): void {
  try {
    const db = getDatabase();
    ensureDashboardSchema(db);
    ensureBrightspaceSchema(db);
  } catch (error) {
    console.error('[dashboard] schema setup failed:', error instanceof Error ? error.message : error);
    return;
  }

  const courses = () => topicCoursesFrom(getBrightspaceMaterials().map((m) => ({ ...m, matchesWeakSpot: false })));

  handle('dash-summary', async () => getSummary(getDatabase(), Date.now(), lists(), readPrefs(getDatabase()), courses()));

  handle('dash-session-start', async (opts) => {
    try {
      if (getActiveSession()) return { success: true };
      const studying = (opts?.studying ?? '').trim().slice(0, 120);
      const session = startSession({ label: studying || undefined });
      const topic = slugTopic(opts?.topic ?? '') || detectTopic(studying) || (studying ? slugTopic(studying) : '');
      const course = topic ? courses().get(topic) ?? null : null;
      getDatabase()
        .prepare('INSERT OR REPLACE INTO dash_session_meta (session_id, planned_minutes, studying, course, topics_json) VALUES (?, ?, ?, ?, ?)')
        .run(session.id, Math.max(1, Math.min(600, Math.round(opts?.plannedMinutes ?? 25))), studying || null, course, JSON.stringify(topic ? [topic] : []));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  handle('reports-get-sessions', async (opts) => getSessions(getDatabase(), opts?.filter ?? 'week', Date.now(), lists()));
  handle('reports-get-session-problems', async (opts) => getSessionProblems(getDatabase(), String(opts?.sessionId ?? '')));
  handle('reports-get-topic-scores', async (opts) => getTopicScores(getDatabase(), Date.now(), courses(), opts?.courseFilter));
  handle('reports-get-practice-plan', async (opts) => getPracticePlan(getDatabase(), String(opts?.topicId ?? '')));

  handle('problem-log', async (input) => {
    try {
      if (!readPrefs(getDatabase()).reports.recordProblems) {
        return { success: false, error: 'Problem recording is off in Settings.' };
      }
      const r = logProblem(getDatabase(), input, getActiveSession()?.id ?? null, Date.now());
      if (!r.ok) return { success: false, error: r.error };
      broadcast('dash-data-changed', { kind: 'problems' });
      return { success: true, id: r.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  handle('brightspace-get-materials', async (opts) => {
    let items = materials();
    if (opts?.filter === 'new') items = items.filter((m) => m.isNew);
    if (opts?.filter === 'weak-spots') items = items.filter((m) => m.matchesWeakSpot);
    if (opts?.courseFilter) items = items.filter((m) => m.course === opts.courseFilter);
    return items;
  });

  handle('brightspace-sync', async () => {
    const link = getExtensionLink();
    const count = () => ({ courses: getBrightspaceMaterials().length ? new Set(getBrightspaceMaterials().map((m) => m.course)).size : 0, items: getBrightspaceMaterials().length });
    if (!link || !link.server.isConnected()) {
      return { success: false, error: 'The browser extension is not connected. Open Chrome with the extension, then try again.', ...count() };
    }
    const arrived = new Promise<boolean>((resolve) => {
      const off = brightspaceEvents.on('saved', () => {
        clearTimeout(timer);
        off();
        resolve(true);
      });
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, 8000);
    });
    link.requestBrightspace();
    if (!(await arrived)) {
      return { success: false, error: 'No data came back. Open your Brightspace homepage in Chrome, then press Sync again.', ...count() };
    }
    return { success: true, ...count() };
  });

  handle('brightspace-open-material', async (opts) => {
    const item = materials().find((m) => m.id === opts?.materialId);
    if (!item?.url) return { success: false, error: 'This item has no link.' };
    if (!/^https?:\/\//i.test(item.url)) return { success: false, error: 'Unsupported link.' };
    try {
      await shell.openExternal(item.url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const applyPrefs = (prefs: ReturnType<typeof readPrefs>) => {
    try {
      if (getSetting('voice.enabled') !== prefs.powers.voice) setSetting('voice.enabled', prefs.powers.voice);
    } catch (error) {
      console.error('[dashboard] could not apply voice pref:', error instanceof Error ? error.message : error);
    }
  };

  handle('dash-prefs-get', async () => {
    const prefs = readPrefs(getDatabase());
    // Voice lives in the real setting too: show what is actually on
    return { ...prefs, powers: { ...prefs.powers, voice: getSetting('voice.enabled') } };
  });
  handle('dash-prefs-update', async (updates) => {
    const next = mergePrefs(readPrefs(getDatabase()), updates ?? {});
    writePrefs(getDatabase(), next);
    applyPrefs(next);
    broadcast('dash-data-changed', { kind: 'prefs' });
    return { success: true, prefs: next };
  });
  handle('dash-prefs-reset', async () => {
    const fresh = { ...DEFAULT_PREFS, brightspaceSyncedAt: readPrefs(getDatabase()).brightspaceSyncedAt };
    writePrefs(getDatabase(), fresh);
    applyPrefs(fresh);
    broadcast('dash-data-changed', { kind: 'prefs' });
    return { success: true, prefs: fresh };
  });

  stops.push(
    brightspaceEvents.on('saved', () => {
      try {
        const db = getDatabase();
        writePrefs(db, { ...readPrefs(db), brightspaceSyncedAt: new Date().toISOString() });
      } catch {
        // sync time is cosmetic
      }
      broadcast('dash-data-changed', { kind: 'brightspace' });
    })
  );
}

export function unregisterDashboard(): void {
  while (stops.length) stops.pop()?.();
}
