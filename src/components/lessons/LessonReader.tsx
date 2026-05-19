import { Link } from 'react-router-dom'
import { IconArrowLeft, IconHeadphones } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
} from '@/components/page/primitives'
import type { LessonExperience, LessonPracticeAction } from '@/lib/lessons'
import { LessonBlockRenderer } from './blocks/LessonBlockRenderer'
import classes from './LessonReader.module.css'

export function LessonReader(props: {
  experience: LessonExperience
  actions?: LessonPracticeAction[]
  lessonAudioUrl?: string | null
  lessonDurationSeconds?: number | null
  onBack: () => void
}) {
  const {
    experience,
    actions = [],
    lessonAudioUrl,
    lessonDurationSeconds,
    onBack,
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
                <LessonBlockRenderer block={block} />
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
