import { createContext, useContext, useState, useEffect } from 'react'
import { getListeningEnabled, setListeningEnabled } from '@/lib/listeningPreferences'

interface ListeningContextValue {
  listeningEnabled: boolean
  setListeningEnabled: (enabled: boolean) => void
}

const ListeningContext = createContext<ListeningContextValue>({
  listeningEnabled: true,
  setListeningEnabled: () => {},
})

export function ListeningProvider({ children }: { children: React.ReactNode }) {
  const [listeningEnabled, setListeningEnabledState] = useState<boolean>(() => getListeningEnabled())

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'listening_enabled') setListeningEnabledState(e.newValue !== 'false')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setFromUi(enabled: boolean) {
    setListeningEnabled(enabled)
    setListeningEnabledState(enabled)
  }

  return (
    <ListeningContext.Provider value={{ listeningEnabled, setListeningEnabled: setFromUi }}>
      {children}
    </ListeningContext.Provider>
  )
}

export function useListening(): ListeningContextValue {
  return useContext(ListeningContext)
}
