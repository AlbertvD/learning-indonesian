// Phase 2 — output quality gate: the rubric. Pure + testable. The actual "listen
// to the audio" step is a Gemini multimodal call (quality-gate.ts); this module
// owns the grading prompt, the structured-output schema, and the pass/fail
// interpretation so they can be unit-tested without the model.

export type Lang = 'nl' | 'en'

export interface GateInput {
  lesson: number
  lang: Lang
  level: string // A1 / A2 / B1 / B2
  topics: string[] // the deterministic coverage checklist from the briefing
}

export interface CheckVerdict {
  pass: boolean
  note: string
}
export interface CoverageVerdict extends CheckVerdict {
  missingTopics: string[]
}

export interface RubricVerdict {
  branding: CheckVerdict
  noForeignNames: CheckVerdict
  language: CheckVerdict
  coverage: CoverageVerdict
  detail: CheckVerdict
  levelAppropriate: CheckVerdict
  summary: string
}

export interface GateResult {
  lesson: number
  lang: Lang
  pass: boolean
  failures: string[]
  verdict: RubricVerdict
}

const LANG_NAME: Record<Lang, string> = { nl: 'Dutch', en: 'English' }

// The prompt handed to Gemini alongside the audio. Names every rubric criterion
// and feeds the deterministic topic checklist so coverage is judged against a
// known list, not re-derived from the audio.
export function buildGradingPrompt(input: GateInput): string {
  const langName = LANG_NAME[input.lang]
  return [
    `You are grading one episode of "Kamoe Bisa", a grammar podcast that accompanies an Indonesian-learning app.`,
    `Listen to the attached audio and judge it against the criteria below. Be strict and honest.`,
    `This is the episode for Lesson ${input.lesson}, CEFR level ${input.level}, spoken in ${langName}.`,
    `The grammar topics it must cover are: ${input.topics.map((t) => `"${t}"`).join(', ')}.`,
    ``,
    `Criteria:`,
    `1. branding — the hosts clearly name the show "Kamoe Bisa".`,
    `2. noForeignNames — they NEVER mention NotebookLM, Google, "Deep Dive", or any other product/source name.`,
    `3. language — the episode is spoken entirely in ${langName} (no drifting into another language; Indonesian example words are fine).`,
    `4. coverage — every listed grammar topic is actually discussed. List any that are missing.`,
    `5. detail — the grammar is explained clearly and in real detail, not skimmed.`,
    `6. levelAppropriate — it stays at CEFR ${input.level}; it does not introduce grammar or vocabulary beyond that level.`,
    ``,
    `For each criterion return pass=true/false and a short note. For coverage, also list missingTopics (empty if none). Give a one-line overall summary.`,
  ].join('\n')
}

// JSON-schema for Gemini structured output (Type-enum string literals; no SDK
// import so this stays test-friendly).
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    branding: check(),
    noForeignNames: check(),
    language: check(),
    coverage: {
      type: 'OBJECT',
      properties: {
        pass: { type: 'BOOLEAN' },
        missingTopics: { type: 'ARRAY', items: { type: 'STRING' } },
        note: { type: 'STRING' },
      },
      propertyOrdering: ['pass', 'missingTopics', 'note'],
      required: ['pass', 'missingTopics', 'note'],
    },
    detail: check(),
    levelAppropriate: check(),
    summary: { type: 'STRING' },
  },
  propertyOrdering: ['branding', 'noForeignNames', 'language', 'coverage', 'detail', 'levelAppropriate', 'summary'],
  required: ['branding', 'noForeignNames', 'language', 'coverage', 'detail', 'levelAppropriate', 'summary'],
}

function check() {
  return {
    type: 'OBJECT',
    properties: { pass: { type: 'BOOLEAN' }, note: { type: 'STRING' } },
    propertyOrdering: ['pass', 'note'],
    required: ['pass', 'note'],
  }
}

// Derive the gate result from the model's verdict — we recompute the overall
// pass from the individual checks rather than trusting a model-supplied "overall".
export function evaluate(input: GateInput, verdict: RubricVerdict): GateResult {
  const checks: [string, boolean][] = [
    ['branding', verdict.branding.pass],
    ['noForeignNames', verdict.noForeignNames.pass],
    ['language', verdict.language.pass],
    ['coverage', verdict.coverage.pass],
    ['detail', verdict.detail.pass],
    ['levelAppropriate', verdict.levelAppropriate.pass],
  ]
  const failures = checks.filter(([, ok]) => !ok).map(([name]) => name)
  return { lesson: input.lesson, lang: input.lang, pass: failures.length === 0, failures, verdict }
}
