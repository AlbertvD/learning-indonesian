// src/components/nav/BackLink.tsx
//
// A small "← back" link, used by surfaces reached from a hub (the Affix and
// Pronunciation trainers, reached from Leren) so the learner can return.
import { Link } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'
import classes from './BackLink.module.css'

export interface BackLinkProps {
  to: string
  label: string
}

export function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link to={to} className={classes.back}>
      <IconArrowLeft size={16} />
      {label}
    </Link>
  )
}
