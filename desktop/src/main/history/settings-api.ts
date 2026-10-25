import { z } from 'zod';
import { RuleEntry, SettingsDefaults, StuckThresholds, type SettingsKey, type SettingsValues } from '@wolfie/shared';
import type { PublicSettingKey, PublicSettings, SettingsSetResult } from '../../common/ipc-sensing.js';

// Validated settings access for the renderer (A10). The renderer never touches the database, and
// it must not be able to store a value of the wrong shape under a settings key, so every write is
// checked against a schema first. Pairing secrets are not readable or writable here.

const positive = (max: number, min = 1) => z.number().finite().min(min).max(max);
const domainList = z.array(z.string().trim().min(1).max(253)).max(500);
const rules = z.array(RuleEntry).max(200);

/** Explicit schemas where the default's type isn't enough (ranges, enums, formats). */
const EXPLICIT: Partial<Record<SettingsKey, z.ZodTypeAny>> = {
  'watch.interval_seconds': positive(120, 5),
  'watch.calls_per_day': positive(20_000, 0),
  'watch.stall_seconds': positive(600, 15),
  'watch.excluded_apps': z.array(z.string().trim().min(1).max(100)).max(200),
  'monitored.ai_tools': rules,
  'monitored.distractions': rules,
  'monitored.excluded_domains': domainList,
  'monitored.rule_cooldown_minutes': positive(240, 0),
  'nudge.max_per_hour': positive(120),
  'nudge.cooldown_minutes': z.object({
    distraction: positive(240, 0),
    ai_tool: positive(240, 0),
    stuck: positive(240, 0),
    streak: positive(1440, 0),
    other: positive(240, 0)
  }),
  'stuck.idle_minutes': positive(120),
  'stuck.long_problem_minutes': positive(240),
  'stuck.thresholds': StuckThresholds.extend(
    Object.fromEntries(Object.keys(StuckThresholds.shape).map((k) => [k, positive(100_000)])) as Record<string, z.ZodNumber>
  ),
  'voice.stt_provider': z.enum(['elevenlabs', 'mock']),
  'voice.tts_provider': z.enum(['elevenlabs', 'mock']),
  'assessment.domains': domainList,
  'streak.qualifying_minutes': positive(600),
  'streak.reminder_time': z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
  'session.auto_start_app': z.string().trim().min(1).max(100).nullable(),
  'session.idle_timeout_seconds': positive(3600, 10),
  'api.call_limit_per_day': z.number().int().min(0).max(10_000)
};

function schemaFor(key: SettingsKey): z.ZodTypeAny {
  const explicit = EXPLICIT[key];
  if (explicit) return explicit;
  const sample = SettingsDefaults[key];
  if (typeof sample === 'boolean') return z.boolean();
  if (typeof sample === 'number') return z.number().finite();
  return z.never(); // unknown shape: refuse rather than guess
}

export function isPublicSettingKey(key: unknown): key is PublicSettingKey {
  return (
    typeof key === 'string' &&
    key in SettingsDefaults &&
    !key.startsWith('pairing.') &&
    // Watch mode can only be turned on through its consent flow (watch-consent / watch-set)
    key !== 'watch.enabled' &&
    key !== 'watch.consented_at'
  );
}

/** Domains are stored lower-case without a scheme, path or spaces. */
function normalizeDomain(entry: string): string {
  return entry
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function normalize(key: PublicSettingKey, value: unknown): unknown {
  if (key === 'monitored.excluded_domains' || key === 'assessment.domains') {
    return [...new Set((value as string[]).map(normalizeDomain).filter(Boolean))];
  }
  if (key === 'monitored.ai_tools' || key === 'monitored.distractions') {
    return (value as SettingsValues['monitored.ai_tools']).map((r) => ({
      name: r.name.trim(),
      enabled: r.enabled,
      domains: [...new Set(r.domains.map((d) => d.trim().toLowerCase()).filter(Boolean))],
      appNames: r.appNames.map((a) => a.trim()).filter(Boolean)
    }));
  }
  return value;
}

export function validateSetting(key: unknown, value: unknown): { ok: true; key: PublicSettingKey; value: unknown } | { ok: false; error: string } {
  if (!isPublicSettingKey(key)) {
    return { ok: false, error: typeof key === 'string' && key.startsWith('pairing.') ? 'Pairing settings have their own screen.' : 'Unknown setting.' };
  }
  const parsed = schemaFor(key).safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Invalid value for ${key}${first?.path.length ? ` (${first.path.join('.')})` : ''}: ${first?.message ?? 'wrong shape'}` };
  }
  return { ok: true, key, value: normalize(key, parsed.data) };
}

export function readPublicSettings(get: <K extends SettingsKey>(key: K) => SettingsValues[K]): PublicSettings {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SettingsDefaults) as SettingsKey[]) {
    if (isPublicSettingKey(key)) out[key] = get(key);
  }
  return out as unknown as PublicSettings;
}

export function writePublicSetting(
  key: unknown,
  value: unknown,
  set: <K extends SettingsKey>(key: K, value: SettingsValues[K]) => void
): SettingsSetResult {
  const checked = validateSetting(key, value);
  if (!checked.ok) return { success: false, error: checked.error };
  set(checked.key, checked.value as never);
  return { success: true, value: checked.value };
}

const placeholder = /^(your_|<|changeme|xxx)/i;

/** True if an env var holds something that looks like a real key (not empty, not the template). */
export function keyPresent(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length > 0 && !placeholder.test(v);
}
