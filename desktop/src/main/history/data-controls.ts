import type Database from 'better-sqlite3';

// Data controls (SPEC 7 and Phase 8): JSON export and "Clear all data". Both run over every app
// table (DATA_TABLES from db/index.ts, which includes both agents' tables), so a table added later
// is covered without editing this file.

/** Child tables first, then parents, so each DELETE satisfies foreign keys even with them on. */
const DELETE_FIRST = [
  'paper_questions',
  'plan_items',
  'hint_requests',
  'webapp_activity',
  'web_signals',
  'app_events',
  'nudges',
  'papers',
  'goals',
  'a_session_tz',
  'a_sync_seen',
  'sessions'
];

export interface ExportFile {
  app: 'wolfie-sensei';
  version: 1;
  exportedAt: number;
  tables: Record<string, unknown[]>;
}

/**
 * Everything in the database as plain JSON. Pairing secrets and the extension token are left out
 * (an export is meant to be shared with a person, not to clone a pairing); image files are not
 * included, only their paths.
 */
export function buildExport(db: Database.Database, tables: readonly string[], now: number): ExportFile {
  const out: Record<string, unknown[]> = {};
  for (const table of tables) {
    assertTableName(table);
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    out[table] = table === 'settings' ? rows.filter((r) => !String(r.key).startsWith('pairing.')) : rows;
  }
  return { app: 'wolfie-sensei', version: 1, exportedAt: now, tables: out };
}

export interface ClearResult {
  tablesCleared: string[];
  imageFilesDeleted: number;
}

/**
 * Deletes every row in every app table, then re-seeds the single `streak_state` row, so the app
 * starts clean. `keepSettings` leaves the settings table (and with it, pairings) alone. Stored hint
 * images are deleted from disk with `deleteFile` (best effort).
 */
export function clearAllData(
  db: Database.Database,
  tables: readonly string[],
  opts: { keepSettings?: boolean; deleteFile?: (path: string) => void } = {}
): ClearResult {
  const imagePaths = (db.prepare('SELECT image_path FROM hint_requests WHERE image_path IS NOT NULL').all() as { image_path: string }[]).map(
    (r) => r.image_path
  );

  const targets = tables.filter((t) => !(opts.keepSettings && t === 'settings'));
  const ordered = [...DELETE_FIRST.filter((t) => targets.includes(t)), ...targets.filter((t) => !DELETE_FIRST.includes(t))];

  // Unknown tables (the other agent's) may have foreign keys we don't know the order of; every row
  // goes anyway, so switch the check off for the duration. The pragma can't change inside a transaction.
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of ordered) {
        assertTableName(table);
        db.prepare(`DELETE FROM ${table}`).run();
      }
      if (targets.includes('streak_state')) {
        db.prepare('INSERT INTO streak_state (id, current, longest, freezes_available, last_freeze_grant) VALUES (1, 0, 0, 0, NULL)').run();
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  let deleted = 0;
  for (const path of imagePaths) {
    try {
      opts.deleteFile?.(path);
      deleted++;
    } catch {
      // already gone
    }
  }
  return { tablesCleared: ordered, imageFilesDeleted: deleted };
}

function assertTableName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsafe table name: ${name}`);
}
