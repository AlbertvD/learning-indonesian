// PwaUpdatePrompt — makes deploys visible on devices.
//
// registerType: 'prompt' means the new service worker WAITS until the user
// opts in, instead of silently activating on some later visit (which made
// every deploy invisible until a lucky reload — 2026-07-02/03 owner friction).
// When an update is waiting we show a persistent notification with a refresh
// button; tapping it tells the waiting SW to SKIP_WAITING (the generateSW
// script ships that message listener) and reloads on controllerchange.
//
// Registration is HAND-ROLLED against the standard SW API rather than
// workbox-window/virtual:pwa-register: in headless verification the
// workbox-window-registered registration ended up in a corrupt state
// (`update()` → InvalidStateError "script (Unknown)") after which Chromium
// never detected byte-changed sw.js again — plain register() detected the
// same update reliably (2026-07-03, see PR).

import { useEffect } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'

// Ask the browser to re-check sw.js periodically so a long-lived open app
// also learns about deploys, not just fresh launches.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

function promptFor(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting
  if (!waiting) return
  // Read the language at fire time — the profile may have loaded (or
  // changed) long after registration.
  const language = useAuthStore.getState().profile?.language ?? 'nl'
  const t = translations[language].pwa
  notifications.show({
    id: 'pwa-update',
    autoClose: false,
    withCloseButton: true,
    title: t.updateTitle,
    message: (
      <Button
        size="xs"
        mt={4}
        onClick={() => {
          // Reload exactly once, when the new SW takes control.
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => { window.location.reload() },
            { once: true },
          )
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
      >
        {t.updateButton}
      </Button>
    ),
  })
}

export function PwaUpdatePrompt() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return
    let interval: number | undefined
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Update already waiting from a previous visit.
        if (registration.waiting) promptFor(registration)
        // Update found during this visit.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          installing?.addEventListener('statechange', () => {
            // 'installed' with an existing controller = a NEW version is
            // waiting (first-ever install has no controller — no prompt).
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              promptFor(registration)
            }
          })
        })
        interval = window.setInterval(() => {
          registration.update().catch(() => { /* transient — retry next tick */ })
        }, UPDATE_CHECK_INTERVAL_MS)
      })
      .catch(() => { /* SW unsupported/blocked — app works without it */ })
    return () => { if (interval !== undefined) window.clearInterval(interval) }
  }, [])

  return null
}
