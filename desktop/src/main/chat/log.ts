import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { ChatTurnType, NudgeButtonType } from '@wolfie/shared';
import type { ChatMessageView, WatchCitation, WatchResource } from '../../common/ipc-intelligence.js';

// Wolfie's chat history (the overlay chat panel). Kept in SQLite so it survives closing the chat
// and restarting the app, like an ongoing conversation; the recent turns are also sent with each
// question so Wolfie remembers what was said. Local only; cleared by "Clear chat" or "Clear all".

export const MAX_MESSAGES = 200;

interface Meta {
  label?: string;
  citations?: WatchCitation[];
  resources?: WatchResource[];
  nudgeId?: string;
  buttons?: NudgeButtonType[];
  answered?: boolean;
}

interface Row {
  id: string;
  ts: number;
  role: 'user' | 'wolfie';
  text: string;
  meta_json: string | null;
}

export class ChatLog {
  constructor(
    private readonly db: () => Database.Database,
    private readonly now: () => number = Date.now
  ) {}

  add(message: { role: 'user' | 'wolfie'; text: string } & Meta): ChatMessageView {
    const id = randomUUID();
    const ts = this.now();
    const { role, text, ...meta } = message;
    const db = this.db();
    // A new step with buttons replaces the buttons of older messages (only the newest is active)
    if (meta.buttons?.length) {
      db.prepare(
        "UPDATE chat_messages SET meta_json = json_set(meta_json, '$.answered', json('true')) WHERE json_extract(meta_json, '$.buttons') IS NOT NULL"
      ).run();
    }
    db.prepare('INSERT INTO chat_messages (id, ts, role, text, meta_json) VALUES (?, ?, ?, ?, ?)').run(
      id,
      ts,
      role,
      text,
      Object.keys(meta).length ? JSON.stringify(meta) : null
    );
    // Keep the newest MAX_MESSAGES
    db.prepare('DELETE FROM chat_messages WHERE seq <= (SELECT MAX(seq) FROM chat_messages) - ?').run(MAX_MESSAGES);
    return { id, ts, role, text, ...meta };
  }

  /** The bubble with this nudge id was answered: its buttons are no longer active. */
  markAnswered(nudgeId: string): ChatMessageView | null {
    const row = this.db()
      .prepare("SELECT id, ts, role, text, meta_json FROM chat_messages WHERE json_extract(meta_json, '$.nudgeId') = ? ORDER BY seq DESC LIMIT 1")
      .get(nudgeId) as Row | undefined;
    if (!row) return null;
    const meta: Meta = { ...(row.meta_json ? (JSON.parse(row.meta_json) as Meta) : {}), answered: true };
    this.db().prepare('UPDATE chat_messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), row.id);
    return toView({ ...row, meta_json: JSON.stringify(meta) });
  }

  /** The button label for an action on a recorded bubble ("Another hint" for another_hint). */
  buttonLabel(nudgeId: string, action: string): string | null {
    const row = this.db()
      .prepare("SELECT meta_json FROM chat_messages WHERE json_extract(meta_json, '$.nudgeId') = ? ORDER BY seq DESC LIMIT 1")
      .get(nudgeId) as { meta_json: string } | undefined;
    const buttons = row ? ((JSON.parse(row.meta_json) as Meta).buttons ?? []) : [];
    return buttons.find((b) => b.action === action)?.label ?? null;
  }

  list(): ChatMessageView[] {
    return (this.db().prepare('SELECT id, ts, role, text, meta_json FROM chat_messages ORDER BY seq').all() as Row[]).map(toView);
  }

  /** The last turns as conversation history for the model (oldest first), with the links Wolfie suggested. */
  recentTurns(n = 6): ChatTurnType[] {
    const rows = this.db()
      .prepare('SELECT role, text, meta_json FROM chat_messages ORDER BY seq DESC LIMIT ?')
      .all(n) as Array<Pick<Row, 'role' | 'text' | 'meta_json'>>;
    return rows.reverse().map((r) => {
      const resources = r.meta_json ? (JSON.parse(r.meta_json) as Meta).resources ?? [] : [];
      const suggested = resources.length
        ? `\n(Suggested: ${resources.map((x, i) => `${i + 1}. ${x.title} <${x.url}>`).join('; ')})`
        : '';
      return { role: r.role === 'user' ? 'user' : 'assistant', content: r.text.slice(0, 1500) + suggested };
    });
  }

  clear(): void {
    this.db().prepare('DELETE FROM chat_messages').run();
  }
}

function toView(row: Row): ChatMessageView {
  const meta = row.meta_json ? (JSON.parse(row.meta_json) as Meta) : {};
  return { id: row.id, ts: row.ts, role: row.role, text: row.text, ...meta };
}

/** Short-lived help-flow messages that are not worth keeping in the history. */
export function isTransient(text: string): boolean {
  return /^let me take a look/i.test(text.trim());
}

