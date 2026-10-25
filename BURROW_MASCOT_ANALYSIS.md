# Burrow Mascot System - Analysis & Implementation Notes

**Date:** 2026-10-24
**Analyzed From:** Burrow-main codebase
**Goal:** Understand their dynamic mascot system to implement similar functionality for Wolfie Sensei

---

## 🎯 Overview

Burrow uses a **sophisticated sprite-based animation system** with a White Rabbit character that:
- Has multiple dynamic states and animations
- Supports smooth transitions between states
- Uses overlays for eyes/mouth (for speaking/blinking)
- Can move, hop, jump through "holes" (teleportation effect)
- Wanders autonomously when idle
- Responds to user interaction with drag-and-drop
- Scales dynamically based on zoom level
- Supports both pixel-perfect rendering and smooth animations

---

## 📁 Architecture

### **1. Component Structure**

```
extension/src/components/
├── CompanionRoot.tsx         # Main container, orchestrates all UI
├── Character.tsx             # Maps states to sprite player
├── pet/
│   ├── SpritePet.tsx        # Main sprite controller & animation logic
│   ├── manifest.ts          # Character data loader
│   ├── player.ts            # Canvas-based sprite playback engine
│   └── travel.ts            # Movement & physics (hop, fly, wander)
└── Bubble.tsx               # Speech bubbles
```

### **2. Asset Structure**

```
extension/public/characters/rabbit/
├── manifest.json                    # Animation definitions
├── rabbit_idle.png                  # Sprite sheet (4 frames)
├── rabbit_listening.png             # Single frame (hold state)
├── rabbit_thinking.png              # 4 frames loop
├── rabbit_confused.png              # 4 frames loop
├── rabbit_celebrate.png             # 8 frames one-shot
├── rabbit_hop.png                   # 5 frames with movement data
├── rabbit_overlay_blink.png         # 3 frames overlay
├── rabbit_overlay_mouth.png         # 4 frames overlay
└── ... (20+ more state files)
```

---

## 🎨 Key Features

### **1. Manifest-Driven Animation System**

The `manifest.json` defines:

```json
{
  "character": "rabbit",
  "cell": [64, 58],              // Sprite dimensions in pixels
  "body": [19, 2, 50, 55],       // Hit box for interactions
  "states": {
    "idle": {
      "file": "rabbit_idle.png",
      "frames": 4,
      "fps": 3,
      "loop": true,
      "head_dy": [0, 0, 1, 1],   // Vertical offset per frame for overlays
      "overlays": ["blink", "mouth"],
      "variants": [               // Random idle variations
        {"state": "idle_tap", "weight": 3},
        {"state": "idle_watch", "weight": 2}
      ]
    },
    "listening": {
      "file": "rabbit_listening.png",
      "frames": 1,
      "fps": 8,
      "loop": false,
      "enter": "to_listening",   // Transition in
      "exit": "from_listening",  // Transition out
      "hold": true,              // Stay on last frame
      "overlays": ["blink"]
    },
    "hop": {
      "file": "rabbit_hop.png",
      "frames": 5,
      "fps": 12,
      "loop": true,
      "move": [0, 4, 6, 4, 0]    // Horizontal movement per frame
    }
  }
}
```

**Key Concepts:**
- **States:** Each state is a separate PNG sprite sheet
- **Transitions:** States can have `enter` and `exit` transition states
- **Overlays:** Eye blinks and mouth movements are separate layers
- **Variants:** Idle states can randomly trigger variations
- **Movement:** `move` array specifies pixel displacement per frame

### **2. State Management**

**Character States:**
```typescript
type CharacterState =
  | "idle"        // Default resting
  | "listening"   // Microphone on
  | "thinking"    // Processing (with thought bubble)
  | "speaking"    // Idle + mouth overlay animated by audio level
  | "pointing"    // Waving at something
  | "celebrating" // Success animation
  | "confused"    // Question mark appears
  | "sleeping"    // Z's floating
  | "acting"      // Generic action state
  | "error"       // Maps to confused
```

**State Mapping:**
```typescript
const STATE_MAP: Record<CharacterState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "idle",      // Speaking uses idle + mouth overlay!
  pointing: "wave",
  celebrating: "celebrate",
  confused: "confused",
  sleeping: "sleepy",
  error: "confused"
};
```

### **3. Overlay System**

Burrow has a clever **overlay system** for dynamic elements:

1. **Blink Overlay** (`overlay_blink`)
   - 3 frames: half-closed, fully closed, half-open
   - Plays randomly during idle states
   - Offset by `head_dy` array to match head bobbing

2. **Mouth Overlay** (`overlay_mouth`)
   - 4 frames: flat, open, wide, smile
   - Frame selected by **audio level** (0-1)
   - Only shows during "speaking" state
   - Syncs with actual voice output

**Implementation:**
```typescript
// In Character component
const mapped = mapCharacterState(state, attention);
return (
  <SpritePet
    state={mapped.name}
    speaking={mapped.speaking}  // Triggers mouth overlay
    level={level}               // 0-1 audio loudness
    ...
  />
);
```

### **4. Movement & Physics**

**Travel Types:**

1. **Hopping** (`hop` state)
   - Short-distance movement along current row
   - Uses `move` array for frame-by-frame displacement
   - Multiple hops chain together for longer distances

2. **Hole Travel** (teleportation)
   - Sequence: `hole_open` → `dive` → `hole_only` (reverse)
   - Used for large distances or repositioning
   - Can reverse animations (dive backwards = emerge)

3. **Wandering**
   - Autonomous movement when `quiet: true`
   - Random timer triggers 2-3 hops in a direction
   - Configurable gaps: `wander_gap: [75, 150]` seconds

4. **Dragging**
   - User can click and drag the mascot
   - Shows `dragged` state while moving
   - Position clamped to viewport bounds

5. **Flinging** (Physics)
   - Throw with velocity in px/s
   - Parabolic arc with gravity
   - Lands with `land` state

**Key Functions:**
```typescript
interface PetController {
  play(state: string): void;           // Change animation state
  moveTo(x: number, y: number): Promise<void>;  // Hole travel
  hopTo(x: number): Promise<void>;     // Hop along row
  goTo(x: number, y: number): Promise<void>;    // Smart travel (hop or hole)
  jumpOut(): Promise<void>;            // Leave screen
  jumpIn(ready: Promise): Promise<void>;        // Enter from hole
  fling(vx: number, vy: number): Promise<void>; // Throw physics
  resize(scale: number): Promise<void>; // Change size via hole
  wanderNow(): boolean;                // Trigger autonomous movement
}
```

### **5. Canvas Rendering**

Uses **HTML5 Canvas** for pixel-perfect sprite rendering:

```typescript
// From SpritePet component
const canvasRef = useRef<HTMLCanvasElement>(null);
const playerRef = useRef<SpritePlayer | null>(null);

// SpritePlayer class handles:
- Frame-by-frame playback
- Overlay compositing
- Pixel-perfect scaling (image-rendering: pixelated)
- Animation loops and transitions
- Mouth sync with audio levels
```

**Rendering Pipeline:**
1. Load character manifest + all PNG sprite sheets
2. Create `SpritePlayer` instance with loaded images
3. Request animation frame loop
4. Draw current frame + overlays to canvas
5. Apply whole-number scaling (2x, 3x, 4x, etc.)

### **6. Zoom Adaptation**

```typescript
// Adapts to browser zoom level
const base = pageRole() === "parent" ? 4 : 3;  // Base scale
const [zoom, setZoom] = useState(1);

// Scale = base / zoom, rounded to whole number
const petScale = Math.max(2, Math.min(6, Math.round(base / zoom)));
```

- Mascot maintains readable size regardless of page zoom
- Always whole-number scaling for crisp pixel art

---

## 🎬 Animation Flow Examples

### **Example 1: Idle → Listening**

```
1. User clicks "Talk"
2. State changes to "listening"
3. Manifest has: "listening": { "enter": "to_listening" }
4. Plays: to_listening (ears rise) → listening (hold, ears up)
5. User stops talking
6. Manifest has: "listening": { "exit": "from_listening" }
7. Plays: from_listening (ears down) → idle
```

### **Example 2: Speaking with Mouth Sync**

```
1. State = "speaking" → Maps to manifest state "idle"
2. `speaking` prop = true → Enables mouth overlay
3. Audio level 0.8 (loud) → Picks mouth frame 2 (wide open)
4. Audio level 0.2 (quiet) → Picks mouth frame 1 (slightly open)
5. Audio level 0.0 (silent) → Picks mouth frame 0 (closed)
6. Mouth overlay drawn on top of idle animation
7. Both animate independently (idle breath + mouth sync)
```

### **Example 3: Autonomous Wandering**

```
1. No activity for 75-150 seconds (random)
2. quiet: true → Wander timer active
3. Timer fires → Pick random direction (-1 or 1)
4. Plan 2-3 hops (random)
5. Play "hop" state in loop
6. Move using frame's `move` values: [0, 4, 6, 4, 0]
7. Repeat hop animation until target reached
8. Play "settle" state → Return to idle
```

---

## 💡 Implementation Strategy for Wolfie

### **Phase 1: Basic Sprite System**
1. Create Wolfie sprite sheets for core states:
   - `wolfie_idle.png` (4 frames, breathing animation)
   - `wolfie_talking.png` (reuse idle + mouth overlay)
   - `wolfie_alert.png` (attention-grabbing animation)
   - `wolfie_sleeping.png` (Z's floating)
   - `wolfie_question.png` (question mark appears)
   - `wolfie_glance.png` (escalation level 1)

2. Build manifest.json for Wolfie:
   ```json
   {
     "character": "wolfie",
     "cell": [64, 64],
     "body": [10, 5, 54, 60],
     "states": {
       "idle": {
         "file": "wolfie_idle.png",
         "frames": 4,
         "fps": 3,
         "loop": true,
         "overlays": ["blink", "mouth"]
       },
       ...
     }
   }
   ```

3. Implement `SpritePlayer` class:
   - Canvas-based rendering
   - Frame playback with FPS control
   - Overlay compositing
   - State transitions

### **Phase 2: Overlay System**
1. Create overlay sprite sheets:
   - `wolfie_overlay_blink.png` (3 frames)
   - `wolfie_overlay_mouth.png` (4 frames)

2. Implement mouth sync with audio:
   ```typescript
   const mouthFrame = Math.floor(audioLevel * 3); // 0-3
   drawOverlay('mouth', mouthFrame, headOffset);
   ```

3. Add random blink timing (every 3-6 seconds)

### **Phase 3: Movement (Optional)**
1. Simple position changes (no physics needed for desktop overlay)
2. Could add:
   - Draggable mascot
   - Position memory (stays where user puts it)
   - Smooth transitions between positions

### **Phase 4: Transitions**
1. Implement enter/exit transitions:
   - `to_sleeping` → `sleeping` → `from_sleeping`
   - `to_alert` → `alert` → `from_alert`

2. State machine for smooth flow

---

## 📦 Required Assets for Wolfie

### **Minimal Set (MVP)**
```
wolfie/
├── manifest.json
├── wolfie_idle.png          (4 frames - breathing)
├── wolfie_talking.png       (same as idle, uses mouth overlay)
├── wolfie_alert.png         (4 frames - ears perk up)
├── wolfie_sleeping.png      (4 frames - Z's floating)
├── wolfie_glance.png        (2 frames - quick look)
├── wolfie_question.png      (4 frames - ? appears)
├── wolfie_overlay_blink.png (3 frames)
└── wolfie_overlay_mouth.png (4 frames - closed, open, wide, smile)
```

### **Extended Set (Full Feature)**
Add:
- `wolfie_listening.png` (ears up, attentive)
- `wolfie_thinking.png` (thought bubble animation)
- `wolfie_celebrate.png` (happy jump/wiggle)
- `wolfie_confused.png` (head tilt)
- Transition states for smooth enter/exit

---

## 🔧 Technical Implementation Notes

### **1. File Format**
- PNG sprite sheets (horizontal strip)
- Each frame is same width
- Pixel art style (use `image-rendering: pixelated`)
- Transparent background

### **2. Scaling**
- Always use whole-number scaling (2x, 3x, 4x)
- Never fractional scaling (causes blur)
- Default 3x for 192px total height (64px * 3)

### **3. Performance**
- Load all sprites once on init
- Use `requestAnimationFrame` for smooth playback
- Only redraw canvas when frame changes
- Reuse canvas, don't recreate

### **4. State Management**
- Central state store (similar to Burrow's `useStore`)
- State → Manifest state mapping
- Transition queue for smooth changes

---

## 🎯 Key Differences: Burrow vs Wolfie Sensei

| Feature | Burrow | Wolfie Sensei |
|---------|--------|---------------|
| **Platform** | Browser extension (content script) | Electron overlay window |
| **Movement** | Hops, hole travel, wander | Stationary (fixed position) |
| **Dragging** | Yes, can drag around page | Not needed (overlay is fixed) |
| **Physics** | Fling with parabolic arc | Not needed |
| **Wandering** | Autonomous movement when idle | Stay in place |
| **Scaling** | Adapts to page zoom | Fixed scale in overlay |
| **Shadow DOM** | Yes (isolates from page CSS) | No (Electron window) |

**What to Keep:**
- ✅ Sprite-based animation system
- ✅ Manifest-driven states
- ✅ Overlay system (blink, mouth)
- ✅ State transitions (enter/exit)
- ✅ Canvas rendering
- ✅ Mouth sync with audio level

**What to Skip:**
- ❌ Movement physics (hop, fling, travel)
- ❌ Wandering logic
- ❌ Dragging
- ❌ Zoom adaptation
- ❌ Shadow DOM mounting
- ❌ Hole travel animations

---

## 🚀 Next Steps

1. **Create Wolfie Sprite Sheets**
   - Design 64x64px base sprites
   - Animate 4-frame idle (breathing)
   - Create overlays (blink, mouth)
   - Export as PNGs

2. **Build Sprite Player**
   - Port Burrow's `SpritePlayer` class
   - Adapt for Electron overlay
   - Test with Wolfie sprites

3. **Implement State Machine**
   - Map Wolfie states to sprite states
   - Handle transitions
   - Connect to existing nudge system

4. **Add Mouth Sync**
   - Connect to voice audio level
   - Pick mouth frame based on loudness
   - Composite over idle animation

5. **Polish**
   - Add blink timing
   - Smooth transitions
   - Test all states

---

**Analysis Complete!** 🎉

This system gives us a clear roadmap for making Wolfie dynamic and expressive like Burrow's rabbit mascot.
