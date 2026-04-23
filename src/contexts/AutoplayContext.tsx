import { createContext, useContext, useState, useEffect } from 'react'
import { getAutoplayPreference, setAutoplayPreference } from '@/lib/audioPreferences'

interface AutoplayContextValue {
  autoPlay: boolean
  setAutoPlay: (enabled: boolean) => void
}

const AutoplayContext = createContext<AutoplayContextValue>({
  autoPlay: true,
  setAutoPlay: () => {},
})

export function AutoplayProvider({ children }: { children: React.ReactNode }) {
  const [autoPlay, setAutoPlayState] = useState<boolean>(() => getAutoplayPreference())

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'autoplay_audio') {
        setAutoPlayState(e.newValue !== 'false')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setAutoPlay(enabled: boolean) {
    setAutoplayPreference(enabled)
    setAutoPlayState(enabled)
  }

  return (
    <AutoplayContext.Provider value={{ autoPlay, setAutoPlay }}>
      {children}
    </AutoplayContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAutoplay(): AutoplayContextValue {
  return useContext(AutoplayContext)
}
