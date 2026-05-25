// Compact vraag/antwoord summary for a typed grammar-exercise row. Used as
// VariantPreview's forward-safety fallback (PR 4a) — currently unreachable
// because every exercise_type in the ExerciseReviewRow union has a rich preview,
// but kept so a future grammar exercise_type degrades gracefully instead of
// rendering nothing.

import { Box, Text, Badge, Stack, Group } from '@mantine/core'
import type { ExerciseReviewRow, ReviewComment } from '@/types/learning'

interface ExerciseSummaryCardProps {
  row: ExerciseReviewRow
  comment?: ReviewComment
}

function renderSummary(row: ExerciseReviewRow): { vraag: string; antwoord: string } {
  switch (row.exercise_type) {
    case 'contrast_pair':
      return {
        vraag: `${row.prompt_text}\nOpties: ${(row.options ?? []).map(o => o.text).join(' / ')}`,
        antwoord: `${row.options.find(o => o.id === row.correct_option_id)?.text ?? row.correct_option_id}${row.target_meaning ? ` — ${row.target_meaning}` : ''}`,
      }
    case 'cloze_mcq':
      return {
        vraag: `${row.sentence}\nOpties: ${(row.options ?? []).join(' / ')}`,
        antwoord: row.correct_option_id,
      }
    case 'sentence_transformation':
      return {
        vraag: `${row.source_sentence}\n${row.transformation_instruction}`,
        antwoord: (row.acceptable_answers ?? [])[0] ?? '—',
      }
    case 'constrained_translation':
      return {
        vraag: row.source_language_sentence,
        antwoord: (row.acceptable_answers ?? [])[0] ?? '—',
      }
    default:
      return { vraag: '—', antwoord: '—' }
  }
}

export function ExerciseSummaryCard({ row, comment }: ExerciseSummaryCardProps) {
  const { vraag, antwoord } = renderSummary(row)

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
        <Badge variant="light" color="cyan" size="sm">{row.exercise_type}</Badge>
        {comment && <Badge variant="light" color="orange" size="sm">💬 opmerking</Badge>}
      </Group>

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
    </Box>
  )
}
