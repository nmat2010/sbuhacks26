import { useState } from 'react';
import './HintConversation.css';

export type HintLevel = 1 | 2 | 3 | 4 | 5;

export interface HintMessage {
  level: HintLevel;
  text: string;
  timestamp: Date;
}

export interface ConversationMessage {
  role: 'user' | 'wolfie';
  text: string;
  timestamp: Date;
  hintLevel?: HintLevel;
}

interface HintConversationProps {
  onClose: () => void;
  onRequestHint: (level: HintLevel) => void;
  onDismiss: (action: 'got-it' | 'not-needed' | 'show-answer') => void;
  assessmentMode?: boolean;
  voiceMode?: boolean;
  contextPreview?: {
    type: 'page' | 'screen' | 'handwriting' | 'camera';
    description: string;
  };
}

const HINT_LEVEL_NAMES: Record<HintLevel, string> = {
  1: 'Nudge',
  2: 'Hint',
  3: 'Explanation',
  4: 'Example',
  5: 'Next Step'
};

export function HintConversation({
  onClose,
  onRequestHint,
  onDismiss,
  assessmentMode = false,
  voiceMode = false,
  contextPreview
}: HintConversationProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      role: 'wolfie',
      text: "I see you might be stuck. I'm here to help! What would you like?",
      timestamp: new Date()
    }
  ]);
  const [currentLevel, setCurrentLevel] = useState<HintLevel>(0 as HintLevel);
  const [userInput, setUserInput] = useState('');

  const handleRequestNextHint = () => {
    const nextLevel = Math.min((currentLevel + 1), 5) as HintLevel;
    setCurrentLevel(nextLevel);
    onRequestHint(nextLevel);

    // Add user message
    setMessages(prev => [...prev, {
      role: 'user',
      text: 'Give me another hint',
      timestamp: new Date()
    }]);

    // Simulate Wolfie response (will be replaced with actual API call)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'wolfie',
        text: getMockHintForLevel(nextLevel),
        timestamp: new Date(),
        hintLevel: nextLevel
      }]);
    }, 500);
  };

  const handleGotIt = () => {
    setMessages(prev => [...prev, {
      role: 'user',
      text: "I got it, thanks!",
      timestamp: new Date()
    }]);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'wolfie',
        text: "Great work! I'm always here if you need me. 🐺",
        timestamp: new Date()
      }]);
    }, 300);

    setTimeout(() => {
      onDismiss('got-it');
    }, 1500);
  };

  const handleNotNeeded = () => {
    onDismiss('not-needed');
  };

  const handleShowAnswer = () => {
    setMessages(prev => [...prev, {
      role: 'user',
      text: "Show me the answer",
      timestamp: new Date()
    }]);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'wolfie',
        text: "Here's a complete walkthrough of the solution...",
        timestamp: new Date()
      }]);
    }, 500);

    setTimeout(() => {
      onDismiss('show-answer');
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!userInput.trim()) return;

    setMessages(prev => [...prev, {
      role: 'user',
      text: userInput,
      timestamp: new Date()
    }]);

    setUserInput('');

    // Simulate Wolfie response (will be replaced with actual API call)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'wolfie',
        text: "I understand. Let me help clarify that for you...",
        timestamp: new Date()
      }]);
    }, 500);
  };

  const getMockHintForLevel = (level: HintLevel): string => {
    const hints = {
      1: "Have you tried reviewing the problem statement carefully? Sometimes the answer is in the details.",
      2: "Think about what data structure would be most efficient here. What are the time complexity requirements?",
      3: "A linked list allows O(1) insertion and deletion at known positions. The key is maintaining proper pointers between nodes.",
      4: "Here's a similar problem: if you were organizing a queue of people, how would you handle someone joining in the middle? You'd need to update the connections.",
      5: "Start by creating a Node class with data and next pointers. Then implement an insert method that updates the previous node's next pointer and sets the new node's next to the following node."
    };
    return hints[level] || "Let me help you with that...";
  };

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
                {assessmentMode && <span className="assessment-badge">Assessment Mode</span>}
                {voiceMode && <span className="voice-badge">🎤 Voice Active</span>}
              </p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Context Preview */}
        {contextPreview && (
          <div className="context-preview">
            <div className="context-header">
              <span className="context-icon">
                {contextPreview.type === 'page' && '📄'}
                {contextPreview.type === 'screen' && '🖥️'}
                {contextPreview.type === 'handwriting' && '✍️'}
                {contextPreview.type === 'camera' && '📷'}
              </span>
              <span className="context-label">What I see:</span>
            </div>
            <p className="context-description">{contextPreview.description}</p>
          </div>
        )}

        {/* Messages */}
        <div className="hint-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.role === 'user' ? 'message-user' : 'message-wolfie'}`}
            >
              {message.role === 'wolfie' && (
                <div className="message-avatar">🐺</div>
              )}
              <div className="message-content">
                {message.hintLevel && (
                  <div className="hint-level-badge">
                    Level {message.hintLevel}: {HINT_LEVEL_NAMES[message.hintLevel]}
                  </div>
                )}
                <p className="message-text">{message.text}</p>
                <span className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="hint-actions">
          {currentLevel > 0 && currentLevel < 5 && (
            <button className="action-btn primary" onClick={handleRequestNextHint}>
              Another Hint ({currentLevel + 1}/5)
            </button>
          )}

          <button className="action-btn success" onClick={handleGotIt}>
            I Got It!
          </button>

          <button className="action-btn secondary" onClick={handleNotNeeded}>
            I'm Good
          </button>

          {!assessmentMode && (
            <button className="action-btn warning" onClick={handleShowAnswer}>
              Show Answer
            </button>
          )}
        </div>

        {/* Input (for follow-up questions) */}
        <div className="hint-input-container">
          <input
            type="text"
            className="hint-input"
            placeholder={voiceMode ? "Speak or type your question..." : "Ask a follow-up question..."}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="send-btn" onClick={handleSendMessage}>
            Send
          </button>
        </div>

        {/* Hint Progress */}
        {currentLevel > 0 && (
          <div className="hint-progress">
            <div className="progress-label">Hint Progress</div>
            <div className="progress-track">
              {[1, 2, 3, 4, 5].map(level => (
                <div
                  key={level}
                  className={`progress-step ${level <= currentLevel ? 'active' : ''}`}
                  title={HINT_LEVEL_NAMES[level as HintLevel]}
                >
                  {level}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
