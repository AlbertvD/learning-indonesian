import { createContext, useContext } from 'react'
import type { SessionAudioMap } from '@/services/audioService'

interface SessionAudioContextValue {
  audioMap: SessionAudioMap
}

const SessionAudioContext = createContext<SessionAudioContextValue>({
  audioMap: new Map(),
})

export function SessionAudioProvider({
  audioMap,
  children,
}: SessionAudioContextValue & { children: React.ReactNode }) {
  return (
    <SessionAudioContext.Provider value={{ audioMap }}>
      {children}
    </SessionAudioContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionAudio(): SessionAudioContextValue {
  return useContext(SessionAudioContext)
}
