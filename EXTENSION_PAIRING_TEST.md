# Extension Pairing Testing Guide

## Overview
This guide helps you test the browser extension pairing feature in the onboarding flow.

## Prerequisites

✅ **Desktop app built:** `npm run dev` works
✅ **Extension built:** `npm run build:extension` completed successfully
✅ **Chrome installed:** Version 120+ recommended

---

## Step-by-Step Testing Procedure

### 1. Start the Desktop App

```bash
npm run dev
```

**What happens:**
- Dashboard window opens showing the onboarding wizard
- Overlay window appears (floating Wolfie mascot)
- Extension WebSocket server starts on `127.0.0.1:45678`
- A 6-digit pairing token is generated (e.g., `7K2WQ9`)

**Check:**
- [ ] Dashboard shows "Welcome" screen (step 1 of 7)
- [ ] Click "START" to proceed to Extension screen (step 2 of 7)

---

### 2. Load the Extension in Chrome

```bash
# 1. Open Chrome
# 2. Navigate to chrome://extensions
# 3. Enable "Developer mode" (toggle in top-right corner)
# 4. Click "Load unpacked"
# 5. Select this folder: /Users/nguyenmaianhthu/sbuhacks26/extension/dist
```

**What happens:**
- Extension loads into Chrome
- Extension icon appears in toolbar (Wolfie icon)

**Check:**
- [ ] Extension appears in chrome://extensions list
- [ ] No errors shown in the extension card
- [ ] Extension icon visible in Chrome toolbar

---

### 3. Test the ExtensionScreen Design

**Desktop App - ExtensionScreen should show:**

**Header:**
- [ ] "WOLFIE SENSEI" title on left
- [ ] "SETUP · 2 OF 7" in center
- [ ] Three colored squares on right (gold, green, red)

**Main Content (Left Side):**
- [ ] Wolfie sprite at 192px (placeholder sprite)
- [ ] Speech bubble: "First, let's link your browser..."
- [ ] "SENSEI · IDLE · placeholder sprite" caption

**Main Content (Right Card):**
- [ ] "CONNECT THE EXTENSION" heading in gold
- [ ] Step 1 with red numbered box "1"
- [ ] "GET EXTENSION" gold button
- [ ] Step 2 with red numbered box "2"
- [ ] Six large digit boxes displaying the pairing code (e.g., 7 K 2 W Q 9)
- [ ] Each digit box has gold border and gold text on black background
- [ ] "Keep this window open · new code" link below digits
- [ ] Status indicator with three blinking orange dots
- [ ] "Waiting for the extension…" in orange text
- [ ] "This turns green when paired." helper text in gray
- [ ] "Extension not showing up?" expandable button
- [ ] "BACK" button (ghost style)
- [ ] "CONTINUE" button (disabled/grayed out initially)

**Footer Progress Stepper:**
- [ ] "Hello" step: gold circle with gold text (completed)
- [ ] "Extension" step: red circle with white text, white border (current)
- [ ] Line from Hello to Extension: gold/dashed
- [ ] Line from Extension to Brightspace: gray/dashed
- [ ] "Brightspace", "Powers", "Goals", "Shields", "Train!": gray circles with gray text (upcoming)

---

### 4. Test Pairing Flow

**In Chrome:**
1. Click the Wolfie Sensei extension icon in toolbar
2. Extension popup should open

**Extension Popup should show:**
- [ ] Connection status indicator
- [ ] Text input field for pairing code
- [ ] "Pair" button

**Enter the pairing code:**
1. Look at the desktop app and note the 6-digit code (e.g., `7K2WQ9`)
2. Type it into the extension popup (case-insensitive)
3. Click "Pair" or press Enter

**What happens:**
- Extension sends `ext.hello` message to desktop via WebSocket
- Desktop validates the token
- Desktop responds with `desk.hello_result: { ok: true }`
- Extension popup shows "Connected" status

**Check Desktop App:**
- [ ] Status indicator changes from blinking orange to solid green dot
- [ ] Text changes from "Waiting for the extension…" to "Extension connected!"
- [ ] "CONTINUE" button becomes enabled (red with shadows)
- [ ] Progress stepper: "Extension" step changes from red to gold
- [ ] Progress stepper: Line to "Brightspace" changes from gray to gold

---

### 5. Test Invalid Token

**Reset and test error handling:**
1. Click "new code" link in desktop app
2. A new 6-digit code generates
3. In extension popup, unpair or clear the old token
4. Enter a fake code like `AAAAAA`
5. Click "Pair"

**Expected:**
- [ ] Extension popup shows "Invalid token" error
- [ ] Desktop app remains in "Waiting" state
- [ ] "CONTINUE" button stays disabled

---

### 6. Test Code Regeneration

**In Desktop App:**
1. Note the current 6-digit code
2. Click "new code" link
3. New code appears (different from the old one)

**Check:**
- [ ] Code changes to a new 6-character alphanumeric string
- [ ] If extension was connected, it disconnects (connection status resets)
- [ ] "CONTINUE" button becomes disabled again

---

### 7. Test Continue Flow

**After successful pairing:**
1. Click "CONTINUE" button

**Expected:**
- [ ] Onboarding advances to next screen (Brightspace, step 3 of 7)
- [ ] Progress stepper at bottom now shows "Brightspace" as active
- [ ] Extension remains connected in background

---

### 8. Test Extension Functionality (After Pairing)

**Complete onboarding:**
1. Click through all onboarding screens to reach the dashboard
2. Start a session from the overlay hover menu

**Test distraction detection:**
1. Open a new Chrome tab
2. Visit `youtube.com`
3. Wait 3-5 seconds

**Expected:**
- [ ] Overlay mascot shows a warning nudge
- [ ] Speech bubble appears: distraction warning message
- [ ] Options shown: "Taking a break", "I need this for the task", "Ignore for this session"

**Test excluded sites:**
1. Visit `chase.com` (excluded by default)

**Expected:**
- [ ] No warning appears (excluded site)

**Test incognito:**
1. Open Chrome incognito window
2. Visit any site

**Expected:**
- [ ] No data sent from incognito tabs (privacy)

---

## Troubleshooting

### Extension won't load
- **Error: "Manifest file is missing or unreadable"**
  - Solution: Rebuild extension with `npm run build:extension`
  - Verify `extension/dist/manifest.json` exists

### Extension can't connect
- **Popup shows "Can't connect to desktop"**
  - Check desktop app is running (`npm run dev`)
  - Check extension server started (look for log: `[extension-link] listening on 127.0.0.1:45678`)
  - Try restarting desktop app

### Wrong pairing code
- **Token mismatch error**
  - Desktop and extension must use the same 6-character code
  - Code is case-insensitive
  - Click "new code" in desktop to regenerate if needed

### CONTINUE button stays disabled
- **Connection didn't complete**
  - Check extension popup shows "Connected" status
  - Look for green status indicator in desktop app
  - Check browser console (F12) for WebSocket errors

### Design doesn't match
- **Styles look different from mockup**
  - Verify fonts loaded: check Network tab for `press-start-2p` and `pixelify-sans`
  - Verify CSS loaded: check for `design/pixel.css` in Sources tab
  - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

---

## Success Criteria

All checkboxes above should be ✅ for a successful test:

1. ✅ Extension loads without errors
2. ✅ Pairing code displays correctly (6 characters in large boxes)
3. ✅ Extension popup accepts the code
4. ✅ Connection status updates to "Connected" on both desktop and extension
5. ✅ CONTINUE button becomes enabled after connection
6. ✅ Progress stepper updates correctly (Extension step turns gold)
7. ✅ Can advance to next onboarding screen
8. ✅ Distraction detection works after completing onboarding

---

## Design Verification

Compare your ExtensionScreen with `/design/reference/connect.html`:

```bash
# Open reference in browser
open /Users/nguyenmaianhthu/sbuhacks26/design/reference/connect.html

# Run desktop app
npm run dev
```

**Visual comparison checklist:**
- [ ] Fonts match (Press Start 2P for headings, Pixelify Sans for body)
- [ ] Colors match exactly (gold: #f2b632, red: #c41e1e, etc.)
- [ ] Card shadows match (beveled appearance)
- [ ] Button shadows match (inset shadows for depth)
- [ ] Spacing matches (gaps, padding, margins)
- [ ] Progress stepper bar at bottom matches
- [ ] Blinking animation works (3 orange dots)
- [ ] Sprite displays correctly at 192px

---

## Developer Notes

**Pairing Architecture:**
- Desktop runs WebSocket server on `127.0.0.1:45678` (loopback only)
- Extension connects via `ws://127.0.0.1:45678`
- Token stored in desktop settings: `pairing.extension_token`
- Extension ID stored after first successful connection
- Connection authenticated via HMAC token comparison

**IPC Channels Used:**
- `extension-pairing-get`: Fetch current token and connection status
- `extension-pairing-regenerate`: Generate new token (disconnects existing)
- Event: `extension-status`: Fires when connection state changes

**File Locations:**
- Desktop: `desktop/src/renderer/dashboard/components/onboarding/ExtensionScreen.tsx`
- Extension: `extension/src/popup/`
- Server: `desktop/src/main/sync/extension-server.ts`
- Background: `extension/src/background/index.ts`

---

**Last Updated:** 2026-10-25
**Tested By:** [Your Name]
**Test Result:** [ ] PASS / [ ] FAIL
