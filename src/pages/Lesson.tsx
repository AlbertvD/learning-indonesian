// src/pages/Lesson.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Container, Center, Loader, Text, Tabs, Badge, Progress, Button, Stack, Group, Box } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconCheck, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { lessonService, type Lesson } from '@/services/lessonService'
import { learningItemService } from '@/services/learningItemService'
import { learnerStateService } from '@/services/learnerStateService'
import { progressService } from '@/services/progressService'
import { startSession, endSession } from '@/lib/session'
import { useSessionBeacon } from '@/lib/useSessionBeacon'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { IndoText } from '@/components/IndoText'
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer'
import { PlayButton } from '@/components/PlayButton'
import { AudioProvider, useAudio } from '@/contexts/AudioContext'
import { fetchAudioMap, resolveAudioUrl, type AudioMap } from '@/services/audioService'
import { normalizeTtsText } from '@/lib/ttsNormalize'
import type { LearningItem, ItemMeaning, LearnerItemState, LearnerSkillState } from '@/types/learning'
import classes from './Lesson.module.css'

type ExerciseItem = { dutch?: string; indonesian?: string; phrase?: string; text?: string; question?: string; prompt?: string; answer?: string }
type ExerciseSection = { title: string; instruction?: string; items?: ExerciseItem[] }
type PhoneticExample = { indonesian: string; phonetic: string; dutch: string }
type SpellingRule = { rule: string; example: string; dutch: string }
type SimpleSentence = { indonesian: string; dutch: string }
type TextData = { type: 'text'; intro?: string; paragraphs?: string[]; examples?: PhoneticExample[]; spelling?: SpellingRule[]; sentences?: SimpleSentence[] }
type GrammarTableRow = { word: string; asks?: string; dutch?: string; example?: string; combinations?: string[] }
type GrammarCategory = { title: string; rules?: string[]; examples?: { indonesian: string; dutch: string }[]; table?: GrammarTableRow[] | string[][] }
type DialogueLine = { speaker: string; text: string; translation?: string }
type PronunciationLetter = { letter: string; rule: string; examples: string[] }
type ReferenceTableRow = { label: string; cells: string[] }
type ReferenceTableSection = { heading: string; rows: ReferenceTableRow[] }

type SectionContentData =
  | { type: 'vocabulary'; items: ExerciseItem[] }
  | { type: 'expressions'; items: ExerciseItem[] }
  | { type: 'numbers'; items: ExerciseItem[] }
  | { type: 'exercises'; sections: ExerciseSection[] }
  | { type: 'text'; intro?: string; examples?: PhoneticExample[]; spelling?: SpellingRule[]; sentences?: SimpleSentence[] }
  | { type: 'grammar'; intro?: string; categories: GrammarCategory[] }
  | { type: 'dialogue'; setup?: string; lines: DialogueLine[] }
  | { type: 'pronunciation'; letters: PronunciationLetter[] }
  | { type: 'reference_table'; intro?: string; examples?: SimpleSentence[]; tableTitle?: string; columns: string[]; sections: ReferenceTableSection[]; footnotes?: string[] }

function renderBodyText(body: string) {
  const paragraphs = body.split(/\n\n+/)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {paragraphs.map((para, i) => {
        // Render **bold** inline
        const parts = para.split(/(\*\*[^*]+\*\*)/)
        return (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : <span key={j}>{part}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DialogueSection({ lines, setup, lesson, audioMap }: {
  lines: DialogueLine[]
  setup?: string
  lesson: Lesson | null
  audioMap: AudioMap
}) {
  const [playingAll, setPlayingAll] = useState(false)
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef(false)

  const playAll = useCallback(async () => {
    if (playingAll) {
      // Stop
      abortRef.current = true
      audioRef.current?.pause()
      setPlayingAll(false)
      setActiveLine(null)
      return
    }

    abortRef.current = false
    setPlayingAll(true)

    for (let i = 0; i < lines.length; i++) {
      if (abortRef.current) break

      const line = lines[i]
      const lineVoice = lesson?.dialogue_voices?.[line.speaker] ?? lesson?.primary_voice ?? null
      const url = lineVoice ? resolveAudioUrl(audioMap, line.text, lineVoice) : null
      if (!url) continue

      setActiveLine(i)

      await new Promise<void>((resolve) => {
        const audio = new Audio(url)
        audioRef.current = audio
        audio.addEventListener('ended', () => resolve())
        audio.addEventListener('error', () => resolve())
        audio.play().catch(() => resolve())
      })

      // Brief pause between lines
      if (!abortRef.current && i < lines.length - 1) {
        await new Promise(r => setTimeout(r, 600))
      }
    }

    setPlayingAll(false)
    setActiveLine(null)
    audioRef.current = null
  }, [playingAll, lines, lesson, audioMap])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true
      audioRef.current?.pause()
    }
  }, [])

  const hasAnyAudio = lines.some(line => {
    const v = lesson?.dialogue_voices?.[line.speaker] ?? lesson?.primary_voice ?? null
    return v ? !!resolveAudioUrl(audioMap, line.text, v) : false
  })

  return (
    <div>
      {setup && <div className={classes.dialogueSetup}>{setup}</div>}
      {hasAnyAudio && (
        <Button
          variant={playingAll ? 'filled' : 'light'}
          size="xs"
          leftSection={playingAll ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
          onClick={playAll}
          mb="md"
        >
          {playingAll ? 'Stop' : 'Speel dialoog af'}
        </Button>
      )}
      <div className={classes.dialogueLines}>
        {lines.map((line, i) => {
          const lineVoice = lesson?.dialogue_voices?.[line.speaker] ?? lesson?.primary_voice ?? null
          return (
            <div
              key={i}
              className={classes.dialogueLine}
              style={activeLine === i ? { background: 'var(--card-bg)', borderRadius: 'var(--r-md)', padding: '8px', margin: '-8px', transition: 'background 0.2s' } : undefined}
            >
              <div className={classes.dialogueSpeaker}>{line.speaker}</div>
              <div>
                <div className={classes.dialogueText} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {line.text}
                  <PlayButton audioUrl={lineVoice ? resolveAudioUrl(audioMap, line.text, lineVoice) : undefined} />
                </div>
                <div className={classes.dialogueTranslation}>{line.translation}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectionContent({ content, lesson }: { content: unknown; lesson: Lesson | null }) {
  const data = content as SectionContentData
  const T = useT()
  const { audioMap, voiceId } = useAudio()

  if (data?.type === 'vocabulary' || data?.type === 'expressions' || data?.type === 'numbers') {
    return (
      <div className={classes.contentCard}>
        <div className={classes.phraseList}>
          {data.items.map((item, i) => (
            <div key={i} className={classes.phraseRow}>
              <div className={classes.phraseIndo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {item.indonesian}
                <PlayButton audioUrl={item.indonesian && voiceId ? resolveAudioUrl(audioMap, item.indonesian, voiceId) : undefined} />
              </div>
              <div className={classes.phraseDutch}>{item.dutch}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data?.type === 'exercises' && Array.isArray(data.sections)) {
    return (
      <>
        {data.sections.map((section, i) => (
          <div key={i} style={{ marginBottom: i < data.sections!.length - 1 ? 40 : 0 }}>
            <div className={classes.contentSectionLabel}>{section.title}</div>
            {section.instruction && (
              <div className={classes.phrasePhonetic} style={{ marginBottom: 8 }}>{section.instruction}</div>
            )}
            {section.items && (
              <ol className={classes.exerciseList}>
                {section.items.map((item, j) => {
                  const prompt = item.prompt ?? item.indonesian ?? item.dutch ?? item.phrase ?? item.text ?? item.question ?? ''
                  const hint = item.answer ?? (item.indonesian && item.dutch ? item.dutch : undefined)
                  return (
                    <li key={j} className={classes.exerciseItem}>
                      <span className={classes.exercisePrompt}>{prompt}</span>
                      {hint && <span className={classes.exerciseHint}> — {hint}</span>}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        ))}
      </>
    )
  }

  if (data?.type === 'text') {
    const textData = data as unknown as TextData
    return (
      <>
        {textData.intro && <div className={classes.lessonIntro}>{textData.intro}</div>}
        {textData.paragraphs && textData.paragraphs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            {textData.paragraphs.map((p, i) => (
              <div key={i} className={classes.lessonIntro} style={{ marginBottom: 0 }}>{p}</div>
            ))}
          </div>
        )}
        
        {textData.examples && textData.examples.length > 0 && (
          <>
            <div className={classes.contentSectionLabel}>{T.lessons.examples}</div>
            <div style={{ marginBottom: 32 }}>
              <div className={classes.phraseList}>
                {textData.examples.map((ex, i) => (
                  <div key={i} className={classes.phraseRow}>
                    <div>
                      <div className={classes.phraseIndo} style={{ fontWeight: 400 }}>{ex.indonesian}</div>
                      <div className={classes.phrasePhonetic}>{ex.phonetic}</div>
                    </div>
                    <div className={classes.phraseDutch}>{ex.dutch}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {textData.spelling && textData.spelling.length > 0 && (
          <>
            <div className={classes.contentSectionLabel}>{T.lessons.spelling}</div>
            <div className={classes.spellingGrid} style={{ marginBottom: 32 }}>
              {textData.spelling.map((s, i) => (
                <div key={i} className={classes.spellingChip}>
                  <div className={classes.spellingRule}>{s.rule}</div>
                  <div className={classes.spellingExample}>{s.example}</div>
                  <div className={classes.spellingMeaning}>{s.dutch}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {textData.sentences && textData.sentences.length > 0 && (
          <>
            <div>
              <div className={classes.sentenceList}>
                {textData.sentences.map((s, i) => (
                  <div key={i} className={classes.sentenceRow}>
                    <div className={classes.sentenceIndo}>{s.indonesian}</div>
                    <div className={classes.sentenceDutch}>{s.dutch}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  if (data?.type === 'grammar' && typeof (data as unknown as { body?: string }).body === 'string') {
    return renderBodyText((data as unknown as { body: string }).body)
  }

  if (data?.type === 'exercises' && typeof (data as unknown as { body?: string }).body === 'string') {
    return renderBodyText((data as unknown as { body: string }).body)
  }

  if (data?.type === 'grammar' && Array.isArray(data.categories)) {
    return (
      <>
        {data.intro && <div className={classes.lessonIntro}>{data.intro}</div>}
        <div className={classes.grammarCard}>
          {data.categories.map((cat, i) => (
            <div key={i} className={classes.grammarCategory}>
              <div className={classes.grammarTitle}>{cat.title}</div>
              {cat.rules && cat.rules.length > 0 && (
                <div className={classes.grammarRules}>
                  {cat.rules.map((rule, j) => (
                    <div key={j} className={classes.grammarRule}>
                      <IndoText text={rule} />
                    </div>
                  ))}
                </div>
              )}
              {cat.examples && cat.examples.length > 0 && (
                <div className={classes.phraseList}>
                  {(cat.examples as { indonesian: string; dutch: string }[]).map((ex, j) => (
                    <div key={j} className={classes.phraseRow}>
                      <div className={classes.phraseIndo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IndoText text={ex.indonesian} />
                        <PlayButton audioUrl={voiceId ? resolveAudioUrl(audioMap, ex.indonesian, voiceId) : undefined} />
                      </div>
                      <div className={classes.phraseDutch}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
              {cat.table && cat.table.length > 0 && (
                Array.isArray(cat.table[0])
                  ? (
                    // string[][] — header row + data rows
                    <table className={classes.grammarTable}>
                      <thead>
                        <tr>
                          {(cat.table[0] as string[]).map((h, k) => (
                            <th key={k} className={classes.grammarTableHeader}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(cat.table as string[][]).slice(1).map((row, j) => (
                          <tr key={j}>
                            {row.map((cell, k) => (
                              <td key={k} className={classes.grammarTableCell}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                  : (
                    // GrammarTableRow[] — legacy format
                    <div className={classes.phraseList}>
                      {(cat.table as GrammarTableRow[]).map((row, j) => (
                        <div key={j}>
                          <div className={classes.phraseRow}>
                            <div className={classes.phraseIndo}>{row.word}</div>
                            <div className={classes.phraseDutch}>{row.asks ?? row.dutch}</div>
                          </div>
                          {row.combinations && row.combinations.length > 0 && (
                            <div style={{ paddingLeft: 16, marginBottom: 4 }}>
                              {row.combinations.map((c, k) => (
                                <div key={k} className={classes.phrasePhonetic}>{c}</div>
                              ))}
                            </div>
                          )}
                          {row.example && (
                            <div style={{ paddingLeft: 16, marginBottom: 8 }} className={classes.phrasePhonetic}>{row.example}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
              )}
              {i < data.categories.length - 1 && <div className={classes.divider} />}
            </div>
          ))}
        </div>
      </>
    )
  }

  if (data?.type === 'dialogue' && Array.isArray(data.lines)) {
    return (
      <DialogueSection
        lines={data.lines}
        setup={data.setup}
        lesson={lesson}
        audioMap={audioMap}
      />
    )
  }

  if (data?.type === 'reference_table') {
    const d = data as unknown as {
      type: 'reference_table'
      intro?: string
      examples?: SimpleSentence[]
      tableTitle?: string
      columns: string[]
      sections: ReferenceTableSection[]
      footnotes?: string[]
    }
    return (
      <>
        {d.intro && (
          <div className={classes.lessonIntro} style={{ marginBottom: 24 }}>{d.intro}</div>
        )}
        {d.examples && d.examples.length > 0 && (
          <div className={classes.sentenceList} style={{ marginBottom: 28 }}>
            {d.examples.map((ex, i) => (
              <div key={i} className={classes.sentenceRow}>
                <div className={classes.sentenceIndo}>{ex.indonesian}</div>
                <div className={classes.sentenceDutch}>{ex.dutch}</div>
              </div>
            ))}
          </div>
        )}
        {d.tableTitle && (
          <div className={classes.contentSectionLabel} style={{ marginBottom: 12 }}>{d.tableTitle}</div>
        )}
        <div className={classes.refTableWrap}>
          <table className={classes.refTable}>
            <thead>
              <tr>
                {d.columns.map((col, i) => <th key={i}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.sections.map((section, si) => (
                <React.Fragment key={si}>
                  <tr className={classes.refTableSectionHead}>
                    <td colSpan={d.columns.length}>{section.heading}</td>
                  </tr>
                  {section.rows.map((row, ri) => (
                    <tr key={`${si}-${ri}`}>
                      <td className={classes.refTableLabelCell}>{row.label}</td>
                      {row.cells.map((cell, ci) => <td key={ci}>{cell}</td>)}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {d.footnotes && d.footnotes.map((note, i) => (
          <div key={i} className={classes.refTableFootnote}>{note}</div>
        ))}
      </>
    )
  }

  if (data?.type === 'pronunciation' && Array.isArray(data.letters)) {
    return (
      <div className={classes.pronunciationList}>
        {data.letters.map((item, i) => (
          <div key={i} className={classes.pronunciationRow}>
            <div className={classes.pronunciationLetter}>{item.letter}</div>
            <div className={classes.pronunciationRule}>{item.rule}</div>
            <div className={classes.pronunciationExamples}>
              {item.examples.map((ex, j) => (
                <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: j < item.examples.length - 1 ? 6 : 0 }}>
                  {ex}
                  <PlayButton audioUrl={voiceId ? resolveAudioUrl(audioMap, ex, voiceId) : undefined} size="xs" />
                  {j < item.examples.length - 1 && <span>,</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={classes.bodySm} style={{ whiteSpace: 'pre-wrap' }}>
      {/* Fallback for unknown content types */}
      {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
    </div>
  )
}

interface VocabularyItem {
  item: LearningItem
  meaning: ItemMeaning | null
  itemState: LearnerItemState | null
  skillStates: LearnerSkillState[]
}

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const T = useT()
  const user = useAuthStore((state) => state.user)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const initialSection = Math.max(0, parseInt(searchParams.get('section') ?? '0', 10) || 0)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(initialSection)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  useSessionBeacon(sessionIdRef)
  const [completedSections, setCompletedSections] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [activeTab, setActiveTab] = useState<string | null>('learn')
  const [vocabularyItems, setVocabularyItems] = useState<VocabularyItem[]>([])
  const [vocabularyLoading, setVocabularyLoading] = useState(false)
  const [audioMap, setAudioMap] = useState<AudioMap>(new Map())

  const loadVocabulary = async () => {
    if (!lessonId || !user || vocabularyLoading) return
    try {
      setVocabularyLoading(true)
      // Get all item contexts for this lesson
      const contexts = await learningItemService.getItemContextsByLesson(lessonId)
      if (contexts.length === 0) {
        setVocabularyItems([])
        return
      }

      // Get unique learning item IDs
      const itemIds = Array.from(new Set(contexts.map(c => c.learning_item_id)))

      // Fetch learning items, meanings, and learner states in parallel
      const items = await Promise.all(itemIds.map(id => learningItemService.getLearningItem(id)))
      const meanings = await learningItemService.getMeaningsBatch(itemIds)
      const itemStates = await learnerStateService.getItemStates(user.id)
      const skillStates = await learnerStateService.getSkillStatesBatch(user.id)

      // Create vocabulary items with all data
      const vocabItems: VocabularyItem[] = items.map(item => {
        const meaning = meanings.find(m => m.learning_item_id === item.id && m.translation_language === 'nl') ||
                       meanings.find(m => m.learning_item_id === item.id)
        const itemState = itemStates.find(s => s.learning_item_id === item.id)
        const itemSkills = skillStates.filter(s => s.learning_item_id === item.id)

        return { item, meaning: meaning || null, itemState: itemState || null, skillStates: itemSkills }
      })

      setVocabularyItems(vocabItems)
    } catch (err) {
      logError({ page: 'lesson', action: 'loadVocabulary', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
    } finally {
      setVocabularyLoading(false)
    }
  }

  useEffect(() => {
    async function fetchData() {
      if (!lessonId || !user) return
      try {
        const [lessonData, sid] = await Promise.all([
          lessonService.getLesson(lessonId),
          startSession(user.id, 'lesson')
        ])

        setLesson(lessonData)
        sessionIdRef.current = sid
        setCurrentSectionIndex((prev) => Math.min(prev, lessonData.lesson_sections.length - 1))

        // Fetch existing progress
        const progress = await lessonService.getUserLessonProgress(user.id)
        const lessonProgress = progress.find((p: any) => p.lesson_id === lessonId)
        if (lessonProgress) {
          setCompletedSections(lessonProgress.sections_completed || [])
        }
      } catch (err) {
        logError({ page: 'lesson', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToLoadLesson })
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(err => {
          logError({ page: 'lesson', action: 'endSession', error: err })
          notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
        })
      }
    }
  }, [lessonId, user, T.common.error, T.lessons.failedToLoadLesson])

  // Fetch audio map whenever lesson loads
  useEffect(() => {
    if (!lesson) return
    const primaryVoice = lesson.primary_voice
    if (!primaryVoice) return

    const allVoices = new Set<string>([primaryVoice])
    if (lesson.dialogue_voices) {
      Object.values(lesson.dialogue_voices).forEach(v => allVoices.add(v))
    }

    const allTexts = new Set<string>()
    for (const section of lesson.lesson_sections) {
      const c = section.content as SectionContentData
      if (c?.type === 'vocabulary' || c?.type === 'expressions' || c?.type === 'numbers') {
        for (const item of c.items) {
          if (item.indonesian) allTexts.add(normalizeTtsText(item.indonesian))
        }
      } else if (c?.type === 'dialogue' && Array.isArray(c.lines)) {
        for (const line of c.lines) {
          allTexts.add(normalizeTtsText(line.text))
        }
      } else if (c?.type === 'grammar' && Array.isArray(c.categories)) {
        for (const cat of c.categories) {
          if (cat.examples) {
            for (const ex of cat.examples) {
              allTexts.add(normalizeTtsText(ex.indonesian))
            }
          }
        }
      } else if (c?.type === 'pronunciation' && Array.isArray((c as unknown as { letters: PronunciationLetter[] }).letters)) {
        for (const item of (c as unknown as { letters: PronunciationLetter[] }).letters) {
          for (const ex of item.examples) {
            allTexts.add(normalizeTtsText(ex))
          }
        }
      }
    }

    if (allTexts.size === 0) return

    fetchAudioMap(Array.from(allTexts), Array.from(allVoices))
      .then(map => setAudioMap(map))
      .catch(err => logError({ page: 'lesson', action: 'fetchAudioMap', error: err }))
  }, [lesson])

  const handleNext = async () => {
    if (!lesson || !user) return
    
    const section = lesson.lesson_sections[currentSectionIndex]
    const nextSections = Array.from(new Set([...completedSections, section.id]))
    setCompletedSections(nextSections)
    
    // Save incremental progress
    try {
      await progressService.markLessonComplete(user.id, lesson.id, nextSections)
    } catch (err) {
      logError({ page: 'lesson', action: 'saveProgress', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToSaveProgress })
      return
    }

    if (currentSectionIndex < lesson.lesson_sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
      document.querySelector('main')?.scrollTo(0, 0)
    } else {
      // Final completion
      notifications.show({
        color: 'green',
        title: T.lessons.lessonComplete,
        message: T.lessons.lessonCompleteMessage(lesson.title),
        icon: <IconCheck size={16} />
      })
      navigate('/lessons')
    }
  }

  const handleBack = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1)
      document.querySelector('main')?.scrollTo(0, 0)
    }
  }

  const handleNextRef = useRef(handleNext)
  const handleBackRef = useRef(handleBack)
  useEffect(() => { handleNextRef.current = handleNext }, [handleNext])
  useEffect(() => { handleBackRef.current = handleBack }, [handleBack])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'ArrowRight') handleNextRef.current()
      if (e.key === 'ArrowLeft') handleBackRef.current()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const handleVolumeChange = (v: number) => {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) audioRef.current.playbackRate = rate
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  if (error || !lesson) {
    return (
      <Center h="50vh">
        <Text c="dimmed">Failed to load lesson.</Text>
      </Center>
    )
  }

  const currentSection = lesson.lesson_sections[currentSectionIndex]
  const audioUrl = lesson.audio_path ? lessonService.getAudioUrl(lesson.audio_path) : null

  return (
    <Container size="md" className={classes.lesson}>
      {/* Back + progress — inline, no bar */}
      <div className={classes.lessonSubnav}>
        <button className={`${classes.btn} ${classes.btnGhost}`} style={{ paddingLeft: 2, color: 'var(--text-tertiary)' }} onClick={() => navigate('/lessons')}>
          <IconChevronLeft size={15} />
          {lesson.title.replace(/\s*\([^)]*\)/g, '')}
        </button>
        <div className={classes.lessonSectionNav}>
          <button
            className={`${classes.btn} ${classes.btnGhost}`}
            onClick={handleBack}
            disabled={currentSectionIndex === 0}
            style={{ opacity: currentSectionIndex === 0 ? 0.3 : 1, padding: '6px 10px' }}
          >
            <IconChevronLeft size={14} />
            {T.lessons.previous}
          </button>
          <div className={classes.progressDots}>
            {lesson.lesson_sections.map((_, i) => (
              <div
                key={i}
                className={`${classes.dot} ${i < currentSectionIndex ? classes.dotDone : ''} ${i === currentSectionIndex ? classes.dotCurr : ''}`}
              />
            ))}
          </div>
          <button
            className={`${classes.btn} ${classes.btnGhost}`}
            onClick={handleNext}
            style={{ padding: '6px 10px' }}
          >
            {currentSectionIndex === lesson.lesson_sections.length - 1 ? T.lessons.finishLesson : T.lessons.nextSection}
            <IconChevronRight size={14} />
          </button>
        </div>
      </div>

      {audioUrl && (
        <>
          <MiniAudioPlayer
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            playbackRate={playbackRate}
            onPlaybackRateChange={handlePlaybackRateChange}
          />
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
            style={{ display: 'none' }}
          />
        </>
      )}

      <Tabs
        value={activeTab}
        onChange={(value: string | null) => {
          setActiveTab(value)
          if (value === 'vocabulary' && vocabularyItems.length === 0 && !vocabularyLoading) {
            loadVocabulary()
          }
        }}
        defaultValue="learn"
      >
        <Tabs.List>
          <Tabs.Tab value="learn">{T.lessons.learn}</Tabs.Tab>
          <Tabs.Tab value="vocabulary">{T.lessons.vocabulary}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="learn" py="md">
          <div className={classes.sectionHeader} style={{ marginBottom: 24 }}>
            <div className={classes.displaySm}>{currentSection.title.replace(/\s*\(.*?\)\s*$/, '')}</div>
          </div>
          <div style={{ minHeight: '200px', marginBottom: 40 }}>
            <AudioProvider audioMap={audioMap} voiceId={lesson.primary_voice ?? null}>
              <SectionContent content={currentSection.content} lesson={lesson} />
            </AudioProvider>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="vocabulary" py="md">
          <Stack gap="lg">
            {vocabularyLoading && <Center><Loader size="sm" /></Center>}
            {!vocabularyLoading && vocabularyItems.length === 0 && (
              <Text c="dimmed" ta="center">{T.lessons.noVocabulary}</Text>
            )}
            {!vocabularyLoading && vocabularyItems.length > 0 && (
              <>
                <div>
                  {vocabularyItems.map((vocabItem) => {
                    const stageColors: Record<string, string> = {
                      new: 'gray',
                      anchoring: 'yellow',
                      retrieving: 'blue',
                      productive: 'teal',
                      maintenance: 'green',
                    }
                    const stage = vocabItem.itemState?.stage || 'new'
                    const stageColor = stageColors[stage] || 'gray'

                    // Calculate skill strength as average of recognition and recall stability
                    const skillStrength = vocabItem.skillStates.length > 0
                      ? vocabItem.skillStates.reduce((sum, s) => sum + (s.stability || 0), 0) / vocabItem.skillStates.length
                      : 0
                    const skillStrengthPercent = Math.min(100, Math.round((skillStrength / 10) * 100))

                    return (
                      <Box key={vocabItem.item.id} className={classes.vocabItem}>
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <Box style={{ flex: 1 }}>
                            <Text fw={500}>{vocabItem.item.base_text}</Text>
                            {vocabItem.meaning && (
                              <Text size="sm" c="dimmed">{vocabItem.meaning.translation_text}</Text>
                            )}
                          </Box>
                          <Badge color={stageColor} size="sm">
                            {stage}
                          </Badge>
                        </Group>
                        {vocabItem.skillStates.length > 0 && (
                          <Progress value={skillStrengthPercent} size="sm" radius="md" />
                        )}
                      </Box>
                    )
                  })}
                </div>
                <Button
                  onClick={() => navigate(`/session?lesson=${lessonId}`)}
                  fullWidth
                  size="md"
                >
                  {T.lessons.practiceThisLesson}
                </Button>
              </>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <div className={classes.lessonNav}>
        <button 
          className={`${classes.btn} ${classes.btnGhost}`} 
          onClick={handleBack} 
          disabled={currentSectionIndex === 0}
          style={{ opacity: currentSectionIndex === 0 ? 0.3 : 1 }}
        >
          <IconChevronLeft size={16} />
          {T.lessons.previous}
        </button>
        <button
          className={`${classes.btn} ${classes.btnGhost}`}
          onClick={handleNext}
        >
          {currentSectionIndex === lesson.lesson_sections.length - 1 ? T.lessons.finishLesson : T.lessons.nextSection}
          {currentSectionIndex === lesson.lesson_sections.length - 1 ? <IconCheck size={16} style={{ marginLeft: 8 }} /> : <IconChevronRight size={16} style={{ marginLeft: 8 }} />}
        </button>
      </div>
    </Container>
  )
}
