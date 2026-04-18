import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { AudioProvider } from '@/contexts/AudioContext'
import { ListeningMCQ } from '@/components/exercises/ListeningMCQ'
import type { ExerciseItem } from '@/types/learning'
import type { AudioMap } from '@/services/audioService'

function wrap(ui: React.ReactElement, audioMap: AudioMap = new Map(), voiceId: string | null = 'voice-1') {
  return render(
    <MantineProvider>
      <AudioProvider audioMap={audioMap} voiceId={voiceId}>
        {ui}
      </AudioProvider>
    </MantineProvider>
  )
}

const baseExercise: ExerciseItem = {
  learningItem: {
    id: 'i1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
    language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, pos: 'verb',
    created_at: '', updated_at: '',
  },
  meanings: [{
    id: 'm1', learning_item_id: 'i1', translation_language: 'nl',
    translation_text: 'eten', is_primary: true, sense_label: null, usage_note: null,
  }],
  distractors: ['drinken', 'lopen', 'slapen'],
  contexts: [],
  answerVariants: [],
  skillType: 'recognition',
  exerciseType: 'listening_mcq',
}

describe('ListeningMCQ', () => {
  it('renders the listen instruction when audio is available', () => {
    // Pass a full audioMap so the "audio not available" branch doesn't fire.
    const audioMap: AudioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    // Autoplay will reject (jsdom has no real audio) → overlay shows.
    // Either way, the 4 Dutch options do not render the Indonesian text inline.
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    expect(screen.queryByText('makan')).toBeNull()
  })

  it('renders error state when no audio URL available', async () => {
    // No audioMap entry for the item → audioUrl undefined → error path.
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, new Map())
    expect(screen.getByText(/niet beschikbaar/i)).toBeInTheDocument()
  })

  it('autoplay rejection path: renders Tap to play overlay', async () => {
    // In jsdom, HTMLAudioElement.play returns a Promise that rejects by default
    // (no actual audio subsystem). Assert the overlay renders.
    const audioMap: AudioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    await waitFor(() => {
      expect(screen.getByText(/klik om af te spelen/i)).toBeInTheDocument()
    })
  })
})
