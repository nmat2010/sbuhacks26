import { useState, useEffect } from 'react';
import type { PaperView, PaperStatus } from '../../../common/ipc-intelligence';
import { PaperReading } from '../components/PaperReading';
import './PapersView.css';

const STATUS_LABELS: Record<PaperStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'To Read', color: '#6e6e73', icon: '📚' },
  reading: { label: 'Reading', color: '#ff9500', icon: '📖' },
  completed: { label: 'Completed', color: '#34c759', icon: '✅' }
};

export function PapersView() {
  const [papers, setPapers] = useState<PaperView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [arxivInput, setArxivInput] = useState('');
  const [showArxivInput, setShowArxivInput] = useState(false);

  useEffect(() => {
    loadPapers();
  }, []);

  const loadPapers = async () => {
    setLoading(true);
    try {
      const paperList = await window.electronAPI.invoke('papers-list');
      setPapers(paperList);
    } catch (error) {
      console.error('Failed to load papers:', error);
      // Set empty list for UI development when backend not available
      setPapers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImportPDF = async () => {
    setImporting(true);
    try {
      const result = await window.electronAPI.invoke('paper-import-pdf');
      if (result.success && result.data) {
        await loadPapers();
      }
    } catch (error) {
      console.error('Failed to import PDF:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleImportArxiv = async () => {
    if (!arxivInput.trim()) return;

    setImporting(true);
    try {
      const result = await window.electronAPI.invoke('paper-import-arxiv', arxivInput);
      if (result.success) {
        setArxivInput('');
        setShowArxivInput(false);
        await loadPapers();
      } else {
        alert(result.error || 'Failed to import from arXiv');
      }
    } catch (error) {
      console.error('Failed to import from arXiv:', error);
      alert('Failed to import from arXiv');
    } finally {
      setImporting(false);
    }
  };

  const handleUpdateStatus = async (paperId: string, status: PaperStatus) => {
    try {
      const result = await window.electronAPI.invoke('paper-set-status', paperId, status);
      if (result.success) {
        await loadPapers();
      }
    } catch (error) {
      console.error('Failed to update paper status:', error);
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    if (!confirm('Delete this paper?')) return;

    try {
      const result = await window.electronAPI.invoke('paper-delete', paperId);
      if (result.success) {
        await loadPapers();
      } else {
        alert(result.error || 'Failed to delete paper');
      }
    } catch (error) {
      console.error('Failed to delete paper:', error);
    }
  };

  const handleOpenPaper = async (paper: PaperView) => {
    if (!paper.readable) {
      // Try to make it readable first
      try {
        const result = await window.electronAPI.invoke('paper-make-readable', paper.id);
        if (result.success) {
          await loadPapers();
          setSelectedPaper(paper.id);
        } else {
          alert(result.error || 'Cannot read this paper yet');
        }
      } catch (error) {
        console.error('Failed to make paper readable:', error);
      }
    } else {
      setSelectedPaper(paper.id);
    }
  };

  const renderPaper = (paper: PaperView) => {
    const status = STATUS_LABELS[paper.status];
    const addedDate = new Date(paper.addedAt).toLocaleDateString();

    return (
      <div key={paper.id} className="paper-card">
        <div className="paper-header">
          <div className="paper-icon">{status.icon}</div>
          <div className="paper-content">
            <h3 className="paper-title">{paper.title}</h3>
            {paper.authors.length > 0 && (
              <p className="paper-authors">{paper.authors.join(', ')}</p>
            )}
            <div className="paper-meta">
              {paper.year && <span className="paper-year">{paper.year}</span>}
              {paper.arxivId && <span className="paper-arxiv">arXiv:{paper.arxivId}</span>}
              <span className="paper-added">Added {addedDate}</span>
              {paper.questionCount > 0 && (
                <span className="paper-questions">{paper.questionCount} questions</span>
              )}
            </div>
          </div>
          <div className="paper-actions">
            <select
              value={paper.status}
              onChange={(e) => handleUpdateStatus(paper.id, e.target.value as PaperStatus)}
              className="status-select"
              style={{ color: status.color }}
            >
              <option value="pending">To Read</option>
              <option value="reading">Reading</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
        <div className="paper-footer">
          <button
            className="btn btn-primary btn-small"
            onClick={() => handleOpenPaper(paper)}
            disabled={!paper.readable && paper.arxivId === null}
          >
            {!paper.readable ? '📥 Download & Read' : '📖 Read with Wolfie'}
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => handleDeletePaper(paper.id)}
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  if (selectedPaper) {
    return (
      <PaperReading
        paperId={selectedPaper}
        onClose={() => setSelectedPaper(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="view-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading papers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container papers-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Papers</h1>
          <p className="view-subtitle">Track your reading and research</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleImportPDF} disabled={importing}>
            {importing ? 'Importing...' : '📁 Upload PDF'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowArxivInput(!showArxivInput)}
          >
            + Add from arXiv
          </button>
        </div>
      </div>

      {showArxivInput && (
        <div className="arxiv-input-card">
          <h3>Import from arXiv</h3>
          <p>Enter an arXiv URL or ID (e.g., "2301.12345" or "https://arxiv.org/abs/2301.12345")</p>
          <div className="arxiv-input-group">
            <input
              type="text"
              placeholder="arXiv URL or ID..."
              value={arxivInput}
              onChange={(e) => setArxivInput(e.target.value)}
              className="form-input"
              onKeyPress={(e) => e.key === 'Enter' && handleImportArxiv()}
            />
            <button className="btn btn-primary" onClick={handleImportArxiv} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowArxivInput(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {papers.length === 0 ? (
        <div className="card">
          <div className="card-content">
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <h3 className="empty-state-title">No papers added</h3>
              <p className="empty-state-text">Add papers by PDF upload or arXiv URL</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="papers-grid">
          {papers.map(renderPaper)}
        </div>
      )}
    </div>
  );
}
