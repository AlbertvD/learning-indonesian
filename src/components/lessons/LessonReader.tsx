import { Link } from 'react-router-dom'
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
  onBack: () => void
  onSourceProgress: (block: LessonExperienceBlock, eventType: SourceProgressEventType) => void
  onLessonExposureProgress?: (block: LessonExperienceBlock, exposureKind: LessonExposureKind) => void
}) {
  const { experience, progressBySourceRef, actions = [], onBack, onSourceProgress, onLessonExposureProgress } = props

  return (
    <main className={classes.root}>
      <div className={classes.readerShell}>
        <nav className={classes.progressRail} aria-label="Lesvoortgang">
          <button type="button" onClick={onBack}>Terug</button>
          {experience.blocks.map((block, index) => (
            <a key={block.id} href={`#${block.id}`}>
              <span>{index + 1}</span>
              {block.title}
            </a>
          ))}
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
          <h2>{experience.title}</h2>
          <p>{experience.level}</p>
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
          <details>
            <summary>{experience.sourceRefs.length} bronverwijzing(en)</summary>
            <ul>
              {experience.sourceRefs.map(ref => <li key={ref}><code>{ref}</code></li>)}
            </ul>
          </details>
          <p>Oefenbruggen verwijzen naar vaardigheden, maar activeren FSRS niet direct.</p>
        </aside>
      </div>
    </main>
  )
}
