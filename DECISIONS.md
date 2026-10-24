# Architecture and Implementation Decisions

This document tracks decisions made during implementation where the spec was ambiguous or required clarification.

## Phase 0: Scaffold

### Technology Choices
- **Confirmed**: Electron + Vite + React + TypeScript for desktop
- **Confirmed**: Chrome MV3 for extension
- **Confirmed**: SQLite with better-sqlite3
- **Confirmed**: Zod for schema validation

### Build System
- Using npm workspaces for monorepo management
- Vite for desktop bundling with vite-plugin-electron
- TypeScript compilation for extension (no bundler for now - may add later if needed)

### Database
- Using migrations table to track applied migrations
- All timestamps stored as Unix epoch milliseconds (INTEGER)
- Boolean values stored as INTEGER (0 or 1) per SQLite conventions
- Foreign keys enabled via pragma

### LLM Provider
- Created provider interface with Claude and Mock implementations
- Mock provider returns deterministic hints based on demo problem IDs
- Claude provider stubbed for Phase 4 implementation
- DEMO_MODE=1 forces mock provider regardless of API key presence

### Extension Architecture
- Using WebSocket for desktop communication (loopback only)
- Pairing token stored in chrome.storage.local
- Background service worker handles connection management
- Content script will be implemented in Phase 4

### Desktop Windows
- Overlay: 200x200px, transparent, frameless, always-on-top
- Dashboard: 1200x800px, standard window
- Overlay click-through enabled except when hovering over mascot
- Both windows use separate React apps

## iOS App
- Deferred to later phases (Thu's work)
- Will use SwiftUI + PencilKit as per spec

## Notes for Future Phases
- Icon assets needed for extension (16px, 48px, 128px)
- Mascot sprite sheet needed for overlay states
- Speech provider implementations (STT/TTS) needed for Phase 1
- Demo page scenarios needed for Phase 4
