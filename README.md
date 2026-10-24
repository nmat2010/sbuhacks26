# Wolfie Sensei

An AI-powered study companion that helps students when they get stuck, tracks their progress, and builds sustainable study habits.

## For Claude Code Agents

If you're a Claude Code agent helping with this project:

1. **Read these files first:**
   - `SPEC.md` - Complete project specification
   - `COORDINATION.md` - How to coordinate with the other developer
   - `STATUS.md` - Current project status
   - `DECISIONS.md` - Architecture decisions made

2. **Before starting work:**
   - Check `STATUS.md` to see what's in progress
   - Update your status in `COORDINATION.md`
   - Review the phase you're assigned in `SPEC.md`

3. **While working:**
   - Update `STATUS.md` when completing tasks
   - Use `COORDINATION.md` to communicate blockers
   - Check shared contracts before modifying them

4. **Check your role:**
   - **Thu**: Overlay UI, Dashboard, Web App, Voice UI (Phases 1, 5, 7-12)
   - **Tuan**: Desktop logic, Extension, LLM, Monitoring (Phases 2-6, 9-10, 12 support)

---

## Project Structure

```
wolfie/
├── shared/                # Shared TypeScript schemas and fixtures
│   ├── src/
│   │   ├── schemas/      # Zod schemas for all data types
│   │   └── fixtures/     # Test data and demo scenarios
│   └── package.json
│
├── desktop/              # Electron desktop app
│   ├── electron/         # Main process
│   │   ├── main.ts      # App entry point
│   │   └── preload.ts   # IPC bridge
│   ├── src/
│   │   ├── main/        # Main process modules
│   │   │   ├── db/      # SQLite database
│   │   │   ├── llm/     # LLM provider interface
│   │   │   ├── voice/   # Speech providers (Tuan)
│   │   │   ├── monitor/ # Session monitoring (Tuan)
│   │   │   ├── rules/   # Distraction detection (Tuan)
│   │   │   ├── stuck/   # Escalation engine (Tuan)
│   │   │   ├── streak/  # Streak tracking (Tuan)
│   │   │   └── sync/    # WebSocket server (Tuan)
│   │   └── renderer/
│   │       ├── overlay/ # Mascot overlay (Thu)
│   │       └── dashboard/ # Dashboard UI (Thu)
│   └── package.json
│
├── extension/            # Chrome MV3 extension (Tuan)
│   ├── src/
│   │   ├── background/  # Service worker
│   │   ├── content/     # Page analysis
│   │   └── popup/       # Extension popup
│   └── manifest.json
│
├── web/                  # React web app for tablets (Thu)
│   └── [To be created]
│
├── demo-pages/           # Demo scenarios (Tuan)
│   └── [To be created]
│
├── SPEC.md              # Complete specification
├── COORDINATION.md      # Developer coordination protocol
├── STATUS.md            # Current status board
├── DECISIONS.md         # Architecture decisions
└── TESTING.md           # [To be created] Testing checklist
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- For extension: Chrome/Chromium browser
- For web app: Any modern browser

### Installation

```bash
# Install all dependencies
npm install

# Build shared package
npm run build --workspace=shared
```

### Development

```bash
# Run desktop app
npm run dev --workspace=desktop

# Build extension
npm run build --workspace=extension

# Watch mode for shared package
npm run build --workspace=shared -- --watch
```

### Loading the Extension

1. Build the extension: `npm run build --workspace=extension`
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension/dist` folder

---

## Key Concepts

### Architecture Overview

**Desktop App (Electron)**
- Always-on-top mascot overlay
- Dashboard for goals, plans, papers
- SQLite database (all data stays local)
- WebSocket servers for extension (loopback) and web app (LAN)

**Chrome Extension**
- Monitors web pages for struggle signals
- Builds PageSummary (no sensitive data)
- Reports to desktop via WebSocket

**Web App (React)**
- Canvas-based notebook for tablets
- Wolfie mascot with hints
- Syncs with desktop via WebSocket
- Voice via Web Speech API

### Data Flow

```
Web Page → Extension → Desktop ← Web App
                          ↓
                      SQLite DB
                          ↓
                      LLM (Gemini)
                          ↓
                      Hints/Nudges
                          ↓
                   Overlay/Web App
```

### Core Loop

1. **Monitor**: Track what the student is doing (desktop monitors apps, extension monitors web pages, web app monitors canvas)
2. **Detect**: Identify struggle signals (wrong answers, dead clicks, idle time, etc.)
3. **Escalate**: Gradually offer help (glance → ? → bubble → spoken)
4. **Hint**: Provide 5-level graduated hints (nudge → hint → explanation → example → direct step)
5. **Track**: Record session for streak and analytics

---

## Shared Contracts

These are frozen interfaces that both developers depend on:

### 1. Nudge API

```typescript
import { NudgeSchema } from '@wolfie/shared';

nudge.push({
  kind: 'stuck',
  level: 3,
  text: 'Want a hint?',
  spokenText: 'You've been working on this for a while. Want a hint?',
  buttons: [
    { label: 'Yes, please', action: 'accept_hint' },
    { label: 'Not yet', action: 'decline' }
  ],
  priority: 8
});
```

### 2. Hint Request

```typescript
import { HintRequestSchema } from '@wolfie/shared';

const request: HintRequest = {
  sessionId: 'session-123',
  device: 'desktop',
  source: 'page',
  trigger: 'auto',
  pageSummary: { /* ... */ },
  assessment: false,
  timestamp: Date.now()
};
```

### 3. Sync Messages

```typescript
import { SyncMessageSchema } from '@wolfie/shared';

const message: SyncMessage = {
  id: 'msg-123',
  type: 'hint.request',
  timestamp: Date.now(),
  payload: { /* ... */ }
};
```

### 4. Database Schema

See `desktop/src/main/db/index.ts` for the complete schema.

Key tables:
- `sessions` - Study sessions
- `nudges` - All nudges shown
- `hint_requests` - Hints requested
- `streak_days` - Daily streak tracking
- `goals` & `plan_items` - Student goals and plans

---

## Development Workflow

### Making Changes

1. **Check ownership** in `COORDINATION.md` file ownership map
2. **Update status** in `STATUS.md` before and after work
3. **Run tests** before committing:
   ```bash
   npm test --workspace=shared
   npm test --workspace=desktop
   ```
4. **Commit** with clear message:
   ```
   [Phase N] Feature description

   - Detail 1
   - Detail 2

   Owner: Thu/Tuan
   ```

### Integration Points

When your feature needs to integrate with the other developer's:

1. **Document the interface** in `COORDINATION.md` under "Integration Offer"
2. **Mark checkpoint ready** in `STATUS.md`
3. **Wait for other part** to be ready
4. **Test together** and update checkpoint status

### Resolving Conflicts

If you both edited the same file:
1. The person who committed second resolves the conflict
2. Communicate via `COORDINATION.md` if unclear
3. Default to keeping both changes if they don't conflict semantically

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific workspace
npm test --workspace=shared
npm test --workspace=desktop

# Watch mode
npm test --workspace=shared -- --watch
```

### Demo Mode

```bash
# Enable demo mode (uses mock LLM, no API calls)
echo "DEMO_MODE=1" > desktop/.env

# Run with demo mode
npm run dev --workspace=desktop
```

---

## Environment Variables

Create `desktop/.env`:

```bash
# API Keys
GEMINI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here

# Demo Mode (1 = mock providers, 0 = real APIs)
DEMO_MODE=0

# Environment
NODE_ENV=development
```

---

## Common Tasks

### Add a New IPC Channel

1. **Define in preload** (`desktop/electron/preload.ts`):
   ```typescript
   invoke: (channel: string, ...args: any[]) => {
     return ipcRenderer.invoke(channel, ...args);
   }
   ```

2. **Handle in main** (`desktop/electron/main.ts`):
   ```typescript
   ipcMain.handle('your-channel', async (event, arg) => {
     // Your logic
     return result;
   });
   ```

3. **Call from renderer**:
   ```typescript
   const result = await window.electronAPI.invoke('your-channel', data);
   ```

### Add a New Schema

1. **Create in shared** (`shared/src/schemas/your-schema.ts`):
   ```typescript
   import { z } from 'zod';

   export const YourSchema = z.object({
     field: z.string()
   });

   export type YourType = z.infer<typeof YourSchema>;
   ```

2. **Export from index** (`shared/src/schemas/index.ts`):
   ```typescript
   export * from './your-schema.js';
   ```

3. **Use in code**:
   ```typescript
   import { YourSchema } from '@wolfie/shared';

   const validated = YourSchema.parse(data);
   ```

### Query the Database

```typescript
import { getDatabase } from '@/main/db';

const db = getDatabase();

// Insert
db.prepare('INSERT INTO table (col) VALUES (?)').run(value);

// Query
const row = db.prepare('SELECT * FROM table WHERE id = ?').get(id);
const rows = db.prepare('SELECT * FROM table').all();
```

---

## Troubleshooting

### Desktop app won't start
- Check `desktop/.env` exists (copy from `.env.example`)
- Run `npm install` again
- Check console for errors

### Extension won't load
- Build first: `npm run build --workspace=extension`
- Check Chrome extensions page for errors
- Verify manifest.json is in dist folder

### Shared package changes not reflected
- Rebuild shared: `npm run build --workspace=shared`
- Restart desktop app
- Check import paths use `@wolfie/shared`

### Database errors
- Delete database: `rm ~/Library/Application\ Support/wolfie/data/wolfie.db`
- Restart app (migrations will run again)

### TypeScript errors
- Run `npm install` at root
- Check tsconfig.json paths
- Rebuild shared package

---

## Resources

- **Electron Docs**: https://www.electronjs.org/docs
- **React Docs**: https://react.dev
- **Zod Docs**: https://zod.dev
- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/mv3
- **Gemini API**: https://ai.google.dev/docs
- **Eleven Labs API**: https://elevenlabs.io/docs

---

## Support

- Check `COORDINATION.md` for help requests
- Update `STATUS.md` with blockers
- Review `SPEC.md` for requirements
- See `DECISIONS.md` for why things are done a certain way
