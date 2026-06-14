// AdminFlagOverlay — the in-session admin flag affordance.
//
// Rendered into every live exercise's top-right `adminOverlay` slot via
// CapabilityExerciseFrame. For an admin it shows the FlagButton (flag icon →
// comment → logged to content_flags); for everyone else it renders nothing, so
// the slot is invisible to learners. This is the live wiring of the
// flag-and-agent review loop (CONTEXT.md §Capability Review).
//
// Anchors a flag to whichever entity the exercise carries: a vocabulary item
// (learningItemId) OR a grammar pattern (grammarPatternId, for the
// contrast_pair / sentence_transformation / constrained_translation / cloze_mcq
// pattern exercises). content_flags requires exactly one of the two (entity-check
// CHECK); the schema already supports both.
import { useEffect, useState } from 'react'
import { FlagButton } from '@/components/exercises/primitives'
import { contentFlagService } from '@/services/contentFlagService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { ContentFlag, ExerciseType } from '@/types/learning'

interface AdminFlagOverlayProps {
  /** The flagged item's id (vocab exercises). */
  learningItemId: string | null
  /** The flagged pattern's id (grammar exercises). */
  grammarPatternId?: string | null
  exerciseType: ExerciseType
}

export function AdminFlagOverlay({ learningItemId, grammarPatternId = null, exerciseType }: AdminFlagOverlayProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [flag, setFlag] = useState<ContentFlag | null>(null)

  // The exercise must anchor to exactly one entity (CHECK); grammar wins when both
  // are somehow present (item exercises never carry a pattern id).
  const hasEntity = grammarPatternId != null || learningItemId != null

  useEffect(() => {
    if (!isAdmin || !userId || !hasEntity) return
    let cancelled = false
    const load = grammarPatternId != null
      ? contentFlagService.getFlagForGrammarPattern(userId, grammarPatternId, exerciseType)
      : contentFlagService.getFlagForItem(userId, learningItemId!, exerciseType)
    load
      .then((existing) => { if (!cancelled) setFlag(existing) })
      .catch((err) => logError({ page: 'admin-flag-overlay', action: 'getFlag', error: err }))
    return () => { cancelled = true }
  }, [isAdmin, userId, learningItemId, grammarPatternId, exerciseType, hasEntity])

  if (!isAdmin || !userId || !hasEntity) return null

  return (
    <FlagButton
      userId={userId}
      learningItemId={grammarPatternId != null ? null : learningItemId}
      grammarPatternId={grammarPatternId}
      exerciseType={exerciseType}
      existingFlag={flag}
      onFlagged={setFlag}
      onUnflagged={() => setFlag(null)}
    />
  )
}
