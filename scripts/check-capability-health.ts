import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { projectCapabilities } from '../src/lib/capabilities/capabilityCatalog'
import { validateCapabilities, type CapabilityHealthReport } from '../src/lib/capabilities/capabilityContracts'
import type { ArtifactIndex } from '../src/lib/capabilities/artifactRegistry'
import type { ArtifactKind, CurrentContentSnapshot, CurrentLearningItem } from '../src/lib/capabilities/capabilityTypes'

export interface CapabilityHealthExitCodeInput {
  strict: boolean
  criticalCount: number
}

export function getCapabilityHealthExitCode(input: CapabilityHealthExitCodeInput): 0 | 1 {
  return input.strict && input.criticalCount > 0 ? 1 : 0
}

export function parseCapabilityHealthArgs(args: string[]): {
  strict: boolean
  stagingPath: string
} {
  const stagingIndex = args.indexOf('--staging')
  if (stagingIndex >= 0 && (!args[stagingIndex + 1] || args[stagingIndex + 1].startsWith('--'))) {
    throw new Error('--staging requires a path')
  }

  return {
    strict: args.includes('--strict'),
    stagingPath: stagingIndex >= 0 ? args[stagingIndex + 1] : 'scripts/data/staging/lesson-1',
  }
}

function stableItemId(item: { base_text?: string; baseText?: string }, index: number): string {
  const text = item.base_text ?? item.baseText ?? `item-${index + 1}`
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${index + 1}`
}

function stableSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function inferLessonSourceRef(absolutePath: string): string {
  const folderName = path.basename(absolutePath).toLowerCase()
  const match = folderName.match(/^lesson-?0*(\d+)$/)
  return match ? `lesson-${Number(match[1])}` : 'lesson-1'
}

function examplesFromPattern(pattern: Record<string, unknown>): string[] {
  if (Array.isArray(pattern.examples)) return pattern.examples.map(String).filter(Boolean)
  const description = String(pattern.description ?? '')
  return Array.from(description.matchAll(/['"]([^'"]{2,})['"]/g))
    .map(match => match[1]?.trim() ?? '')
    .filter(example => example.length > 0)
}

export async function loadStagedContentSnapshot(stagingPath: string): Promise<{
  snapshot: CurrentContentSnapshot
  artifacts: ArtifactIndex
}> {
  const absolutePath = path.resolve(stagingPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Staging path does not exist: ${stagingPath}`)
  }

  const learningItemsPath = path.join(absolutePath, 'learning-items.ts')
  const grammarPatternsPath = path.join(absolutePath, 'grammar-patterns.ts')
  const podcastSegmentsPath = path.join(absolutePath, 'podcast-segments.ts')
  const podcastPhrasesPath = path.join(absolutePath, 'podcast-phrases.ts')
  const morphologyPatternsPath = path.join(absolutePath, 'morphology-patterns.ts')
  const learningItemsModule = existsSync(learningItemsPath)
    ? await import(pathToFileURL(learningItemsPath).href) as { learningItems?: Array<Record<string, unknown>> }
    : { learningItems: [] }
  const grammarPatternsModule = existsSync(grammarPatternsPath)
    ? await import(pathToFileURL(grammarPatternsPath).href) as { grammarPatterns?: Array<Record<string, unknown>> }
    : { grammarPatterns: [] }
  const podcastSegmentsModule = existsSync(podcastSegmentsPath)
    ? await import(pathToFileURL(podcastSegmentsPath).href) as { podcastSegments?: Array<Record<string, unknown>> }
    : { podcastSegments: [] }
  const podcastPhrasesModule = existsSync(podcastPhrasesPath)
    ? await import(pathToFileURL(podcastPhrasesPath).href) as { podcastPhrases?: Array<Record<string, unknown>> }
    : { podcastPhrases: [] }
  const morphologyPatternsModule = existsSync(morphologyPatternsPath)
    ? await import(pathToFileURL(morphologyPatternsPath).href) as { affixedFormPairs?: Array<Record<string, unknown>> }
    : { affixedFormPairs: [] }

  const learningItems: CurrentLearningItem[] = (learningItemsModule.learningItems ?? []).map((item, index) => {
    const id = String(item.id ?? stableItemId(item, index))
    return {
      id,
      baseText: String(item.base_text ?? item.baseText ?? ''),
      meanings: [
        { language: 'nl', text: String(item.translation_nl ?? '') },
        { language: 'en', text: String(item.translation_en ?? '') },
      ].filter(meaning => meaning.text.length > 0),
      acceptedAnswers: {
        id: [String(item.base_text ?? item.baseText ?? '')].filter(Boolean),
        l1: [String(item.translation_nl ?? item.translation_en ?? '')].filter(Boolean),
      },
      hasAudio: false,
    }
  })

  const lessonSourceRef = inferLessonSourceRef(absolutePath)
  const grammarPatterns = (grammarPatternsModule.grammarPatterns ?? []).map((pattern, index) => {
    const slug = String(pattern.slug ?? pattern.id ?? `pattern-${index + 1}`)
    return {
      id: String(pattern.id ?? slug),
      sourceRef: String(pattern.source_ref ?? pattern.sourceRef ?? `${lessonSourceRef}/pattern-${stableSlug(slug) || index + 1}`),
      name: String(pattern.name ?? pattern.pattern_name ?? `Pattern ${index + 1}`),
      examples: examplesFromPattern(pattern),
    }
  })

  const podcastSegments = (podcastSegmentsModule.podcastSegments ?? []).map((segment, index) => ({
    id: String(segment.id ?? `podcast-segment-${index + 1}`),
    sourceRef: String(segment.source_ref ?? segment.sourceRef ?? `podcast/segment-${index + 1}`),
    hasAudio: segment.hasAudio !== false,
    transcript: String(segment.transcript ?? ''),
    gistPrompt: String(segment.gistPrompt ?? segment.gist_prompt ?? ''),
    exposureOnly: segment.exposureOnly !== false,
  }))

  const podcastPhrases = (podcastPhrasesModule.podcastPhrases ?? []).map((phrase, index) => ({
    id: String(phrase.id ?? `podcast-phrase-${index + 1}`),
    sourceRef: String(phrase.source_ref ?? phrase.sourceRef ?? `podcast/phrase-${index + 1}`),
    text: String(phrase.text ?? phrase.phrase ?? ''),
    translation: String(phrase.translation ?? phrase.translation_nl ?? phrase.translation_en ?? ''),
    segmentSourceRef: phrase.segmentSourceRef != null || phrase.segment_source_ref != null
      ? String(phrase.segmentSourceRef ?? phrase.segment_source_ref)
      : undefined,
  }))

  const affixedFormPairs = (morphologyPatternsModule.affixedFormPairs ?? []).map((pair, index) => ({
    id: String(pair.id ?? `affixed-form-pair-${index + 1}`),
    sourceRef: String(pair.source_ref ?? pair.sourceRef ?? `morphology/pair-${index + 1}`),
    root: String(pair.root ?? ''),
    derived: String(pair.derived ?? ''),
    allomorphRule: pair.allomorphRule != null || pair.allomorph_rule != null
      ? String(pair.allomorphRule ?? pair.allomorph_rule)
      : undefined,
    patternSourceRef: pair.patternSourceRef != null || pair.pattern_source_ref != null
      ? String(pair.patternSourceRef ?? pair.pattern_source_ref)
      : undefined,
  }))

  const artifacts: ArtifactIndex = {}
  const addArtifact = (kind: ArtifactKind, sourceRef: string, approved: boolean): void => {
    artifacts[kind] = [
      ...(artifacts[kind] ?? []),
      { qualityStatus: approved ? 'approved' : 'blocked', sourceRef },
    ]
  }

  for (const item of learningItems) {
    const sourceRef = `learning_items/${item.id}`
    addArtifact('base_text', sourceRef, item.baseText.length > 0)
    addArtifact('meaning:l1', sourceRef, item.meanings.length > 0)
    addArtifact('accepted_answers:l1', sourceRef, (item.acceptedAnswers?.l1?.length ?? 0) > 0)
    addArtifact('accepted_answers:id', sourceRef, (item.acceptedAnswers?.id?.length ?? 0) > 0)
  }

  for (const pattern of grammarPatterns) {
    addArtifact('pattern_explanation:l1', pattern.sourceRef, pattern.name.length > 0)
    addArtifact('pattern_example', pattern.sourceRef, pattern.examples.length > 0)
  }

  for (const segment of podcastSegments) {
    addArtifact('audio_segment', segment.sourceRef, segment.hasAudio)
    addArtifact('transcript_segment', segment.sourceRef, segment.transcript.length > 0)
    addArtifact('podcast_gist_prompt', segment.sourceRef, segment.gistPrompt.length > 0)
  }

  for (const phrase of podcastPhrases) {
    addArtifact('timecoded_phrase', phrase.sourceRef, phrase.text.length > 0)
    addArtifact('translation:l1', phrase.sourceRef, (phrase.translation?.length ?? 0) > 0)
  }

  for (const pair of affixedFormPairs) {
    addArtifact('root_derived_pair', pair.sourceRef, pair.root.length > 0 && pair.derived.length > 0)
    if (pair.allomorphRule) {
      addArtifact('allomorph_rule', pair.sourceRef, pair.allomorphRule.length > 0)
    }
  }

  return {
    snapshot: {
      learningItems,
      grammarPatterns,
      podcastSegments,
      podcastPhrases,
      affixedFormPairs,
      stagedLessons: [],
    },
    artifacts,
  }
}

export async function buildCapabilityHealthReport(stagingPath: string): Promise<CapabilityHealthReport> {
  const { snapshot, artifacts } = await loadStagedContentSnapshot(stagingPath)
  return validateCapabilities({
    projection: projectCapabilities(snapshot),
    artifacts,
  })
}

if (process.argv[1]?.endsWith('check-capability-health.ts')) {
  if (process.argv.includes('--help')) {
    console.log('Usage: bun scripts/check-capability-health.ts [--staging scripts/data/staging/lesson-N] [--strict]')
    process.exit(0)
  }

  try {
    const args = parseCapabilityHealthArgs(process.argv.slice(2))
    const report = await buildCapabilityHealthReport(args.stagingPath)
    console.log(JSON.stringify(report, null, 2))
    process.exit(getCapabilityHealthExitCode({ strict: args.strict, criticalCount: report.criticalCount }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
