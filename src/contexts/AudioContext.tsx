import { createContext, useContext } from 'react'
import type { AudioMap } from '@/services/audioService'

interface AudioContextValue {
  audioMap: AudioMap
  voiceId: string | null
}

const AudioContext = createContext<AudioContextValue>({
  audioMap: new Map(),
  voiceId: null,
})

export function AudioProvider({
  audioMap,
  voiceId,
  children,
}: AudioContextValue & { children: React.ReactNode }) {
  return (
    <AudioContext.Provider value={{ audioMap, voiceId }}>
      {children}
    </AudioContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudio(): AudioContextValue {
  return useContext(AudioContext)
}
