import { useState, useEffect } from 'react';
import './WolfieWidget.css';

type HintResponse = {
  what_i_see: string;
  hint_levels: {
    nudge: string;
    hint: string;
    explanation: string;
    analogous_example: string;
    direct_step: string;
  };
  offline: boolean;
} | null;

interface WolfieWidgetProps {
  onAsk: (question: string) => void;
  lastResponse: HintResponse;
  onClose: () => void;
}

export function WolfieWidget({ onAsk, lastResponse, onClose }: WolfieWidgetProps) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (lastResponse) {
      setAsking(false);
    }
  }, [lastResponse]);

  const handleAsk = () => {
    if (!question.trim()) return;

    setAsking(true);
    onAsk(question);
  };

  return (
    <div className="wolfie-widget">
      <div className="widget-header">
        <div className="widget-avatar">🐺</div>
        <div className="widget-title">Ask Wolfie</div>
        <button className="widget-close" onClick={onClose}>✕</button>
      </div>

      <div className="widget-body">
        {lastResponse && (
          <div className="hint-response">
            <div className="hint-level">Hint Response</div>
            <p className="hint-text">{lastResponse.hint_levels.hint || lastResponse.what_i_see}</p>
          </div>
        )}

        {asking && !lastResponse && (
          <div className="thinking">
            <div className="spinner"></div>
            <p>Wolfie is thinking...</p>
          </div>
        )}
      </div>

      <div className="widget-input">
        <input
          type="text"
          placeholder="Ask Wolfie for help..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
          disabled={asking}
          className="question-input"
        />
        <button
          className="ask-btn"
          onClick={handleAsk}
          disabled={asking || !question.trim()}
        >
          {asking ? '...' : '🐺 Ask'}
        </button>
      </div>
    </div>
  );
}
