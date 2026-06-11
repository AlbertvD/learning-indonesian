// src/lib/analytics/index.ts
//
// Top-level barrel for the read-only analytics module (target-architecture.md:642-768).
// Namespaced sub-modules: every UI surface that displays facts about a learner
// reads from here. No writes, no mutations.
//
// Roster is being built out per the learner-progress analytics redesign
// (docs/plans/2026-06-10-learner-progress-analytics-redesign.md):
//   engagement — Practice Time (here, Slice 1)
//   mastery    — ladder funnel / skill-mode gaps / weekly movement (existing + slices 3-6)
// `leaderboard` is decommissioned; `memory` is removed at the surface.
import { engagement } from './engagement'

export const analytics = {
  engagement,
}
