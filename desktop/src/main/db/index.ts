import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { migrations as sensingMigrations, tables as sensingTables } from './migrations-a.js';
import { migrations as intelligenceMigrations, tables as intelligenceTables } from './migrations-b.js';
import type { Migration } from './migration.js';

let db: Database.Database | null = null;

/** Opens the app database under `<userDataPath>/data/wolfie.db` (main.ts passes app.getPath('userData')). */
export function initDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbDir = join(userDataPath, 'data');

  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = openDatabase(join(dbDir, 'wolfie.db'));
  return db;
}

/** Opens and migrates a database at `path`. Tests pass ':memory:'. Does not touch the singleton. */
export function openDatabase(path: string): Database.Database {
  const database = new Database(path);

  // Enable foreign keys
  database.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(database);

  return database;
}

/** Test helper: make getDatabase() return `database`. */
export function setDatabaseForTesting(database: Database.Database | null): void {
  db = database;
}

function runMigrations(database: Database.Database) {
  // Create migrations table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrations: Migration[] = [
    {
      name: '001_initial_schema',
      up: () => {
        database.exec(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            device TEXT NOT NULL CHECK(device IN ('desktop', 'webapp')),
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            goal_id TEXT,
            label TEXT,
            assessment_mode INTEGER DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS app_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            app_name TEXT NOT NULL,
            window_title TEXT,
            url_domain TEXT,
            is_idle INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );

          CREATE TABLE IF NOT EXISTS web_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            type TEXT NOT NULL,
            strength TEXT NOT NULL CHECK(strength IN ('weak', 'strong')),
            meta_json TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );

          CREATE TABLE IF NOT EXISTS nudges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            device TEXT NOT NULL CHECK(device IN ('desktop', 'webapp')),
            kind TEXT NOT NULL CHECK(kind IN ('distraction', 'ai_tool', 'stuck', 'streak', 'other')),
            level INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            user_response TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );

          CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('research', 'job', 'project', 'course', 'other')),
            target_date TEXT,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived'))
          );

          CREATE TABLE IF NOT EXISTS plan_items (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            title TEXT NOT NULL,
            due_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
            notes TEXT,
            FOREIGN KEY (goal_id) REFERENCES goals(id)
          );

          CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            goal_id TEXT,
            title TEXT NOT NULL,
            url_or_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reading', 'completed')),
            added_at INTEGER NOT NULL,
            FOREIGN KEY (goal_id) REFERENCES goals(id)
          );

          CREATE TABLE IF NOT EXISTS paper_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            input_mode TEXT NOT NULL CHECK(input_mode IN ('text', 'voice')),
            ts INTEGER NOT NULL,
            FOREIGN KEY (paper_id) REFERENCES papers(id)
          );

          CREATE TABLE IF NOT EXISTS hint_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            device TEXT NOT NULL CHECK(device IN ('desktop', 'webapp')),
            source TEXT NOT NULL CHECK(source IN ('screen', 'page', 'handwriting', 'camera')),
            trigger TEXT NOT NULL CHECK(trigger IN ('auto', 'manual', 'voice')),
            image_path TEXT,
            hint_level INTEGER NOT NULL,
            hint_text TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );

          CREATE TABLE IF NOT EXISTS webapp_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            type TEXT NOT NULL,
            meta_json TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );

          CREATE TABLE IF NOT EXISTS streak_days (
            local_date TEXT PRIMARY KEY,
            qualified INTEGER NOT NULL DEFAULT 0,
            focus_minutes INTEGER NOT NULL DEFAULT 0,
            freeze_used INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS streak_state (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            current INTEGER NOT NULL DEFAULT 0,
            longest INTEGER NOT NULL DEFAULT 0,
            freezes_available INTEGER NOT NULL DEFAULT 0,
            last_freeze_grant TEXT
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            device TEXT NOT NULL CHECK(device IN ('desktop', 'webapp')),
            type TEXT NOT NULL,
            payload_json TEXT
          );

          -- Initialize streak state
          INSERT OR IGNORE INTO streak_state (id, current, longest, freezes_available)
          VALUES (1, 0, 0, 0);

          -- Indexes for performance
          CREATE INDEX IF NOT EXISTS idx_app_events_session ON app_events(session_id);
          CREATE INDEX IF NOT EXISTS idx_web_signals_session ON web_signals(session_id);
          CREATE INDEX IF NOT EXISTS idx_nudges_session ON nudges(session_id);
          CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
        `);
      },
    },
    {
      // nudges.session_id becomes nullable (streak reminders can fire outside a session) and
      // nudges get the NudgeQueue's string id (uid) so responses can be matched to their row.
      name: '002_nudges_uid_nullable_session',
      up: () => {
        database.exec(`
          CREATE TABLE nudges_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,
            session_id TEXT,
            ts INTEGER NOT NULL,
            device TEXT NOT NULL CHECK(device IN ('desktop', 'webapp')),
            kind TEXT NOT NULL CHECK(kind IN ('distraction', 'ai_tool', 'stuck', 'streak', 'other')),
            level INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            user_response TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );
          INSERT INTO nudges_new (id, session_id, ts, device, kind, level, payload_json, user_response)
            SELECT id, session_id, ts, device, kind, level, payload_json, user_response FROM nudges;
          DROP TABLE nudges;
          ALTER TABLE nudges_new RENAME TO nudges;
          CREATE INDEX IF NOT EXISTS idx_nudges_session ON nudges(session_id);
        `);
      },
    },
  ];

  // Run pending migrations: core first, then each agent's own list (see migrations-a/b.ts)
  for (const migration of [...migrations, ...sensingMigrations(database), ...intelligenceMigrations(database)]) {
    const exists = database
      .prepare('SELECT name FROM migrations WHERE name = ?')
      .get(migration.name);

    if (!exists) {
      console.log(`Running migration: ${migration.name}`);
      database.transaction(() => {
        migration.up();
        database
          .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
          .run(migration.name, Date.now());
      })();
    }
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Every app table, for "Clear all data" and export (SPEC Phase 8). */
export const DATA_TABLES = [
  'sessions',
  'app_events',
  'web_signals',
  'nudges',
  'goals',
  'plan_items',
  'papers',
  'paper_questions',
  'hint_requests',
  'webapp_activity',
  'streak_days',
  'streak_state',
  'settings',
  'events',
  ...sensingTables,
  ...intelligenceTables
] as const;
