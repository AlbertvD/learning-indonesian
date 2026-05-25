// Admin-only preview of a typed grammar-exercise row. Renders rich question +
// answer-revealed cards for the 4 grammar exercise types (cloze_mcq,
// contrast_pair, sentence_transformation, constrained_translation), reading
// typed columns directly off the ExerciseReviewRow discriminated union (PR 4a —
// replaces the retired exercise_variants.payload_json probing).
//
// Independent of the runtime registry — ContentReview consumes the typed rows
// directly without going through capability resolution.

import { Box, Button, Divider, Stack, Text, TextInput, Group, Badge } from '@mantine/core'
import type {
  ExerciseReviewRow,
  ClozeMcqExercisesRow,
  ContrastPairExercisesRow,
  SentenceTransformationExercisesRow,
  ConstrainedTranslationExercisesRow,
  ReviewComment,
} from '@/types/learning'
import { ExerciseSummaryCard } from './ExerciseSummaryCard'

interface VariantPreviewProps {
  row: ExerciseReviewRow
  comment?: ReviewComment
}

const BLANK_STYLE = {
  display: 'inline-block',
  minWidth: 80,
  borderBottom: '2px solid var(--mantine-color-cyan-6)',
  margin: '0 4px',
  verticalAlign: 'bottom',
  textAlign: 'center' as const,
}

const SENTENCE_STYLE = { fontSize: '1.1rem', lineHeight: 1.6, fontWeight: 500 }

function PreviewFrame({ exerciseType, comment, children }: {
  exerciseType: string
  comment?: ReviewComment
  children: React.ReactNode
}) {
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
        <Badge variant="light" color="cyan" size="sm">{exerciseType}</Badge>
        {comment && <Badge variant="light" color="orange" size="sm">💬 opmerking</Badge>}
      </Group>
      {children}
    </Box>
  )
}

function ExplanationCard({ text }: { text: string }) {
  return (
    <Box
      p="md"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-sm)',
        background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
      }}
    >
      <Text size="sm">{text}</Text>
    </Box>
  )
}

function ClozeMcqPreview({ row, comment }: { row: ClozeMcqExercisesRow; comment?: ReviewComment }) {
  const options = row.options ?? []
  const parts = String(row.sentence ?? '').split('___')
  // correct_option_id for cloze_mcq is the option text itself (options is string[]).
  const correct = row.correct_option_id

  return (
    <PreviewFrame exerciseType="cloze_mcq" comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Vul het ontbrekende woord in</Text>
          {row.translation && (
            <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{row.translation}</Text>
          )}
          <Box style={SENTENCE_STYLE}>
            {parts[0]}
            <Box component="span" style={{ ...BLANK_STYLE, color: 'transparent' }}>_</Box>
            {parts[1] ?? ''}
          </Box>
        </Stack>
        <Stack gap="xs">
          {options.map(option => (
            <Button key={option} variant="light" size="md" fullWidth disabled>{option}</Button>
          ))}
        </Stack>

        <Divider label="Antwoord" labelPosition="center" />

        <Box style={SENTENCE_STYLE}>
          {parts[0]}
          <Box component="span" style={{ ...BLANK_STYLE, color: 'var(--mantine-color-green-6)' }}>{correct}</Box>
          {parts[1] ?? ''}
        </Box>
        <Stack gap="xs">
          {options.map(option => (
            <Button
              key={option}
              variant={option === correct ? 'filled' : 'light'}
              color={option === correct ? 'green' : undefined}
              size="md"
              fullWidth
              disabled
            >
              {option}
            </Button>
          ))}
        </Stack>
      </Stack>
    </PreviewFrame>
  )
}

function ContrastPairPreview({ row, comment }: { row: ContrastPairExercisesRow; comment?: ReviewComment }) {
  const options = row.options ?? []
  // correct_option_id for contrast_pair is the option id (options is [{id, text}]).
  const correct = row.correct_option_id

  return (
    <PreviewFrame exerciseType="contrast_pair" comment={comment}>
      <Stack gap="xl">
        <Text size="sm" c="dimmed">{row.prompt_text}</Text>
        <Stack gap="xs">
          {options.map(option => (
            <Button key={option.id} variant="light" size="md" fullWidth disabled>{option.text}</Button>
          ))}
        </Stack>

        <Divider label="Antwoord" labelPosition="center" />

        <Stack gap="xs">
          {options.map(option => (
            <Button
              key={option.id}
              variant={option.id === correct ? 'filled' : 'light'}
              color={option.id === correct ? 'green' : undefined}
              size="md"
              fullWidth
              disabled
            >
              {option.text}
            </Button>
          ))}
        </Stack>
        {row.target_meaning && (
          <Text size="sm" c="dimmed">Betekenis: {row.target_meaning}</Text>
        )}
        {row.explanation_text && <ExplanationCard text={row.explanation_text} />}
      </Stack>
    </PreviewFrame>
  )
}

function SentenceTransformationPreview({ row, comment }: { row: SentenceTransformationExercisesRow; comment?: ReviewComment }) {
  const acceptableAnswers = row.acceptable_answers ?? []

  return (
    <PreviewFrame exerciseType="sentence_transformation" comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Vorm de zin: {row.transformation_instruction}</Text>
          <Box style={SENTENCE_STYLE}>{row.source_sentence}</Box>
          {row.hint_text && (
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Hint: {row.hint_text}</Text>
          )}
        </Stack>
        <TextInput placeholder="Typ je antwoord" size="md" disabled value="" readOnly />

        <Divider label="Antwoord" labelPosition="center" />

        <Box>
          <Text size="xl" fw={700} c="green">{acceptableAnswers[0] ?? '—'}</Text>
          {acceptableAnswers.length > 1 && (
            <Text size="xs" c="dimmed" mt="xs">ook: {acceptableAnswers.slice(1).join(', ')}</Text>
          )}
        </Box>
        {row.explanation_text && <ExplanationCard text={row.explanation_text} />}
      </Stack>
    </PreviewFrame>
  )
}

function ConstrainedTranslationPreview({ row, comment }: { row: ConstrainedTranslationExercisesRow; comment?: ReviewComment }) {
  const acceptableAnswers = row.acceptable_answers ?? []
  const sourceSentence = String(row.source_language_sentence ?? '')
  const isWord = !sourceSentence.includes(' ')

  return (
    <PreviewFrame exerciseType="constrained_translation" comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">{isWord ? 'Vertaal het woord' : 'Vertaal de zin'}</Text>
          <Box style={SENTENCE_STYLE}>{sourceSentence}</Box>
          {row.required_target_pattern && (
            <Text size="xs" c="dimmed">Gebruik: {row.required_target_pattern}</Text>
          )}
        </Stack>
        <TextInput placeholder="Typ je antwoord" size="md" disabled value="" readOnly />

        <Divider label="Antwoord" labelPosition="center" />

        <Box>
          <Text size="xl" fw={700} c="green">{acceptableAnswers[0] ?? '—'}</Text>
          {acceptableAnswers.length > 1 && (
            <Text size="xs" c="dimmed" mt="xs">ook: {acceptableAnswers.slice(1).join(', ')}</Text>
          )}
        </Box>
        {row.disallowed_shortcut_forms && row.disallowed_shortcut_forms.length > 0 && (
          <Text size="xs" c="dimmed">Niet toegestaan: {row.disallowed_shortcut_forms.join(', ')}</Text>
        )}
        {row.explanation_text && <ExplanationCard text={row.explanation_text} />}
      </Stack>
    </PreviewFrame>
  )
}

export function VariantPreview({ row, comment }: VariantPreviewProps) {
  switch (row.exercise_type) {
    case 'cloze_mcq':
      return <ClozeMcqPreview row={row} comment={comment} />
    case 'contrast_pair':
      return <ContrastPairPreview row={row} comment={comment} />
    case 'sentence_transformation':
      return <SentenceTransformationPreview row={row} comment={comment} />
    case 'constrained_translation':
      return <ConstrainedTranslationPreview row={row} comment={comment} />
    default:
      // Forward-safety guard: a 5th grammar exercise_type added to ExerciseReviewRow
      // without a rich preview here falls back to the compact summary card. Currently
      // unreachable — the union is exhaustive over the 4 typed tables.
      return <ExerciseSummaryCard row={row} comment={comment} />
  }
}
