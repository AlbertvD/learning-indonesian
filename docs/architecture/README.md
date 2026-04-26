# Architecture Overview — Learning Indonesian

Progressive-disclosure reference. Each section links to a detail doc. Start here; follow links when you need depth.

---

## [Current System Documentation](../current-system/README.md)

Start here for the capability-learning implementation handoff, the human product guide, and the content pipeline quality-gates guide. These docs explain what was built on the feature branch and how it relates to the deeper architecture plans.

## [Session Engine](session-engine.md)

`buildSessionQueue` assembles a session from four item buckets (due, anchoring, weak, new), applies slot-allocation ratios, and calls `selectExercises` to turn each candidate into a concrete `ExerciseItem`. `calculateNewSlots` throttles new-item introduction based on how many reviews are pending (due >40 → 0 new, >20 → 2 new, else 8 new). Grammar exercises bypass the meanings filter because they carry all display content in their payload. `orderQueue` places up to two `recognition_mcq` items first for an easy warm-up.

## [Session Policies](session-policies.md)

Five ordered policy layers transform the raw queue after `buildSessionQueue` returns. Layer 1 gates exercise types (env-var flag takes precedence, then DB `session_enabled`; fail-open on missing DB record). Layer 2 interleaves items from the same `confusion_group`. Layer 3 caps consecutive same-type exercises at 2. Layer 4 protects new learners (account age <30 days AND <50 stable items) by limiting new items to 15% of session size. Layer 5 trims to `sessionInteractionCap` in priority order: due > weak > new.

## [Exercise Types](exercise-types.md)

Eight exercise types in two categories. **Vocabulary** (generated on-the-fly): `recognition_mcq`, `typed_recall`, `cued_recall`, `cloze`. **Grammar** (from the `exercise_variants` table): `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking` (disabled). Each exercise component handles its own inline feedback — `ExerciseFeedback.tsx` exists but is dead code, not wired up anywhere.

## [Content Pipeline](content-pipeline.md)

Grammar exercises originate as TypeScript staging files (`scripts/data/staging/lesson-N/candidates.ts`) with a `review_status` field. `publish-grammar-candidates.ts` walks approved candidates, upserts a `learning_item` + `item_context` + grammar-pattern link, then writes `exercise_variant` rows with the answer keys split into `answer_key_json`. Vocabulary cloze contexts are seeded separately by `extract-cloze-items.ts`. `lesson_snippet` contexts exist only to carry `source_lesson_id` for lesson-gating; their `source_text` is a bare word placeholder that is never displayed.

## [Data Model](data-model.md)

All tables live in the `indonesian` Postgres schema. Content tables (`learning_items`, `item_meanings`, `item_answer_variants`, `item_contexts`, `exercise_variants`, `grammar_patterns`) are admin-written and app-read. Learner-state tables (`learner_item_state`, `learner_skill_state`, `review_events`) are user-owned. Supporting tables: `exercise_type_availability` controls per-type rollout; `learner_weekly_goal_sets` / `learner_weekly_goals` / `learner_daily_goal_rollups` drive the goal system.

## [FSRS Scheduling](fsrs-scheduling.md)

Each vocabulary item tracks up to four skills: `recognition`, `form_recall`, `meaning_recall`, `spoken_production`. Items progress through stages: `new → anchoring → retrieving → productive → maintenance`. FSRS stability and difficulty are stored per skill in `learner_skill_state`; retrievability is computed on-the-fly. Anchoring items are always reinforced regardless of due date. Items with ≥3 lapses are flagged weak and get priority treatment.

## [Feature Flags](feature-flags.md)

All flags are `VITE_FEATURE_*` env vars parsed at build time; absent or empty means enabled. `recognition_mcq`, `typed_recall`, and `cloze` are hardcoded enabled and cannot be turned off. Optional types (`cued_recall`, `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking`) can be individually disabled. The DB `exercise_type_availability` table provides a second gate; the env-var flag wins if it says disabled.

## [Session Modes](session-modes.md)

Five modes extend `buildSessionQueue`'s default behavior. `standard` applies all normal ratios. `quick` fixes session size to 5 and biases toward recall for items that already have a `form_recall` skill. `recall_sprint` restricts to items with a `form_recall` skill, forces recall exercises, and scores by lowest-retrievability ordering. `backlog_clear` maximises due reviews (zero anchoring, weak, or new slots). `push_to_productive` forces `retrieving`-stage items with recall skills into the due bucket regardless of due date.

## [Infrastructure](infrastructure.md)

Frontend-only React app deployed as a static Nginx container behind Traefik on the homelab (`indonesian.duin.home`). Shares a self-hosted Supabase instance (`api.supabase.duin.home`) with family-hub; all app tables live in the `indonesian` schema. The Supabase JS client uses `@supabase/ssr` with a cookie scoped to `.duin.home` for future SSO. `make migrate` applies schema via SSH + `docker exec`; Docker builds bake `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time.
