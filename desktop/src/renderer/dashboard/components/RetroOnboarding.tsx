import { useState } from 'react';
import { WelcomeScreen } from './onboarding/WelcomeScreen';
import { ExtensionScreen } from './onboarding/ExtensionScreen';
import { BrightspaceScreen } from './onboarding/BrightspaceScreen';
import { PowersScreen } from './onboarding/PowersScreen';
import { GoalScreen } from './onboarding/GoalScreen';
import { ShieldsScreen } from './onboarding/ShieldsScreen';
import { CompleteScreen } from './onboarding/CompleteScreen';

export type OnboardingStep =
  | 'welcome'
  | 'extension'
  | 'brightspace'
  | 'powers'
  | 'goal'
  | 'shields'
  | 'complete';

interface OnboardingData {
  extensionConnected: boolean;
  brightspaceConnected: boolean;
  semester: string | null;
  courses: any[];
  assignments: number;
  overlayEnabled: boolean;
  screenRecordingEnabled: boolean;
  voiceEnabled: boolean;
  mainGoal: string | null;
  questLine: any[];
  shields: any[];
}

interface RetroOnboardingProps {
  onComplete: (data: OnboardingData) => void;
}

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: 'welcome', label: 'Hello' },
  { id: 'extension', label: 'Extension' },
  { id: 'brightspace', label: 'Brightspace' },
  { id: 'powers', label: 'Powers' },
  { id: 'goal', label: 'Goals' },
  { id: 'shields', label: 'Shields' },
  { id: 'complete', label: 'Train!' },
];

export function RetroOnboarding({ onComplete }: RetroOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [data, setData] = useState<OnboardingData>({
    extensionConnected: false,
    brightspaceConnected: false,
    semester: null,
    courses: [],
    assignments: 0,
    overlayEnabled: false,
    screenRecordingEnabled: false,
    voiceEnabled: false,
    mainGoal: null,
    questLine: [],
    shields: [],
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
  const completedSteps = STEPS.slice(0, currentStepIndex);

  const handleNext = (stepData?: Partial<OnboardingData>) => {
    if (stepData) {
      setData(prev => ({ ...prev, ...stepData }));
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleComplete = () => {
    onComplete(data);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeScreen onNext={() => handleNext()} />;
      case 'extension':
        return (
          <ExtensionScreen
            onNext={(extensionData) => handleNext(extensionData)}
            onBack={handleBack}
          />
        );
      case 'brightspace':
        return (
          <BrightspaceScreen
            onNext={(brightspaceData) => handleNext(brightspaceData)}
            onBack={handleBack}
          />
        );
      case 'powers':
        return (
          <PowersScreen
            onNext={(powersData) => handleNext(powersData)}
            onBack={handleBack}
          />
        );
      case 'goal':
        return (
          <GoalScreen
            onNext={(goalData) => handleNext(goalData)}
            onBack={handleBack}
          />
        );
      case 'shields':
        return (
          <ShieldsScreen
            onNext={(shieldsData) => handleNext(shieldsData)}
            onBack={handleBack}
          />
        );
      case 'complete':
        return (
          <CompleteScreen
            data={data}
            onComplete={handleComplete}
            onBack={handleBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {renderStep()}
    </>
  );
}
