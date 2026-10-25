import type { CSSProperties } from "react";

/**
 * Placeholder sensei sprite, drawn as a 16x16 grid of rectangles.
 * Copied rect for rect from the approved mockups. Do not replace with an emoji or image.
 * Swap in the licensed mascot sprite sheet later by changing this one file.
 *
 * variant "idle"  : default (Welcome 256, Connect 192, Brightspace 112, gate overlay 96, sidebar 88)
 * variant "cheer" : open mouth + gold sparkles (Setup complete, 224)
 * variant "plain" : no inner ears, eye shine or headband tail (warn pop-up, 56)
 */

type Rect = [x: number, y: number, w: number, h: number, fill: string];

const EAR = "#5d6270";
const EAR_INNER = "#d9a3a3";
const FUR = "#9aa0ac";
const BAND = "#c41e1e";
const BAND_DARK = "#990000";
const DARK = "#1a1214";
const CREAM = "#f5ecd9";
const MUZZLE = "#efe6d6";
const GOLD = "#f2b632";

const IDLE: Rect[] = [
  [2, 1, 3, 3, EAR],
  [11, 1, 3, 3, EAR],
  [3, 2, 1, 2, EAR_INNER],
  [12, 2, 1, 2, EAR_INNER],
  [3, 3, 10, 1, FUR],
  [2, 4, 12, 6, FUR],
  [3, 10, 10, 1, FUR],
  [4, 11, 8, 1, FUR],
  [2, 4, 12, 2, BAND],
  [14, 5, 2, 1, BAND_DARK],
  [14, 6, 1, 2, BAND_DARK],
  [4, 7, 2, 2, DARK],
  [10, 7, 2, 2, DARK],
  [4, 7, 1, 1, CREAM],
  [10, 7, 1, 1, CREAM],
  [5, 9, 6, 3, MUZZLE],
  [7, 9, 2, 1, DARK],
];

const CHEER: Rect[] = [
  ...IDLE,
  [7, 11, 2, 1, BAND],
  [0, 1, 1, 1, GOLD],
  [15, 1, 1, 1, GOLD],
  [0, 12, 1, 1, GOLD],
  [15, 12, 1, 1, GOLD],
  [1, 14, 1, 1, GOLD],
  [14, 14, 1, 1, GOLD],
];

const PLAIN: Rect[] = [
  [2, 1, 3, 3, EAR],
  [11, 1, 3, 3, EAR],
  [3, 3, 10, 1, FUR],
  [2, 4, 12, 6, FUR],
  [3, 10, 10, 1, FUR],
  [4, 11, 8, 1, FUR],
  [2, 4, 12, 2, BAND],
  [4, 7, 2, 2, DARK],
  [10, 7, 2, 2, DARK],
  [5, 9, 6, 3, MUZZLE],
  [7, 9, 2, 1, DARK],
];

const RECTS = { idle: IDLE, cheer: CHEER, plain: PLAIN } as const;

export type SpriteVariant = keyof typeof RECTS;

export interface SpriteProps {
  /** Rendered width and height in CSS px. Use the size from the mockup. */
  size?: number;
  variant?: SpriteVariant;
  /** Omit for decorative use (default). Provide to expose the sprite to screen readers. */
  label?: string;
  style?: CSSProperties;
}

export function Sprite({ size = 160, variant = "idle", label, style }: SpriteProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ imageRendering: "pixelated", flex: "none", ...style }}
    >
      {RECTS[variant].map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </svg>
  );
}

export default Sprite;
