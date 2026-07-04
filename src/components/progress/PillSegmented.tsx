// src/components/progress/PillSegmented.tsx
//
// A pill-shaped segmented control with a sliding indicator — the clean,
// modern filter pattern (Mobbin/Eleken). Thin wrapper over Mantine's
// SegmentedControl (which already animates the indicator), filled with the
// app's tamarind action color (desktop slice 4 warm retune). Reused for the
// tab switch and the vocab/grammar filter.
import { SegmentedControl } from '@mantine/core'
import classes from './PillSegmented.module.css'

export interface PillSegmentedProps {
  value: string
  onChange: (value: string) => void
  data: { value: string; label: string }[]
  fullWidth?: boolean
  className?: string
}

export function PillSegmented({ value, onChange, data, fullWidth, className }: PillSegmentedProps) {
  return (
    <SegmentedControl
      className={className}
      fullWidth={fullWidth}
      radius="xl"
      withItemsBorders={false}
      value={value}
      onChange={onChange}
      data={data}
      classNames={{
        root: classes.root,
        indicator: classes.indicator,
        label: classes.label,
      }}
    />
  )
}
