# Wolfie Overlay Features

This document describes the current implementation of the Wolfie mascot overlay, including recent updates and improvements.

## Mascot States

The mascot now supports 5 animated states, all using sprite-based animations:

### Available States

1. **Idle** (`idle`)
   - Default resting state
   - 4-frame sprite animation at 2 fps
   - Gentle breathing animation
   - File: `wolfie_idle.png`

2. **Talking** (`talking`)
   - Used when Wolfie is speaking or showing nudges
   - 4-frame sprite animation at 4 fps
   - Animated with sparkles
   - File: `wolfie_talking.png`

3. **Angry** (`angry`)
   - Used for distraction and AI tool warnings
   - 4-frame sprite animation at 6 fps (fastest)
   - Shows frustrated expression
   - File: `wolfie_angry.png`
   - Triggers bounce effect when activated

4. **Sleeping** (`sleeping`)
   - Used when session is inactive or paused
   - 4-frame sprite animation at 2 fps
   - Shows Z's and sleepy expression
   - File: `wolfie_sleeping.png`

5. **Thinking** (`thinking`)
   - Used during stuck detection (levels 1-2)
   - 4-frame sprite animation at 3 fps
   - Shows contemplative pose
   - File: `wolfie_thinking.png`

### State Usage in Nudges

The mascot state automatically changes based on the nudge type:

```typescript
// Stuck detection
case 'stuck':
  if (currentNudge.level === 1 || currentNudge.level === 2) {
    setMascotState('thinking');
  } else {
    setMascotState('talking');
  }
  break;

// Warnings
case 'distraction':
case 'ai_tool':
  setMascotState('angry');
  break;

// Positive feedback
case 'streak':
  setMascotState('talking');
  break;
```

## Draggable Mascot

The mascot can now be freely moved around the screen:

### Features
- **Click and Drag**: Click anywhere on the mascot and drag to move it
- **Position Persistence**: The mascot's position is saved to localStorage and restored on app restart
- **Boundary Constraints**: The mascot cannot be dragged outside the window bounds
- **Visual Feedback**: Cursor changes to "grab" when hovering, "grabbing" when dragging

### Implementation Details
- Position is stored in localStorage as `wolfie-position` with `{x, y}` coordinates
- Default position: Bottom center of the screen
- Mascot size: 220x220 pixels
- Position updates in real-time during drag

## Hover Menu

An interactive hover menu appears when hovering over the mascot:

### Smart Behavior
- **Delay**: Menu only appears after 300ms of hovering (prevents interference with dragging)
- **Drag Detection**: Menu is suppressed while dragging the mascot
- **Auto-Hide**: Menu hides immediately when you start dragging
- **Clear Timeout**: Clicking cancels any pending menu appearance

### Menu Options

**Test Panel**
- Opens the development test panel for testing nudges

**Animation Tests**
- 😊 Idle - Test idle animation
- 💬 Talking - Test talking animation
- 😠 Angry - Test angry/alert animation
- 😴 Sleeping - Test sleeping animation
- 🤔 Thinking - Test thinking animation

**Interaction Tests**
- 💬 Test Hint Modal - Opens the hint conversation modal
- 😴 Snooze 30min - Snoozes all nudges for 30 minutes
- ⏸️ Pause / ▶️ Resume - Pause or resume monitoring
- 👁️ Hide Wolfie - Hides the overlay from the screen

## Hint Conversation Modal

A full-featured modal dialog for hint interactions:

### Features
- **Interactive Conversation**: Chat-like interface with Wolfie
- **5-Level Hints**: Progressive hints from nudge to direct step
- **Voice Mode**: Supports voice input when enabled
- **Context Preview**: Shows what Wolfie can see (page, screen, handwriting, camera)
- **Action Buttons**:
  - "Another Hint" - Request next level hint
  - "I Got It!" - Acknowledge and close
  - "I'm Good" - Dismiss without needing help
  - "Show Answer" - Get complete solution (disabled in assessment mode)

### Modal Interaction Fixes
- **Proper z-index**: Modal renders at z-index 2000
- **Mouse Events**: Modal properly captures all mouse events
- **Click-through Fix**: Window automatically disables click-through when modal opens
- **Drag Region Fix**: Modal excludes itself from window drag region via `-webkit-app-region: no-drag`
- **React Portal**: Modal renders to `document.body` to bypass pointer-events restrictions

### Keyboard Support
- **Enter key**: Send message in input field
- **X button**: Close modal
- **Outside click**: Click overlay background to close

## Sprite Animation System

All mascot animations use a sprite-based system for smooth, consistent animations:

### Technical Details
- **Format**: Horizontal sprite sheets (4 frames side-by-side)
- **Frame Size**: 217x288 pixels per frame
- **Total Width**: 866 pixels (4 frames × 217px)
- **Canvas-based**: Uses HTML5 Canvas with `requestAnimationFrame`
- **Performance**: Efficient rendering with proper cleanup

### Static Mascot
- Uses first frame extracted from `wolfie_idle.png`
- File: `wolfie_static.png`
- Ensures consistent proportions across all states

## Voice Indicators

When voice mode is active, a visual indicator appears:

- **Green dot**: Shows in top-right corner of mascot
- **2px white border**: Makes indicator visible against any background
- **Box shadow**: Adds depth for better visibility

## Click-Through Window

The overlay window is click-through except when interacting with elements:

### Mouse Event Handling
- **Click-through enabled**: When not hovering over mascot or bubbles
- **Click-through disabled**: When hovering over interactive elements
- **Smart toggling**: Automatically manages `setIgnoreMouseEvents()` calls
- **Drag support**: Disables click-through while dragging mascot

## Testing

All animation states can be tested via the hover menu:

1. Hover over mascot to show menu (wait 300ms)
2. Click any animation test button
3. Mascot will show that animation for 3 seconds
4. Automatically returns to idle state

For hint modal testing:
1. Click "Test Hint Modal" in hover menu
2. Test all interaction buttons
3. Verify voice mode indicator appears
4. Test message input and "Another Hint" progression

## Files Changed

### Components
- `desktop/src/renderer/overlay/App.tsx` - Main app logic, dragging, states
- `desktop/src/renderer/overlay/components/Mascot.tsx` - Mascot states and sprites
- `desktop/src/renderer/overlay/components/HoverMenu.tsx` - Hover menu UI
- `desktop/src/renderer/overlay/components/HintConversation.tsx` - Modal dialog
- `desktop/src/renderer/overlay/components/HintConversation.css` - Modal styles

### Assets
- `desktop/src/renderer/overlay/assets/wolfie_static.png` - Static mascot (217×288)
- `desktop/src/renderer/overlay/assets/wolfie_idle.png` - Idle sprite (866×288)
- `desktop/src/renderer/overlay/assets/wolfie_talking.png` - Talking sprite (866×288)
- `desktop/src/renderer/overlay/assets/wolfie_angry.png` - Angry sprite (866×288)
- `desktop/src/renderer/overlay/assets/wolfie_sleeping.png` - Sleeping sprite (866×288)
- `desktop/src/renderer/overlay/assets/wolfie_thinking.png` - Thinking sprite (866×288)

## TypeScript Types

```typescript
// Mascot states
export type MascotState = 'idle' | 'talking' | 'angry' | 'sleeping' | 'thinking';

// Position storage
interface Position {
  x: number;
  y: number;
}
```

## Hide/Show Functionality

Users can hide the Wolfie overlay when they need an unobstructed view:

### Hide Wolfie
- Hover over the mascot to show the menu
- Click "👁️ Hide Wolfie" at the bottom of the menu
- The overlay window will be hidden from view

### Show Wolfie Again
To bring Wolfie back after hiding:
1. Right-click on the system tray icon (if available)
2. Or open the Dashboard window
3. Select "Show Wolfie" from the context menu
4. Alternatively, right-click on the overlay while visible and select "Show Wolfie"

## Known Issues

None currently. All features are working as expected.

## Future Improvements

These features are working well but could be enhanced in future iterations:

1. **System Tray Icon**: Add a system tray icon for easy access to show/hide Wolfie when overlay is hidden
2. **Keyboard Shortcut**: Add a global hotkey to toggle Wolfie visibility (e.g., Cmd+Shift+W)
3. **More Animation States**: Could add celebration, aha moment, confused states
4. **Custom Positions**: Allow snapping to screen corners or edges
5. **Multi-Monitor Support**: Remember position per monitor
6. **Animation Speed**: Make animation FPS configurable per user preference
7. **Hover Menu Customization**: Let users hide/show specific menu items
