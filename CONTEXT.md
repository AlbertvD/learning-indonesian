# Learning Indonesian Domain Context

This context defines the domain language for the capability-based learning architecture. Use these terms consistently in code, docs, tests, and reviews.

## Content Source

A source of learning material, such as a textbook lesson, dialogue line, podcast segment, story, grammar pattern, or morphology pattern. A content source is provenance and sequencing context; it is not itself the thing scheduled by FSRS.

## Content Unit

A stable, publishable unit derived from a content source. Content units preserve source refs, section refs, ordering, and relationships to lesson page blocks and learning capabilities.

## Learning Capability

A concrete memory trace or skill facet that can be practiced, reviewed, and scheduled. Examples include text recognition, meaning recall, form recall, audio recognition, dictation, contextual cloze, pattern recognition, and root-derived morphology recognition.

## Capability Contract

The fail-closed readiness contract for a learning capability. It defines required typed artifacts, allowed exercise families, readiness status, publication status, and why a capability is ready, blocked, exposure-only, deprecated, or unknown.

## Typed Artifact

A named piece of approved content required by a capability or exercise, such as `meaning:l1`, `accepted_answers:id`, `base_text`, `audio_clip`, `cloze_context`, `pattern_example`, `transcript_segment`, or `root_derived_pair`.

## Capability Readiness

The scheduling/rendering readiness state of a capability. Valid states are `ready`, `blocked`, `exposure_only`, `deprecated`, and `unknown`. Only ready and published capabilities can become active learner review targets.

## Learner Activation State

The learner-specific state describing whether a capability is dormant, active, suspended, or retired for that learner. FSRS schedules active learner capabilities only.

## Source Progress

Evidence that a learner has encountered source material in the Lesson Reader or listening experience. Examples include opened, section exposed, intro completed, heard once, pattern noticing seen, guided practice completed, and lesson completed.

## Lesson Page Block

A web-native lesson rendering block with stable identity, source refs, optional content unit refs, optional capability refs, and optional source progress events. Lesson page blocks make book-derived lessons feel modern without directly activating FSRS review.

## Review Processor

The write owner for capability review commits. It validates answer reports, computes or validates outcomes, commits review events and FSRS state atomically/idempotently, and performs first-review activation of eligible dormant capabilities.

## Exercise Resolver

The module that maps a ready capability plus approved artifacts to an exercise render plan or an explicit typed failure. It prevents sessions from silently falling back to unrelated legacy exercises.

## Session Composer

The module that composes a learning session from due active capabilities, Pedagogy Planner recommendations, and Exercise Resolver results. It is composition-only and does not write activation, FSRS, or review state.

## Lesson Experience Module

The module that renders lesson page blocks, emits source progress, and bridges to practice. It does not directly activate FSRS review.

## Mastery Model

A read-only model that derives learner-facing mastery from capability state, review evidence, source progress, modality spread, recency, and confidence. It does not schedule content or overclaim production ability from recognition evidence.
