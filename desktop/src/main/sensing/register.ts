// Agent A (Sensing & Data) wires its modules here: session manager, monitor, rules, extension and
// LAN servers, streak, history IPC. main.ts calls this once after the DB and NudgeQueue are ready.
// Only register files may import `electron` or `../ipc.js`; logic modules get them injected.

export function registerSensing(): void {
  // A1..A10 add their start-up calls here.
}

/** Called on quit: close servers, stop pollers. */
export function unregisterSensing(): void {
  // A1..A10 add their shutdown calls here.
}
