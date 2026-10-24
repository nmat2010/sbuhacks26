import { describe, expect, it } from 'vitest';
import { escalation, messages, nudges } from '../fixtures/index.js';
import {
  ExtensionMessageSchema,
  HintContextSchema,
  HintResponseSchema,
  NudgeResponseSchema,
  NudgeSchema,
  PageSummarySchema,
  StruggleSignalSchema,
  SyncMessageSchema
} from '../schemas/index.js';

describe('contract fixtures', () => {
  it.each(Object.entries(nudges))('nudge %s validates', (_name, nudge) => {
    expect(() => NudgeSchema.parse(nudge)).not.toThrow();
  });

  it('single-object fixtures validate', () => {
    PageSummarySchema.parse(messages.pageSummary);
    StruggleSignalSchema.parse(messages.signal);
    NudgeResponseSchema.parse(messages.nudgeResponse);
    HintContextSchema.parse(messages.hintContext);
    HintResponseSchema.parse(messages.hintResponse);
  });

  it.each(messages.sync.map((m) => [m.type, m] as const))('sync %s validates', (_type, msg) => {
    expect(() => SyncMessageSchema.parse(msg)).not.toThrow();
  });

  it.each(messages.extension.map((m) => [m.type, m] as const))('extension %s validates', (_type, msg) => {
    expect(() => ExtensionMessageSchema.parse(msg)).not.toThrow();
  });

  it('every sync and extension message type has a fixture', () => {
    const syncTypes = SyncMessageSchema.options.map((o) => o.shape.type.value);
    const extTypes = ExtensionMessageSchema.options.map((o) => o.shape.type.value);
    expect(new Set(messages.sync.map((m) => m.type))).toEqual(new Set(syncTypes));
    expect(new Set(messages.extension.map((m) => m.type))).toEqual(new Set(extTypes));
  });

  it.each(messages.invalid.sync.map((m) => [m.id, m] as const))('invalid sync %s is rejected', (_id, msg) => {
    expect(SyncMessageSchema.safeParse(msg).success).toBe(false);
  });

  it.each(messages.invalid.extension.map((m) => [m.id, m] as const))('invalid extension %s is rejected', (_id, msg) => {
    expect(ExtensionMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('escalation fixture signals validate', () => {
    for (const signal of Object.values(escalation.signals)) StruggleSignalSchema.parse(signal);
  });
});
