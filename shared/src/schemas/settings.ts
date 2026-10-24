import { z } from 'zod';

// Settings keys contract
export const SettingsKeys = {
  // Monitoring
  MONITORED_AI_TOOLS: 'monitored.ai_tools',
  MONITORED_DISTRACTIONS: 'monitored.distractions',
  EXCLUDED_DOMAINS: 'monitored.excluded_domains',
  CAPTURE_WINDOW_TITLES: 'monitoring.capture_window_titles',
  CAPTURE_PAGE_TEXT: 'monitoring.capture_page_text',

  // Nudge behavior
  NUDGE_MAX_PER_HOUR: 'nudge.max_per_hour',
  NUDGE_COOLDOWN_MINUTES: 'nudge.cooldown_minutes',

  // Stuck detection thresholds
  STUCK_IDLE_MINUTES: 'stuck.idle_minutes',
  STUCK_LONG_PROBLEM_MINUTES: 'stuck.long_problem_minutes',

  // Voice
  VOICE_ENABLED: 'voice.enabled',
  VOICE_HOLD_TO_TALK: 'voice.hold_to_talk',
  VOICE_STT_PROVIDER: 'voice.stt_provider',
  VOICE_TTS_PROVIDER: 'voice.tts_provider',

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

  // API
  API_CALL_LIMIT_PER_DAY: 'api.call_limit_per_day',

  // Demo
  DEMO_MODE: 'demo.mode'
} as const;

export const SettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.record(z.any())
]);

export type SettingValue = z.infer<typeof SettingValueSchema>;
