#!/usr/bin/env bun
/**
 * generate-staging-files.ts - deterministic staging-file generation.
 *
 * Usage:
 *   bun scripts/generate-staging-files.ts <lesson-number> [--force] [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  buildCapabilityStagingFromContent,
  buildContentUnitsFromStaging,
  buildLessonPageBlocksFromStaging,
  validateCapabilityStaging,
  validateContentUnits,
  validateExerciseAssets,
  validateLessonPageBlocks,
  type StagingLessonInput,
} from './lib/content-pipeline-output'

type SectionType =
  | 'vocabulary' | 'expressions' | 'numbers'
  | 'grammar' | 'exercises' | 'dialogue'
  | 'text' | 'pronunciation' | 'reference_table'

interface VocabItem { indonesian: string; dutch: string; pos?: string | null }
interface DialogueLine { speaker: string; text: string }

interface CatalogSection {
  id: number
  type: SectionType
  title: string
  source_pages: number[]
  confidence: 'high' | 'medium' | 'low'
  items?: VocabItem[]
  lines?: DialogueLine[]
  paragraphs?: string[]
  raw_text?: string
}

interface SectionsCatalog {
  lesson: number
  generatedAt: string
  sourcePages: number
  lessonMeta: {
    title: string
    level: string
    module_id: string
    order_index: number
  }
  sections: CatalogSection[]
  flags: string[]
}

interface LearningItemsReport {
  totalGenerated: number
  droppedEmptyIndonesian: number
  droppedEmptyDutch: number
}

type StagingLearningItem = StagingLessonInput['learningItems'][number] & Record<string, unknown>

const importRuntimeModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Record<string, unknown>>

function writeFile(filePath: string, content: string, label: string, dryRun: boolean, mode: 'WRITE' | 'SCAFFOLD' = 'WRITE') {
  if (dryRun) {
    console.log(`  DRY-RUN ${mode}: ${label} (${content.length} bytes)`)
    return
  }
  fs.writeFileSync(filePath, content)
  console.log(`  ${mode}: ${label}`)
}

function scaffoldIfAbsent(filePath: string, content: string, label: string, dryRun: boolean) {
  if (fs.existsSync(filePath)) {
    console.log(`  SKIP (exists): ${label}`)
    return
  }
  writeFile(filePath, content, label, dryRun, 'SCAFFOLD')
}

function skipExisting(label: string, reason: string) {
  console.log(`  SKIP (${reason}): ${label}`)
}

function buildSectionContent(section: CatalogSection): Record<string, unknown> {
  switch (section.type) {
    case 'vocabulary':
    case 'expressions':
    case 'numbers':
      return {
        type: section.type,
        items: (section.items || []).map(item => ({
          indonesian: item.indonesian,
          dutch: item.dutch,
        })),
      }
    case 'dialogue':
      return {
        type: 'dialogue',
        lines: (section.lines || []).map(line => ({
          speaker: line.speaker,
          text: line.text,
          translation: '',
        })),
      }
    case 'text':
      return { type: 'text', paragraphs: section.paragraphs || [] }
    case 'grammar':
    case 'reference_table':
      return { type: section.type, body: section.raw_text || '' }
    case 'exercises':
      return { type: 'exercises', body: section.raw_text || '' }
    case 'pronunciation':
      return { type: 'pronunciation', body: section.raw_text || '' }
    default:
      return { type: section.type, body: section.raw_text || '' }
  }
}

function buildTypedSectionContent(section: CatalogSection): { type: string; [key: string]: unknown } {
  return buildSectionContent(section) as { type: string; [key: string]: unknown }
}

function lessonFromCatalog(catalog: SectionsCatalog): StagingLessonInput['lesson'] {
  return {
    title: catalog.lessonMeta.title,
    description: '',
    level: catalog.lessonMeta.level,
    module_id: catalog.lessonMeta.module_id,
    order_index: catalog.lessonMeta.order_index,
    sections: catalog.sections.map((section, idx) => ({
      title: section.title,
      order_index: idx,
      content: buildTypedSectionContent(section),
    })),
  }
}

export function selectLessonForGeneration(
  catalog: SectionsCatalog | null,
  existingLesson?: StagingLessonInput['lesson'] | null,
): StagingLessonInput['lesson'] {
  if (existingLesson) return existingLesson
  if (canUseCatalogForGeneration(catalog)) return lessonFromCatalog(catalog)
  throw new Error('No curated lesson file or current-format sections catalog is available.')
}

export function canUseCatalogForGeneration(catalog: unknown): catalog is SectionsCatalog {
  if (!catalog || typeof catalog !== 'object') return false
  const record = catalog as Record<string, unknown>
  const lessonMeta = record.lessonMeta
  const sections = record.sections
  if (!lessonMeta || typeof lessonMeta !== 'object') return false
  if (!Array.isArray(sections)) return false
  const meta = lessonMeta as Record<string, unknown>
  if (typeof meta.title !== 'string' || !meta.title.trim()) return false
  if (typeof meta.level !== 'string' || !meta.level.trim()) return false
  if (typeof meta.module_id !== 'string' || !meta.module_id.trim()) return false
  if (typeof meta.order_index !== 'number') return false
  return sections.every(section => (
    Boolean(section)
    && typeof section === 'object'
    && typeof (section as Record<string, unknown>).type === 'string'
  ))
}

function normaliseDutchTranslation(raw: string): string {
  const t = raw.trim()
  if (t.includes(' / ')) return t
  const ofMatch = t.match(/^(.+?)\s+of\s+(.+)$/i)
  if (ofMatch) {
    const parts = ofMatch.slice(1).map(p => p.trim())
    if (parts.every(p => p.split(/\s+/).length <= 4)) return parts.join(' / ')
  }
  if (t.includes(';')) return t.split(/\s*;\s*/).map(p => p.trim()).filter(Boolean).join(' / ')
  if (t.includes(',')) {
    const parts = t.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2 && parts.every(p => p.split(/\s+/).length <= 2)) return parts.join(' / ')
  }
  return t
}

function itemTypeFromSection(sectionType: SectionType, indonesian: string): 'word' | 'phrase' {
  if (sectionType === 'expressions') return 'phrase'
  return indonesian.trim().split(/\s+/).length >= 3 ? 'phrase' : 'word'
}

function learningItemsFromCatalog(catalog: SectionsCatalog): { items: StagingLessonInput['learningItems']; report: LearningItemsReport } {
  const items: StagingLessonInput['learningItems'] = []
  const report: LearningItemsReport = {
    totalGenerated: 0,
    droppedEmptyIndonesian: 0,
    droppedEmptyDutch: 0,
  }

  for (const section of catalog.sections) {
    if (['vocabulary', 'expressions', 'numbers'].includes(section.type) && section.items) {
      for (const item of section.items) {
        if (!item.indonesian?.trim()) { report.droppedEmptyIndonesian++; continue }
        if (!item.dutch?.trim()) { report.droppedEmptyDutch++; continue }
        const stagingItem: StagingLessonInput['learningItems'][number] = {
          base_text: item.indonesian.trim(),
          item_type: itemTypeFromSection(section.type, item.indonesian),
          context_type: 'vocabulary_list',
          translation_nl: normaliseDutchTranslation(item.dutch.trim()),
          translation_en: '',
          source_page: section.source_pages[0] ?? null,
          review_status: 'pending_review',
        }
        if (item.pos) (stagingItem as any).pos = item.pos
        items.push(stagingItem)
      }
    }

    if (section.type === 'dialogue' && section.lines) {
      for (const line of section.lines) {
        if (!line.text?.trim() || line.speaker === 'narrator') continue
        items.push({
          base_text: line.text.trim(),
          item_type: 'dialogue_chunk',
          context_type: 'dialogue',
          translation_nl: '',
          translation_en: '',
          source_page: section.source_pages[0] ?? null,
          review_status: 'pending_review',
        })
      }
    }
  }

  report.totalGenerated = items.length
  return { items, report }
}

function learningItemIdentity(item: Pick<StagingLearningItem, 'base_text'>): string {
  return item.base_text.trim().toLowerCase()
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function preferredText(current: unknown, next: unknown): string | undefined {
  return nonEmpty(current)
    ?? nonEmpty(next)
    ?? (typeof current === 'string' ? current : undefined)
    ?? (typeof next === 'string' ? next : undefined)
}

function appendUniqueDelimitedText(current: unknown, next: unknown): string | undefined {
  const parts = new Set<string>()
  for (const value of [current, next]) {
    if (typeof value !== 'string' || !value.trim()) continue
    value
      .split(/\s+\/\s+|\s*;\s*/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => parts.add(part))
  }
  if (parts.size > 0) return [...parts].join(' / ')
  if (typeof current === 'string') return current
  if (typeof next === 'string') return next
  return undefined
}

function preferredReviewStatus(current?: string, next?: string): string | undefined {
  const rank: Record<string, number> = {
    pending_review: 0,
    deferred_dialogue: 1,
    approved: 2,
    published: 3,
  }
  if (!current) return next
  if (!next) return current
  return (rank[next] ?? -1) > (rank[current] ?? -1) ? next : current
}

function curatedItemsByIdentity(existingItems: StagingLearningItem[]): Map<string, StagingLearningItem> {
  const byIdentity = new Map<string, StagingLearningItem>()
  for (const item of existingItems) {
    const key = learningItemIdentity(item)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, { ...item })
      continue
    }
    byIdentity.set(key, {
      ...existing,
      translation_nl: appendUniqueDelimitedText(existing.translation_nl, item.translation_nl),
      translation_en: appendUniqueDelimitedText(existing.translation_en, item.translation_en),
      review_status: preferredReviewStatus(existing.review_status, item.review_status),
      pos: existing.pos ?? item.pos,
    })
  }
  return byIdentity
}

export function mergeGeneratedLearningItemsWithExisting(
  generatedItems: StagingLearningItem[],
  existingItems: StagingLearningItem[] = [],
): StagingLearningItem[] {
  const existingByIdentity = curatedItemsByIdentity(existingItems)
  return generatedItems.map(item => {
    const existing = existingByIdentity.get(learningItemIdentity(item))
    if (!existing) return item
    return {
      ...item,
      translation_nl: preferredText(existing.translation_nl, item.translation_nl),
      translation_en: preferredText(existing.translation_en, item.translation_en),
      review_status: preferredReviewStatus(item.review_status, existing.review_status),
      pos: item.pos ?? existing.pos,
    }
  })
}

function tsExport(name: string, value: unknown, header = 'Generated by generate-staging-files.ts'): string {
  return `// ${header}\nexport const ${name} = ${JSON.stringify(value, null, 2)}\n`
}

function scaffoldGrammarPatterns(lessonNumber: number): string {
  return `// Grammar patterns for Lesson ${lessonNumber}\nexport const grammarPatterns = []\n`
}

function scaffoldCandidates(lessonNumber: number): string {
  return `// Exercise candidates for Lesson ${lessonNumber}\nexport const candidates = []\n`
}

function scaffoldClozeContexts(lessonNumber: number): string {
  return `// Cloze contexts for Lesson ${lessonNumber}\nexport const clozeContexts = []\n`
}

const sourceIndexExports = [
  "export { lesson } from './lesson'",
  "export { learningItems } from './learning-items'",
  "export { grammarPatterns } from './grammar-patterns'",
]

const workflowIndexExports = [
  "export { candidates } from './candidates'",
  "export { clozeContexts } from './cloze-contexts'",
  "export { contentUnits } from './content-units'",
  "export { capabilities } from './capabilities'",
  "export { lessonPageBlocks } from './lesson-page-blocks'",
  "export { exerciseAssets } from './exercise-assets'",
]

function exportPath(line: string): string | null {
  return line.match(/\sfrom\s['"](.+)['"]/)?.[1] ?? null
}

export function generateIndexTs(existingContent = ''): string {
  const standardPaths = new Set([...sourceIndexExports, ...workflowIndexExports].map(exportPath).filter(Boolean))
  const customExports = existingContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('export '))
    .filter(line => {
      const pathRef = exportPath(line)
      return pathRef && !standardPaths.has(pathRef)
    })

  return [...sourceIndexExports, ...customExports, ...workflowIndexExports].join('\n') + '\n'
}

async function readExistingExport(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  const module = await importRuntimeModule(`${pathToFileURL(filePath).href}?t=${Date.now()}`)
  return Object.values(module)[0] ?? null
}

async function inputFromExistingStaging(lessonNumber: number, stagingDir: string): Promise<StagingLessonInput | null> {
  const [lesson, learningItems, grammarPatterns, affixedFormPairs] = await Promise.all([
    readExistingExport(path.join(stagingDir, 'lesson.ts')),
    readExistingExport(path.join(stagingDir, 'learning-items.ts')),
    readExistingExport(path.join(stagingDir, 'grammar-patterns.ts')),
    readExistingExport(path.join(stagingDir, 'morphology-patterns.ts')),
  ])
  if (!lesson) return null
  return {
    lessonNumber,
    lesson,
    learningItems: learningItems ?? [],
    grammarPatterns: grammarPatterns ?? [],
    affixedFormPairs: affixedFormPairs ?? [],
  }
}

function buildPipeline(input: StagingLessonInput) {
  const contentUnits = buildContentUnitsFromStaging(input)
  const capabilityPlan = buildCapabilityStagingFromContent({ ...input, contentUnits })
  const lessonPageBlocks = buildLessonPageBlocksFromStaging({
    ...input,
    contentUnits,
    capabilities: capabilityPlan.capabilities,
  })
  const findings = [
    ...validateContentUnits(contentUnits),
    ...validateCapabilityStaging({ capabilities: capabilityPlan.capabilities, contentUnits }),
    ...validateExerciseAssets({ exerciseAssets: capabilityPlan.exerciseAssets, capabilities: capabilityPlan.capabilities }),
    ...validateLessonPageBlocks({ blocks: lessonPageBlocks, contentUnits, capabilities: capabilityPlan.capabilities }),
  ]
  const critical = findings.filter(finding => finding.severity === 'CRITICAL')
  if (critical.length > 0) {
    throw new Error(`Generated pipeline output has critical findings:\n${critical.map(item => `${item.rule}: ${item.detail}`).join('\n')}`)
  }
  return { contentUnits, capabilityPlan, lessonPageBlocks }
}

async function main() {
  const args = process.argv.slice(2)
  const lessonNumber = parseInt(args[0], 10)
  const dryRun = args.includes('--dry-run')
  if (Number.isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/generate-staging-files.ts <lesson-number> [--force] [--dry-run]')
    process.exit(1)
  }

  const stagingDir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${lessonNumber}`)
  const catalogPath = path.join(stagingDir, 'sections-catalog.json')
  const catalog: SectionsCatalog | null = fs.existsSync(catalogPath)
    ? JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
    : null

  const existingInput = await inputFromExistingStaging(lessonNumber, stagingDir)
  if (!catalog && !existingInput) {
    console.error(`Error: No catalog or existing staging files found at ${stagingDir}`)
    if (!dryRun) console.error(`Run first: bun scripts/catalog-lesson-sections.ts ${lessonNumber}`)
    process.exit(1)
  }

  const useCatalog = canUseCatalogForGeneration(catalog)
  if (catalog && !useCatalog && !existingInput) {
    console.error(`Error: Legacy catalog found at ${catalogPath}, but no curated staging files exist to use as fallback`)
    process.exit(1)
  }

  const usingCuratedLesson = Boolean(existingInput?.lesson)
  const lesson = selectLessonForGeneration(catalog, existingInput?.lesson)
  const generatedItemsFromSource = useCatalog
    ? learningItemsFromCatalog(catalog)
    : {
        items: existingInput!.learningItems,
        report: { totalGenerated: existingInput!.learningItems.length, droppedEmptyIndonesian: 0, droppedEmptyDutch: 0 },
      }
  const mergedLearningItems = useCatalog
    ? mergeGeneratedLearningItemsWithExisting(generatedItemsFromSource.items, existingInput?.learningItems ?? [])
    : generatedItemsFromSource.items
  const generatedItems = {
    items: mergedLearningItems,
    report: {
      ...generatedItemsFromSource.report,
      totalGenerated: mergedLearningItems.length,
    },
  }
  const grammarPatterns = existingInput?.grammarPatterns ?? []
  const affixedFormPairs = existingInput?.affixedFormPairs ?? []
  const pipelineInput: StagingLessonInput = {
    lessonNumber,
    lesson,
    learningItems: generatedItems.items,
    grammarPatterns,
    affixedFormPairs,
  }
  const { contentUnits, capabilityPlan, lessonPageBlocks } = buildPipeline(pipelineInput)

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Generating staging files for lesson ${lessonNumber} (${lesson.title})...`)
  if (catalog && !useCatalog) {
    console.log('  Using existing curated staging files because sections-catalog.json is in the legacy reverse-engineered format.')
  }
  console.log(`  Sections in catalog/staging: ${lesson.sections.length}`)
  if (useCatalog && usingCuratedLesson) {
    console.log('  Using existing curated lesson sections; catalog refreshes learning items and derived Slice 10 files.')
  }
  if (useCatalog && catalog.flags.length) console.log(`  Catalog flags: ${catalog.flags.length} (see sections-catalog.json)`)
  console.log()

  fs.mkdirSync(stagingDir, { recursive: true })

  if (usingCuratedLesson) {
    skipExisting('lesson.ts', 'curated source')
  } else {
    writeFile(path.join(stagingDir, 'lesson.ts'), tsExport('lesson', lesson, 'Generated by generate-staging-files.ts from sections-catalog.json'), 'lesson.ts', dryRun)
  }

  if (useCatalog) {
    writeFile(path.join(stagingDir, 'learning-items.ts'), tsExport('learningItems', generatedItems.items, 'Generated by generate-staging-files.ts from sections-catalog.json'), 'learning-items.ts', dryRun)
  } else {
    skipExisting('learning-items.ts', 'curated source')
  }

  if (generatedItems.report.droppedEmptyIndonesian > 0) console.warn(`  WARN: ${generatedItems.report.droppedEmptyIndonesian} catalog items dropped - missing indonesian text`)
  if (generatedItems.report.droppedEmptyDutch > 0) console.warn(`  WARN: ${generatedItems.report.droppedEmptyDutch} catalog items dropped - missing dutch translation`)

  const vocabSectionsInCatalog = catalog?.sections.filter(section => ['vocabulary', 'expressions', 'numbers'].includes(section.type) && (section.items?.length ?? 0) > 0) ?? []
  if (vocabSectionsInCatalog.length > 0 && generatedItems.report.totalGenerated === 0) {
    console.error(`\nCatalog has ${vocabSectionsInCatalog.length} vocabulary section(s) but 0 learning items were generated.`)
    process.exit(1)
  }

  scaffoldIfAbsent(path.join(stagingDir, 'grammar-patterns.ts'), scaffoldGrammarPatterns(lessonNumber), 'grammar-patterns.ts', dryRun)
  scaffoldIfAbsent(path.join(stagingDir, 'candidates.ts'), scaffoldCandidates(lessonNumber), 'candidates.ts', dryRun)
  scaffoldIfAbsent(path.join(stagingDir, 'cloze-contexts.ts'), scaffoldClozeContexts(lessonNumber), 'cloze-contexts.ts', dryRun)

  writeFile(path.join(stagingDir, 'content-units.ts'), tsExport('contentUnits', contentUnits), 'content-units.ts', dryRun)
  writeFile(path.join(stagingDir, 'capabilities.ts'), tsExport('capabilities', capabilityPlan.capabilities), 'capabilities.ts', dryRun)
  writeFile(path.join(stagingDir, 'lesson-page-blocks.ts'), tsExport('lessonPageBlocks', lessonPageBlocks), 'lesson-page-blocks.ts', dryRun)
  writeFile(path.join(stagingDir, 'exercise-assets.ts'), tsExport('exerciseAssets', capabilityPlan.exerciseAssets), 'exercise-assets.ts', dryRun)
  const indexPath = path.join(stagingDir, 'index.ts')
  const existingIndexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : ''
  writeFile(indexPath, generateIndexTs(existingIndexContent), 'index.ts', dryRun)

  const rawSections = useCatalog && !usingCuratedLesson
    ? catalog.sections.filter(section => ['grammar', 'exercises', 'pronunciation', 'reference_table'].includes(section.type))
    : []
  console.log('\nSummary:')
  console.log(`  learning_items to review: ${generatedItems.items.length}`)
  console.log(`  content units: ${contentUnits.length}`)
  console.log(`  capability rows planned: ${capabilityPlan.capabilities.length}`)
  console.log(`  exercise assets planned: ${capabilityPlan.exerciseAssets.length}`)
  console.log(`  lesson page blocks planned: ${lessonPageBlocks.length}`)
  console.log(`  raw sections for linguist-structurer: ${rawSections.length}`)
  rawSections.forEach(section => console.log(`    - ${section.title} (${section.type})`))

  console.log('\nNext steps:')
  console.log('  1. Run linguist-structurer to structure grammar/exercises and generate candidates')
  console.log('  2. Run linguist-reviewer to validate creator output')
  console.log(`  3. bun scripts/publish-approved-content.ts ${lessonNumber}`)
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
