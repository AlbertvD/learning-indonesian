// src/lib/spreektaalPreferences.ts
// localStorage-backed user preference for informal-register ("spreektaal")
// vocabulary — the register-pair core (nggak/udah/aja/... anchored to the
// lesson that teaches the formal twin, docs/plans/2026-07-09-spreektaal-
// lesson-woven-core.md). Disabling removes every capability anchored to a
// register='informal' learning_items row from sessions.

const KEY = 'spreektaal_enabled'

export function getSpreektaalEnabled(): boolean {
  const v = localStorage.getItem(KEY)
  return v !== 'false'  // default true
}

export function setSpreektaalEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'true' : 'false')
}
