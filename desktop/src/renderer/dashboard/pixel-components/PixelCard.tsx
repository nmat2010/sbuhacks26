import { ReactNode, ElementType, ComponentProps } from 'react';
import '../styles/tokens.css';

export interface PixelCardProps {
  children: ReactNode;
  variant?: 'default' | 'inset';
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
}

export function PixelCard({
  children,
  variant = 'default',
  as: Component = 'div',
  className = '',
  style,
  ...rest
}: PixelCardProps & ComponentProps<any>) {
  const cardClass = variant === 'inset' ? 'ws-card-2' : 'ws-card';

  return (
    <Component
      className={`${cardClass} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </Component>
  );
}
