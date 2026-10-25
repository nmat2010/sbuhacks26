import { ReactNode, CSSProperties } from 'react';
import './Chip.css';

export interface ChipProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Chip({ children, className = '', style }: ChipProps) {
  return (
    <span className={`chip ${className}`.trim()} style={style}>
      {children}
    </span>
  );
}
