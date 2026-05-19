import { IconBulb, IconArrowRight } from '@tabler/icons-react'
import { HeroCard } from '@/components/page/primitives'
import type { LessonExperienceBlock } from '@/lib/lessons'
import classes from '../LessonReader.module.css'

const AUDIO_POSITION_PREFIX = 'lesson-audio-position'

interface LessonBlockRendererProps {
  block: LessonExperienceBlock
}

function textFromPayload(payload: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['body', 'intro', 'description', 'label']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) parts.push(value)
  }
  if (Array.isArray(payload.paragraphs)) {
    parts.push(...payload.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
  }
  if (Array.isArray(payload.categories)) {
    for (const rawCategory of payload.categories) {
      if (!rawCategory || typeof rawCategory !== 'object') continue
      const category = rawCategory as Record<string, unknown>
      if (typeof category.title === 'string' && category.title.trim()) parts.push(category.title)
      if (Array.isArray(category.rules)) {
        parts.push(...category.rules.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
      }
      if (Array.isArray(category.examples)) {
        for (const rawExample of category.examples) {
          if (!rawExample || typeof rawExample !== 'object') continue
          const example = rawExample as Record<string, unknown>
          for (const key of ['indonesian', 'dutch', 'text', 'translation']) {
            const value = example[key]
            if (typeof value === 'string' && value.trim()) parts.push(value)
          }
        }
      }
    }
  }
  return [...new Set(parts)].join('\n\n')
}

function itemsFromPayload(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(payload.items)) return payload.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  if (Array.isArray(payload.lines)) return payload.lines.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  const hasFlatItemText = [
    'indonesian',
    'text',
    'baseText',
    'base_text',
    'name',
    'dutch',
    'translation',
    'translationNl',
    'translation_nl',
  ].some(key => typeof payload[key] === 'string' && payload[key].trim())
  if (hasFlatItemText) return [payload]
  return []
}

function primaryItemText(item: Record<string, unknown>): string {
  for (const key of ['indonesian', 'text', 'baseText', 'base_text', 'name']) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function secondaryItemText(item: Record<string, unknown>): string {
  for (const key of ['dutch', 'translation', 'translationNl', 'translation_nl', 'description']) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function audioUrlFromPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.audioUrl === 'string') return payload.audioUrl
  if (typeof payload.audio_url === 'string') return payload.audio_url
  return null
}

function audioPositionKey(block: LessonExperienceBlock, audioUrl: string): string {
  return `${AUDIO_POSITION_PREFIX}:${block.sourceRef}:${audioUrl}`
}

function restoreAudioPosition(audio: HTMLAudioElement, key: string) {
  const raw = localStorage.getItem(key)
  if (!raw) return
  const storedTime = Number(raw)
  if (!Number.isFinite(storedTime) || storedTime <= 0) return
  if (Number.isFinite(audio.duration) && audio.duration > 0 && storedTime >= audio.duration - 2) return
  try {
    audio.currentTime = storedTime
  } catch {
    localStorage.removeItem(key)
  }
}

function saveAudioPosition(audio: HTMLAudioElement, key: string) {
  if (!Number.isFinite(audio.currentTime) || audio.currentTime <= 0) return
  if (audio.ended) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, String(Math.round(audio.currentTime)))
}

function labelForKind(kind: LessonExperienceBlock['kind']): string {
  switch (kind) {
    case 'vocab_strip': return 'Woordenschat'
    case 'pattern_callout': return 'Patroon'
    case 'reading_section': return 'Lezen'
    case 'lesson_hero': return 'Les'
    case 'practice_bridge': return 'Oefenbrug'
    case 'lesson_recap': return 'Samenvatting'
    default: return kind.replaceAll('_', ' ')
  }
}

export function LessonBlockRenderer({ block }: LessonBlockRendererProps) {
  const items = itemsFromPayload(block.payload)
  const body = textFromPayload(block.payload)
  const audioUrl = audioUrlFromPayload(block.payload)
  const audioKey = audioUrl ? audioPositionKey(block, audioUrl) : null

  if (block.kind === 'lesson_hero') {
    return (
      <HeroCard>
        <p className={classes.kicker}>Moderne lesweergave</p>
        <h1 className={classes.heroTitle} id={`${block.id}-title`}>{block.title}</h1>
        <p className={classes.heroBody}>
          Lees, merk patronen op, luister en ga daarna gericht oefenen zonder lesblootstelling direct als FSRS-herhaling te tellen.
        </p>
      </HeroCard>
    )
  }

  if (block.kind === 'practice_bridge') {
    return (
      <section
        className={`${classes.block} ${classes.practiceBlock}`}
        aria-labelledby={`${block.id}-title`}
      >
        <div className={classes.blockTopline}>
          <p className={classes.kicker}>
            <IconArrowRight size={12} /> Oefenbrug
          </p>
        </div>
        <h2 id={`${block.id}-title`} className={classes.blockTitle}>{block.title}</h2>
        <p className={classes.blockBody}>
          {body || 'Oefenen komt beschikbaar wanneer de planner en reviewverwerker aangeven dat de vaardigheid klaar is.'}
        </p>
      </section>
    )
  }

  if (block.kind === 'lesson_recap') {
    return (
      <section
        className={`${classes.block} ${classes.recapBlock}`}
        aria-labelledby={`${block.id}-title`}
      >
        <div className={classes.blockTopline}>
          <p className={classes.kicker}>
            <IconBulb size={12} /> Samenvatting
          </p>
        </div>
        <h2 id={`${block.id}-title`} className={classes.blockTitle}>{block.title}</h2>
        <p className={classes.blockBody}>
          Een korte terugblik op wat de les heeft voorbereid. Activeer de les hierboven als je hem wilt opnemen in oefeningen.
        </p>
      </section>
    )
  }

  return (
    <section className={classes.block} aria-labelledby={`${block.id}-title`}>
      <div className={classes.blockTopline}>
        <p className={classes.kicker}>{labelForKind(block.kind)}</p>
      </div>
      <h2 id={`${block.id}-title`} className={classes.blockTitle}>{block.title}</h2>
      {audioUrl && (
        <audio
          className={classes.blockAudio}
          controls
          data-testid={`lesson-block-audio-${block.id}`}
          src={audioUrl}
          onLoadedMetadata={event => {
            if (audioKey) restoreAudioPosition(event.currentTarget, audioKey)
          }}
          onTimeUpdate={event => {
            if (audioKey) saveAudioPosition(event.currentTarget, audioKey)
          }}
          onEnded={() => {
            if (audioKey) localStorage.removeItem(audioKey)
          }}
        />
      )}
      {body && <p className={classes.blockBody}>{body}</p>}
      {items.length > 0 && (
        <div className={classes.itemGrid}>
          {items.slice(0, 12).map((item, index) => (
            <article key={`${block.id}-${index}`} className={classes.itemCard}>
              <strong className={classes.itemPrimary}>{primaryItemText(item)}</strong>
              <span className={classes.itemSecondary}>{secondaryItemText(item)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
