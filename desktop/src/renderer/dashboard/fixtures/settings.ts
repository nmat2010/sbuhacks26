import type { Settings } from '../types/wolfie';

export const fixtureSettings: Settings = {
  connections: {
    extensionPaired: true,
    brightspaceSyncedAt: '2026-10-24T08:00:00Z',
    semester: 'Fall 2026'
  },
  powers: {
    overlay: true,
    screenRecording: false,
    voice: false
  },
  reports: {
    recordProblems: true,
    showProductivityCurve: true,
    weeklyReport: true
  },
  independence: {
    attemptLength: 20,
    unlockMinutes: 15,
    aiShareCap: 0.20,
    tryFirstMinutes: 10
  },
  appearance: {
    pixelScale: 1,
    reduceMotion: false,
    soundEffects: true
  }
};
