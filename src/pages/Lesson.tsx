// src/pages/Lesson.tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Center, Loader, Text } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconCheck } from '@tabler/icons-react'
import { lessonService, type Lesson } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import { startSession, endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { IndoText } from '@/components/IndoText'
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer'
import classes from './Lesson.module.css'

type ExerciseItem = { dutch?: string; indonesian?: string }
type PhoneticExample = { indonesian: string; phonetic: string; dutch: string }
type SpellingRule = { rule: string; example: string; dutch: string }
type SimpleSentence = { indonesian: string; dutch: string }
type GrammarCategory = { title: string; rules: string[] }
type DialogueLine = { speaker: string; text: string; translation?: string }

type SectionContentData =
  | { type: 'exercises'; items: ExerciseItem[] }
  | { type: 'text'; intro?: string; examples?: PhoneticExample[]; spelling?: SpellingRule[]; sentences?: SimpleSentence[] }
  | { type: 'grammar'; intro?: string; categories: GrammarCategory[] }
  | { type: 'dialogue'; setup?: string; lines: DialogueLine[] }

function SectionContent({ content }: { content: unknown }) {
  const data = content as SectionContentData
  const T = useT()

  if (data?.type === 'exercises' && Array.isArray(data.items)) {
    return (
      <div className={classes.contentCard}>
        <div className={classes.phraseList}>
          {data.items.map((item, i) => (
            <div key={i} className={classes.phraseRow}>
              <div>
                <div className={classes.phraseIndo}>{item.indonesian}</div>
              </div>
              <div className={classes.phraseDutch}>{item.dutch}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data?.type === 'text') {
    return (
      <>
        {data.intro && <div className={classes.lessonIntro}>{data.intro}</div>}
        
        {data.examples && data.examples.length > 0 && (
          <>
            <div className={classes.contentSectionLabel}>{T.lessons.examples}</div>
            <div className={classes.contentCard} style={{ marginBottom: 32 }}>
              <div className={classes.phraseList}>
                {data.examples.map((ex, i) => (
                  <div key={i} className={classes.phraseRow}>
                    <div>
                      <div className={classes.phraseIndo}>{ex.indonesian}</div>
                      <div className={classes.phrasePhonetic}>{ex.phonetic}</div>
                    </div>
                    <div className={classes.phraseDutch}>{ex.dutch}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {data.spelling && data.spelling.length > 0 && (
          <>
            <div className={classes.contentSectionLabel}>{T.lessons.spelling}</div>
            <div className={classes.spellingGrid} style={{ marginBottom: 32 }}>
              {data.spelling.map((s, i) => (
                <div key={i} className={classes.spellingChip}>
                  <div className={classes.spellingRule}>{s.rule}</div>
                  <div className={classes.spellingExample}>{s.example}</div>
                  <div className={classes.spellingMeaning}>{s.dutch}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {data.sentences && data.sentences.length > 0 && (
          <>
            <div className={classes.contentSectionLabel}>{T.lessons.simpleSentences}</div>
            <div className={classes.contentCard}>
              <div className={classes.sentenceList}>
                {data.sentences.map((s, i) => (
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

  if (data?.type === 'grammar' && Array.isArray(data.categories)) {
    return (
      <>
        {data.intro && <div className={classes.lessonIntro}>{data.intro}</div>}
        <div className={`${classes.contentCard} ${classes.grammarCard}`}>
          {data.categories.map((cat, i) => (
            <div key={i} className={classes.grammarCategory}>
              <div className={classes.grammarTitle}>{cat.title}</div>
              <div className={classes.grammarRules}>
                {cat.rules.map((rule, j) => (
                  <div key={j} className={classes.grammarRule}>
                    <IndoText text={rule} />
                  </div>
                ))}
              </div>
              {i < data.categories.length - 1 && <div className={classes.divider} />}
            </div>
          ))}
        </div>
      </>
    )
  }

  if (data?.type === 'dialogue' && Array.isArray(data.lines)) {
    return (
      <div className={`${classes.contentCard}`} style={{ padding: '26px 28px' }}>
        {data.setup && (
          <div className={classes.dialogueSetup}>{data.setup}</div>
        )}
        <div className={classes.dialogueLines}>
          {data.lines.map((line, i) => (
            <div key={i} className={classes.dialogueLine}>
              <div className={classes.dialogueSpeaker}>{line.speaker}</div>
              <div>
                <div className={classes.dialogueText}>{line.text}</div>
                <div className={classes.dialogueTranslation}>{line.translation}</div>
              </div>
            </div>
          ))}
        </div>
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

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const [completedSections, setCompletedSections] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)

  useEffect(() => {
    async function fetchData() {
      if (!lessonId || !user) return
      try {
        const [lessonData, sid] = await Promise.all([
          lessonService.getLesson(lessonId),
          startSession(user.id, 'lesson')
        ])

        // Reorder sections so grammar comes first
        const sections = [...lessonData.lesson_sections].sort((a, b) => {
          const aIsGrammar = (a.content as { type?: string }).type === 'grammar' ? -1 : 0
          const bIsGrammar = (b.content as { type?: string }).type === 'grammar' ? -1 : 0
          return aIsGrammar - bIsGrammar
        })
        setLesson({ ...lessonData, lesson_sections: sections })
        sessionIdRef.current = sid

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
        endSession(sessionIdRef.current).catch(err =>
          logError({ page: 'lesson', action: 'endSession', error: err })
        )
      }
    }
  }, [lessonId, user, T.common.error, T.lessons.failedToLoadLesson])

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
      window.scrollTo(0, 0)
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
      window.scrollTo(0, 0)
    }
  }

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

  const handlePlaybackRateChange = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2]
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]
    setPlaybackRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="violet" />
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
        <button className={`${classes.btn} ${classes.btnGhost}`} style={{ paddingLeft: 2, color: 'var(--text-3)' }} onClick={() => navigate('/lessons')}>
          <IconChevronLeft size={15} />
          {lesson.title.replace(/\s*\([^)]*\)/g, '')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={classes.progressDots}>
            {lesson.lesson_sections.map((_, i) => (
              <div 
                key={i} 
                className={`${classes.dot} ${i < currentSectionIndex ? classes.dotDone : ''} ${i === currentSectionIndex ? classes.dotCurr : ''}`} 
              />
            ))}
          </div>
          <span className={classes.caption}>{currentSectionIndex + 1} {T.lessons.of} {lesson.lesson_sections.length}</span>
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

      <div className={classes.sectionHeader} style={{ marginBottom: 24 }}>
        <span className={classes.label}>{T.lessons.section} {currentSectionIndex + 1}</span>
        <div className={classes.displaySm}>{currentSection.title.replace(/\s*\(.*?\)\s*$/, '')}</div>
      </div>

      <div style={{ minHeight: '200px', marginBottom: 40 }}>
        <SectionContent content={currentSection.content} />
      </div>

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
          className={`${classes.btn} ${classes.btnPrimary} ${classes.btnLg}`}
          onClick={handleNext}
        >
          {currentSectionIndex === lesson.lesson_sections.length - 1 ? T.lessons.finishLesson : T.lessons.nextSection}
          {currentSectionIndex === lesson.lesson_sections.length - 1 ? <IconCheck size={16} style={{ marginLeft: 8 }} /> : <IconChevronRight size={16} style={{ marginLeft: 8 }} />}
        </button>
      </div>
    </Container>
  )
}
