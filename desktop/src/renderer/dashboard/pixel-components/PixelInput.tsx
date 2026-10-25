import { InputHTMLAttributes } from 'react';
import './PixelInput.css';

export type PixelInputProps = InputHTMLAttributes<HTMLInputElement>;

export function PixelInput({ className = '', ...rest }: PixelInputProps) {
  return (
    <input
      className={`pixel-input ${className}`.trim()}
      {...rest}
    />
  );
}
