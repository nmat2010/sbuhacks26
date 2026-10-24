import { useEffect, useRef, useState } from 'react';
import type { Nudge, NudgeButtonType } from '@wolfie/shared';
import type { WatchAnswer, WatchStatus } from '../../../common/ipc-intelligence';
import './HintConversation.css';

// Wolfie's chat panel (opened by clicking Wolfie). Thu's design, wired to the backend by Tuan:
// - "Help me with this" starts the help flow (an explanation in learning mode, the hint ladder in
//   homework mode); its steps arrive as 'stuck' nudges and are shown here with their buttons.
// - Typed messages go to chat-send: a follow-up to the open hint/explanation, or a question
//   answered from the study session (Watch mode) or general knowledge.

export interface ConversationMessage {
  id: string;
  role: 'user' | 'wolfie';
  text: string;
  timestamp: Date;
  /** Bubble id for answering this message's buttons (nudge-response). */
  nudgeId?: string;
  buttons?: NudgeButtonType[];
  /** Buttons are active only on the newest Wolfie message that has them. */
  answered?: boolean;
  label?: string;
  citations?: WatchAnswer['citations'];
}

interface HintConversationProps {
  onClose: () => void;
  voiceMode?: boolean;
}

let seq = 0;
const nextId = () => `m${++seq}`;

function describeWatch(status: WatchStatus | null): { icon: string; text: string } | null {
  if (!status) return null;
  if (status.state === 'watching' && status.subject) {
    const what = status.activity ? status.activity.replace(/_/g, ' ') : 'working';
    return { icon: '👀', text: `${what}: ${status.subject}` };
  }
  if (!status.enabled || !status.consented) {
    return { icon: '🙈', text: "Watch mode is off, so I only know what you tell me." };
  }
  return { icon: '⏸️', text: status.note ?? "I haven't had a look yet. Keep working and ask me anytime." };
}

export function HintConversation({ onClose, voiceMode = false }: HintConversationProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: nextId(),
      role: 'wolfie',
      text: 'Hi! Ask me anything about what you are working on, or tap "Help me with this".',
      timestamp: new Date()
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const add = (msg: Omit<ConversationMessage, 'id' | 'timestamp'>) =>
    setMessages((prev) => {
      // A new message with buttons replaces the buttons of older ones
      const settled = msg.buttons?.length ? prev.map((m) => (m.buttons ? { ...m, answered: true } : m)) : prev;
      return [...settled, { ...msg, id: nextId(), timestamp: new Date() }];
    });

  useEffect(() => {
    void window.electronAPI.invoke('watch-get').then(setWatch).catch(() => setWatch(null));
    const offs = [
      window.electronAPI.on('watch-state', setWatch),
      // Help-flow steps (explanation, hint ladder, follow-up replies) show up here while the chat is open
      window.electronAPI.on('nudge-show', (nudge: Nudge) => {
        if (nudge.kind !== 'stuck') return;
        setBusy(false);
        add({ role: 'wolfie', text: nudge.text, nudgeId: nudge.id, buttons: nudge.buttons });
      }),
      // Spoken questions answered from the session
      window.electronAPI.on('watch-answer', (answer: WatchAnswer) => {
        add({ role: 'wolfie', text: answer.answer, label: answer.label, citations: answer.citations });
      })
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Bring the newest message into view from its first line, so a long answer reads from the top
  useEffect(() => {
    const list = listRef.current;
    const last = list?.lastElementChild as HTMLElement | null;
    if (!list || !last) return;
    list.scrollTo({ top: Math.max(0, last.offsetTop - list.offsetTop - 8), behavior: 'smooth' });
  }, [messages, busy]);

  const openStep = () => [...messagesRef.current].reverse().find((m) => m.buttons?.length && !m.answered && m.nudgeId);

  const handleHelp = () => {
    add({ role: 'user', text: 'Help me with this' });
    setBusy(true);
    void window.electronAPI.invoke('mascot-click');
  };

  const handleButton = (message: ConversationMessage, button: NudgeButtonType) => {
    if (!message.nudgeId) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, answered: true } : m)));
    add({ role: 'user', text: button.label });
    void window.electronAPI.invoke('nudge-response', { id: message.nudgeId, action: button.action, via: 'button' });
  };

  const handleSendMessage = async () => {
    const text = userInput.trim();
    if (!text || busy) return;
    add({ role: 'user', text });
    setUserInput('');
    setBusy(true);
    try {
      const res = await window.electronAPI.invoke('chat-send', text);
      if (res.kind === 'answer') {
        add({ role: 'wolfie', text: res.answer.answer, label: res.answer.label, citations: res.answer.citations });
        setBusy(false);
      } else if (res.kind === 'error') {
        add({ role: 'wolfie', text: res.error });
        setBusy(false);
      }
      // 'followup': the reply arrives as a nudge (handled above)
    } catch {
      add({ role: 'wolfie', text: "Sorry, I couldn't reach my brain just now. Please try again." });
      setBusy(false);
    }
  };

  const handleClose = () => {
    // Closing with a hint or explanation still open ends it, so Wolfie can offer help again later
    const step = openStep();
    if (step?.nudgeId) void window.electronAPI.invoke('nudge-response', { id: step.nudgeId, action: 'dismissed', via: 'button' });
    onClose();
  };

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
          <button className="close-btn" onClick={handleClose}>×</button>
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
          {messages.map((message) => (
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
                {!!message.buttons?.length && !message.answered && (
                  <div className="hint-actions" style={{ padding: '8px 0 0', borderTop: 'none' }}>
                    {message.buttons.map((b) => (
                      <button
                        key={b.action}
                        className={`action-btn ${b.variant === 'primary' ? 'primary' : 'secondary'}`}
                        onClick={() => handleButton(message, b)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

        {/* Input (questions and follow-ups) */}
        <div className="hint-input-container">
          <input
            type="text"
            className="hint-input"
            autoFocus
            placeholder={helpOpen ? 'Ask about this hint...' : voiceMode ? 'Speak or type your question...' : 'Ask me anything...'}
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
