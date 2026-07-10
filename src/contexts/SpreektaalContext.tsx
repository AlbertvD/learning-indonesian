import { createContext, useContext, useState, useEffect } from 'react'
import { getSpreektaalEnabled, setSpreektaalEnabled } from '@/lib/spreektaalPreferences'

interface SpreektaalContextValue {
  spreektaalEnabled: boolean
  setSpreektaalEnabled: (enabled: boolean) => void
}

const SpreektaalContext = createContext<SpreektaalContextValue>({
  spreektaalEnabled: true,
  setSpreektaalEnabled: () => {},
})

export function SpreektaalProvider({ children }: { children: React.ReactNode }) {
  const [spreektaalEnabled, setSpreektaalEnabledState] = useState<boolean>(() => getSpreektaalEnabled())

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'spreektaal_enabled') setSpreektaalEnabledState(e.newValue !== 'false')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setFromUi(enabled: boolean) {
    setSpreektaalEnabled(enabled)
    setSpreektaalEnabledState(enabled)
  }

  return (
    <SpreektaalContext.Provider value={{ spreektaalEnabled, setSpreektaalEnabled: setFromUi }}>
      {children}
    </SpreektaalContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpreektaal(): SpreektaalContextValue {
  return useContext(SpreektaalContext)
}
