// src/components/page/primitives/LoadingState.tsx
// Centered Mantine Loader + optional caption — the primitive shape behind
// every page-level "data still loading" branch. Absorbs the recurring
// `<Center h="50vh"><Loader size="xl" /></Center>` pattern found in
// Lessons.tsx:40-46, Profile.tsx:181-187, Leaderboard.tsx:106, and ~6 more
// callsites so there's one loading visual across the app instead of six
// slightly-different ones.
//
// Structure is a vertical stack: spinner → optional caption. Both slots are
// centered; the primitive sets its own min-height so the loader has room to
// breathe in panels that haven't decided on a height yet.
//
// Props are minimal by design. `caption` is optional — most loading states
// are momentary enough that a spinner on its own is the right answer; a
// caption is useful when the wait is measured in seconds and the user
// benefits from knowing *what* is loading ("Oefeningen klaarzetten…").
//
// There is no `size` prop. The spec (§3 item 12) standardizes on one visual
// weight (`<Loader size="xl" />`) so loading states look identical
// everywhere. Consumers that genuinely need a tiny inline spinner (e.g.
// inside a button) should use Mantine's `<Loader />` directly rather than
// shoehorn this primitive in.
//
// NO viewport-height units in the module CSS — this primitive is not on the
// viewport-math allowlist (Task 35 scanner). See LoadingState.module.css
// header for the full rationale. Callers who want the loader to fill the
// page wrap it in `<PageBody variant="fit">`.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 12).

import { Loader } from '@mantine/core'
import { cx } from './cx'
import classes from './LoadingState.module.css'

export interface LoadingStateProps {
  /**
   * Optional caption rendered below the spinner. Plain string — use when the
   * wait is long enough that the user benefits from knowing what's loading
   * ("Oefeningen klaarzetten…"). Omit for short, obvious loads.
   */
  caption?: string
}

export function LoadingState({ caption }: LoadingStateProps) {
  return (
    <div className={cx(classes.root)}>
      <Loader size="xl" />
      {caption && <p className={cx(classes.caption)}>{caption}</p>}
    </div>
  )
}
