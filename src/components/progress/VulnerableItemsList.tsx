// src/components/progress/VulnerableItemsList.tsx
import { Skeleton } from '@mantine/core'
import classes from './VulnerableItemsList.module.css'

interface VulnerableItemsListProps {
  items: { id: string; indonesianText: string; meaning: string; lapseCount: number; consecutiveFailures: number }[] | null
  loading: boolean
}

function strengthColor(lapseCount: number): string {
  if (lapseCount >= 3) return 'var(--danger)'
  if (lapseCount >= 2) return 'var(--warning)'
  return 'var(--text-secondary)'
}

function strengthPct(lapseCount: number): number {
  return Math.max(10, 100 - lapseCount * 18)
}

export function VulnerableItemsList({ items, loading }: VulnerableItemsListProps) {
  if (!loading && (items === null || items.length === 0)) return null

  return (
    <div>
      <div className="section-label">Meest Kwetsbare Woorden</div>

      <div className={classes.card}>
        <p className={classes.subtitle}>
          Woorden die het meest aandacht nodig hebben op basis van herhaalde fouten.
        </p>

        {loading && (
          <div className={classes.list}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={36} radius={6} />
            ))}
          </div>
        )}

        {!loading && items !== null && items.length > 0 && (
          <div className={classes.list}>
            {items.slice(0, 5).map((item) => {
              const pct = strengthPct(item.lapseCount)
              const color = strengthColor(item.lapseCount)
              const showLapseIcon = item.lapseCount > 0

              return (
                <div key={item.id} className={classes.item}>
                  <span className={classes.word}>{item.indonesianText}</span>
                  <span className={classes.meaning}>{item.meaning}</span>
                  <span className={classes.lapseCount}>
                    {showLapseIcon && (
                      <span className={classes.lapseIcon} style={{ borderColor: color, color }}>!</span>
                    )}
                    {item.lapseCount} {item.lapseCount === 1 ? 'lapse' : 'lapses'}
                  </span>
                  <div className={classes.barWrap}>
                    <div
                      className={classes.bar}
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className={classes.pct} style={{ color }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
