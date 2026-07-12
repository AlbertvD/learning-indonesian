// src/components/OfflineBanner.tsx
//
// Slim, dismissible top banner shown while the browser reports offline
// (navigator.onLine / online/offline events via useOnlineStatus). Rendered
// once at the app-shell level (App.tsx), alongside PwaUpdatePrompt — visible
// regardless of route. Auto-hides the moment the browser reports back online;
// a fresh offline period re-arms the dismiss state so a later outage isn't
// silently suppressed by an earlier dismissal.
//
// No service-worker or caching changes — this is presentational only, a
// heads-up that in-flight writes won't save, not an offline-capable app.
import { useEffect, useState } from 'react'
import { IconWifiOff, IconX } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import classes from './OfflineBanner.module.css'

export function OfflineBanner() {
  const online = useOnlineStatus()
  const [dismissed, setDismissed] = useState(false)
  const T = useT()

  // Re-arm on reconnect so a later offline period shows the banner again.
  useEffect(() => {
    if (online) setDismissed(false)
  }, [online])

  if (online || dismissed) return null

  return (
    <div className={classes.banner} role="status">
      <span className={classes.message}>
        <IconWifiOff size={16} />
        {T.common.offline}
      </span>
      <button
        type="button"
        className={classes.dismiss}
        onClick={() => setDismissed(true)}
        aria-label={T.common.dismiss}
      >
        <IconX size={16} />
      </button>
    </div>
  )
}
