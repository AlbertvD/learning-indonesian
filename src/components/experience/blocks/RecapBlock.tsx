import type { ExerciseType } from '@/types/learning'
import { exerciseLabel } from '@/lib/session/sessionLabels'
import classes from '../ExperiencePlayer.module.css'

interface RecapCapabilityChange {
  id: string
  kind: 'due_review' | 'new_introduction'
  exerciseType: ExerciseType
}

interface RecapBlockProps {
  answeredCount: number
  totalCount: number
  dueCount: number
  newCount: number
  changedCapabilities: RecapCapabilityChange[]
  onComplete: () => void
}

export function RecapBlock({ answeredCount, totalCount, dueCount, newCount, changedCapabilities, onComplete }: RecapBlockProps) {
  const complete = totalCount === 0 || answeredCount === totalCount
  const answeredDue = changedCapabilities.filter(change => change.kind === 'due_review').length
  const answeredNew = changedCapabilities.filter(change => change.kind === 'new_introduction').length

  return (
    <section className={`${classes.panel} ${classes.recapPanel}`} aria-labelledby="experience-recap-title">
      <p className={classes.eyebrow}>Samenvatting</p>
      <h2 id="experience-recap-title">{complete ? 'Sessieroute afgerond' : 'Sessieroute bezig'}</h2>
      <p className={classes.lede}>
        {answeredCount} van {totalCount} vaardigheidskaarten zijn veilig opgeslagen. Deze samenvatting telt alleen kaarten die je hebt afgerond.
      </p>
      <div className={classes.statGrid}>
        <span><strong>{answeredDue}</strong> van {dueCount} herhaald</span>
        <span><strong>{answeredNew}</strong> van {newCount} geintroduceerd</span>
        <span><strong>{Math.max(totalCount - answeredCount, 0)}</strong> niet aangeraakt</span>
      </div>
      {changedCapabilities.length > 0 ? (
        <ul className={classes.changeList} aria-label="Vaardigheden aangeraakt in deze sessie">
          {changedCapabilities.map(change => (
            <li key={change.id}>
              <span>{change.kind === 'due_review' ? 'Herhaling opgeslagen' : 'Introductie gestart'}</span>
              <strong>{exerciseLabel(change.exerciseType)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={classes.noChanges}>Er zijn nog geen vaardigheidskaarten afgerond.</p>
      )}
      <button type="button" className={classes.primaryAction} onClick={onComplete} disabled={!complete}>
        {complete ? 'Sessie afronden' : 'Rond af na de kaarten'}
      </button>
    </section>
  )
}
