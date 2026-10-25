# Wolfie Sensei 🐺

An AI-powered study companion for Stony Brook University students. Wolfie Sensei helps you stay focused, tracks your study sessions, and provides smart hints when you get stuck.

Built for SBU Hacks 2026.

---

## Features

### 🎯 Smart Study Tracking
- **Session Monitoring**: Automatically tracks your study time and breaks
- **Brightspace Integration**: Syncs with your courses and assignments
- **Streak System**: Build study habits with daily streak tracking
- **Analytics**: Visualize your study patterns and progress

### 💬 AI Study Assistant
- **Push-to-Talk Voice**: Talk to Wolfie for help and guidance
- **Context-Aware Hints**: Get help based on what you're working on
- **Graduated Assistance**: From gentle nudges to detailed explanations

### 🎨 Retro Pixel Interface
- **Retro Dashboard**: Pixel-art themed UI inspired by classic games
- **Mascot Overlay**: Wolfie floats on your screen to keep you company
- **Browser Extension**: Monitors your browsing for distractions

### 🔒 Privacy-First
- **Local Data**: All your data stays on your computer
- **No Cloud Sync**: Everything is stored in a local SQLite database
- **Optional Features**: Choose which permissions to enable

---

## Quick Start

### Prerequisites
- **Node.js 18+** and **npm 9+**
- **macOS** (for system permissions)
- **Chrome** (for browser extension)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/sbuhacks26.git
cd sbuhacks26

# Install dependencies
npm install

# Build shared package
npm run build --workspace=shared
```

### Running the App

```bash
# Start the desktop app
npm run dev --workspace=desktop
```

The app will open with:
- **Dashboard**: Main interface for managing your study sessions
- **Overlay**: Floating Wolfie mascot on your screen

### Setting Up the Extension

1. Build the extension:
   ```bash
   npm run build --workspace=extension
   ```

2. Load in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/dist` folder

3. Pair with the desktop app:
   - Click the extension icon
   - Enter the pairing code shown in the onboarding

### Environment Setup

Create `desktop/.env`:

```bash
# Optional: For AI features
GEMINI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here

# Demo mode (uses mock data instead of real AI)
DEMO_MODE=0
```

---

## Project Structure

```
sbuhacks26/
├── desktop/              # Electron app
│   ├── electron/         # Main process
│   ├── src/
│   │   ├── main/        # Backend logic
│   │   └── renderer/
│   │       ├── dashboard/  # Main dashboard UI
│   │       └── overlay/    # Floating mascot
│   └── package.json
│
├── extension/           # Chrome extension
│   ├── src/
│   │   ├── background/  # Service worker
│   │   ├── content/     # Page monitoring
│   │   └── popup/       # Extension UI
│   └── manifest.json
│
├── shared/              # Shared code
│   └── src/
│       └── schemas/     # TypeScript schemas
│
└── design/              # Design assets
    └── sprites/         # Pixel art sprites
```

---

## How It Works

### 1. Onboarding Flow
First-time users go through a retro-themed setup:
- **Welcome**: Introduction to Wolfie
- **Extension**: Connect browser extension
- **Brightspace**: Sync your courses
- **Powers**: Enable overlay, screen recording, voice
- **Goals**: Set your study goals
- **Shields**: Configure distraction blockers

### 2. Study Sessions
- Start a session from the dashboard or overlay
- Wolfie monitors your activity (apps, websites)
- Tracks time spent on productive vs. distracting sites
- Builds your daily streak

### 3. Getting Help
- **Click Wolfie**: Open the chat interface
- **Push-to-Talk**: Hold the mic button to speak
- **Ask Questions**: Get hints and explanations
- **View Resources**: Access suggested study materials

### 4. Dashboard
Navigate between pages:
- **Dashboard**: Overview and quick stats
- **Reports**: Detailed session analytics
- **Strengths & Weaknesses**: Course performance insights
- **Brightspace**: View assignments and materials
- **Settings**: Configure permissions and preferences

---

## Development

### Tech Stack
- **Frontend**: React, TypeScript
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **AI**: Google Gemini, ElevenLabs
- **Extension**: Chrome MV3

### Key Commands

```bash
# Development
npm run dev --workspace=desktop    # Run desktop app
npm run build --workspace=shared   # Build shared package
npm run build --workspace=extension # Build extension

# Testing
npm test                           # Run all tests
npm test --workspace=desktop       # Test specific package
```

### Database

Local SQLite database stored at:
```
~/Library/Application Support/wolfie/data/wolfie.db
```

To reset:
```bash
rm -rf ~/Library/Application\ Support/wolfie
```

---

## Permissions

### macOS Permissions Required

**Overlay** (optional)
- **Permission**: Accessibility
- **Why**: Allows Wolfie to float above other apps

**Screen Recording** (optional)
- **Permission**: Screen Recording
- **Why**: Monitors which apps you're using

**Voice** (optional)
- **Permission**: Microphone
- **Why**: Enables push-to-talk voice assistant

All permissions can be enabled/disabled in Settings.

---

## Troubleshooting

### App won't start
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild shared package
npm run build --workspace=shared
```

### Extension not connecting
- Make sure the desktop app is running
- Check that you entered the correct pairing code
- Try regenerating the code in the onboarding

### Database errors
```bash
# Reset the database
rm ~/Library/Application\ Support/wolfie/data/wolfie.db
# Restart the app
```

### Voice not working
- Check microphone permissions in System Settings
- Enable "Voice" in the Powers screen during onboarding
- Make sure ELEVENLABS_API_KEY is set in `.env`

---

## Team

Built by Thu and Tuan for SBU Hacks 2026.

---

## License

MIT License - see LICENSE file for details
