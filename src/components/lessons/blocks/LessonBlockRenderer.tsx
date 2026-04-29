import { useEffect, useRef } from 'react'
import type { LessonExperienceBlock } from '@/lib/lessons/lessonExperience'
import type { LessonExposureKind } from '@/lib/lessons/lessonExposureProgress'
import { isMeaningfulDialogueAudio, isMeaningfulGrammarAudio } from '@/lib/lessons/lessonReadiness'
import type { SourceProgressState } from '@/services/sourceProgressService'
import classes from '../LessonReader.module.css'

const AUDIO_POSITION_PREFIX = 'lesson-audio-position'
const MEANINGFUL_TEXT_EXPOSURE_MS = 120_000

interface LessonBlockRendererProps {
  block: LessonExperienceBlock
  progress?: SourceProgressState | null
  onProgress: (block: LessonExperienceBlock) => void
  onLessonExposureProgress?: (block: LessonExperienceBlock, exposureKind: LessonExposureKind) => void
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

function payloadType(block: LessonExperienceBlock): string | null {
  return typeof block.payload.type === 'string' ? block.payload.type : null
}

function exposureKindForText(block: LessonExperienceBlock): LessonExposureKind | null {
  const type = payloadType(block)
  if (type === 'grammar') return 'grammar_text'
  if (type === 'reference_table') return 'grammar_text'
  if (block.kind === 'pattern_callout' || block.kind === 'noticing_prompt') return 'grammar_text'
  if (block.sourceProgressEvent === 'pattern_noticing_seen') return 'grammar_text'
  if (type === 'dialogue' || block.kind === 'dialogue_card') return 'dialogue_text'
  return null
}

function exposureKindForAudio(block: LessonExperienceBlock): LessonExposureKind | null {
  const type = payloadType(block)
  if (type === 'grammar') return 'grammar_audio'
  if (type === 'dialogue' || block.kind === 'dialogue_card') return 'dialogue_audio'
  return null
}

function labelForKind(kind: LessonExperienceBlock['kind']): string {
  switch (kind) {
    case 'vocab_strip': return 'Woordenschat'
    case 'pattern_callout': return 'Patroon'
    case 'noticing_prompt': return 'Opmerken'
    case 'reading_section': return 'Lezen'
    case 'lesson_hero': return 'Les'
    case 'practice_bridge': return 'Oefenbrug'
    case 'lesson_recap': return 'Samenvatting'
    default: return kind.replaceAll('_', ' ')
  }
}

function labelForStatus(status: string): string {
  if (status === 'not_started') return 'Nog niet gestart'
  if (status === 'seen') return 'Gezien'
  if (status === 'completed') return 'Afgerond'
  return status
}

export function LessonBlockRenderer({ block, progress, onProgress, onLessonExposureProgress }: LessonBlockRendererProps) {
  const status = progress?.currentState ?? 'not_started'
  const items = itemsFromPayload(block.payload)
  const body = textFromPayload(block.payload)
  const audioUrl = audioUrlFromPayload(block.payload)
  const audioKey = audioUrl ? audioPositionKey(block, audioUrl) : null
  const audioExposureKind = exposureKindForAudio(block)
  const textExposureKind = exposureKindForText(block)
  const sectionRef = useRef<HTMLElement | null>(null)
  const audioExposureRecordedRef = useRef(false)
  const visibleSinceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!textExposureKind) return
    const element = sectionRef.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(candidate => candidate.target === element)
      if (!entry) return
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        visibleSinceRef.current ??= Date.now()
        return
      }
      visibleSinceRef.current = null
    }, { threshold: [0, 0.6] })

    observer.observe(element)
    return () => observer.disconnect()
  }, [textExposureKind])

  const maybeRecordAudioExposure = (audio: HTMLAudioElement) => {
    if (!audioExposureKind || !onLessonExposureProgress || audioExposureRecordedRef.current) return
    const input = {
      durationSeconds: audio.duration,
      playedSeconds: audio.currentTime,
      completed: audio.ended || (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration),
    }
    const isMeaningful = audioExposureKind === 'grammar_audio'
      ? isMeaningfulGrammarAudio(input)
      : isMeaningfulDialogueAudio(input)
    if (!isMeaningful) return

    audioExposureRecordedRef.current = true
    onLessonExposureProgress(block, audioExposureKind)
  }

  const handleSectionProgress = () => {
    if (textExposureKind && onLessonExposureProgress) {
      const visibleSince = visibleSinceRef.current
      if (visibleSince == null) {
        visibleSinceRef.current = Date.now()
        return
      }
      if (Date.now() - visibleSince < MEANINGFUL_TEXT_EXPOSURE_MS) return
      onLessonExposureProgress(block, textExposureKind)
      return
    }

    onProgress(block)
  }

  if (block.kind === 'lesson_hero') {
    return (
      <section className={`${classes.block} ${classes.heroBlock}`} aria-labelledby={`${block.id}-title`}>
        <p className={classes.kicker}>Moderne lesweergave</p>
        <h1 id={`${block.id}-title`}>{block.title}</h1>
        <p>Lees, merk patronen op, luister en ga daarna gericht oefenen zonder lesblootstelling direct als FSRS-herhaling te tellen.</p>
        <button type="button" onClick={() => onProgress(block)}>Markeer als geopend</button>
      </section>
    )
  }

  if (block.kind === 'practice_bridge') {
    return (
      <section className={`${classes.block} ${classes.practiceBlock}`} aria-labelledby={`${block.id}-title`}>
        <p className={classes.kicker}>Oefenbrug</p>
        <h2 id={`${block.id}-title`}>{block.title}</h2>
        <p>{body || 'Oefenen komt beschikbaar wanneer de planner en reviewverwerker aangeven dat de vaardigheid klaar is.'}</p>
        <details className={classes.meta}>
          <summary>{block.capabilityKeyRefs.length} vaardigheidsverwijzing(en)</summary>
          <ul>
            {block.capabilityKeyRefs.map(ref => <li key={ref}><code>{ref}</code></li>)}
            {block.contentUnitSlugs.map(slug => <li key={slug}><code>{slug}</code></li>)}
          </ul>
        </details>
      </section>
    )
  }

  if (block.kind === 'lesson_recap') {
    return (
      <section className={`${classes.block} ${classes.recapBlock}`} aria-labelledby={`${block.id}-title`}>
        <p className={classes.kicker}>Samenvatting</p>
        <h2 id={`${block.id}-title`}>{block.title}</h2>
        <p>Rond af wanneer je de les hebt gezien en de opmerkvragen hebt gedaan. Dit registreert bronvoortgang, geen FSRS-beheersing.</p>
        <button type="button" onClick={() => onProgress(block)}>Markeer les als afgerond</button>
      </section>
    )
  }

  return (
    <section ref={sectionRef} className={classes.block} aria-labelledby={`${block.id}-title`}>
      <div className={classes.blockTopline}>
        <p className={classes.kicker}>{labelForKind(block.kind)}</p>
        <span>{labelForStatus(status)}</span>
      </div>
      <h2 id={`${block.id}-title`}>{block.title}</h2>
      {audioUrl && (
        <audio
          controls
          data-testid={`lesson-block-audio-${block.id}`}
          src={audioUrl}
          onLoadedMetadata={event => {
            if (audioKey) restoreAudioPosition(event.currentTarget, audioKey)
            maybeRecordAudioExposure(event.currentTarget)
          }}
          onTimeUpdate={event => {
            if (audioKey) saveAudioPosition(event.currentTarget, audioKey)
            maybeRecordAudioExposure(event.currentTarget)
          }}
          onEnded={event => {
            if (audioKey) localStorage.removeItem(audioKey)
            maybeRecordAudioExposure(event.currentTarget)
          }}
        />
      )}
      {body && <p className={classes.bodyText}>{body}</p>}
      {items.length > 0 && (
        <div className={classes.itemGrid}>
          {items.slice(0, 12).map((item, index) => (
            <article key={`${block.id}-${index}`} className={classes.itemCard}>
              <strong>{primaryItemText(item)}</strong>
              <span>{secondaryItemText(item)}</span>
            </article>
          ))}
        </div>
      )}
      <button type="button" onClick={handleSectionProgress}>
        {block.sourceProgressEvent === 'pattern_noticing_seen' ? 'Ik heb dit patroon opgemerkt' : 'Markeer sectie als gezien'}
      </button>
    </section>
  )
}
