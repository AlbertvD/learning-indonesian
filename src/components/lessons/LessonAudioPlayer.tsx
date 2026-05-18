import { Paper } from '@mantine/core'

// Lesson-level audio player. Minimal — just the native <audio> control, no
// title row, no voice attribution. The bespoke page composes its own frame.
//
// `voice` is accepted but unused (kept on the prop surface so callers passing
// it from the data fetcher don't need to change if we ever want it back —
// for cache keys, analytics, etc.).
export function LessonAudioPlayer({ src }: { src: string; voice?: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <audio
        controls
        preload="none"
        src={src}
        style={{ width: '100%', display: 'block' }}
        data-testid="lesson-audio-player"
      />
    </Paper>
  )
}
