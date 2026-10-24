import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  HINT_LEVEL_KEYS,
  HintResponseSchema,
  SettingsDefaults,
  type HintContext,
  type SettingsKey,
  type SettingsValues
} from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import type { LLMProvider, LlmRequest } from '../../llm/provider.js';
import { HintService } from '../service.js';

// B4: hint.request with source handwriting / camera (A8 routes the web app's message here)

let db: Database.Database;
let dir: string;
const png = 'data:image/png;base64,iVBORw0KGgo=';
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

beforeEach(() => {
  db = openDatabase(':memory:');
  dir = mkdtempSync(join(tmpdir(), 'wolfie-hw-'));
  db.prepare("INSERT INTO sessions (id, device, started_at) VALUES ('w1', 'webapp', 1)").run();
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const requests: LlmRequest[] = [];
  const mock = new MockLLMProvider({ delayMs: 0 });
  const provider: LLMProvider = {
    name: 'mock',
    countsTowardCap: false,
    generateJson: (req) => {
      requests.push(req);
      return mock.generateJson(req);
    }
  };
  const client = new LLMClient({ provider, log: () => {} });
  const service = new HintService({
    llm: () => client,
    db: () => db,
    now: () => 1,
    getSetting: <K extends SettingsKey>(key: K) => SettingsDefaults[key] as SettingsValues[K],
    activeSession: () => null,
    imageDir: () => join(dir, 'images'),
    log: () => {},
    console: () => {}
  });
  return { service, requests };
}

const ctx = (extra: Partial<HintContext>): HintContext => ({
  sessionId: 'w1',
  device: 'webapp',
  trigger: 'manual',
  ...extra
});

describe('handwriting and camera sources (mock round trip)', () => {
  const cases: Array<['handwriting' | 'camera', string, string]> = [
    ['handwriting', 'demo-handwriting', png],
    ['camera', 'demo-camera', jpeg],
    ['handwriting', 'some-unknown-canvas', png],
    ['camera', 'some-unknown-photo', jpeg]
  ];

  for (const [source, problemId, image] of cases) {
    it(`${source} / ${problemId} returns five distinct levels`, async () => {
      const { service, requests } = setup();
      const res = await service.requestHints(ctx({ problemId, imageDataUrl: image }), source, false);
      expect(() => HintResponseSchema.parse(res)).not.toThrow();
      expect(new Set(HINT_LEVEL_KEYS.map((k) => res.hint_levels[k])).size).toBe(5);
      expect(res.offline).toBe(false);
      // the image goes to the model as inlineData material
      expect(requests[0].images?.[0].mimeType).toBe(image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    });
  }

  it('the demo handwriting problem gets its own hints; unknown ones get a handwriting-aware default', async () => {
    const { service } = setup();
    const demo = await service.requestHints(ctx({ problemId: 'demo-handwriting', imageDataUrl: png }), 'handwriting', false);
    expect(demo.what_i_see).toMatch(/x\^2 sin\(x\)/);
    const unknown = await service.requestHints(ctx({ problemId: 'nope', imageDataUrl: png }), 'handwriting', false);
    expect(unknown.what_i_see).toMatch(/handwritten/);
    expect(unknown.what_i_see).not.toBe(demo.what_i_see);
  });

  it('illegible writing: the hint says what it could not read and asks instead of guessing', async () => {
    const { service } = setup();
    const res = await service.requestHints(ctx({ problemId: 'demo-illegible', imageDataUrl: png }), 'handwriting', false);
    expect(res.what_i_see).toMatch(/could not read/i);
    expect(res.hint_levels.nudge).toMatch(/\?$/);
  });

  it('the prompt tells the model to flag illegible writing, for handwriting and camera only', async () => {
    const { service, requests } = setup();
    await service.requestHints(ctx({ imageDataUrl: png }), 'handwriting', false);
    await service.requestHints(ctx({ imageDataUrl: jpeg }), 'camera', false);
    await service.requestHints(ctx({}), 'screen', false);
    expect(requests[0].system).toMatch(/illegible or ambiguous/);
    expect(requests[0].system).toMatch(/notebook page/);
    expect(requests[1].system).toMatch(/illegible or ambiguous/);
    expect(requests[1].system).toMatch(/photo/);
    expect(requests[2].system).not.toMatch(/illegible or ambiguous/);
  });

  it('works in assessment mode and with follow-ups on the same source', async () => {
    const { service } = setup();
    const res = await service.requestHints(ctx({ problemId: 'demo-handwriting', imageDataUrl: png }), 'handwriting', true);
    expect(res.hint_levels.direct_step).not.toMatch(/2x sin\(x\) \+ x\^2 cos\(x\)/);
    const follow = await service.requestFollowup(
      { requestId: 'r', utterance: "I don't get the product rule", currentLevel: 1, conversationHistory: [] },
      ctx({ problemId: 'demo-handwriting', imageDataUrl: png }),
      'handwriting',
      true
    );
    expect(follow.level).toBe(2);
  });

  it('logs the web app request against its session and keeps no image with storage off', async () => {
    const { service } = setup();
    await service.requestHints(ctx({ problemId: 'demo-handwriting', imageDataUrl: png }), 'handwriting', false);
    expect(db.prepare('SELECT device, source, trigger, image_path FROM hint_requests').get()).toEqual({
      device: 'webapp',
      source: 'handwriting',
      trigger: 'manual',
      image_path: null
    });
    expect(existsSync(join(dir, 'images'))).toBe(false);
  });
});
