import { useState } from 'react';
import './Onboarding.css';

interface Course {
  name: string;
  credits: number;
  importantDates: string;
}

interface Goal {
  title: string;
  type: 'research' | 'job' | 'project' | 'course' | 'other';
  targetDate: string;
}

interface OnboardingData {
  semester: string;
  semesterStart: string;
  semesterEnd: string;
  weeklyHours: number;
  courses: Course[];
  goals: Goal[];
}

const SEMESTERS = [
  { value: 'fall-2024', label: 'Fall 2024', start: '2024-08-26', end: '2024-12-20' },
  { value: 'winter-2025', label: 'Winter 2025', start: '2025-01-06', end: '2025-01-24' },
  { value: 'spring-2025', label: 'Spring 2025', start: '2025-01-27', end: '2025-05-16' },
  { value: 'summer-2025', label: 'Summer 2025', start: '2025-05-27', end: '2025-08-15' },
  { value: 'fall-2025', label: 'Fall 2025', start: '2025-08-25', end: '2025-12-19' },
  { value: 'winter-2026', label: 'Winter 2026', start: '2026-01-05', end: '2026-01-23' },
  { value: 'spring-2026', label: 'Spring 2026', start: '2026-01-26', end: '2026-05-15' },
  { value: 'summer-2026', label: 'Summer 2026', start: '2026-05-26', end: '2026-08-14' },
  { value: 'fall-2026', label: 'Fall 2026', start: '2026-08-24', end: '2026-12-18' },
  { value: 'winter-2027', label: 'Winter 2027', start: '2027-01-04', end: '2027-01-22' },
  { value: 'spring-2027', label: 'Spring 2027', start: '2027-01-25', end: '2027-05-14' },
];

interface OnboardingProps {
  onComplete: (data: OnboardingData) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    semester: '',
    semesterStart: '',
    semesterEnd: '',
    weeklyHours: 20,
    courses: [],
    goals: []
  });

  const handleSemesterChange = (semesterValue: string) => {
    const selected = SEMESTERS.find(s => s.value === semesterValue);
    if (selected) {
      setData({
        ...data,
        semester: semesterValue,
        semesterStart: selected.start,
        semesterEnd: selected.end
      });
    }
  };

  const [currentCourse, setCurrentCourse] = useState<Course>({
    name: '',
    credits: 3,
    importantDates: ''
  });

  const [currentGoal, setCurrentGoal] = useState<Goal>({
    title: '',
    type: 'course',
    targetDate: ''
  });

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const addCourse = () => {
    if (currentCourse.name) {
      setData({ ...data, courses: [...data.courses, currentCourse] });
      setCurrentCourse({ name: '', credits: 3, importantDates: '' });
    }
  };

  const removeCourse = (index: number) => {
    setData({ ...data, courses: data.courses.filter((_, i) => i !== index) });
  };

  const addGoal = () => {
    if (currentGoal.title) {
      setData({ ...data, goals: [...data.goals, currentGoal] });
      setCurrentGoal({ title: '', type: 'course', targetDate: '' });
    }
  };

  const removeGoal = (index: number) => {
    setData({ ...data, goals: data.goals.filter((_, i) => i !== index) });
  };

  const handleComplete = () => {
    onComplete(data);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="onboarding-step">
            <div className="welcome-icon">🐺</div>
            <h1 className="onboarding-title">Welcome to Wolfie Sensei!</h1>
            <p className="onboarding-text">
              Your AI study companion is here to help you succeed this semester.
              Let's get you set up in just a few steps.
            </p>
            <ul className="feature-list">
              <li>📚 Track your study sessions</li>
              <li>💡 Get hints when you're stuck</li>
              <li>🎯 Stay focused with gentle nudges</li>
              <li>🔥 Build your study streak</li>
            </ul>
            <button className="btn btn-primary btn-large" onClick={nextStep}>
              Get Started
            </button>
          </div>
        );

      case 1:
        return (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Semester Information</h2>
            <p className="onboarding-text">Which semester are you in?</p>

            <div className="form-group">
              <label>Select Semester</label>
              <select
                className="form-input"
                value={data.semester}
                onChange={(e) => handleSemesterChange(e.target.value)}
              >
                <option value="">Choose a semester...</option>
                {SEMESTERS.map(semester => (
                  <option key={semester.value} value={semester.value}>
                    {semester.label}
                  </option>
                ))}
              </select>
              {data.semester && (
                <p className="form-hint">
                  {new Date(data.semesterStart).toLocaleDateString()} - {new Date(data.semesterEnd).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Weekly Study Hours Available</label>
              <input
                type="number"
                className="form-input"
                value={data.weeklyHours}
                onChange={(e) => setData({ ...data, weeklyHours: parseInt(e.target.value) || 0 })}
                min="1"
                max="168"
              />
              <p className="form-hint">How many hours per week can you dedicate to studying?</p>
            </div>

            <div className="button-group">
              <button className="btn btn-secondary" onClick={prevStep}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={nextStep}
                disabled={!data.semester}
              >
                Continue
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Your Courses</h2>
            <p className="onboarding-text">Import from Brightspace or add manually</p>

            {/* Brightspace Import Option */}
            <div className="import-section">
              <div className="import-card">
                <div className="import-icon">🎓</div>
                <div>
                  <h3 className="import-title">Import from Brightspace</h3>
                  <p className="import-description">
                    Automatically sync your courses and assignments
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    // TODO: Implement Brightspace OAuth integration
                    alert('Brightspace integration coming soon! For now, please add courses manually.');
                  }}
                >
                  Connect Brightspace
                </button>
              </div>
            </div>

            <div className="divider">
              <span>or add manually</span>
            </div>

            <div className="form-group">
              <label>Course Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Data Structures & Algorithms"
                value={currentCourse.name}
                onChange={(e) => setCurrentCourse({ ...currentCourse, name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Credits</label>
                <input
                  type="number"
                  className="form-input"
                  value={currentCourse.credits}
                  onChange={(e) => setCurrentCourse({ ...currentCourse, credits: parseInt(e.target.value) || 0 })}
                  min="1"
                  max="6"
                />
              </div>

              <div className="form-group">
                <label>Important Dates (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Midterm: Oct 15, Final: Dec 10"
                  value={currentCourse.importantDates}
                  onChange={(e) => setCurrentCourse({ ...currentCourse, importantDates: e.target.value })}
                />
              </div>
            </div>

            <button className="btn btn-secondary" onClick={addCourse}>
              + Add Course
            </button>

            {data.courses.length > 0 && (
              <div className="item-list">
                <h3>Added Courses ({data.courses.length})</h3>
                {data.courses.map((course, index) => (
                  <div key={index} className="item-card">
                    <div>
                      <strong>{course.name}</strong>
                      <span className="item-meta"> • {course.credits} credits</span>
                      {course.importantDates && (
                        <p className="item-detail">{course.importantDates}</p>
                      )}
                    </div>
                    <button
                      className="btn-remove"
                      onClick={() => removeCourse(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="button-group">
              <button className="btn btn-secondary" onClick={prevStep}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={nextStep}
                disabled={data.courses.length === 0}
              >
                Continue
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Your Goals</h2>
            <p className="onboarding-text">What do you want to achieve this semester?</p>

            <div className="form-group">
              <label>Goal</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Get into a research lab"
                value={currentGoal.title}
                onChange={(e) => setCurrentGoal({ ...currentGoal, title: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select
                  className="form-input"
                  value={currentGoal.type}
                  onChange={(e) => setCurrentGoal({ ...currentGoal, type: e.target.value as Goal['type'] })}
                >
                  <option value="course">Course</option>
                  <option value="research">Research</option>
                  <option value="job">Job/Internship</option>
                  <option value="project">Project</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={currentGoal.targetDate}
                  onChange={(e) => setCurrentGoal({ ...currentGoal, targetDate: e.target.value })}
                />
              </div>
            </div>

            <button className="btn btn-secondary" onClick={addGoal}>
              + Add Goal
            </button>

            {data.goals.length > 0 && (
              <div className="item-list">
                <h3>Added Goals ({data.goals.length})</h3>
                {data.goals.map((goal, index) => (
                  <div key={index} className="item-card">
                    <div>
                      <strong>{goal.title}</strong>
                      <span className="item-meta"> • {goal.type}</span>
                      <p className="item-detail">Target: {new Date(goal.targetDate).toLocaleDateString()}</p>
                    </div>
                    <button
                      className="btn-remove"
                      onClick={() => removeGoal(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="button-group">
              <button className="btn btn-secondary" onClick={prevStep}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={nextStep}
                disabled={data.goals.length === 0}
              >
                Continue
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="onboarding-step">
            <div className="success-icon">✅</div>
            <h2 className="onboarding-title">All Set!</h2>
            <p className="onboarding-text">
              Wolfie is ready to help you succeed this semester.
            </p>

            <div className="summary-card">
              <h3>Your Setup</h3>
              <div className="summary-row">
                <span>Semester:</span>
                <span>{SEMESTERS.find(s => s.value === data.semester)?.label}</span>
              </div>
              <div className="summary-row">
                <span>Weekly Hours:</span>
                <span>{data.weeklyHours} hours</span>
              </div>
              <div className="summary-row">
                <span>Courses:</span>
                <span>{data.courses.length}</span>
              </div>
              <div className="summary-row">
                <span>Goals:</span>
                <span>{data.goals.length}</span>
              </div>
            </div>

            <div className="button-group">
              <button className="btn btn-secondary" onClick={prevStep}>
                Back
              </button>
              <button className="btn btn-primary btn-large" onClick={handleComplete}>
                Start Using Wolfie Sensei
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        {/* Progress indicator */}
        {step > 0 && step < 4 && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        )}

        {renderStep()}
      </div>
    </div>
  );
}
