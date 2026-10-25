import { useEffect, useRef, useState } from 'react';
import type { ChatMessageView, WatchStatus } from '../../../common/ipc-intelligence';
import { usePushToTalk } from '../hooks/usePushToTalk';
import './HintConversation.css';

// Wolfie's chat panel (opened by clicking Wolfie). Thu's design, wired to the backend by Tuan:
// - "Help me with this" starts the help flow (an explanation in learning mode, the hint ladder in
//   homework mode); its steps arrive as 'stuck' nudges and are shown here with their buttons.
// - Typed messages go to chat-send: a follow-up to the open hint/explanation, or a question
//   answered from the study session (Watch mode) or general knowledge.

type ConversationMessage = ChatMessageView;

interface HintConversationProps {
  onClose: () => void;
  voiceMode?: boolean;
}

const GREETING: ConversationMessage = {
  id: 'greeting',
  ts: 0,
  role: 'wolfie',
  text: 'Hi! Ask me anything about what you are working on, or tap "Help me with this".'
};

const RESOURCE_ICONS: Record<string, string> = { video: '🎬', article: '📰', course: '🎓', book: '📚', paper: '📄' };

function describeWatch(status: WatchStatus | null): { icon: string; text: string } | null {
  if (!status) return null;
  if (status.state === 'watching') {
    // The model's description, unless it is about the window before the latest switch
    const fresh =
      status.subject && status.lastObservedAt !== null && (status.lookingSince === null || status.lastObservedAt >= status.lookingSince);
    if (fresh) {
      const what = status.activity ? status.activity.replace(/_/g, ' ') : 'working';
      return { icon: '👀', text: `${what}: ${status.subject}` };
    }
    if (status.looking) return { icon: '👀', text: `Looking at ${status.looking}...` };
  }
  if (!status.enabled || !status.consented) {
    return { icon: '🙈', text: "Watch mode is off, so I only know what you tell me." };
  }
  return { icon: '⏸️', text: status.note ?? "I haven't had a look yet. Keep working and ask me anytime." };
}

export function HintConversation({ onClose, voiceMode = false }: HintConversationProps) {
  // The conversation lives in the main process (kept across closing the chat and restarts)
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  /** Waiting for Wolfie: the number of Wolfie messages when the request was made. */
  const [waitingFrom, setWaitingFrom] = useState<number | null>(null);
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  // Wolfie reads his replies aloud (ElevenLabs) unless muted here
  const [readAloud, setReadAloud] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const wolfieCount = (list: ConversationMessage[]) => list.filter((m) => m.role === 'wolfie').length;
  const busy = waitingFrom !== null && wolfieCount(messages) <= waitingFrom;

  useEffect(() => {
    void window.electronAPI.invoke('watch-get').then(setWatch).catch(() => setWatch(null));
    void window.electronAPI.invoke('chat-history').then(setMessages).catch(() => setMessages([]));
    void window.electronAPI
      .invoke('settings-get')
      .then((s) => setReadAloud(s['voice.read_replies']))
      .catch(() => undefined);
    const offs = [
      window.electronAPI.on('watch-state', setWatch),
      window.electronAPI.on('chat-history-changed', setMessages),
      window.electronAPI.on('settings-changed', ({ key, value }) => {
        if (key === 'voice.read_replies') setReadAloud(value === true);
      })
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Give up waiting after a minute (the reply may have failed silently)
  useEffect(() => {
    if (waitingFrom === null) return;
    const t = setTimeout(() => setWaitingFrom(null), 60_000);
    return () => clearTimeout(t);
  }, [waitingFrom]);

  // On open, show the end of the conversation; afterwards bring each new message into view from
  // its first line, so a long answer reads from the top
  useEffect(() => {
    const list = listRef.current;
    const last = list?.lastElementChild as HTMLElement | null;
    if (!list || !last) return;
    if (firstLoad.current && messages.length) {
      firstLoad.current = false;
      list.scrollTo({ top: list.scrollHeight });
      return;
    }
    list.scrollTo({ top: Math.max(0, last.offsetTop - list.offsetTop - 8), behavior: 'smooth' });
  }, [messages, busy]);

  const openStep = () => [...messages].reverse().find((m) => m.buttons?.length && !m.answered && m.nudgeId);

  const handleHelp = () => {
    setWaitingFrom(wolfieCount(messages));
    void window.electronAPI.invoke('chat-help');
  };

  const handleButton = (message: ConversationMessage, action: string) => {
    if (!message.nudgeId) return;
    setWaitingFrom(wolfieCount(messages));
    void window.electronAPI.invoke('nudge-response', { id: message.nudgeId, action, via: 'button' });
  };

  const handleSendMessage = () => {
    const text = userInput.trim();
    if (!text || busy) return;
    setUserInput('');
    void sendText(text);
  };

  /** Typed or spoken (push-to-talk): the same path into the conversation. */
  const sendText = async (text: string) => {
    setWaitingFrom(wolfieCount(messages) + 0);
    try {
      const res = await window.electronAPI.invoke('chat-send', text);
      if (res.kind !== 'followup') setWaitingFrom(null); // answers and errors are already in the history
    } catch {
      setWaitingFrom(null);
    }
  };

  // Push-to-talk: hold the mic, talk, let go; the words are sent like a typed message
  const [pttNote, setPttNote] = useState<string | null>(null);
  useEffect(() => {
    if (!pttNote) return;
    const t = setTimeout(() => setPttNote(null), 4000);
    return () => clearTimeout(t);
  }, [pttNote]);
  const ptt = usePushToTalk(
    (text) => void sendText(text),
    (message) => setPttNote(message)
  );

  const handleClear = () => {
    setWaitingFrom(null);
    void window.electronAPI.invoke('chat-clear');
  };

  const toggleReadAloud = () => {
    const next = !readAloud;
    setReadAloud(next);
    void window.electronAPI.invoke('settings-set', 'voice.read_replies', next);
    if (!next) void window.electronAPI.invoke('voice-stop-speaking');
  };

  const handleClose = () => {
    // Wolfie stops reading when the chat closes
    void window.electronAPI.invoke('voice-stop-speaking');
    // Closing with a hint or explanation still open ends it, so Wolfie can offer help again later
    const step = openStep();
    if (step?.nudgeId) void window.electronAPI.invoke('nudge-response', { id: step.nudgeId, action: 'dismissed', via: 'button' });
    onClose();
  };

  const shown = messages.length ? messages : [GREETING];
  const seeing = describeWatch(watch);
  const helpOpen = !!openStep();

  return (
    <div className="hint-conversation-overlay">
      <div className="hint-conversation-container">
        {/* Header */}
        <div className="hint-header">
          <div className="hint-header-left">
            <div className="wolfie-avatar">🐺</div>
            <div>
              <h3 className="hint-title">Wolfie Sensei</h3>
              <p className="hint-subtitle">
                {watch?.mode === 'homework' && <span className="assessment-badge">Homework: hints only</span>}
                {voiceMode && <span className="voice-badge">🎤 Voice Active</span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="close-btn read-aloud-btn"
              title={readAloud ? 'Wolfie reads replies aloud (click to mute)' : 'Replies are muted (click to have Wolfie read them)'}
              style={{ fontSize: 16, width: 'auto', padding: '0 6px' }}
              onClick={toggleReadAloud}
            >
              {readAloud ? '🔊' : '🔇'}
            </button>
            {messages.length > 0 && (
              <button className="close-btn" title="Clear chat" style={{ fontSize: 14, width: 'auto', padding: '0 8px' }} onClick={handleClear}>
                Clear
              </button>
            )}
            <button className="close-btn" onClick={handleClose}>×</button>
          </div>
        </div>

        {/* What Wolfie sees (Watch mode) */}
        {seeing && (
          <div className="context-preview">
            <div className="context-header">
              <span className="context-icon">{seeing.icon}</span>
              <span className="context-label">What I see:</span>
            </div>
            <p className="context-description" title={seeing.text}>{seeing.text}</p>
          </div>
        )}

        {/* Messages */}
        <div className="hint-messages" ref={listRef}>
          {shown.map((message) => (
            <div key={message.id} className={`message ${message.role === 'user' ? 'message-user' : 'message-wolfie'}`}>
              {message.role === 'wolfie' && <div className="message-avatar">🐺</div>}
              <div className="message-content">
                {message.label && <div className="hint-level-badge">{message.label}</div>}
                <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                {!!message.citations?.length && (
                  <p className="message-time">
                    {message.citations
                      .map((c) => `${c.kind === 'video' ? '🎬' : '📄'} ${c.title}${c.locator ? ` (${c.locator})` : ''}`)
                      .join(' · ')}
                  </p>
                )}
                {!!message.resources?.length && (
                  <div className="resource-list">
                    {message.resources.map((r) => (
                      <button
                        key={r.url}
                        className="resource-link"
                        title={r.url}
                        onClick={() => void window.electronAPI.invoke('open-link', r.url)}
                      >
                        <span className="resource-title">
                          {RESOURCE_ICONS[r.kind] ?? '🔗'} {r.title}
                        </span>
                        {r.why && <span className="resource-why">{r.why}</span>}
                        {r.detail && <span className="resource-detail">{r.checked ? r.detail : `🔎 ${r.detail}`}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!!message.buttons?.length && !message.answered && (
                  <div className="hint-actions" style={{ padding: '8px 0 0', borderTop: 'none' }}>
                    {message.buttons.map((b) => (
                      <button
                        key={b.action}
                        className={`action-btn ${b.variant === 'primary' ? 'primary' : 'secondary'}`}
                        onClick={() => handleButton(message, b.action)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="message-time">
                  {message.ts ? new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            </div>
          ))}
          {busy && (
            <div className="message message-wolfie">
              <div className="message-avatar">🐺</div>
              <div className="message-content">
                <p className="message-text">Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!helpOpen && (
          <div className="hint-actions">
            <button className="action-btn primary" onClick={handleHelp} disabled={busy}>
              Help me with this
            </button>
          </div>
        )}

        {/* Input (questions and follow-ups): hold the mic to talk, or type */}
        {pttNote && <p className="ptt-note">{pttNote}</p>}
        <div className="hint-input-container">
          <button
            className={`ptt-btn ${ptt.state}`}
            title="Hold to talk, let go to send"
            disabled={busy || ptt.state === 'transcribing'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              void ptt.start();
            }}
            onPointerUp={() => ptt.stop()}
            onPointerCancel={() => ptt.stop()}
          >
            {ptt.state === 'transcribing' ? '…' : '🎤'}
          </button>
          <input
            type="text"
            className="hint-input"
            autoFocus
            placeholder={
              ptt.state === 'recording'
                ? 'Listening... let go to send'
                : ptt.state === 'transcribing'
                  ? 'Getting your words...'
                  : helpOpen
                    ? 'Ask about this hint...'
                    : voiceMode
                      ? 'Speak or type your question...'
                      : 'Ask me anything...'
            }
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSendMessage()}
          />
          <button className="send-btn" onClick={() => void handleSendMessage()} disabled={busy}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
