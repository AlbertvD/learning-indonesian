const AUTOPLAY_KEY = 'autoplay_audio'

export function getAutoplayPreference(): boolean {
  return localStorage.getItem(AUTOPLAY_KEY) !== 'false' // default: true
}

export function setAutoplayPreference(enabled: boolean): void {
  localStorage.setItem(AUTOPLAY_KEY, String(enabled))
}
