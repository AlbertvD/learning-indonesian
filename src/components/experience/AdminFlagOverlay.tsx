// AdminFlagOverlay — the in-session admin flag affordance.
//
// Rendered into the session header's chrome row (ExperiencePlayer's
// SessionHeader flagSlot) — not overlaid on the exercise, so long instructions
// can never collide with it. For an admin it shows the FlagButton (flag icon →
// comment → logged to content_flags); for everyone else it renders nothing, so
// the slot is invisible to learners. This is the live wiring of the
// flag-and-agent review loop (CONTEXT.md §Capability Review).
//
// Anchors every flag to the exercise's capability_id — the universal exercise
// identity that every block carries. This replaces the old item/pattern-anchor
// split, which left dialogue-cloze and affixed-pair exercises (capability-only,
// no learning_item or grammar_pattern) with no way to surface the flag at all.
import { useEffect, useState } from 'react'
import { FlagButton } from '@/components/exercises/primitives'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { ContentFlag, ExerciseType } from '@/types/learning'

interface AdminFlagOverlayProps {
  /** The flagged exercise's capability id. Null only if resolution failed; the
   *  overlay renders nothing in that case. */
  capabilityId: string | null
  exerciseType: ExerciseType
}

export function AdminFlagOverlay({ capabilityId, exerciseType }: AdminFlagOverlayProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [flag, setFlag] = useState<ContentFlag | null>(null)

  useEffect(() => {
    if (!isAdmin || !userId || !capabilityId) return
    let cancelled = false
    contentFlagService.getFlagForCapability(userId, capabilityId, exerciseType)
      .then((existing) => { if (!cancelled) setFlag(existing) })
      .catch((err) => logError({ page: 'admin-flag-overlay', action: 'getFlag', error: err }))
    return () => { cancelled = true }
  }, [isAdmin, userId, capabilityId, exerciseType])

  if (!isAdmin || !userId || !capabilityId) return null

  return (
    <FlagButton
      userId={userId}
      capabilityId={capabilityId}
      exerciseType={exerciseType}
      existingFlag={flag}
      onFlagged={setFlag}
      onUnflagged={() => setFlag(null)}
    />
  )
}
