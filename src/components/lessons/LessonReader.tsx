import { Link } from 'react-router-dom'
import { IconArrowLeft, IconHeadphones } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
} from '@/components/page/primitives'
import type { LessonExperience, LessonExperienceBlock } from '@/lib/lessons/lessonExperience'
import type { LessonPracticeAction } from '@/lib/lessons/lessonActionModel'
import type { LessonExposureKind } from '@/lib/lessons/lessonExposureProgress'
import type { SourceProgressEventType, SourceProgressState } from '@/services/sourceProgressService'
import { LessonBlockRenderer } from './blocks/LessonBlockRenderer'
import classes from './LessonReader.module.css'

export function LessonReader(props: {
  experience: LessonExperience
  progressBySourceRef: Map<string, SourceProgressState>
  actions?: LessonPracticeAction[]
  lessonAudioUrl?: string | null
  lessonDurationSeconds?: number | null
  onBack: () => void
  onSourceProgress: (block: LessonExperienceBlock, eventType: SourceProgressEventType) => void
  onLessonExposureProgress?: (block: LessonExperienceBlock, exposureKind: LessonExposureKind) => void
}) {
  const {
    experience,
    progressBySourceRef,
    actions = [],
    lessonAudioUrl,
    lessonDurationSeconds,
    onBack,
    onSourceProgress,
    onLessonExposureProgress,
  } = props
  const lessonDurationMinutes = lessonDurationSeconds ? Math.max(1, Math.round(lessonDurationSeconds / 60)) : null

  return (
    <PageContainer size="xl">
      <PageBody>
        <div className={classes.readerShell}>
          <nav className={classes.progressRail} aria-label="Lesvoortgang">
            <button type="button" className={classes.backButton} onClick={onBack}>
              <IconArrowLeft size={14} />
              <span>Terug</span>
            </button>
            <ol className={classes.tocList}>
              {experience.blocks.map((block, index) => (
                <li key={block.id}>
                  <a href={`#${block.id}`} className={classes.tocLink}>
                    <span className={classes.tocNumber}>{index + 1}</span>
                    <span className={classes.tocTitle}>{block.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className={classes.lessonColumn}>
            {experience.blocks.map(block => (
              <div id={block.id} key={block.id} className={classes.anchorTarget}>
                <LessonBlockRenderer
                  block={block}
                  progress={progressBySourceRef.get(`${block.sourceRefs[0] ?? block.sourceRef}::${block.id}`)}
                  onProgress={(target) => onSourceProgress(target, target.sourceProgressEvent ?? 'section_exposed')}
                  onLessonExposureProgress={onLessonExposureProgress}
                />
              </div>
            ))}
          </article>

          <aside className={classes.companion} aria-label="Lescontext">
            <p className={classes.companionLabel}>Bron</p>
            <h2 className={classes.companionTitle}>{experience.title}</h2>
            <p className={classes.companionLevel}>{experience.level}</p>

            {lessonAudioUrl && (
              <section className={classes.lessonAudioPanel} aria-label="Lesaudio">
                <div className={classes.lessonAudioHeader}>
                  <span className={classes.lessonAudioTitle}>
                    <IconHeadphones size={14} />
                    Luister naar de les
                  </span>
                  {lessonDurationMinutes && (
                    <span className={classes.lessonAudioDuration}>{lessonDurationMinutes} min</span>
                  )}
                </div>
                <audio controls preload="metadata" src={lessonAudioUrl} data-testid="lesson-audio-player" />
              </section>
            )}

            {actions.length > 0 && (
              <div className={classes.lessonActions} aria-label="Lesson practice actions">
                {actions.map(action => (
                  <Link
                    key={action.kind}
                    to={action.href}
                    className={action.priority === 'primary' ? classes.primaryAction : classes.secondaryAction}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}

            <details className={classes.companionDetails}>
              <summary>{experience.sourceRefs.length} bronverwijzing(en)</summary>
              <ul>
                {experience.sourceRefs.map(ref => <li key={ref}><code>{ref}</code></li>)}
              </ul>
            </details>

            <p className={classes.companionFootnote}>
              Oefenbruggen verwijzen naar vaardigheden, maar activeren FSRS niet direct.
            </p>
          </aside>
        </div>
      </PageBody>
    </PageContainer>
  )
}
