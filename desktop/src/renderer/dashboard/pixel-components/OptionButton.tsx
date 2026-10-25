import { ButtonHTMLAttributes, ReactNode } from 'react';
import './OptionButton.css';

export interface OptionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  pressed?: boolean;
}

export function OptionButton({ children, pressed = false, ...rest }: OptionButtonProps) {
  return (
    <button
      type="button"
      className={`option-btn ${pressed ? 'option-btn--pressed' : ''}`.trim()}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
    </button>
  );
}
