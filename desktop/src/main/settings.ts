import type Database from 'better-sqlite3';
import { SettingsDefaults, type SettingsKey, type SettingsValues } from '@wolfie/shared';
import { getDatabase } from './db/index.js';
import { TypedEmitter } from './typed-emitter.js';

// Typed settings over the `settings` table; missing keys fall back to SettingsDefaults.

export const settingsEvents = new TypedEmitter<{ change: [key: SettingsKey, value: unknown] }>();

export function getSetting<K extends SettingsKey>(key: K, db: Database.Database = getDatabase()): SettingsValues[K] {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return structuredClone(SettingsDefaults[key]);
  return JSON.parse(row.value_json) as SettingsValues[K];
}

export function setSetting<K extends SettingsKey>(
  key: K,
  value: SettingsValues[K],
  db: Database.Database = getDatabase()
): void {
  db.prepare(
    'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
  ).run(key, JSON.stringify(value));
  settingsEvents.emit('change', key, value);
}
