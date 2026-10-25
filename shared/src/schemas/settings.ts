import { z } from 'zod';

// Settings keys contract (SPEC 11, contract 5). Stored in the desktop `settings` table as JSON.
export const SettingsKeys = {
  // Monitoring
  MONITORED_AI_TOOLS: 'monitored.ai_tools',
  MONITORED_DISTRACTIONS: 'monitored.distractions',
  EXCLUDED_DOMAINS: 'monitored.excluded_domains',
  CAPTURE_WINDOW_TITLES: 'monitoring.capture_window_titles',
  CAPTURE_PAGE_TEXT: 'monitoring.capture_page_text',
  RULE_COOLDOWN_MINUTES: 'monitored.rule_cooldown_minutes',

  // Nudge behavior
  NUDGE_MAX_PER_HOUR: 'nudge.max_per_hour',
  NUDGE_COOLDOWN_MINUTES: 'nudge.cooldown_minutes',

  // Stuck detection thresholds
  STUCK_IDLE_MINUTES: 'stuck.idle_minutes',
  STUCK_LONG_PROBLEM_MINUTES: 'stuck.long_problem_minutes',
  STUCK_THRESHOLDS: 'stuck.thresholds',

  // Voice
  VOICE_ENABLED: 'voice.enabled',
  VOICE_HOLD_TO_TALK: 'voice.hold_to_talk',
  VOICE_STT_PROVIDER: 'voice.stt_provider',
  VOICE_TTS_PROVIDER: 'voice.tts_provider',
  VOICE_STORE_TRANSCRIPTS: 'voice.store_transcripts',
  /** Wolfie reads his chat replies aloud (ElevenLabs), separate from voice mode's microphone. */
  VOICE_READ_REPLIES: 'voice.read_replies',

  // Assessment
  ASSESSMENT_DOMAINS: 'assessment.domains',

  // Images
  IMAGE_STORAGE_ENABLED: 'image.storage_enabled',

  // Streak
  STREAK_QUALIFYING_MINUTES: 'streak.qualifying_minutes',
  STREAK_REMINDER_TIME: 'streak.reminder_time',
  STREAK_REMINDER_ENABLED: 'streak.reminder_enabled',

  // Session
  SESSION_AUTO_START_APP: 'session.auto_start_app',
  SESSION_IDLE_TIMEOUT_SECONDS: 'session.idle_timeout_seconds',

  // Pairing
  EXTENSION_PAIRING_TOKEN: 'pairing.extension_token',
  EXTENSION_ID: 'pairing.extension_id',
  WEBAPP_DEVICES: 'pairing.webapp_devices',

  // Watch mode (WATCH_MODE.md)
  WATCH_ENABLED: 'watch.enabled',
  WATCH_CONSENTED_AT: 'watch.consented_at',
  WATCH_INTERVAL_SECONDS: 'watch.interval_seconds',
  WATCH_EXCLUDED_APPS: 'watch.excluded_apps',
  WATCH_AUTO_IMPORT_PAPERS: 'watch.auto_import_papers',
  WATCH_CALLS_PER_DAY: 'watch.calls_per_day',
  WATCH_STALL_SECONDS: 'watch.stall_seconds',

  // API
  API_CALL_LIMIT_PER_DAY: 'api.call_limit_per_day',

  // Demo
  DEMO_MODE: 'demo.mode'
} as const;

export type SettingsKey = (typeof SettingsKeys)[keyof typeof SettingsKeys];

export const RuleEntry = z.object({
  name: z.string(),
  domains: z.array(z.string()), // matched against the tab domain (suffix match)
  appNames: z.array(z.string()), // fallback: matched against app name / window title
  enabled: z.boolean()
});
export type RuleEntryType = z.infer<typeof RuleEntry>;

export const PairedDevice = z.object({
  deviceId: z.string(),
  name: z.string(),
  secret: z.string(),
  pairedAt: z.number()
});
export type PairedDeviceType = z.infer<typeof PairedDevice>;

export const StuckThresholds = z.object({
  wrongAnswerCount: z.number(),
  deadClickCount: z.number(),
  deadClickWindowSec: z.number(),
  validationErrorCount: z.number(),
  validationWindowSec: z.number(),
  backtrackCount: z.number(),
  backtrackWindowSec: z.number(),
  contextSwitchCount: z.number(),
  contextSwitchWindowSec: z.number(),
  // web app canvas signals
  idleOnPageMinutes: z.number(),
  scribbleOutCount: z.number(),
  scribbleOutWindowSec: z.number(),
  undoBurstCount: z.number(),
  undoBurstWindowSec: z.number()
});
export type StuckThresholdsType = z.infer<typeof StuckThresholds>;

const rule = (name: string, domains: string[], appNames: string[] = []): RuleEntryType => ({
  name,
  domains,
  appNames,
  enabled: true
});

// One value type per key. getSetting(key) returns SettingsValues[key].
export interface SettingsValues {
  'monitored.ai_tools': RuleEntryType[];
  'monitored.distractions': RuleEntryType[];
  'monitored.excluded_domains': string[];
  'monitoring.capture_window_titles': boolean;
  'monitoring.capture_page_text': boolean;
  'monitored.rule_cooldown_minutes': number;
  'nudge.max_per_hour': number;
  'nudge.cooldown_minutes': Record<'distraction' | 'ai_tool' | 'stuck' | 'streak' | 'other', number>;
  'stuck.idle_minutes': number;
  'stuck.long_problem_minutes': number;
  'stuck.thresholds': StuckThresholdsType;
  'voice.enabled': boolean;
  'voice.hold_to_talk': boolean;
  'voice.stt_provider': 'elevenlabs' | 'mock';
  'voice.tts_provider': 'elevenlabs' | 'mock';
  'voice.store_transcripts': boolean;
  'voice.read_replies': boolean;
  'assessment.domains': string[];
  'image.storage_enabled': boolean;
  'streak.qualifying_minutes': number;
  'streak.reminder_time': string; // "HH:MM" local
  'streak.reminder_enabled': boolean;
  'session.auto_start_app': string | null;
  'session.idle_timeout_seconds': number;
  'pairing.extension_token': string | null;
  'pairing.extension_id': string | null;
  'pairing.webapp_devices': PairedDeviceType[];
  'watch.enabled': boolean;
  /** When the student accepted the Watch-mode consent screen (epoch ms), or null. */
  'watch.consented_at': number | null;
  'watch.interval_seconds': number;
  /** App names that are never captured (matched case-insensitively against the app name). */
  'watch.excluded_apps': string[];
  'watch.auto_import_papers': boolean;
  /** Separate cap for watcher calls, so watching never uses up the hint/plan budget. */
  'watch.calls_per_day': number;
  /** On an unanswered question with no keyboard/mouse input this long: offer a hint to get started. */
  'watch.stall_seconds': number;
  'api.call_limit_per_day': number;
  'demo.mode': boolean;
}

export const SettingsDefaults: SettingsValues = {
  'monitored.ai_tools': [
    rule('Claude', ['claude.ai'], ['Claude']),
    rule('ChatGPT', ['chatgpt.com', 'chat.openai.com'], ['ChatGPT']),
    rule('Gemini', ['gemini.google.com'], ['Gemini']),
    rule('Copilot', ['copilot.microsoft.com', 'github.com/copilot'], ['Copilot']),
    rule('Perplexity', ['perplexity.ai'], ['Perplexity'])
  ],
  'monitored.distractions': [
    rule('YouTube', ['youtube.com', 'youtu.be'], ['YouTube']),
    rule('Netflix', ['netflix.com'], ['Netflix']),
    rule('Instagram', ['instagram.com'], ['Instagram']),
    rule('TikTok', ['tiktok.com'], ['TikTok']),
    rule('Reddit', ['reddit.com'], ['Reddit']),
    rule('Games', ['store.steampowered.com', 'chess.com', 'roblox.com'], ['Steam', 'Minecraft', 'Roblox', 'League of Legends'])
  ],
  // Banking, email, and health portals (SPEC Phase 2). Suffix-matched.
  'monitored.excluded_domains': [
    'chase.com',
    'bankofamerica.com',
    'wellsfargo.com',
    'capitalone.com',
    'paypal.com',
    'venmo.com',
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
    'mail.yahoo.com',
    'mychart.org',
    'mychart.com',
    'patient.portal'
  ],
  'monitoring.capture_window_titles': true,
  'monitoring.capture_page_text': true,
  'monitored.rule_cooldown_minutes': 10,
  'nudge.max_per_hour': 12,
  // stuck: 1 min. The escalation engine paces offers itself (steps, decline quiet, "I'm good");
  // this is only a safety net, and must not exceed the 1 min re-offer for a new wrong answer
  'nudge.cooldown_minutes': { distraction: 10, ai_tool: 10, stuck: 1, streak: 60, other: 5 },
  'stuck.idle_minutes': 4,
  'stuck.long_problem_minutes': 12,
  'stuck.thresholds': {
    wrongAnswerCount: 2,
    deadClickCount: 3,
    deadClickWindowSec: 20,
    validationErrorCount: 3,
    validationWindowSec: 120,
    backtrackCount: 3,
    backtrackWindowSec: 120,
    contextSwitchCount: 3,
    contextSwitchWindowSec: 120,
    idleOnPageMinutes: 4,
    scribbleOutCount: 3,
    scribbleOutWindowSec: 90,
    undoBurstCount: 5,
    undoBurstWindowSec: 60
  },
  'voice.enabled': false,
  'voice.hold_to_talk': false,
  'voice.stt_provider': 'elevenlabs',
  'voice.tts_provider': 'elevenlabs',
  'voice.store_transcripts': false,
  'voice.read_replies': true,
  'assessment.domains': [],
  'image.storage_enabled': false,
  'streak.qualifying_minutes': 20,
  'streak.reminder_time': '20:00',
  'streak.reminder_enabled': true,
  'session.auto_start_app': null,
  'session.idle_timeout_seconds': 60,
  'pairing.extension_token': null,
  'pairing.extension_id': null,
  'pairing.webapp_devices': [],
  'watch.enabled': false,
  'watch.consented_at': null,
  'watch.interval_seconds': 8,
  'watch.excluded_apps': [
    'Messages',
    'Mail',
    'FaceTime',
    'WhatsApp',
    'Signal',
    'Telegram',
    '1Password',
    'Bitwarden',
    'Keychain Access',
    'System Settings',
    'Wallet'
  ],
  // Opt-in: the Watch-mode consent screen asks "Let Wolfie read papers you open?" (WATCH_MODE.md §3.2)
  'watch.auto_import_papers': false,
  'watch.calls_per_day': 2000,
  'watch.stall_seconds': 60,
  'api.call_limit_per_day': 200,
  'demo.mode': false
};

export const SettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.any()),
  z.record(z.any())
]);

export type SettingValue = z.infer<typeof SettingValueSchema>;
