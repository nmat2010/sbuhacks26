import { useState, useEffect, useRef } from 'react';
import type {
  PaperView,
  PaperSection,
  PaperQuestionView,
  ReadingMode,
  PaperAnswer,
  PaperCitation
} from '../../../common/ipc-intelligence';
import './PaperReading.css';

interface PaperReadingProps {
  paperId: string;
  onClose: () => void;
}

const MODE_INFO: Record<ReadingMode, { label: string; icon: string; prompt: string }> = {
  explain: {
    label: 'Explain Simply',
    icon: '💡',
    prompt: 'Ask Wolfie to explain a concept in simple terms'
  },
  check: {
    label: 'Check Understanding',
    icon: '✅',
    prompt: 'Ask a question to check your understanding'
  },
  where: {
    label: 'Show Me Where',
    icon: '🔍',
    prompt: 'Ask where something is mentioned in the paper'
  }
};

export function PaperReading({ paperId, onClose }: PaperReadingProps) {
  const [paper, setPaper] = useState<PaperView | null>(null);
  const [sections, setSections] = useState<PaperSection[]>([]);
  const [questions, setQuestions] = useState<PaperQuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReadingMode>('explain');
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [selectedSection, setSelectedSection] = useState<number>(0);
  const [highlightedCitation, setHighlightedCitation] = useState<PaperCitation | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPaper();
    // Set paper focus for voice mode
    window.electronAPI.invoke('paper-focus', paperId);

    return () => {
      // Clear focus when leaving
      window.electronAPI.invoke('paper-focus', null);
    };
  }, [paperId]);

  useEffect(() => {
    // Listen for voice-answered questions
    const handlePaperAnswer = (answer: PaperAnswer) => {
      if (answer.paperId === paperId) {
        loadQuestions();
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    window.electronAPI.on('paper-answer', handlePaperAnswer);
    return () => {
      window.electronAPI.off('paper-answer', handlePaperAnswer);
    };
  }, [paperId]);

  const loadPaper = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.invoke('paper-content', paperId);
      if (result.success && result.data) {
        setPaper(result.data.paper);
        setSections(result.data.sections);
      } else {
        alert(result.error || 'Failed to load paper');
        onClose();
      }
      await loadQuestions();
    } catch (error) {
      console.error('Failed to load paper:', error);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    try {
      const questionList = await window.electronAPI.invoke('paper-questions', paperId);
      setQuestions(questionList);
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim()) return;

    setAsking(true);
    try {
      const result = await window.electronAPI.invoke('paper-ask', {
        paperId,
        question: questionInput,
        mode,
        inputMode: 'text'
      });

      if (result.success && result.data) {
        setQuestionInput('');
        await loadQuestions();
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        alert(result.error || 'Failed to get answer');
      }
    } catch (error) {
      console.error('Failed to ask question:', error);
      alert('Failed to get answer');
    } finally {
      setAsking(false);
    }
  };

  const handleCitationClick = (citation: PaperCitation) => {
    setHighlightedCitation(citation);
    // Try to scroll to the section
    const sectionIndex = sections.findIndex(s => s.title === citation.section);
    if (sectionIndex >= 0) {
      setSelectedSection(sectionIndex);
      // Scroll to snippet in content
      setTimeout(() => {
        const contentEl = contentRef.current;
        if (contentEl) {
          const textNodes = getTextNodes(contentEl);
          for (const node of textNodes) {
            if (node.textContent?.includes(citation.snippet)) {
              const range = document.createRange();
              range.selectNodeContents(node);
              const rect = range.getBoundingClientRect();
              contentEl.scrollTo({
                top: rect.top - contentEl.getBoundingClientRect().top + contentEl.scrollTop - 100,
                behavior: 'smooth'
              });
              break;
            }
          }
        }
      }, 100);
    }
  };

  const getTextNodes = (element: HTMLElement): Text[] => {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }
    return textNodes;
  };

  const renderQuestion = (q: PaperQuestionView) => {
    const modeInfo = MODE_INFO[q.mode];
    const timestamp = new Date(q.ts).toLocaleTimeString();

    return (
      <div key={q.id} className="qa-pair">
        {/* User Question */}
        <div className="message message-user">
          <div className="message-avatar">👤</div>
          <div className="message-content">
            <div className="message-mode">{modeInfo.icon} {modeInfo.label}</div>
            <p className="message-text">{q.question}</p>
            <span className="message-time">{timestamp}</span>
          </div>
        </div>

        {/* Wolfie Answer */}
        <div className="message message-wolfie">
          <div className="message-avatar">🐺</div>
          <div className="message-content">
            <div className="answer-label" style={{ color: q.grounded ? '#34c759' : '#6e6e73' }}>
              {q.grounded ? '📄 From the paper' : '💭 General knowledge'}
            </div>
            <p className="message-text">{q.answer}</p>
            {q.citations.length > 0 && (
              <div className="citations">
                <div className="citations-header">Citations:</div>
                {q.citations.map((citation, idx) => (
                  <div
                    key={idx}
                    className="citation"
                    onClick={() => handleCitationClick(citation)}
                  >
                    <div className="citation-header">
                      <span className="citation-section">{citation.section}</span>
                      {citation.page && <span className="citation-page">p. {citation.page}</span>}
                    </div>
                    <div className="citation-snippet">"{citation.snippet}..."</div>
                  </div>
                ))}
              </div>
            )}
            <span className="message-time">{timestamp}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="paper-reading">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading paper...</p>
        </div>
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="paper-reading">
      {/* Header */}
      <div className="paper-reading-header">
        <button className="back-btn" onClick={onClose}>
          ← Back to Papers
        </button>
        <div className="paper-info">
          <h2 className="paper-reading-title">{paper.title}</h2>
          {paper.authors.length > 0 && (
            <p className="paper-reading-authors">{paper.authors.join(', ')}</p>
          )}
        </div>
      </div>

      {/* Split View */}
      <div className="paper-split">
        {/* Left: Paper Content */}
        <div className="paper-content-panel">
          {/* Sections Navigation */}
          <div className="sections-nav">
            {sections.map((section, idx) => (
              <button
                key={idx}
                className={`section-nav-btn ${idx === selectedSection ? 'active' : ''}`}
                onClick={() => setSelectedSection(idx)}
              >
                {section.title}
                {section.page && <span className="section-page">p. {section.page}</span>}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="paper-content" ref={contentRef}>
            {sections[selectedSection] && (
              <div className="section-content">
                <h3 className="section-title">{sections[selectedSection].title}</h3>
                {sections[selectedSection].page && (
                  <div className="section-page-num">Page {sections[selectedSection].page}</div>
                )}
                <div className="section-text">
                  {sections[selectedSection].text.split('\n\n').map((para, idx) => (
                    <p
                      key={idx}
                      className={
                        highlightedCitation &&
                        para.includes(highlightedCitation.snippet)
                          ? 'highlighted-paragraph'
                          : ''
                      }
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Chat with Wolfie */}
        <div className="paper-chat-panel">
          <div className="chat-header">
            <div className="chat-header-title">
              <span className="wolfie-avatar">🐺</span>
              Ask Wolfie
            </div>
            <div className="chat-modes">
              {(Object.keys(MODE_INFO) as ReadingMode[]).map(m => (
                <button
                  key={m}
                  className={`mode-btn ${mode === m ? 'active' : ''}`}
                  onClick={() => setMode(m)}
                  title={MODE_INFO[m].prompt}
                >
                  {MODE_INFO[m].icon}
                  <span className="mode-label">{MODE_INFO[m].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chat-messages">
            {questions.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">💬</div>
                <h3>Ask Wolfie about this paper</h3>
                <p>Choose a mode above and ask questions. Wolfie will answer based on the paper content.</p>
              </div>
            ) : (
              <>
                {questions.map(renderQuestion)}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          <div className="chat-input">
            <input
              type="text"
              placeholder={MODE_INFO[mode].prompt}
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !asking && handleAskQuestion()}
              disabled={asking}
              className="question-input"
            />
            <button
              className="ask-btn"
              onClick={handleAskQuestion}
              disabled={asking || !questionInput.trim()}
            >
              {asking ? (
                <>
                  <span className="spinner-small"></span>
                  Asking...
                </>
              ) : (
                <>
                  {MODE_INFO[mode].icon} Ask
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
