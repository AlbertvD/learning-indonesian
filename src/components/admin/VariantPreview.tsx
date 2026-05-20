// Admin-only preview of an ExerciseVariant from its raw payload_json. Renders
// rich question + answer-revealed cards for the 4 types where the visual
// shape carries meaning the admin needs to eyeball (cloze_mcq, contrast_pair,
// sentence_transformation, constrained_translation). All other types fall
// through to ExerciseSummaryCard.
//
// Independent of the runtime registry — ContentReview consumes payload_json
// directly without going through capability resolution.

import { Box, Button, Divider, Stack, Text, TextInput, Group, Badge } from '@mantine/core'
import type { ExerciseVariant, ReviewComment } from '@/types/learning'
import { ExerciseSummaryCard } from './ExerciseSummaryCard'

interface VariantPreviewProps {
  variant: ExerciseVariant
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

function PreviewFrame({ variant, comment, children }: {
  variant: ExerciseVariant
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
        <Badge variant="light" color="cyan" size="sm">{variant.exercise_type}</Badge>
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

function ClozeMcqPreview({ variant, comment }: VariantPreviewProps) {
  const p = variant.payload_json as Record<string, any>
  const options = (p.options ?? []) as string[]
  const parts = String(p.sentence ?? '').split('___')
  const correct = String(p.correctOptionId ?? '')

  return (
    <PreviewFrame variant={variant} comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Vul het ontbrekende woord in</Text>
          {p.translation && (
            <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{p.translation}</Text>
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

function ContrastPairPreview({ variant, comment }: VariantPreviewProps) {
  const p = variant.payload_json as Record<string, any>
  const options = (p.options ?? []) as Array<{ id: string; text: string }>
  const correct = String(p.correctOptionId ?? '')

  return (
    <PreviewFrame variant={variant} comment={comment}>
      <Stack gap="xl">
        <Text size="sm" c="dimmed">{p.promptText ?? ''}</Text>
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
        {p.targetMeaning && (
          <Text size="sm" c="dimmed">Betekenis: {p.targetMeaning}</Text>
        )}
        {p.explanationText && <ExplanationCard text={p.explanationText} />}
      </Stack>
    </PreviewFrame>
  )
}

function SentenceTransformationPreview({ variant, comment }: VariantPreviewProps) {
  const p = variant.payload_json as Record<string, any>
  const acceptableAnswers = (p.acceptableAnswers ?? []) as string[]

  return (
    <PreviewFrame variant={variant} comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Vorm de zin: {p.transformationInstruction ?? ''}</Text>
          <Box style={SENTENCE_STYLE}>{p.sourceSentence ?? ''}</Box>
        </Stack>
        <TextInput placeholder="Typ je antwoord" size="md" disabled value="" readOnly />

        <Divider label="Antwoord" labelPosition="center" />

        <Box>
          <Text size="xl" fw={700} c="green">{acceptableAnswers[0] ?? '—'}</Text>
          {acceptableAnswers.length > 1 && (
            <Text size="xs" c="dimmed" mt="xs">ook: {acceptableAnswers.slice(1).join(', ')}</Text>
          )}
        </Box>
        {p.explanationText && <ExplanationCard text={p.explanationText} />}
      </Stack>
    </PreviewFrame>
  )
}

function ConstrainedTranslationPreview({ variant, comment }: VariantPreviewProps) {
  const p = variant.payload_json as Record<string, any>
  const isClozeMode = !!p.targetSentenceWithBlank && Array.isArray(p.blankAcceptableAnswers) && p.blankAcceptableAnswers.length > 0

  if (isClozeMode) {
    const parts = String(p.targetSentenceWithBlank ?? '').split('___')
    const blankAnswers = (p.blankAcceptableAnswers ?? []) as string[]
    return (
      <PreviewFrame variant={variant} comment={comment}>
        <Stack gap="xl">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Vul het juiste woord in</Text>
            <Box style={SENTENCE_STYLE}>
              {parts[0]}
              <Box component="span" style={{ ...BLANK_STYLE, color: 'transparent' }}>_</Box>
              {parts[1] ?? ''}
            </Box>
            {p.sourceLanguageSentence && (
              <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{p.sourceLanguageSentence}</Text>
            )}
          </Stack>

          <Divider label="Antwoord" labelPosition="center" />

          <Box style={SENTENCE_STYLE}>
            {parts[0]}
            <Box component="span" style={{ ...BLANK_STYLE, color: 'var(--mantine-color-green-6)' }}>{blankAnswers[0] ?? '—'}</Box>
            {parts[1] ?? ''}
          </Box>
          {blankAnswers.length > 1 && (
            <Text size="xs" c="dimmed">ook: {blankAnswers.slice(1).join(', ')}</Text>
          )}
          {p.explanationText && <ExplanationCard text={p.explanationText} />}
        </Stack>
      </PreviewFrame>
    )
  }

  const acceptableAnswers = (p.acceptableAnswers ?? []) as string[]
  const sourceSentence = String(p.sourceLanguageSentence ?? '')
  const isWord = !sourceSentence.includes(' ')
  return (
    <PreviewFrame variant={variant} comment={comment}>
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">{isWord ? 'Vertaal het woord' : 'Vertaal de zin'}</Text>
          <Box style={SENTENCE_STYLE}>{sourceSentence}</Box>
        </Stack>
        <TextInput placeholder="Typ je antwoord" size="md" disabled value="" readOnly />

        <Divider label="Antwoord" labelPosition="center" />

        <Box>
          <Text size="xl" fw={700} c="green">{acceptableAnswers[0] ?? '—'}</Text>
          {acceptableAnswers.length > 1 && (
            <Text size="xs" c="dimmed" mt="xs">ook: {acceptableAnswers.slice(1).join(', ')}</Text>
          )}
        </Box>
        {p.explanationText && <ExplanationCard text={p.explanationText} />}
      </Stack>
    </PreviewFrame>
  )
}

export function VariantPreview({ variant, comment }: VariantPreviewProps) {
  switch (variant.exercise_type) {
    case 'cloze_mcq':
      return <ClozeMcqPreview variant={variant} comment={comment} />
    case 'contrast_pair':
      return <ContrastPairPreview variant={variant} comment={comment} />
    case 'sentence_transformation':
      return <SentenceTransformationPreview variant={variant} comment={comment} />
    case 'constrained_translation':
      return <ConstrainedTranslationPreview variant={variant} comment={comment} />
    default:
      return <ExerciseSummaryCard variant={variant} comment={comment} />
  }
}
