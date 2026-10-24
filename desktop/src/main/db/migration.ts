export interface Migration {
  /** Unique, never renamed. Core: 0xx_*, Agent A: 1xx_a_*, Agent B: 2xx_b_*. */
  name: string;
  up: () => void;
}
