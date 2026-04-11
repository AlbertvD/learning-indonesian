import { Box, Text, Badge, Stack, Group, Code } from '@mantine/core'
import type { ExerciseVariant, ReviewComment } from '@/types/learning'

interface ExerciseSummaryCardProps {
  variant: ExerciseVariant
  comment?: ReviewComment
}

const KNOWN_TYPES = [
  'recognition_mcq', 'cued_recall', 'cloze_mcq', 'cloze', 'contrast_pair',
  'sentence_transformation', 'constrained_translation', 'meaning_recall',
  'typed_recall', 'speaking',
]

function renderSummary(variant: ExerciseVariant): { vraag: string; antwoord: string } {
  const p = variant.payload_json as Record<string, any>
  // NOTE: field names verified against live DB payload_json shapes.
  // If a field returns '—', check the actual payload key in Supabase Studio.
  switch (variant.exercise_type) {
    case 'recognition_mcq':
    case 'meaning_recall':
    case 'typed_recall':
      return {
        vraag: p.base_text ?? p.prompt ?? '—',
        antwoord: p.correctAnswer ?? (p.acceptableAnswers ?? [])[0] ?? '—',
      }
    case 'cued_recall':
      return {
        vraag: p.promptMeaningText ?? '—',
        antwoord: p.correctOptionId ?? '—',
      }
    case 'cloze_mcq':
      return {
        vraag: `${p.sentence ?? '—'}\nOpties: ${(p.options ?? []).join(' / ')}`,
        antwoord: p.correctOptionId ?? '—',
      }
    case 'cloze':
      return {
        vraag: p.sentence ?? p.source_text ?? '—',
        antwoord: p.targetWord ?? p.correct_answer ?? '—',
      }
    case 'contrast_pair':
      return {
        vraag: `${p.promptText ?? '—'}\nOpties: ${(p.options ?? []).join(' / ')}`,
        antwoord: `${p.correctOptionId ?? '—'}${p.targetMeaning ? ` — ${p.targetMeaning}` : ''}`,
      }
    case 'sentence_transformation':
      return {
        vraag: `${p.sourceSentence ?? '—'}\n${p.transformationInstruction ?? ''}`,
        antwoord: (p.acceptableAnswers ?? [])[0] ?? '—',
      }
    case 'constrained_translation':
      return {
        vraag: p.sourceLanguageSentence ?? '—',
        antwoord: p.targetSentenceWithBlank
          ? `[Cloze] ${(p.blankAcceptableAnswers ?? [])[0] ?? '—'}`
          : (p.acceptableAnswers ?? [])[0] ?? '—',
      }
    case 'speaking':
      return {
        vraag: p.promptText ?? '—',
        antwoord: '(zelf beoordelen)',
      }
    default:
      return { vraag: '—', antwoord: '—' }
  }
}

export function ExerciseSummaryCard({ variant, comment }: ExerciseSummaryCardProps) {
  const { vraag, antwoord } = renderSummary(variant)
  const isUnknown = !KNOWN_TYPES.includes(variant.exercise_type)

  return (
    <Box
      p="lg"
      style={{
        border: '2px solid var(--mantine-color-cyan-6)',
        borderRadius: 'var(--mantine-radius-md)',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Group justify="space-between" mb="md">
        <Badge variant="light" color="cyan" size="sm">{variant.exercise_type}</Badge>
        {comment && <Badge variant="light" color="orange" size="sm">💬 opmerking</Badge>}
      </Group>

      {isUnknown ? (
        <>
          <Badge color="red" mb="sm">Onbekend type</Badge>
          <Code block style={{ fontSize: '11px', maxHeight: 200, overflow: 'auto' }}>
            {JSON.stringify(variant.payload_json, null, 2)}
          </Code>
        </>
      ) : (
        <Stack gap="md">
          <Box>
            <Text size="xs" c="dimmed" mb={2}>Vraag</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{vraag}</Text>
          </Box>
          <Box
            p="sm"
            style={{
              background: 'light-dark(var(--mantine-color-green-0), var(--mantine-color-green-9))',
              borderRadius: 'var(--mantine-radius-sm)',
              borderLeft: '3px solid var(--mantine-color-green-5)',
            }}
          >
            <Text size="xs" c="dimmed" mb={2}>Antwoord</Text>
            <Text size="sm" fw={600} style={{ whiteSpace: 'pre-wrap' }}>{antwoord}</Text>
          </Box>
        </Stack>
      )}
    </Box>
  )
}
