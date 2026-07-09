// src/components/dashboard/FirstRunChecklist.tsx — the "Aan de slag" first-run
// stepper (desktop program slice 3). Replaces the Vandaag panel in the hero
// position for accounts that haven't finished the first-run steps, on
// desktop AND mobile. Step state derivation lives in Dashboard.tsx +
// lib/firstRun.ts; this component is presentational.
import { Link, useNavigate } from 'react-router-dom'
import { IconCheck } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import classes from './FirstRunChecklist.module.css'

export interface ChecklistSteps {
  lessonOpened: boolean
  sessionDone: boolean
  uitspraakVisited: boolean
  ontdekVisited: boolean
}

interface FirstRunChecklistProps {
  steps: ChecklistSteps
  /** Step (uitspraak) is dismissable — marks it done without visiting the primer. */
  onSkipUitspraak: () => void
  /** Step ④ is dismissable — marks it done without visiting Ontdek. */
  onSkipOntdek: () => void
}

export function FirstRunChecklist({ steps, onSkipUitspraak, onSkipOntdek }: FirstRunChecklistProps) {
  const T = useT()
  const navigate = useNavigate()

  const items = [
    {
      key: 'lesson',
      done: steps.lessonOpened,
      title: T.checklist.step1Title,
      sub: T.checklist.step1Sub,
      action: <Link className={classes.action} to="/leren">{T.checklist.view}</Link>,
    },
    {
      key: 'session',
      done: steps.sessionDone,
      title: T.checklist.step2Title,
      sub: T.checklist.step2Sub,
      action: (
        <button className={classes.action} onClick={() => navigate('/session')}>
          {T.checklist.start}
        </button>
      ),
    },
    {
      key: 'uitspraak',
      done: steps.uitspraakVisited,
      title: T.checklist.stepUitspraakTitle,
      sub: T.checklist.stepUitspraakSub,
      action: (
        <span className={classes.actionRow}>
          <Link className={classes.action} to="/pronunciation">{T.checklist.read}</Link>
          <button className={classes.skip} onClick={onSkipUitspraak}>{T.checklist.skip}</button>
        </span>
      ),
    },
    {
      key: 'ontdek',
      done: steps.ontdekVisited,
      title: T.checklist.step3Title,
      sub: T.checklist.step3Sub,
      action: (
        <span className={classes.actionRow}>
          <Link className={classes.action} to="/ontdek">{T.checklist.explore}</Link>
          <button className={classes.skip} onClick={onSkipOntdek}>{T.checklist.skip}</button>
        </span>
      ),
    },
  ]

  const currentKey = items.find(item => !item.done)?.key

  return (
    <section className={classes.card} data-testid="first-run-checklist">
      <div className={classes.label}>{T.checklist.label}</div>
      <h2 className={classes.title}>{T.checklist.title}</h2>
      <p className={classes.intro}>{T.checklist.intro}</p>

      <ol className={classes.stepper}>
        {items.map((item, index) => {
          const state = item.done ? classes.done : item.key === currentKey ? classes.current : ''
          return (
            <li key={item.key} className={`${classes.step} ${state}`}>
              <span className={classes.node} aria-hidden="true">
                {item.done ? <IconCheck size={15} stroke={3} /> : index + 1}
              </span>
              <div className={classes.body}>
                <h3>{item.title}</h3>
                {!item.done && <p>{item.sub}</p>}
              </div>
              {!item.done && item.key === currentKey && (
                <span className={classes.stepAction}>{item.action}</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
