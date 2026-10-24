# Scenario D: distraction warning (Phase 3)

A script for the live demo. Nothing here needs the network except the sites themselves.

## Setup
1. Start the desktop app (`npm run dev`) and make sure the overlay shows Wolfie.
2. Load the extension (`npm run build:extension`, then "Load unpacked" on `extension/dist`) and paste the pairing code from Wolfie's settings into the extension popup. The popup should say it is connected.
3. Start a session from Wolfie's menu: right-click Wolfie, "Start Session".

## Steps
1. Work for a moment: open `http://localhost:5174/algebra.html` in Chrome. Wolfie stays quiet.
2. Open a new tab and go to `youtube.com`. Within about 3 seconds a warm bubble appears with three buttons: "Taking a break", "I need this for the task", "Ignore for this session".
3. Press "Taking a break". The bubble closes. Nothing more is said about YouTube for 10 minutes (the per-rule cooldown).
4. Switch back to the algebra tab, then to `claude.ai`. A different message appears for AI tools, because that list is separate.
5. Press "Ignore for this session". Switch away and back to `claude.ai`: no further warning this session.
6. Stop the session ("Stop Session"), open `youtube.com` again: nothing happens, because nothing is monitored outside a session.

## Voice mode (optional)
With voice on, the same warning is spoken. Say "taking a break", "I need this", or "ignore" to answer it.

## Without the extension
Disconnect the extension (or pause it in its popup). Opening YouTube in Chrome still warns within about 5 seconds, matched by the window title ("... - YouTube") instead of the domain.

## What to check afterwards
In the dashboard History (or the SQLite file), each warning is a row in `nudges` with your answer in `user_response`, and `events` has `nudge.shown`, `nudge.answered` and `rule.response`.
