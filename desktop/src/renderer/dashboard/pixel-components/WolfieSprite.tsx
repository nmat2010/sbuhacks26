import './WolfieSprite.css';

export type WolfieMood = 'idle' | 'watching' | 'ready';

export interface WolfieSpriteProps {
  mood?: WolfieMood;
  size?: number;
}

// Pixel data for the "ready" mood (from the handoff HTML)
const READY_SPRITE = [
  { x: 2, y: 1, w: 3, h: 3, fill: '#5d6270' },  // left ear
  { x: 11, y: 1, w: 3, h: 3, fill: '#5d6270' }, // right ear
  { x: 3, y: 2, w: 1, h: 2, fill: '#d9a3a3' },  // inner left ear
  { x: 12, y: 2, w: 1, h: 2, fill: '#d9a3a3' }, // inner right ear
  { x: 3, y: 3, w: 10, h: 1, fill: '#9aa0ac' }, // top of head
  { x: 2, y: 4, w: 12, h: 6, fill: '#9aa0ac' }, // face
  { x: 3, y: 10, w: 10, h: 1, fill: '#9aa0ac' }, // bottom
  { x: 4, y: 11, w: 8, h: 1, fill: '#9aa0ac' }, // chin
  { x: 2, y: 4, w: 12, h: 2, fill: '#c41e1e' }, // bandana
  { x: 14, y: 5, w: 2, h: 1, fill: '#990000' }, // bandana tail
  { x: 14, y: 6, w: 1, h: 2, fill: '#990000' }, // bandana tail
  { x: 4, y: 7, w: 2, h: 2, fill: '#1a1214' },  // left eye bg
  { x: 10, y: 7, w: 2, h: 2, fill: '#1a1214' }, // right eye bg
  { x: 4, y: 7, w: 1, h: 1, fill: '#f5ecd9' },  // left eye
  { x: 10, y: 7, w: 1, h: 1, fill: '#f5ecd9' }, // right eye
  { x: 5, y: 9, w: 6, h: 3, fill: '#efe6d6' },  // snout
  { x: 7, y: 9, w: 2, h: 1, fill: '#1a1214' },  // nose
];

export function WolfieSprite({ mood: _mood = 'ready', size = 88 }: WolfieSpriteProps) {
  // For now, only the ready mood is implemented
  const sprite = READY_SPRITE;

  return (
    <svg
      className="wolfie-sprite"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {sprite.map((rect, i) => (
        <rect
          key={i}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={rect.fill}
        />
      ))}
    </svg>
  );
}
