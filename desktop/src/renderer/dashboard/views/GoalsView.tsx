import { useState, useEffect } from 'react';
import type { PlanView, PlanGoalView, PlanItemView, PlanItemStatus, GoalType } from '../../../common/ipc-intelligence';
import './GoalsView.css';

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  research: '🔬 Research',
  job: '💼 Job',
  project: '🚀 Project',
  course: '📚 Course',
  other: '📌 Other'
};

const STATUS_LABELS: Record<PlanItemStatus, { label: string; color: string }> = {
  pending: { label: 'To Do', color: '#6e6e73' },
  in_progress: { label: 'In Progress', color: '#ff9500' },
  completed: { label: 'Done', color: '#34c759' }
};

export function GoalsView() {
  const [planView, setPlanView] = useState<PlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [newItemGoalId, setNewItemGoalId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDueDate, setNewItemDueDate] = useState('');

  useEffect(() => {
    loadPlan();
  }, []);

  const loadPlan = async () => {
    setLoading(true);
    try {
      const plan = await window.electronAPI.invoke('plan-get');
      setPlanView(plan);
      if (plan.goals.length > 0 && !selectedGoal) {
        setSelectedGoal(plan.goals[0].id);
      }
    } catch (error) {
      console.error('Failed to load plan:', error);
      // Set empty plan for UI development when backend not available
      setPlanView({ goals: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async (goalId?: string) => {
    setGenerating(true);
    try {
      const result = await window.electronAPI.invoke('plan-generate', goalId ? { goalId } : undefined);
      if (result.success && result.data) {
        setPlanView(result.data);
      } else {
        alert(result.error || 'Failed to generate plan');
      }
    } catch (error) {
      console.error('Failed to generate plan:', error);
      alert('Failed to generate plan');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateItemStatus = async (itemId: string, status: PlanItemStatus) => {
    try {
      const result = await window.electronAPI.invoke('plan-item-update', itemId, { status });
      if (result.success) {
        await loadPlan();
      } else {
        alert(result.error || 'Failed to update item');
      }
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this plan item?')) return;

    try {
      const result = await window.electronAPI.invoke('plan-item-delete', itemId);
      if (result.success) {
        await loadPlan();
      } else {
        alert(result.error || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  const handleRegenerateItem = async (itemId: string) => {
    try {
      const result = await window.electronAPI.invoke('plan-item-regenerate', itemId);
      if (result.success) {
        await loadPlan();
      } else {
        alert(result.error || 'Failed to regenerate item');
      }
    } catch (error) {
      console.error('Failed to regenerate item:', error);
    }
  };

  const handleAddItem = async () => {
    if (!newItemGoalId || !newItemTitle.trim()) return;

    try {
      const result = await window.electronAPI.invoke('plan-item-add', newItemGoalId, {
        title: newItemTitle,
        dueDate: newItemDueDate || undefined
      });
      if (result.success) {
        setNewItemTitle('');
        setNewItemDueDate('');
        setNewItemGoalId(null);
        await loadPlan();
      } else {
        alert(result.error || 'Failed to add item');
      }
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  };

  const renderPlanItem = (item: PlanItemView) => {
    const status = STATUS_LABELS[item.status];
    const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'completed';

    return (
      <div key={item.id} className={`plan-item ${item.status}`}>
        <div className="plan-item-header">
          <div className="plan-item-checkbox">
            <input
              type="checkbox"
              checked={item.status === 'completed'}
              onChange={(e) => {
                handleUpdateItemStatus(item.id, e.target.checked ? 'completed' : 'pending');
              }}
            />
          </div>
          <div className="plan-item-content">
            <div className="plan-item-title">{item.title}</div>
            {item.notes && <div className="plan-item-notes">{item.notes}</div>}
            <div className="plan-item-meta">
              <span className="plan-item-status" style={{ color: status.color }}>
                {status.label}
              </span>
              {item.dueDate && (
                <span className={`plan-item-due ${isOverdue ? 'overdue' : ''}`}>
                  Due: {new Date(item.dueDate).toLocaleDateString()}
                </span>
              )}
              {item.estimatedHours && (
                <span className="plan-item-hours">{item.estimatedHours}h</span>
              )}
              <span className="plan-item-source">{item.source}</span>
            </div>
          </div>
        </div>
        <div className="plan-item-actions">
          <button
            className="action-icon-btn"
            onClick={() => handleRegenerateItem(item.id)}
            title="Regenerate with AI"
          >
            🔄
          </button>
          <button
            className="action-icon-btn"
            onClick={() => handleDeleteItem(item.id)}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const renderGoal = (goal: PlanGoalView) => {
    const isSelected = selectedGoal === goal.id;
    const completedCount = goal.items.filter(i => i.status === 'completed').length;
    const totalCount = goal.items.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
      <div key={goal.id} className={`goal-card ${isSelected ? 'selected' : ''}`}>
        <div className="goal-header" onClick={() => setSelectedGoal(isSelected ? null : goal.id)}>
          <div className="goal-header-left">
            <span className="goal-type">{GOAL_TYPE_LABELS[goal.type]}</span>
            <h3 className="goal-title">{goal.title}</h3>
          </div>
          <div className="goal-header-right">
            <div className="goal-progress">
              <span className="goal-progress-text">{completedCount}/{totalCount}</span>
              <div className="goal-progress-bar">
                <div className="goal-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button className="expand-btn">{isSelected ? '▼' : '▶'}</button>
          </div>
        </div>

        {isSelected && (
          <div className="goal-content">
            {goal.rationale && (
              <div className="goal-rationale">
                <strong>Why:</strong> {goal.rationale}
              </div>
            )}

            {goal.targetDate && (
              <div className="goal-target-date">
                <strong>Target:</strong> {new Date(goal.targetDate).toLocaleDateString()}
              </div>
            )}

            {/* Milestones */}
            {goal.milestones.length > 0 && (
              <div className="milestones-section">
                <h4>Milestones</h4>
                <div className="milestones-timeline">
                  {goal.milestones.map(milestone => (
                    <div key={milestone.id} className="milestone">
                      <div className="milestone-marker"></div>
                      <div className="milestone-content">
                        <div className="milestone-title">{milestone.title}</div>
                        <div className="milestone-date">
                          Week of {new Date(milestone.weekStart).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plan Items */}
            <div className="plan-items-section">
              <div className="plan-items-header">
                <h4>Tasks</h4>
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => setNewItemGoalId(newItemGoalId === goal.id ? null : goal.id)}
                >
                  + Add Task
                </button>
              </div>

              {newItemGoalId === goal.id && (
                <div className="add-item-form">
                  <input
                    type="text"
                    placeholder="Task title..."
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    className="form-input"
                  />
                  <input
                    type="date"
                    value={newItemDueDate}
                    onChange={(e) => setNewItemDueDate(e.target.value)}
                    className="form-input"
                  />
                  <div className="add-item-actions">
                    <button className="btn btn-primary btn-small" onClick={handleAddItem}>
                      Add
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        setNewItemGoalId(null);
                        setNewItemTitle('');
                        setNewItemDueDate('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="plan-items-list">
                {goal.items.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No tasks yet. Add one or generate a plan.</p>
                  </div>
                ) : (
                  goal.items.map(renderPlanItem)
                )}
              </div>
            </div>

            <div className="goal-actions">
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handleGeneratePlan(goal.id)}
                disabled={generating}
              >
                {generating ? 'Regenerating...' : '🔄 Regenerate Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="view-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container goals-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Goals & Plan</h1>
          <p className="view-subtitle">AI-generated study plan based on your goals</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => handleGeneratePlan()}
          disabled={generating || !planView || planView.goals.length === 0}
        >
          {generating ? (
            <>
              <span className="spinner-small"></span>
              Generating Plan...
            </>
          ) : (
            '✨ Generate Plan'
          )}
        </button>
      </div>

      {!planView || planView.goals.length === 0 ? (
        <div className="card">
          <div className="card-content">
            <div className="empty-state">
              <div className="empty-state-icon">🎯</div>
              <h3 className="empty-state-title">No goals yet</h3>
              <p className="empty-state-text">
                Complete the onboarding wizard to set up your goals and generate a plan
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="goals-list">
          {planView.goals.map(renderGoal)}
        </div>
      )}

      {generating && (
        <div className="generating-overlay">
          <div className="generating-modal">
            <div className="spinner"></div>
            <h3>Generating your plan...</h3>
            <p>Wolfie is analyzing your goals and creating a personalized study plan</p>
          </div>
        </div>
      )}
    </div>
  );
}
