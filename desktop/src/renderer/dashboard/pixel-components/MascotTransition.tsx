import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import chargeSheet from '../assets/wolfie_charge.png';
import diveSheet from '../assets/wolfie_dive.png';
import holeSheet from '../assets/wolfie_hole.png';
import emergeSheet from '../assets/wolfie_emerge.png';
import landSheet from '../assets/wolfie_land.png';
import waveSheet from '../assets/wolfie_wave.png';
import { blip, whoosh } from './mascotSound';
import './MascotTransition.css';

/**
 * The mascot "launch" transition, after Burrow's dive: Wolfie charges up, a sign names where he is
 * going, he launches off the top of the screen, and a pixel-dither iris closes over the page. The
 * action (opening a link, ...) runs once the page is covered; then the iris lets go.
 *
 * Frames (4 each): wolfie_charge (crouch, coil, release, airborne), wolfie_hole (the hole opening,
 * dug while he coils) and wolfie_dive (tuck, tip, plunge, gone). The dive frames carry their own hole
 * baked into the ground, so the hole prop hands over to them. When the page is covered and the action
 * has run, the iris lets go while wolfie_emerge climbs out of the same spot and wolfie_land has him
 * jump out, squash, stretch, bounce and settle, then wolfie_wave greets you under a "Here we are!" sign.
 */

export interface MascotPlayOptions {
  /** Where he is going, shown on the sign: "brightspace.stonybrook.edu". */
  label: string;
  /** Small line under the label. */
  sub?: string;
  /** Runs while the page is covered. */
  onCover?: () => void | Promise<void>;
  /** The clicked element, so he starts near it. Falls back to screen centre. */
  origin?: DOMRect | null;
}

interface MascotApi {
  play(opts: MascotPlayOptions): Promise<void>;
  playing: boolean;
}

const Ctx = createContext<MascotApi>({ play: async (o) => void (await o.onCover?.()), playing: false });
export const useMascotTransition = () => useContext(Ctx);

// Timings in ms
const FRAME_W = 865 / 4; // the sheet is 865 wide: four frames of 216.25
const FRAME_H = 288;
const PHASES = {
  pop: 200, // he drops in at charge frame 0
  crouch: 240, // charge frame 1
  dig: 150, // coil, shaking, per hole frame (two of them)
  release: 220, // charge frame 2, hole fully open, burst
  air: 260, // charge frame 3, a hop up and down
  dive: 130, // per dive frame (the last one is held longer)
  diveEnd: 260,
  close: 600, // iris closes (matches the CSS 8 steps)
  hold: 380, // covered
  emerge: 150, // per emerge frame while the iris lets go (the last is held longer)
  emergeEnd: 240,
  land: 130, // per land frame (the last is held longer)
  landEnd: 200,
  wave: 140 // per wave frame (two loops, the last held a beat)
};
/** The emerge frames have the hole higher up in the cell than the dive frames do; this lowers them to match. */
const EMERGE_DROP = 0.1;
/** Where the ground is inside a frame (his feet and the dive's hole), as a share of the height. */
const GROUND = 0.845;
/** Where the hole sheet's hole sits inside its frame, as a share of the height. */
const HOLE_CENTER = 0.573;
const IRIS_STEPS = 8;
const BAND = 30;
const DENSITIES = [25, 50, 75, 100] as const;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** A 4x4 Bayer dither tile at the given fill percentage, as a data URI, in 3px cells. */
function ditherTile(percent: number): string {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cells: string[] = [];
  for (let i = 0; i < 16; i++) {
    if (bayer[i] < (percent / 100) * 16) cells.push(`<rect x='${(i % 4) * 3}' y='${Math.floor(i / 4) * 3}' width='3' height='3'/>`);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%231a1214' shape-rendering='crispEdges'>${cells.join('')}</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

type Stage = 'pop' | 'crouch' | 'dig' | 'release' | 'air' | 'dive' | 'close' | 'hold' | 'emerge' | 'land' | 'wave';

interface Scene {
  x: number; // centre of his feet
  y: number; // bottom edge of the frame
  scale: number;
  label: string;
  sub?: string;
  sheet: 'charge' | 'dive' | 'emerge' | 'land' | 'wave';
  frame: 0 | 1 | 2 | 3;
  /** Hole prop frame, or -1 for none. */
  hole: -1 | 0 | 1 | 2 | 3;
  stage: Stage;
}

export function MascotTransitionProvider({ children, sound = true }: { children: ReactNode; sound?: boolean }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const skip = useRef<(() => void) | null>(null);
  const busy = useRef(false);

  const play = useCallback(
    async (opts: MascotPlayOptions) => {
      const reduced =
        document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || busy.current) {
        await opts.onCover?.();
        return;
      }
      busy.current = true;
      const scale = Math.min(1, (window.innerHeight * 0.5) / FRAME_H);
      const o = opts.origin;
      // Keep both him and his sign (up to 300px wide) on screen, wherever the clicked element is
      const margin = Math.min(window.innerWidth / 2, Math.max(FRAME_W * scale * 0.5, 160) + 12);
      const x = Math.round(Math.min(window.innerWidth - margin, Math.max(margin, o ? o.left + o.width / 2 : window.innerWidth / 2)));
      const y = Math.round(window.innerHeight * 0.74);
      const base = { x, y, scale, label: opts.label, sub: opts.sub };
      let skipped = false;
      skip.current = () => {
        skipped = true;
      };
      const step = async (stage: Stage, sheet: Scene['sheet'], frame: Scene['frame'], hole: Scene['hole'], ms: number) => {
        setScene({ ...base, stage, sheet, frame, hole });
        if (!skipped) await wait(ms);
      };
      try {
        await step('pop', 'charge', 0, -1, PHASES.pop);
        if (sound) blip(220);
        await step('crouch', 'charge', 1, 0, PHASES.crouch);
        if (sound) blip(330);
        await step('dig', 'charge', 1, 1, PHASES.dig);
        await step('dig', 'charge', 1, 2, PHASES.dig);
        await step('release', 'charge', 2, 3, PHASES.release);
        await step('air', 'charge', 3, 3, PHASES.air);
        if (sound) whoosh('down');
        await step('dive', 'dive', 0, -1, PHASES.dive);
        await step('dive', 'dive', 1, -1, PHASES.dive);
        await step('dive', 'dive', 2, -1, PHASES.dive);
        await step('dive', 'dive', 3, -1, PHASES.diveEnd);
        await step('close', 'dive', 3, -1, PHASES.close);
        await step('hold', 'dive', 3, -1, PHASES.hold);
        await opts.onCover?.();
        await step('emerge', 'emerge', 0, -1, PHASES.emerge);
        await step('emerge', 'emerge', 1, -1, PHASES.emerge);
        await step('emerge', 'emerge', 2, -1, PHASES.emerge);
        await step('emerge', 'emerge', 3, -1, PHASES.emergeEnd);
        if (sound) blip(440);
        await step('land', 'land', 0, -1, PHASES.land);
        await step('land', 'land', 1, -1, PHASES.land);
        await step('land', 'land', 2, -1, PHASES.land);
        await step('land', 'land', 3, -1, PHASES.landEnd);
        for (const f of [0, 1, 2, 3, 0, 1, 2, 3] as const) await step('wave', 'wave', f, -1, f === 3 ? PHASES.wave * 2 : PHASES.wave);
      } finally {
        skip.current = null;
        busy.current = false;
        setScene(null);
      }
    },
    [sound]
  );

  const api = useMemo<MascotApi>(() => ({ play, playing: scene !== null }), [play, scene]);

  // Escape or a click jumps straight to the cover, so it never feels like a wait
  useEffect(() => {
    if (!scene) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scene]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {scene && <MascotLayer scene={scene} onSkip={() => skip.current?.()} />}
    </Ctx.Provider>
  );
}

function MascotLayer({ scene, onSkip }: { scene: Scene; onSkip: () => void }) {
  const { x, y, scale, sheet, frame, hole: holeFrame, stage, label, sub } = scene;
  const w = Math.round(FRAME_W * scale);
  const h = Math.round(FRAME_H * scale);
  const irisOn = stage === 'close' || stage === 'hold' || stage === 'emerge';
  const sheetUrl = { charge: chargeSheet, dive: diveSheet, emerge: emergeSheet, land: landSheet, wave: waveSheet }[sheet];
  const hole = { x, y: Math.round(y - h * (1 - GROUND)) };
  const holeOffset = Math.round(h * (GROUND - HOLE_CENTER));
  const signUp = stage === 'crouch' || stage === 'dig' || stage === 'release' || stage === 'wave';
  const greeting = stage === 'wave';

  // Iris geometry (as in Burrow): four dither densities, circles shrinking in steps around the hole
  const iris = useMemo(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const far = Math.ceil(Math.max(Math.hypot(hole.x, hole.y), Math.hypot(W - hole.x, hole.y), Math.hypot(hole.x, H - hole.y), Math.hypot(W - hole.x, H - hole.y)));
    const clear = 0;
    const step = 2 * Math.ceil((2 * far + 2 * BAND * 3 - clear) / IRIS_STEPS / 2);
    return DENSITIES.map((d, i) => ({
      d,
      tile: ditherTile(d),
      d0: clear + i * 2 * BAND + IRIS_STEPS * step,
      d1: clear + i * 2 * BAND
    }));
  }, [hole.x, hole.y]);

  const sparks = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r = 90 + (i % 3) * 40;
        return { dx: Math.round((Math.cos(a) * r) / 3) * 3, dy: Math.round((Math.sin(a) * r) / 3) * 3, gold: i % 2 === 0 };
      }),
    []
  );

  const clods = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ dx: (i % 2 ? 1 : -1) * (24 + (i % 4) * 18), dy: -(36 + (i % 3) * 30) })),
    []
  );

  return (
    <div className="mascot-layer" aria-hidden="true" onClick={onSkip}>
      <div className={`mascot-dim ${stage === 'land' || stage === 'wave' ? 'off' : stage !== 'pop' ? 'on' : ''}`} style={{ backgroundImage: ditherTile(25) }} />

      <div className={`mascot-sign ${signUp ? 'up' : ''} ${stage === 'air' || stage === 'dive' || irisOn ? 'down' : ''}`}
        style={{ left: x, top: y - h - 24 * scale }}>
        <div className="mascot-sign__board">
          <span className="mascot-sign__label">{greeting ? 'Here we are!' : label}</span>
          {sub && !greeting && <b className="mascot-sign__sub">{sub}</b>}
        </div>
        <i className="mascot-sign__leg" />
      </div>

      {holeFrame >= 0 && (
        <div
          className="mascot-hole"
          style={{
            left: x - w / 2,
            top: y - h + holeOffset,
            width: w,
            height: h,
            backgroundImage: `url(${holeSheet})`,
            backgroundSize: '400% 100%',
            backgroundPosition: `${(holeFrame / 3) * 100}% 0`
          }}
        />
      )}

      <div
        className={`mascot-wolfie stage-${stage}`}
        style={{
          left: x - w / 2,
          top: y - h + (sheet === 'emerge' ? Math.round(h * EMERGE_DROP) : 0),
          width: w,
          height: h,
          backgroundImage: `url(${sheetUrl})`,
          backgroundSize: '400% 100%',
          backgroundPosition: `${(frame / 3) * 100}% 0`
        }}
      />

      {stage === 'release' && (
        <div className="mascot-burst" style={{ left: x, top: y - h * 0.5 }}>
          {sparks.map((s, i) => (
            <span key={i} className={`mascot-spark ${s.gold ? 'gold' : ''}`} style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }} />
          ))}
        </div>
      )}

      {((stage === 'dive' && frame >= 2) || (stage === 'land' && frame === 0)) && (
        <div className="mascot-burst" style={{ left: x, top: hole.y }}>
          {clods.map((c, i) => (
            <span key={`${frame}-${i}`} className="mascot-spark clod" style={{ ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px` }} />
          ))}
        </div>
      )}

      {irisOn &&
        iris.map((l) => (
          <div
            key={l.d}
            className={`mascot-iris ${stage === 'emerge' ? 'out' : ''}`}
            style={{
              backgroundImage: l.tile,
              ['--hx' as string]: `${hole.x}px`,
              ['--hy' as string]: `${hole.y}px`,
              ['--d0' as string]: `${l.d0}px`,
              ['--d1' as string]: `${l.d1}px`
            }}
          />
        ))}
    </div>
  );
}
