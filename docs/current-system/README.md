# Current System Documentation

This folder documents what the `capability-learning-system-implementation` branch has built and why it is shaped this way.

It is intentionally different from the planning docs in `docs/plans/`. The planning docs explain the target architecture and implementation slices. These documents explain the current implemented system so a future coding session, reviewer, or human product owner can quickly understand the branch.

## Reading Order

1. [Capability System Handoff](capability-system-handoff.md)
   - Audience: a new coding session or AI agent.
   - Goal: understand the actual implementation, module seams, flags, current limitations, and safe next steps.

2. [Human Product and Learning Guide](human-product-and-learning-guide.md)
   - Audience: a human who wants to understand the app experience.
   - Goal: explain what the app does, how the learning engine works, what exercise types exist, how progression works, and how the learner experience ties together.

3. [Content Pipeline and Quality Gates](content-pipeline-and-quality-gates.md)
   - Audience: a future content-production session, linguist/reviewer, or developer extending publishing.
   - Goal: explain how content is staged, how capabilities and exercises are produced, which review roles exist, and how quality is checked before content becomes schedulable.

## Release Posture

The new capability system is additive and feature-flagged. The legacy exercise/session path remains the safe production path unless migration flags are explicitly enabled.

Safe default release posture:

```text
VITE_CAPABILITY_SESSION_DIAGNOSTICS=false
VITE_CAPABILITY_REVIEW_SHADOW=false
VITE_CAPABILITY_REVIEW_COMPAT=false
VITE_CAPABILITY_STANDARD_SESSION=false
VITE_EXPERIENCE_PLAYER_V1=false
VITE_LESSON_READER_V2=false
VITE_LOCAL_CONTENT_PREVIEW=false
```

The `/preview` routes are local review surfaces. They are useful for visual/product review, but they are not a replacement for publishing approved content into Supabase.

## Key Planning References

- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/capability-implementation-slices/00-index.md`
- `docs/adr/0001-capability-based-learning-core.md`
- `docs/adr/0005-lesson-reader-emits-source-progress-not-fsrs-activation.md`