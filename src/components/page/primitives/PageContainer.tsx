import type { ReactNode } from 'react'
import classes from './PageContainer.module.css'

export interface PageContainerProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  fit?: boolean
}

const SIZE_CLASS: Record<NonNullable<PageContainerProps['size']>, string> = {
  sm: classes.sm,
  md: classes.md,
  lg: classes.lg,
  xl: classes.xl,
}

export function PageContainer({ children, size = 'md', fit = false }: PageContainerProps) {
  return (
    <div className={`${classes.root} ${SIZE_CLASS[size]} ${fit ? classes.fit : ''}`}>
      {children}
    </div>
  )
}
