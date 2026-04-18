// src/lib/listeningPreferences.ts
// localStorage-backed user preference for audio-prompt exercise types
// (listening_mcq, dictation). Disabling removes all audio-prompt exercises
// from sessions — accessibility opt-out for hard-of-hearing learners.

const KEY = 'listening_enabled'

export function getListeningEnabled(): boolean {
  const v = localStorage.getItem(KEY)
  return v !== 'false'  // default true
}

export function setListeningEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'true' : 'false')
}
