// AdminFlagOverlay — the in-session admin flag affordance.
//
// Rendered into every live exercise's top-right `adminOverlay` slot via
// CapabilityExerciseFrame. For an admin it shows the FlagButton (flag icon →
// comment → logged to content_flags); for everyone else it renders nothing, so
// the slot is invisible to learners. This is the missing live wiring of the
// flag-and-agent review loop (CONTEXT.md §Capability Review) — the FlagButton
// primitive and contentFlagService already existed; only this connection from
// the runtime dispatcher was dropped when ExerciseShell was deleted (#75).
import { useEffect, useState } from 'react'
import { FlagButton } from '@/components/exercises/primitives'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { ContentFlag, ExerciseType } from '@/types/learning'

interface AdminFlagOverlayProps {
  /** The flagged item's id; null for grammar-pattern exercises (not yet wired). */
  learningItemId: string | null
  exerciseType: ExerciseType
}

export function AdminFlagOverlay({ learningItemId, exerciseType }: AdminFlagOverlayProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [flag, setFlag] = useState<ContentFlag | null>(null)

  useEffect(() => {
    if (!isAdmin || !userId || !learningItemId) return
    let cancelled = false
    contentFlagService
      .getFlagForItem(userId, learningItemId, exerciseType)
      .then((existing) => { if (!cancelled) setFlag(existing) })
      .catch((err) => logError({ page: 'admin-flag-overlay', action: 'getFlagForItem', error: err }))
    return () => { cancelled = true }
  }, [isAdmin, userId, learningItemId, exerciseType])

  // Learners (and item-less grammar exercises, for now) see nothing.
  if (!isAdmin || !userId || !learningItemId) return null

  return (
    <FlagButton
      userId={userId}
      learningItemId={learningItemId}
      exerciseType={exerciseType}
      existingFlag={flag}
      onFlagged={setFlag}
      onUnflagged={() => setFlag(null)}
    />
  )
}
