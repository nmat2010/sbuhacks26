import { useState } from 'react';
import Welcome from './Welcome';
import Connect from './Connect';
import Brightspace from './Brightspace';
import Permissions from './Permissions';
import Goals from './Goals';
import Distractions from './Distractions';
import Done from './Done';

interface OnboardingData {
  extensionConnected: boolean;
  brightspaceConnected: boolean;
  semester: string | null;
  courses: any[];
  overlayEnabled: boolean;
  screenRecordingEnabled: boolean;
  voiceEnabled: boolean;
  mainGoal: string | null;
  shields: any[];
}

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
}

const STEPS = [
  'welcome',
  'connect',
  'brightspace',
  'permissions',
  'goals',
  'distractions',
  'done'
] as const;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    extensionConnected: false,
    brightspaceConnected: false,
    semester: null,
    courses: [],
    overlayEnabled: true,
    screenRecordingEnabled: false,
    voiceEnabled: false,
    mainGoal: null,
    shields: []
  });

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - complete onboarding
      onComplete(data);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateData = (updates: Partial<OnboardingData>) => {
    setData({ ...data, ...updates });
  };

  // Render current step
  const renderStep = () => {
    const stepName = STEPS[currentStep];

    switch (stepName) {
      case 'welcome':
        return <Welcome onNext={handleNext} />;
      case 'connect':
        return <Connect onNext={handleNext} onBack={handleBack} data={data} updateData={updateData} />;
      case 'brightspace':
        return <Brightspace onNext={handleNext} onBack={handleBack} data={data} updateData={updateData} />;
      case 'permissions':
        return <Permissions onNext={handleNext} onBack={handleBack} data={data} updateData={updateData} />;
      case 'goals':
        return <Goals onNext={handleNext} onBack={handleBack} data={data} updateData={updateData} />;
      case 'distractions':
        return <Distractions onNext={handleNext} onBack={handleBack} data={data} updateData={updateData} />;
      case 'done':
        return <Done onNext={handleNext} onBack={handleBack} data={data} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'auto' }}>
      {renderStep()}
    </div>
  );
}
