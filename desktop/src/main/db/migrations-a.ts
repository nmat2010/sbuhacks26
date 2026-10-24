import type Database from 'better-sqlite3';
import type { Migration } from './migration.js';

// Agent A's migrations. Names: 1xx_a_<what> (e.g. 101_a_...). Additive only; never depend on
// the other agent's tables. Only Agent A edits this file.
export function migrations(db: Database.Database): Migration[] {
  return [
    {
      // LAN sync (A8): ids of web app messages already applied, so replays after an offline
      // period (or a desktop restart) are acknowledged but never applied twice.
      name: '101_a_sync_seen',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS a_sync_seen (
            id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            seen_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_a_sync_seen_at ON a_sync_seen(seen_at);
        `);
      }
    },
    {
      // Streak (A9): the IANA time zone a desktop session ran in, so a day keeps the date it had
      // when it happened even if the user later changes time zone.
      name: '102_a_session_tz',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS a_session_tz (
            session_id TEXT PRIMARY KEY,
            tz TEXT NOT NULL
          );
        `);
      }
    }
  ];
}

/** Tables created here, so "Clear all data" and export include them. */
export const tables: readonly string[] = ['a_sync_seen', 'a_session_tz'];
