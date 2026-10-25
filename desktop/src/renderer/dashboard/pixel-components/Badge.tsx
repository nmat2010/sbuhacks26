import { ReactNode } from 'react';
import './Badge.css';

export type BadgeTone = 'gold' | 'green' | 'weak';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

export function Badge({ children, tone = 'gold' }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {children}
    </span>
  );
}
