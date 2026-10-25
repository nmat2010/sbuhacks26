import { useEffect, useRef, useState } from 'react';

const STEPS = 12;
const STEP_MS = 40;

function reduced(): boolean {
  return (
    document.documentElement.dataset.reduceMotion === 'true' ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** A number that counts up in a few chunky steps (not a smooth tween) when it first shows or changes. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setShown(Math.round(start + ((value - start) * step) / STEPS));
      if (step >= STEPS) {
        clearInterval(timer);
        from.current = value;
      }
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span aria-label={`${value}${suffix}`}>
      <span aria-hidden="true">{shown}{suffix}</span>
    </span>
  );
}
