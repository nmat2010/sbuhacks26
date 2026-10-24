// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

export function registerIntelligence(): void {
  // B1..B8 add their start-up calls here.
}

/** Called on quit. */
export function unregisterIntelligence(): void {
  // B1..B8 add their shutdown calls here.
}
