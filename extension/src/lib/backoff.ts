/** Reconnect delay: 1 s, 2 s, 4 s ... capped at 30 s, plus up to 20% jitter. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 + 0.2 * random()));
}
