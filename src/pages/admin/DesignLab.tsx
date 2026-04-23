// src/pages/admin/DesignLab.tsx
// Admin-only visual QA surface. Renders every primitive in every state for
// design review. Permanent tool — not deleted after migration.
// See docs/plans/2026-04-23-exercise-framework-design.md §9

import { useState } from 'react'
import { Container, Title, Stack, Group, SegmentedControl, Box, Text, Divider } from '@mantine/core'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOption,
  ExerciseOptionGroup,
  ExerciseTextInput,
  ExerciseSubmitButton,
  LanguagePill,
  ExerciseFeedback,
  ExerciseAudioButton,
  ExerciseHint,
  type OptionState,
  type InputState,
  type PromptCardVariant,
  type FeedbackCopy,
} from '@/components/exercises/primitives'
import { AdminGuard } from './AdminGuard'
import classes from './DesignLab.module.css'

const FEEDBACK_COPY_NL: FeedbackCopy = {
  outcomeCorrect:     'Correct',
  outcomeAlmost:      'Bijna goed',
  outcomeWrong:       'Fout',
  announceCorrect:    'Correct',
  announceWrong:      'Fout. Het juiste antwoord is {x}.',
  announceFuzzy:      'Bijna goed — het antwoord is {x}.',
  roleLabelHeard:     'Je hoorde',
  roleLabelShown:     'Je zag',
  roleLabelSaid:      'Het woord was',
  roleLabelTarget:    'Juist antwoord',
  roleLabelYourAnswer:'Jouw antwoord',
  roleLabelMeaning:   'Betekent',
  roleLabelExplanation:'Uitleg',
  alsoAccepted:       'Ook goed',
  replayAudio:        'Herhaal audio',
  commitFailed:       'Kon beoordeling niet opslaan — we gaan toch door.',
  emptyAnswer:        '(geen antwoord)',
}

const OPTION_STATES: OptionState[] = ['idle', 'focused', 'disabled', 'correct', 'wrong', 'answer']
const INPUT_STATES: InputState[] = ['idle', 'correct', 'wrong', 'fuzzy', 'disabled']
const PROMPT_VARIANTS: PromptCardVariant[] = ['word', 'sentence', 'audio', 'transform', 'pair']

export function DesignLab() {
  return (
    <AdminGuard>
      <Container size="lg" py="xl" className={classes.root}>
        <Title order={1} mb="md">Design lab</Title>
        <Text c="dimmed" mb="xl">
          Visual QA surface for exercise primitives. Renders every primitive in every state.
        </Text>

        <Stack gap={48}>
          <TokensSection />
          <InstructionSection />
          <PromptCardSection />
          <OptionSection />
          <OptionGroupSection />
          <TextInputSection />
          <SubmitButtonSection />
          <LanguagePillSection />
          <HintSection />
          <AudioButtonSection />
          <FeedbackSection />
          <FlagButtonSection />
        </Stack>
      </Container>
    </AdminGuard>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Title order={2} mb="md">{title}</Title>
      {children}
    </Box>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className={classes.cell}>
      <Text size="xs" c="dimmed" mb={6}>{label}</Text>
      {children}
    </Box>
  )
}

// ─── Token specimen ──────────────────────────────────────────────────────────

function TokensSection() {
  const sizes: { name: string; varName: string }[] = [
    { name: 'xs',   varName: '--fs-xs' },
    { name: 'sm',   varName: '--fs-sm' },
    { name: 'md',   varName: '--fs-md' },
    { name: 'lg',   varName: '--fs-lg' },
    { name: 'xl',   varName: '--fs-xl' },
    { name: '2xl',  varName: '--fs-2xl' },
    { name: '3xl',  varName: '--fs-3xl' },
    { name: '4xl',  varName: '--fs-4xl' },
  ]
  return (
    <Section title="Tokens">
      <Stack gap="xs">
        {sizes.map(s => (
          <Group key={s.name} align="baseline" gap="md">
            <Text size="xs" c="dimmed" style={{ width: 60 }}>{s.name} · {s.varName}</Text>
            <Text style={{ fontSize: `var(${s.varName})` }}>rumah — huis — ik ga naar huis</Text>
          </Group>
        ))}
      </Stack>
    </Section>
  )
}

// ─── Per-primitive sections ──────────────────────────────────────────────────

function InstructionSection() {
  return (
    <Section title="ExerciseInstruction">
      <ExerciseFrame variant="preview">
        <ExerciseInstruction>Wat betekent dit woord?</ExerciseInstruction>
      </ExerciseFrame>
    </Section>
  )
}

function PromptCardSection() {
  return (
    <Section title="ExercisePromptCard — 5 variants">
      <Stack gap="md">
        {PROMPT_VARIANTS.map(v => (
          <Cell key={v} label={`variant="${v}"`}>
            <ExerciseFrame variant="preview">
              <ExercisePromptCard
                variant={v}
                constraint={v === 'transform' ? 'gebruik verleden tijd' : undefined}
                meta={v === 'sentence' ? 'Saya pergi ke sekolah' : undefined}
              >
                {renderPromptDemo(v)}
              </ExercisePromptCard>
            </ExerciseFrame>
          </Cell>
        ))}
      </Stack>
    </Section>
  )
}

function renderPromptDemo(v: PromptCardVariant) {
  switch (v) {
    case 'word':      return 'rumah'
    case 'sentence':  return 'Saya sedang belajar bahasa Indonesia.'
    case 'audio':     return <ExerciseAudioButton variant="primary" audioUrl="" aria-label="Speel audio af" />
    case 'transform': return 'Saya pergi ke pasar.'
    case 'pair':      return <span>murah<span style={{ margin: '0 24px', color: 'var(--ex-fg-muted)', fontWeight: 300 }}>│</span>mahal</span>
  }
}

function OptionSection() {
  return (
    <Section title="ExerciseOption — 6 states × 2 variants">
      <Box className={classes.matrix}>
        <Box />
        {OPTION_STATES.map(s => <Text key={s} size="xs" c="dimmed" ta="center">{s}</Text>)}
        <Text size="xs" c="dimmed">word</Text>
        {OPTION_STATES.map(s => (
          <ExerciseOption key={`w-${s}`} state={s} variant="word" onClick={() => {}}>
            rumah
          </ExerciseOption>
        ))}
        <Text size="xs" c="dimmed">sentence</Text>
        {OPTION_STATES.map(s => (
          <ExerciseOption key={`s-${s}`} state={s} variant="sentence" onClick={() => {}}>
            Saya pergi ke sekolah setiap hari.
          </ExerciseOption>
        ))}
      </Box>
    </Section>
  )
}

function OptionGroupSection() {
  return (
    <Section title="ExerciseOptionGroup">
      <ExerciseFrame variant="preview">
        <ExerciseInstruction>Kies de juiste vertaling</ExerciseInstruction>
        <ExerciseOptionGroup>
          {['huis', 'auto', 'boek', 'vriend'].map(opt => (
            <ExerciseOption key={opt} state="idle" variant="word" onClick={() => {}}>
              {opt}
            </ExerciseOption>
          ))}
        </ExerciseOptionGroup>
      </ExerciseFrame>
    </Section>
  )
}

function TextInputSection() {
  const [value, setValue] = useState('')
  return (
    <Section title="ExerciseTextInput — 5 states">
      <Stack gap="md">
        {INPUT_STATES.map(s => (
          <Cell key={s} label={`state="${s}"`}>
            <ExerciseTextInput
              label="Antwoord"
              value={s === 'idle' || s === 'disabled' ? value : 'tujuh'}
              onChange={setValue}
              state={s}
              placeholder="Typ je antwoord..."
              autoFocus={false}
            />
          </Cell>
        ))}
        <Cell label="inline (cloze mode)">
          <Text style={{ fontSize: 'var(--fs-xl)', lineHeight: 1.6 }}>
            Saya makan{' '}
            <ExerciseTextInput
              label="Vul in"
              value=""
              onChange={() => {}}
              inline
              hintedAnswerLength={4}
              autoFocus={false}
            />
            {' '}di rumah.
          </Text>
        </Cell>
      </Stack>
    </Section>
  )
}

function SubmitButtonSection() {
  return (
    <Section title="ExerciseSubmitButton">
      <ExerciseFrame
        variant="preview"
        footer={<ExerciseSubmitButton onClick={() => {}}>Doorgaan</ExerciseSubmitButton>}
      >
        <Text c="dimmed" size="sm">Submit button always lives in <code>&lt;ExerciseFrame footer&gt;</code>.</Text>
      </ExerciseFrame>
    </Section>
  )
}

function LanguagePillSection() {
  return (
    <Section title="LanguagePill">
      <Group>
        <LanguagePill lang="ID" />
        <LanguagePill lang="NL" />
        <LanguagePill lang="EN" />
      </Group>
    </Section>
  )
}

function HintSection() {
  return (
    <Section title="ExerciseHint">
      <Stack gap="md">
        <Cell label="defaultRevealed (default)">
          <ExerciseHint>De zin moet in de verleden tijd staan.</ExerciseHint>
        </Cell>
        <Cell label="collapsed (defaultRevealed=false)">
          <ExerciseHint defaultRevealed={false}>De zin moet in de verleden tijd staan.</ExerciseHint>
        </Cell>
      </Stack>
    </Section>
  )
}

function AudioButtonSection() {
  return (
    <Section title="ExerciseAudioButton">
      <Group>
        <Cell label="variant=primary (56×56)">
          <ExerciseAudioButton variant="primary" audioUrl="" aria-label="Primary audio" />
        </Cell>
        <Cell label="variant=decorative (36×36)">
          <ExerciseAudioButton variant="decorative" audioUrl="" aria-label="Decorative audio" />
        </Cell>
      </Group>
    </Section>
  )
}

function FeedbackSection() {
  const [outcome, setOutcome] = useState<'correct' | 'fuzzy' | 'wrong'>('wrong')
  return (
    <Section title="ExerciseFeedback">
      <SegmentedControl
        value={outcome}
        onChange={v => setOutcome(v as typeof outcome)}
        data={['correct', 'fuzzy', 'wrong']}
        mb="md"
      />
      <Divider my="md" label="vocab-pair · L1→ID" />
      <ExerciseFrame variant="preview">
        <ExerciseFeedback
          outcome={outcome}
          layout="vocab-pair"
          direction="L1→ID"
          promptShown={{ text: 'huis', lang: 'NL', role: 'shown' }}
          correctAnswer={{ text: 'rumah', lang: 'ID', role: 'target' }}
          userAnswer={outcome !== 'correct' ? { text: 'rumha', lang: 'ID', role: 'typed' } : undefined}
          continueLabel="Doorgaan"
          copy={FEEDBACK_COPY_NL}
          onContinue={() => {}}
        />
      </ExerciseFrame>

      <Divider my="md" label="grammar-reveal · ID→ID" />
      <ExerciseFrame variant="preview">
        <ExerciseFeedback
          outcome="wrong"
          layout="grammar-reveal"
          direction="ID→ID"
          promptShown={{ text: 'Saya pergi ke pasar.', lang: 'ID', role: 'shown' }}
          correctAnswer={{ text: 'Saya sudah pergi ke pasar.', lang: 'ID', role: 'target' }}
          userAnswer={{ text: 'Saya akan pergi ke pasar.', lang: 'ID', role: 'typed' }}
          meaning="Ik ben naar de markt gegaan (voltooide tijd)'"
          explanation="Voeg `sudah` in om een voltooide actie uit te drukken."
          continueLabel="Doorgaan"
          copy={FEEDBACK_COPY_NL}
          onContinue={() => {}}
        />
      </ExerciseFrame>

      <Divider my="md" label="audio→ID (dictation)" />
      <ExerciseFrame variant="preview">
        <ExerciseFeedback
          outcome="fuzzy"
          layout="vocab-pair"
          direction="audio→ID"
          promptShown={{ text: 'tujuh', lang: 'ID', role: 'heard' }}
          correctAnswer={{ text: 'tujuh', lang: 'ID', role: 'said' }}
          userAnswer={{ text: 'tujuuh', lang: 'ID', role: 'typed' }}
          audio={{ url: '' }}
          continueLabel="Doorgaan"
          copy={FEEDBACK_COPY_NL}
          onContinue={() => {}}
        />
      </ExerciseFrame>
    </Section>
  )
}

function FlagButtonSection() {
  return (
    <Section title="FlagButton (admin)">
      <Text size="sm" c="dimmed" mb="md">
        Mobile: bottom sheet. Desktop: 360px popover. Comment-only (no chips).
        Full functional wiring lands in PR #6 alongside the DB migration that
        makes <code>flag_type</code> nullable.
      </Text>
      <Group>
        <Box className={classes.flagDemo}>
          <Text size="sm" mb="xs">Shown inline in an admin session overlay:</Text>
          <Box style={{ position: 'relative', padding: 16, border: '1px dashed var(--ex-card-border)', borderRadius: 'var(--r-md)', minHeight: 80 }}>
            <Text size="sm" c="dimmed">(exercise content)</Text>
            {/* Disabled — contentFlagService writes would fail pre-migration */}
            <Text size="xs" c="dimmed" mt="sm">Trigger button is disabled in the design lab to prevent pre-migration writes.</Text>
          </Box>
        </Box>
      </Group>
    </Section>
  )
}
