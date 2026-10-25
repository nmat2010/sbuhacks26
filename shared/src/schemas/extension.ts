import { z } from 'zod';
import { PageSummarySchema } from './page-summary.js';
import { StruggleSignalSchema } from './signals.js';
import { BrightspaceDataSchema } from './brightspace.js';

// Chrome extension <-> desktop over the loopback WebSocket (SPEC Phase 2, 4a).
//
// The extension connects to ws://127.0.0.1:<port> and must send `ext.hello` with the pairing
// token as its first message; the token is never put in the URL. The desktop also checks the
// Origin header is chrome-extension://<id>. The extension reports only while the last
// `desk.state` said `reporting: true` (session active, browser frontmost, not paused).

/** Loopback port for the extension server (127.0.0.1 only). */
export const EXTENSION_WS_PORT = 45678;

const envelope = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    id: z.string(),
    type: z.literal(type),
    ts: z.number(),
    payload
  });

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  // extension -> desktop
  envelope('ext.hello', z.object({ token: z.string(), extensionVersion: z.string() })),
  envelope(
    'ext.tab',
    z.object({
      domain: z.string(),
      title: z.string().optional(),
      /**
       * Full URL, sent only for papers and videos (a PDF, an arXiv page, a YouTube watch page) so
       * Watch mode can read the paper or the video. Never sent for other pages.
       */
      contentUrl: z.string().url().max(2048).optional()
    })
  ),
  /**
   * The active tab reports nothing (excluded, incognito, not a web page, or Chrome lost focus).
   * The desktop forgets the last domain so nothing is attributed to, or captured for, it.
   */
  envelope('ext.tab_none', z.object({})),
  envelope('ext.page_summary', z.object({ summary: PageSummarySchema })),
  envelope('ext.signal', z.object({ signal: StruggleSignalSchema, domain: z.string() })),
  envelope('ext.brightspace_data', z.object({ data: BrightspaceDataSchema })),
  // desktop -> extension
  envelope('desk.hello_result', z.object({ ok: z.boolean(), reason: z.string().optional() })),
  envelope(
    'desk.state',
    z.object({
      reporting: z.boolean(),
      paused: z.boolean(),
      capturePageText: z.boolean(),
      excludedDomains: z.array(z.string())
    })
  ),
  envelope('desk.request_summary', z.object({ requestId: z.string() })),
  envelope('desk.request_brightspace', z.object({ requestId: z.string() }))
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
export type ExtensionMessageType = ExtensionMessage['type'];
export type ExtensionMessageOf<T extends ExtensionMessageType> = Extract<ExtensionMessage, { type: T }>;
