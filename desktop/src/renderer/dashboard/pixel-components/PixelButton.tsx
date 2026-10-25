import { ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import '../styles/tokens.css';
import './PixelButton.css';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonTone = 'red' | 'gold';

interface BaseButtonProps {
  children: ReactNode;
  size?: ButtonSize;
  tone?: ButtonTone;
  className?: string;
}

type ButtonAsButton = BaseButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type ButtonAsLink = BaseButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type PixelButtonProps = ButtonAsButton | ButtonAsLink;

export function PixelButton({
  children,
  size = 'md',
  tone = 'red',
  className = '',
  href,
  ...rest
}: PixelButtonProps) {
  const classes = [
    'pixel-btn',
    `pixel-btn--${size}`,
    `pixel-btn--${tone}`,
    className
  ].filter(Boolean).join(' ');

  if (href) {
    return (
      <a href={href} className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
