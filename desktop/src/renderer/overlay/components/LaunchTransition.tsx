import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import chargeSheet from '../../dashboard/assets/wolfie_charge.png';
import diveSheet from '../../dashboard/assets/wolfie_dive.png';
import holeSheet from '../../dashboard/assets/wolfie_hole.png';
import emergeSheet from '../../dashboard/assets/wolfie_emerge.png';
import landSheet from '../../dashboard/assets/wolfie_land.png';
import waveSheet from '../../dashboard/assets/wolfie_wave.png';
import { blip, whoosh } from '../../dashboard/pixel-components/mascotSound';
import '../../dashboard/pixel-components/MascotTransition.css';

// Thu's mascot launch (dashboard/pixel-components/MascotTransition.tsx), played in the overlay
// right where Wolfie stands when the student opens a link Wolfie suggested in the chat: the
// overlay Wolfie hides, the launch Wolfie digs a hole and dives in, the link opens while he is
// underground, then he climbs out of the same hole, lands and waves, and the overlay Wolfie is back.
// No iris or dimming: the overlay window is transparent over the student's screen.

interface LaunchApi {
  /** Plays the launch; `underground` runs (e.g. opens the link) while Wolfie is in the hole. */
  launch(underground: () => unknown): Promise<void>;
  /** The launch is playing: the overlay Wolfie is hidden meanwhile. */
  launching: boolean;
}

const Ctx = createContext<LaunchApi>({ launch: async (u) => void (await u()), launching: false });
export const useLaunch = () => useContext(Ctx);

// Thu's sheet geometry (MascotTransition.tsx): four frames of 216.25 x 288 per sheet
const FRAME_W = 865 / 4;
const FRAME_H = 288;
/** Where the ground is inside a frame (his feet, the dive's hole), as a share of the height. */
const GROUND = 0.845;
/** Where the hole sheet's hole sits inside its frame. */
const HOLE_CENTER = 0.573;
/** The emerge frames have the hole higher in the cell; this lowers them to match. */
const EMERGE_DROP = 0.1;
/** Where the overlay Wolfie's feet are inside his 220px box (from the top). */
const FEET = 0.96;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type Sheet = 'charge' | 'dive' | 'emerge' | 'land' | 'wave';
type Stage = 'start' | 'crouch' | 'dig' | 'release' | 'air' | 'dive' | 'under' | 'emerge' | 'land' | 'wave';
interface Scene {
  /** Centre of his feet, and the ground line (page px). */
  x: number;
  ground: number;
  scale: number;
  sheet: Sheet;
  frame: 0 | 1 | 2 | 3;
  hole: -1 | 0 | 1 | 2 | 3;
  stage: Stage;
}

export function LaunchProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const busy = useRef(false);

  const launch = useCallback(async (underground: () => unknown) => {
    const spot = document.querySelector('.mascot')?.getBoundingClientRect();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!spot || reduced || busy.current) {
      await underground();
      return;
    }
    busy.current = true;
    // Sound follows the dashboard's Appearance setting (on unless turned off)
    const prefs = await window.electronAPI.invoke('dash-prefs-get').catch(() => null);
    const sound = prefs?.appearance.soundEffects ?? true;
    const base = { x: spot.left + spot.width / 2, ground: spot.top + spot.height * FEET, scale: spot.width / FRAME_W };
    const step = async (stage: Stage, sheet: Sheet, frame: Scene['frame'], hole: Scene['hole'], ms: number) => {
      setScene({ ...base, stage, sheet, frame, hole });
      await wait(ms);
    };
    try {
      // Thu's timings (PHASES), without the iris
      await step('start', 'charge', 0, -1, 160);
      if (sound) blip(220);
      await step('crouch', 'charge', 1, 0, 240);
      if (sound) blip(330);
      await step('dig', 'charge', 1, 1, 150);
      await step('dig', 'charge', 1, 2, 150);
      await step('release', 'charge', 2, 3, 220);
      await step('air', 'charge', 3, 3, 260);
      if (sound) whoosh('down');
      for (const f of [0, 1, 2] as const) await step('dive', 'dive', f, -1, 130);
      await step('dive', 'dive', 3, -1, 260);
      // Underground: the link opens now
      setScene({ ...base, stage: 'under', sheet: 'dive', frame: 3, hole: -1 });
      await Promise.all([Promise.resolve(underground()).catch(() => undefined), wait(380)]);
      for (const f of [0, 1, 2] as const) await step('emerge', 'emerge', f, -1, 150);
      await step('emerge', 'emerge', 3, -1, 240);
      if (sound) blip(440);
      for (const f of [0, 1, 2] as const) await step('land', 'land', f, -1, 130);
      await step('land', 'land', 3, -1, 200);
      for (const f of [0, 1, 2, 3] as const) await step('wave', 'wave', f, -1, f === 3 ? 280 : 140);
    } finally {
      busy.current = false;
      setScene(null);
    }
  }, []);

  const api = useMemo<LaunchApi>(() => ({ launch, launching: scene !== null }), [launch, scene]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {scene && <LaunchLayer scene={scene} />}
    </Ctx.Provider>
  );
}

function LaunchLayer({ scene }: { scene: Scene }) {
  const { x, ground, scale, sheet, frame, hole, stage } = scene;
  const w = Math.round(FRAME_W * scale);
  const h = Math.round(FRAME_H * scale);
  const top = ground - h * GROUND;
  const sheetUrl = { charge: chargeSheet, dive: diveSheet, emerge: emergeSheet, land: landSheet, wave: waveSheet }[sheet];

  const sparks = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r = 50 + (i % 3) * 24;
        return { dx: Math.round((Math.cos(a) * r) / 3) * 3, dy: Math.round((Math.sin(a) * r) / 3) * 3, gold: i % 2 === 0 };
      }),
    []
  );
  const clods = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ dx: (i % 2 ? 1 : -1) * (16 + (i % 4) * 12), dy: -(24 + (i % 3) * 20) })), []);

  return (
    <div className="launch-layer" aria-hidden="true">
      {hole >= 0 && (
        <div
          className="mascot-hole"
          style={{
            left: x - w / 2,
            top: top + Math.round(h * (GROUND - HOLE_CENTER)),
            width: w,
            height: h,
            backgroundImage: `url(${holeSheet})`,
            backgroundSize: '400% 100%',
            backgroundPosition: `${(hole / 3) * 100}% 0`
          }}
        />
      )}
      {stage !== 'under' && (
        <div
          className={`mascot-wolfie stage-${stage}`}
          style={{
            left: x - w / 2,
            top: top + (sheet === 'emerge' ? Math.round(h * EMERGE_DROP) : 0),
            width: w,
            height: h,
            backgroundImage: `url(${sheetUrl})`,
            backgroundSize: '400% 100%',
            backgroundPosition: `${(frame / 3) * 100}% 0`
          }}
        />
      )}
      {stage === 'release' && (
        <div className="mascot-burst" style={{ left: x, top: ground - h * 0.4 }}>
          {sparks.map((s, i) => (
            <span key={i} className={`mascot-spark ${s.gold ? 'gold' : ''}`} style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }} />
          ))}
        </div>
      )}
      {((stage === 'dive' && frame >= 2) || (stage === 'land' && frame === 0)) && (
        <div className="mascot-burst" style={{ left: x, top: ground }}>
          {clods.map((c, i) => (
            <span key={`${frame}-${i}`} className="mascot-spark clod" style={{ ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px` }} />
          ))}
        </div>
      )}
    </div>
  );
}
