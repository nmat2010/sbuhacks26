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
- Created provider interface with Gemini and Mock implementations
- Mock provider returns deterministic hints based on demo problem IDs
- Gemini provider stubbed for Phase 4 implementation (Tuan's work)
- DEMO_MODE=1 forces mock provider regardless of API key presence
- Using Gemini API instead of Claude per updated spec requirements

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

## Tablet/iPad Support: Web App Instead of Native iOS
- **Decision**: Use a React web app instead of a native iOS/SwiftUI app for tablet support
- **Rationale**:
  - Faster development for hackathon timeline (no App Store, no Xcode required)
  - Cross-platform: works on iPad, Android tablets, and any device with a browser
  - Code reuse: can share React components with desktop dashboard
  - HTML5 Canvas provides drawing capabilities (though not as advanced as PencilKit)
  - Web Speech API provides voice (browser-native, on-device)
  - Camera API via `<input capture>` allows photographing physical paper
  - WebSocket sync works the same way as native would
- **Trade-offs**:
  - ❌ No native Apple Pencil pressure sensitivity
  - ❌ No PencilKit's advanced features
  - ❌ Web app feel instead of native iOS feel
  - ✅ But core functionality preserved: drawing, stuck detection, hints, voice, camera, sync
- **Storage**: IndexedDB instead of SwiftData/Core Data
- **Implementation**: Thu's responsibility (Phases 10, 11, 12)

## Notes for Future Phases
- Icon assets needed for extension (16px, 48px, 128px)
- Mascot sprite sheet needed for overlay states
- Speech provider implementations (STT/TTS) needed for Phase 1
- Demo page scenarios needed for Phase 4
