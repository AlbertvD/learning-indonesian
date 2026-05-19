import type { Lesson, LessonPageBlock } from '@/services/lessonService'
import { buildLessonExperience, type LessonExperience } from '@/lib/lessons'

export interface PreviewLesson {
  slug: string
  lesson: Lesson
  pageBlocks: LessonPageBlock[]
  summary: string
  tags: string[]
}

function previewLesson(input: {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
}): Lesson {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    level: input.level,
    module_id: 'preview',
    order_index: input.orderIndex,
    audio_path: null,
    duration_seconds: null,
    transcript_dutch: null,
    transcript_indonesian: null,
    transcript_english: null,
    primary_voice: null,
    dialogue_voices: null,
    lesson_sections: [],
    created_at: new Date(0).toISOString(),
  }
}

function lessonBlock(input: {
  key: string
  sourceRef: string
  kind: LessonPageBlock['block_kind']
  order: number
  payload: Record<string, unknown>
  unitSlugs?: string[]
}): LessonPageBlock {
  return {
    block_key: input.key,
    source_ref: input.sourceRef,
    source_refs: [input.sourceRef],
    content_unit_slugs: input.unitSlugs ?? [],
    block_kind: input.kind,
    display_order: input.order,
    payload_json: input.payload,
  }
}

const lessonOne: PreviewLesson = {
  slug: 'lesson-1-market',
  summary: 'Een moderne web-native leeservaring voor de eerste marktles.',
  tags: ['lesweergave', 'oefenbrug'],
  lesson: previewLesson({
    id: 'preview-lesson-1',
    title: 'Les 1 - Di Pasar',
    description: 'Begroetingen, markttaal, prijzen en eerste Indonesische zinspatronen.',
    level: 'A1',
    orderIndex: 1,
  }),
  pageBlocks: [
    lessonBlock({
      key: 'preview-l1-hero',
      sourceRef: 'lesson-1',
      kind: 'hero',
      order: 0,
      payload: {
        title: 'Di Pasar',
        body: 'Een klein marktverhaal wordt het startpunt voor begroeten, fruit kopen, prijzen vragen en zien hoe Indonesisch werkwoorden eenvoudig houdt.',
      },
    }),
    lessonBlock({
      key: 'preview-l1-reading',
      sourceRef: 'lesson-1/section-story',
      kind: 'section',
      order: 10,
      payload: {
        title: 'Een klein marktverhaal',
        paragraphs: [
          'Ibu mau ke pasar. Di pasar, Ibu mau beli tiga buah pisang.',
          'Pak, saya mau beli tiga buah pisang. Berapa harganya?',
          'Murah, Bu. Delapan rupiah. Ibu glimlacht, maar merkt op: Itu mahal ya.',
        ],
      },
    }),
    lessonBlock({
      key: 'preview-l1-vocab',
      sourceRef: 'lesson-1/section-vocabulary',
      kind: 'exposure',
      order: 20,
      unitSlugs: ['item-ibu', 'item-pasar', 'item-beli', 'item-mahal'],
      payload: {
        type: 'vocabulary',
        title: 'Woorden die de scene dragen',
        items: [
          { indonesian: 'ibu', dutch: 'mevrouw, moeder' },
          { indonesian: 'pasar', dutch: 'markt' },
          { indonesian: 'beli', dutch: 'kopen' },
          { indonesian: 'mahal', dutch: 'duur' },
          { indonesian: 'murah', dutch: 'goedkoop' },
          { indonesian: 'berapa', dutch: 'hoeveel' },
        ],
      },
    }),
    lessonBlock({
      key: 'preview-l1-pattern',
      sourceRef: 'lesson-1/pattern-serial-verb-construction',
      kind: 'section',
      order: 30,
      unitSlugs: ['pattern-serial-verb-construction'],
      payload: {
        title: 'Let op: mau + beli',
        body: 'In het Indonesisch kunnen werkwoorden direct naast elkaar staan. Saya mau beli pisang betekent "Ik wil bananen kopen", zonder apart woord voor "te".',
      },
    }),
    lessonBlock({
      key: 'preview-l1-practice',
      sourceRef: 'lesson-1/practice',
      kind: 'practice_bridge',
      order: 40,
      unitSlugs: ['item-pasar', 'pattern-serial-verb-construction'],
      payload: {
        title: 'Door naar oefenen',
        body: 'Na lezen en opmerken kan de oefening precies de woorden en patronen gebruiken die in de les voorkwamen.',
      },
    }),
    lessonBlock({
      key: 'preview-l1-recap',
      sourceRef: 'lesson-1',
      kind: 'recap',
      order: 50,
      payload: { title: 'Wat deze les heeft voorbereid' },
    }),
  ],
}

const podcastPilot: PreviewLesson = {
  slug: 'podcast-warung-market',
  summary: 'Een podcastachtige bron met globaal luisteren en gemijnde zinnen.',
  tags: ['podcast', 'luisteren', 'zinnen mijnen'],
  lesson: previewLesson({
    id: 'preview-podcast-warung',
    title: 'Podcastpilot - Warungmarkt',
    description: 'Begeleide luisterbron voor markttaal.',
    level: 'A1 luisteren',
    orderIndex: 20,
  }),
  pageBlocks: [
    lessonBlock({
      key: 'preview-podcast-hero',
      sourceRef: 'podcast-warung-market/segment-1',
      kind: 'hero',
      order: 0,
      payload: {
        title: 'Luister naar de hoofdzaak',
        body: 'Podcastsegmenten kunnen eerst alleen blootstelling zijn. De leerder luistert op betekenis voordat gemijnde zinnen in herhaling komen.',
      },
    }),
    lessonBlock({
      key: 'preview-podcast-transcript',
      sourceRef: 'podcast-warung-market/segment-1',
      kind: 'section',
      order: 10,
      payload: {
        title: 'Begeleid transcript',
        paragraphs: [
          'Apa kabar, Bu? Baik, terima kasih. Ibu mau ke pasar.',
          'De vraag is: welke alledaagse situatie wordt geintroduceerd, en wat doet apa kabar sociaal?',
        ],
      },
    }),
    lessonBlock({
      key: 'preview-podcast-phrases',
      sourceRef: 'podcast-warung-market/phrases',
      kind: 'exposure',
      order: 20,
      unitSlugs: ['phrase-apa-kabar', 'phrase-terima-kasih'],
      payload: {
        type: 'expressions',
        title: 'Gemijnde zinnen na het luisteren',
        items: [
          { indonesian: 'Apa kabar?', dutch: 'Hoe gaat het?' },
          { indonesian: 'Terima kasih.', dutch: 'Dank u wel.' },
        ],
      },
    }),
    lessonBlock({
      key: 'preview-podcast-recap',
      sourceRef: 'podcast-warung-market/segment-1',
      kind: 'recap',
      order: 30,
      payload: { title: 'Podcast samenvatting' },
    }),
  ],
}

const morphologyPilot: PreviewLesson = {
  slug: 'men-active-verbs',
  summary: 'Een smalle meN-morfologiepilot: herkennen voor produceren.',
  tags: ['morfologie', 'meN-actief', 'patroonbeheersing'],
  lesson: previewLesson({
    id: 'preview-men-active',
    title: 'Morfologiepilot - meN actieve werkwoorden',
    description: 'Facetgerichte oefening voor Indonesische werkwoordsvormen met affixen.',
    level: 'A2 patroon',
    orderIndex: 30,
  }),
  pageBlocks: [
    lessonBlock({
      key: 'preview-men-hero',
      sourceRef: 'lesson-9/pattern-men-active',
      kind: 'hero',
      order: 0,
      payload: {
        title: 'meN actieve werkwoorden',
        body: 'Deze preview modelleert morfologie als vaardigheden: eerst afgeleide vormen herkennen, daarna pas produceren wanneer er bewijs is.',
      },
    }),
    lessonBlock({
      key: 'preview-men-noticing',
      sourceRef: 'lesson-9/pattern-men-active',
      kind: 'section',
      order: 10,
      unitSlugs: ['pattern-men-active'],
      payload: {
        title: 'Let op de allomorf',
        body: 'baca wordt membaca. tulis wordt menulis. De app volgt dit als specifiek patroonfacet, niet als brede "morfologie beheerst".',
      },
    }),
    lessonBlock({
      key: 'preview-men-pairs',
      sourceRef: 'lesson-9/morphology',
      kind: 'exposure',
      order: 20,
      unitSlugs: ['men-baca-membaca', 'men-tulis-menulis'],
      payload: {
        type: 'vocabulary',
        title: 'Stam en afgeleide vorm',
        items: [
          { indonesian: 'baca -> membaca', dutch: 'lezen -> actief lezen' },
          { indonesian: 'tulis -> menulis', dutch: 'schrijven -> actief schrijven' },
        ],
      },
    }),
    lessonBlock({
      key: 'preview-men-practice',
      sourceRef: 'lesson-9/morphology/practice',
      kind: 'practice_bridge',
      order: 30,
      unitSlugs: ['men-baca-membaca'],
      payload: {
        title: 'Gerichte morfologie-oefening',
        body: 'De herinneringsvaardigheid blijft in de planner achter herkenningsbewijs; deze knop toont alleen de brug.',
      },
    }),
    lessonBlock({
      key: 'preview-men-recap',
      sourceRef: 'lesson-9/pattern-men-active',
      kind: 'recap',
      order: 40,
      payload: { title: 'Morfologie samenvatting' },
    }),
  ],
}

export const previewLessons = [lessonOne, podcastPilot, morphologyPilot]

export function getPreviewLesson(slug: string | undefined): PreviewLesson | undefined {
  return previewLessons.find(lesson => lesson.slug === slug)
}

export function buildPreviewExperience(preview: PreviewLesson): LessonExperience {
  return buildLessonExperience({
    lesson: preview.lesson,
    pageBlocks: preview.pageBlocks,
  })
}
