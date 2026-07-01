// src/components/nav/HubCard.tsx
//
// A tappable navigation entry card — icon + title + description + chevron — used
// by the hub pages (Ontdek's two choices, Leren's practice-tool entries) to route
// into an existing surface. Pure navigation, no data.
import { Link } from 'react-router-dom'
import { IconChevronRight } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import classes from './HubCard.module.css'

export interface HubCardProps {
  to: string
  icon: ReactNode
  title: string
  description: string
}

export function HubCard({ to, icon, title, description }: HubCardProps) {
  return (
    <Link to={to} className={classes.card}>
      <span className={classes.icon}>{icon}</span>
      <span className={classes.body}>
        <span className={classes.title}>{title}</span>
        <span className={classes.desc}>{description}</span>
      </span>
      <IconChevronRight size={18} className={classes.chevron} />
    </Link>
  )
}
