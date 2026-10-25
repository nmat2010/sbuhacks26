import { OptionButton } from './OptionButton';
import './Stepper.css';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label
}: StepperProps) {
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  return (
    <div className="stepper">
      <OptionButton
        onClick={handleDecrement}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
      >
        -
      </OptionButton>
      <span className="stepper__value">{value}</span>
      <OptionButton
        onClick={handleIncrement}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
      >
        +
      </OptionButton>
    </div>
  );
}
