import { ButtonHTMLAttributes } from 'react';
import './Switch.css';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onToggle, label, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'switch--on' : ''}`.trim()}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onToggle(!checked)}
      {...rest}
    />
  );
}
