# GDPR / PII audit — 2026-07-02 — pre-cloud-hardening (Follow-up A)

**Sources read:** `scripts/migration.sql` (3855 lines, full `CREATE TABLE`/RLS/GRANT sweep),
`src/lib/supabase.ts`, `src/lib/logger.ts`, `src/stores/authStore.ts`, `src/pages/Login.tsx`,
`src/pages/Register.tsx`, `supabase/functions/signup-with-invite/index.ts`,
`supabase/functions/commit-capability-answer-report/index.ts`, `docs/current-system/data-model.md`,
`docs/audits/2026-06-26-whole-repo-security-audit.md`. No code or schema changed. No live-DB `psql`
queries run — findings are grounded in `scripts/migration.sql` (CLAUDE.md's single source of truth for
schema) and the app/edge-function code that reads/writes it.

**Scope note:** this is a *read-only* legal/architectural audit. No deletion-path, retention-cron, or
consent-UI code is proposed as a build here — per the task, those are separate user decisions gated at
the end of this report.

## Executive summary

1. GDPR applies (EU-based controller, Art. 3(1), regardless of where learners sit) once this goes from single-author test data to paying customers.
2. The **deletion cascade is already good for the hard case**: 10 of 12 user-linked tables `ON DELETE CASCADE` off `auth.users(id)` — deleting the `auth.users` row already removes essentially all FSRS/session/behavioral data in one Postgres-native operation. This is a real strength, not a gap.
3. The **actual gap is machinery, not schema**: there is no self-serve or admin-facing UI/RPC that ever deletes an `auth.users` row (CRITICAL), no privacy policy page (CRITICAL), no data-export/access path (MAJOR), and no retention policy on the two tables that deliberately survive deletion (`error_logs`, `capability_resolution_failure_events` — both `ON DELETE SET NULL`, unbounded retention today) (MAJOR).
4. `capability_review_events.answer_report_json` stores the learner's raw typed answers (`rawResponse`) forever, cascade-deleted with the user but otherwise unbounded while the account lives — flagged as a decision, not resolved here, per the task.
5. Consent posture is clean: the only cookie is the Supabase auth/session cookie (functional, ePrivacy Art. 5(3) exempt); grep of `src/` and the two edge functions found **zero** third-party analytics/tracking SDKs and **zero** runtime calls to external APIs — TTS/LLM only run in the offline authoring pipeline (`scripts/`), never in the deployed app or its edge functions. No cookie banner is legally required under this reasoning; state it explicitly in the privacy policy rather than adding a banner.
6. No sub-processor beyond the self-hosted homelab Supabase instance was found at runtime — the processor inventory for a privacy policy is short.
7. `signup_invite_codes` stores no redemption linkage at all (`scripts/migration.sql:3787-3792`) — good by construction, not a finding.
8. One inherited item from the 2026-06-26 security audit is directly relevant here and is re-cited, not re-investigated: 7 undocumented `anon` SELECT grants live in the DB outside `migration.sql` (inert today because every relevant policy is `TO authenticated`, but grant hygiene matters more once real EU customer data is at stake).
9. Ranked recommendation list and a decisions-vs-builds split are in §5/§6 below.
10. Bottom line: **the plumbing (cascade, RLS, narrow grants) is already commercialization-grade; the missing pieces are entirely at the "exercise the right" layer — a delete-my-account path, an export path, and a published privacy policy.**

---

## 1. PII inventory

Every column below stores data attributable to an identified/identifiable natural person, or user-generated content. "Retention" = current behavior in `scripts/migration.sql`; **all are "forever" unless noted**.

| Table.column | Contains | Legitimate purpose | Retention today |
|---|---|---|---|
| `auth.users.email` | Login identifier | Auth (contract necessity) | Forever (GoTrue-managed, outside this schema) |
| `auth.users.raw_user_meta_data.full_name` | Name typed at signup (`supabase/functions/signup-with-invite/index.ts:139`) | Personalization (display name seed) | Forever |
| `indonesian.profiles.id/display_name/timezone/language/preferred_session_size/daily_new_items_limit` (`scripts/migration.sql:50-57,60,63,66`) | Display name (seeded from `full_name`, `src/stores/authStore.ts:77`), IANA timezone, UI language, study prefs | Personalization, session sizing, streak/goal timezone math | Forever |
| `indonesian.user_roles.user_id` (`scripts/migration.sql:69-75`) | Admin-role linkage | Access control | Forever |
| `indonesian.learning_sessions.user_id/started_at/ended_at/completed_at/session_type` (`scripts/migration.sql:282-291,308`) | Behavioral data: when/how long/what type of session a learner ran | Streaks, analytics, practice-time cards | Forever |
| `indonesian.error_logs.user_id/page/action/error_message/error_code` (`scripts/migration.sql:313-321`) | Crash/error telemetry, optionally linked to a user | Debugging | **Forever, no cap** — flagged in §4 |
| `indonesian.content_flags.user_id/comment` (`scripts/migration.sql:729-744`) | Learner-typed free-text flag comments on exercises | Content-quality feedback loop | Forever |
| `indonesian.exercise_review_comments.user_id/comment` (`scripts/migration.sql:777-789`) | Admin-typed review annotations (the `user_id` here identifies which admin wrote it — admin-only surface, `review_comments_admin_only` policy, `:793-812`) | Content review workflow | Forever |
| `indonesian.learner_capability_state.*` (`scripts/migration.sql:1213-1233`) | FSRS scheduling state per (user, capability): stability, difficulty, due dates, lapse/review counts | Core product function (spaced repetition) | Forever |
| `indonesian.capability_review_events.answer_report_json` (`scripts/migration.sql:1250`, populated from `p_command->'answerReport'` at `scripts/migration.sql:1715`) | **Full answer report including `rawResponse`** — the learner's raw typed text for free-response exercise types (Dictation, TypedRecall, ConstrainedTranslation, Cloze, CuedRecall, DecomposeWord — confirmed via `rawResponse: result.response` at each of `src/components/exercises/implementations/{Dictation,CuedRecallExercise,DecomposeWordExercise,ConstrainedTranslationExercise,Cloze,TypedRecall}.tsx`), plus `scheduler_snapshot_json`, `state_before_json`, `state_after_json` | FSRS audit trail, fuzzy-match debugging, mastery re-derivation | Forever, cascade-deleted with the user — flagged as a decision in §4, not resolved |
| `indonesian.learner_lesson_activation.user_id` (`scripts/migration.sql:1791-1794`) | Which lessons a learner activated | Product function | Forever |
| `indonesian.learner_collection_activation.user_id` (`scripts/migration.sql:3529-3535`) | Which word-collections a learner activated | Product function | Forever |
| `indonesian.learner_reading_harvest.user_id` (`scripts/migration.sql:3600-3606`) | Which words a learner tapped "+ leren" in the reader | Product function | Forever |
| `indonesian.capability_resolution_failure_events.user_id` (`scripts/migration.sql:1260-1271`) | Diagnostic: which user hit a capability-resolution failure, session id, payload | Debugging | **Forever, no cap** — flagged in §4 |
| `indonesian.signup_invite_codes.note` (`scripts/migration.sql:3787-3792`) | Free-text admin note on an invite code (e.g. could contain a recipient's name/email if an admin types it there) | Invite-issuance bookkeeping | Forever; service-role-only (`:3794-3796`), no anon/authenticated grant — low exposure, but no defined retention. Confirmed: **no redemption linkage stored** (no `redeemed_by`/`user_id` column) — the code table cannot be joined back to a specific signup. |
| Storage buckets `indonesian-lessons`, `indonesian-podcasts`, `indonesian-tts` (`scripts/migration.sql:722-726,1025-1027`) | Admin/pipeline-authored audio only | Content delivery | N/A — confirmed **no user-upload path exists**: `grep -rn "\.upload(" src/` returned zero matches. Public-read buckets carry no learner PII. |

**Not PII, confirmed by reading the schema:** `lessons`, `lesson_sections`, `texts`, `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`, `grammar_patterns`, `audio_clips`, `learning_capabilities`, `collections`, `collection_items`, `generated_exercise_candidates`, `textbook_sources/pages`, `distractors`, `item_embeddings`, `lesson_dialogue_lines`, `dialogue_clozes`, `affixed_form_pairs`, and the typed exercise tables (`cloze_mcq_exercises`, `contrast_pair_exercises`, `sentence_transformation_exercises`, `constrained_translation_exercises`) — all admin/pipeline-authored content catalog, zero `user_id` columns (confirmed by the full `CREATE TABLE` sweep, `scripts/migration.sql`, all ~46 tables).

---

## 2. Deletion cascade map

**Method:** every `user_id`/`id` column `REFERENCES auth.users(id)` was found via `grep -n "REFERENCES auth.users"` against `scripts/migration.sql` (12 hits) and each one carries an explicit `ON DELETE` clause — **no bare `user_id uuid` column without an FK was found** (every hit in the grep has `REFERENCES auth.users(id)` attached; no orphan-by-missing-FK risk exists).

| Table | FK clause | Cite | Behavior on `auth.users` row delete |
|---|---|---|---|
| `profiles` | `id ... REFERENCES auth.users(id) ON DELETE CASCADE` | `:51` | Row deleted |
| `user_roles` | `ON DELETE CASCADE` | `:71` | Row deleted |
| `learning_sessions` | `ON DELETE CASCADE` | `:284` | Row deleted |
| `content_flags` | `ON DELETE CASCADE` | `:731` | Row deleted |
| `exercise_review_comments` | `ON DELETE CASCADE` | `:779` | Row deleted |
| `learner_capability_state` | `on delete cascade` | `:1215` | Row deleted (FSRS state gone) |
| `capability_review_events` | `on delete cascade` | `:1242` | Row deleted (answer history, incl. `rawResponse`, gone) |
| `learner_lesson_activation` | `on delete cascade` | `:1791` | Row deleted |
| `learner_collection_activation` | `on delete cascade` | `:3530` | Row deleted |
| `learner_reading_harvest` | `on delete cascade` | `:3601` | Row deleted |
| `error_logs` | `ON DELETE SET NULL` | `:315` | **Row survives**, `user_id` nulled — anonymized but `error_message`/`page`/`action`/`error_code` untouched |
| `capability_resolution_failure_events` | `on delete cascade` at the FK to `learning_capabilities` (`:1262`) but `user_id ... on delete set null` (`:1266`) | `:1260-1271` | **Row survives**, `user_id` nulled |

**Verdict: if an admin deletes a user in `auth.users` today, almost everything cascades away in one native Postgres operation.** The two survivors (`error_logs`, `capability_resolution_failure_events`) are diagnostic/debug tables that are **already anonymized by the `SET NULL` FK** — once `user_id` is null they are no longer linked to an identifiable person by the schema itself (the residual risk is only if `error_message` free text happens to embed an identifier — see §1 note and the "email-in-error-message" check below). This is a materially better starting position than most pre-launch apps; the finding is not "the cascade is broken," it's "nothing ever triggers the cascade, and the two SET-NULL survivors have no retention cap" (§3, §4).

**Verified, not assumed:** the claim that auth-error messages could embed a learner's email (raised in the task prompt) was checked against the actual code, not accepted at face value. `src/pages/Login.tsx:20-33` swallows the `signIn` error into a generic empty `catch {}` — no `logError` call, no message ever reaches `error_logs`. `src/pages/Register.tsx:56-72` does call `logError` with the raw `err` from `supabase.functions.invoke('signup-with-invite', ...)`, but that error is a `FunctionsHttpError` whose `.message` is a generic HTTP-status string, not an interpolation of the submitted email — confirmed by reading `supabase/functions/signup-with-invite/index.ts` end to end: every `console.error`/thrown-error path (`:108-113`, `:150`, `:184`) logs status codes and GoTrue's own message field, never the caller-submitted `email` variable directly. **Conclusion: the "auth errors may embed emails" concern in the task brief does not hold for this codebase as written — INFO, not a finding requiring a fix.**

---

## 3. Missing rights machinery

- **Right to erasure (Art. 17) — CRITICAL, confirmed absent.** No route, component, or RPC anywhere in `src/` or `supabase/functions/` deletes an `auth.users` row or offers to. `grep -rln "deleteUser|delete_user"` across `src/`, `supabase/`, `scripts/` returned zero matches. The only admin surfaces that exist are `/admin/content-review`, `/admin/design-lab`, `/admin/page-lab` (`src/App.tsx:422,430,438`) — none touch user accounts. Today, erasure is only possible via direct Supabase Studio / GoTrue admin-API access outside the app, undocumented anywhere in `docs/process/`.
- **Right to access/export (Art. 15/20) — MAJOR, confirmed absent.** No export/download-my-data feature exists (same grep, zero matches for `export.*data|downloadData`). A learner cannot self-serve a copy of their FSRS history, session history, or flagged comments.
- **Consent surface — clean, reasoned, not just "absent."** `src/lib/supabase.ts:4-18` sets exactly one cookie: the Supabase auth/session token, scoped to `.duin.home`, `sameSite: 'lax'`, `secure: true`. This is a strictly-necessary/functional cookie (the app cannot authenticate a returning user without it) and falls under the ePrivacy Directive Art. 5(3) "strictly necessary for the service explicitly requested" exemption — no consent banner is legally required for it. Confirmed no other cookies, no analytics/tracking SDK: `grep -rn "analytics|gtag|posthog|mixpanel|segment\.io|sentry" src/ -i` matched only the app's own internal learner-progress-analytics module names (`src/lib/analytics/mastery`, `/engagement`, `/memory` — in-app FSRS/study dashboards, not third-party trackers) and zero external SDK imports. **Recommendation: state this reasoning in the privacy policy rather than adding a cookie banner** — a banner would be over-mechanism for a single functional cookie (Minimum Mechanism).
- **Privacy policy page — CRITICAL, confirmed absent.** `grep -rn "privacy" src/App.tsx -i` and `grep -rln "privacy" src/` both returned zero. No `/privacy` or `/terms` route exists.

---

## 4. Retention proposals

### `error_logs` (`scripts/migration.sql:313-321`, RLS hardened `:460-472` same day as this audit)

No retention cap exists. Proposed target: **90-day rolling window**, deleted by whichever job is cheapest given the mechanism already present:

| Option | Mechanism cost | Tradeoff |
|---|---|---|
| **`pg_cron` scheduled `DELETE`** | **Cheapest — the extension is already installed and idle**: `CREATE EXTENSION IF NOT EXISTS pg_cron` (`scripts/migration.sql:524`), explicitly noted as "available for non-goal jobs (currently none scheduled)". Adding `SELECT cron.schedule('purge-error-logs', '0 3 * * *', $$DELETE FROM indonesian.error_logs WHERE created_at < now() - interval '90 days'$$)` is one `migration.sql` block, no new infra, no new process to babysit. | DB-internal; a stopped/uninstalled `pg_cron` on a future Postgres image silently stops purging — needs a health-check line (cheap: extend `check-supabase-deep`'s existing table sweep, no new machinery class). |
| `make` target run manually / via a host cron | No DB extension needed | Depends on a human or an external cron actually firing — more moving parts (a shell script + a scheduler outside the DB) for a guarantee `pg_cron` already gives for free. Rejected under Minimum Mechanism: it's strictly more mechanism for the same guarantee. |
| App-level lazy purge (delete-on-read) | Zero new schedule | Wrong shape — it only prunes rows a query happens to touch, not a real bound; violates the "actually bounded" requirement of Art. 5(1)(e) storage limitation. Rejected. |

**Recommendation: `pg_cron`, cheapest mechanism that gives the actual guarantee** (Minimum Mechanism: extension already paid for, zero new infrastructure class).

### `capability_resolution_failure_events` (`scripts/migration.sql:1260-1271`)

Same shape, same fix: add to the same `pg_cron` job or a sibling one. Lower volume (diagnostic-only, fires on resolution failures, not every session) so a longer window (e.g. 180 days) is defensible — **flagging the exact number as a decision for the user**, not deciding it here.

### `capability_review_events.answer_report_json` (raw learner responses)

**Flagged, not decided — per the task's explicit instruction.** The FSRS scheduler only ever reads the *aggregate* fields (`rating`, `state_before_json`, `state_after_json`, `scheduler_snapshot_json` — confirmed by `supabase/functions/commit-capability-answer-report/index.ts:298-324`, which computes `nextFsrs`/`rating` from `stateBefore` and never re-reads `rawResponse` on subsequent commits). `rawResponse` inside `answer_report_json` is retained purely for fuzzy-match debugging/audit, with no scheduling dependency on it staying present. Two live options exist and are **not decided here**: (a) leave forever, cascade-deleted with the account (current behavior, defensible under "processing for as long as the account exists" if documented in the privacy policy); (b) redact/null `answer_report_json->'rawResponse'` after some window (e.g. 1 year) via the same `pg_cron` job, keeping the aggregate fields FSRS actually needs. This is a product/legal call, not an architecture call — surfaced for the user in §6.

---

## 5. Ranked recommendation list

**Must exist before paying EU customers:**

1. **CRITICAL — Right-to-erasure path.** Some mechanism (self-serve "delete my account" button, or at minimum a documented admin runbook + a `service_role` RPC modeled on the existing `set_lesson_activation`/`redeem_invite_code` pattern) that actually calls the GoTrue admin `deleteUser` endpoint. The DB-side cascade (§2) already does the hard part; only the trigger is missing.
2. **CRITICAL — Privacy policy page**, listing: what's collected (§1), why (legitimate interest / contract necessity per row), retention (§4 once decided), the processor inventory (§6 below — short, since this audit found no runtime third-party calls), and how to exercise erasure/access once #1/#3 exist.
3. **MAJOR — Right-to-access/export path.** Even a minimal service-role RPC returning the caller's own rows across `profiles`, `learner_capability_state`, `capability_review_events`, `learning_sessions`, `content_flags` satisfies Art. 15 in spirit; doesn't need to be pretty.
4. **MAJOR — Retention cap on `error_logs` + `capability_resolution_failure_events`** (§4) — storage-limitation principle violation today (unbounded).
5. **MAJOR (carried over, re-cited not re-verified) — the 7 undocumented `anon` SELECT grants** flagged in `docs/audits/2026-06-26-whole-repo-security-audit.md:51-53`. Inert today (every relevant policy is `TO authenticated`), but "inert because RLS currently blocks it" is a weaker guarantee than "no grant exists" once real customer PII is behind it — tighten before commercial launch, not urgent to re-audit here since it was already found and characterized.

**Can wait:**

6. **MINOR — `answer_report_json.rawResponse` retention decision** (§4) — no compliance violation in leaving it as-is *if* documented in the privacy policy; only becomes urgent if the user wants a shorter retention promise.
7. **MINOR — stale comment** at `scripts/migration.sql:49` ("readable by all — used by sharing UI") — the RLS was tightened to owner-only on 2026-06-26 (`:385`) but the comment above the table definition was never updated. Not a PII risk (the policy is correct; the comment is just wrong), but worth a one-line fix to stop a future reader from reasoning from stale prose (CLAUDE.md "spec drift" — same failure class the comment itself warns against elsewhere in this file).
8. **INFO — `content_units`/`capability_content_units` schema carve-out** (`scripts/migration.sql:20-26`, cross-referenced in `docs/audits/2026-06-26-whole-repo-security-audit.md:54-56`) — pre-existing, documented, and confirmed **not PII-bearing** (capability catalog, no `user_id` column). No action needed for this audit; noted only so the processor-inventory reasoning above ("all schema is in `migration.sql`") isn't read as absolute.
9. **INFO — `signup_invite_codes.note`** (§1) could carry an admin-typed identifier with no retention cap; low exposure (service-role-only, no grants to `anon`/`authenticated`, `:3794-3796`) — worth a one-line retention mention in the privacy policy's processor/internal-ops section, not urgent.

**Processor inventory for the privacy policy (confirmed empty beyond the controller's own infrastructure):** grep of `src/` (the entire SPA bundle source) and both edge functions (`supabase/functions/signup-with-invite/index.ts`, `supabase/functions/commit-capability-answer-report/index.ts`) for external `fetch`/`https://` calls found **zero** third-party endpoints — every runtime call targets the self-hosted `SUPABASE_URL` (`Deno.env.get('SUPABASE_URL')`, resolved to `api.supabase.duin.home`, the controller's own homelab). TTS (Google Cloud TTS) and LLM (Gemini/Claude) calls exist only in `scripts/` (the offline authoring pipeline, per `CLAUDE.md` § Content Management — "TTS/LLM run at authoring time only") and are never invoked by the deployed app or its edge functions. **Confirmed, not assumed**, by the absence of any external URL in the two runtime surfaces. If the self-hosted Supabase/Postgres/GoTrue/Storage stack itself is entirely on infrastructure the controller owns (per `CLAUDE.md` — homelab, Traefik, Step-CA), there is no third-party sub-processor to disclose at all; the privacy policy's processor section can be short.

---

## 6. Proposed next steps

**Decisions for the user (not agent-runnable — product/legal calls):**

- Retention window for `error_logs` (proposed: 90 days) and `capability_resolution_failure_events` (proposed: 180 days) — confirm or pick different numbers.
- Whether `answer_report_json.rawResponse` gets a redaction window, or stays for the life of the account (§4) — legal/product tradeoff between debugging value and data minimization.
- Self-serve delete-my-account UI vs. admin-only erasure runbook — UX/support-load tradeoff, not an architecture question.
- Whether to add a cookie-consent statement to the (not-yet-existing) privacy policy page, or add a banner anyway for defensiveness beyond the strict legal minimum — a business risk-appetite call, not a technical one.
- Privacy-policy copy itself (legal drafting) — outside this agent's scope entirely.

**Agent-runnable builds once the above decisions land (separate spec, not built here per task scope):**

- `pg_cron` retention job(s) in `scripts/migration.sql` for `error_logs`/`capability_resolution_failure_events`, plus a `check-supabase-deep` assertion that the job is scheduled (mirrors the existing "gate closes the drift" pattern used elsewhere in this repo).
- A service-role erasure RPC (modeled on `redeem_invite_code`/`set_lesson_activation` shape) + either an admin UI button or a documented runbook entry in `docs/process/`.
- A minimal export RPC/page returning the caller's own rows across the tables in §1.
- One-line comment fix at `scripts/migration.sql:49` to match the actual (already-correct) RLS.
- Revoke the 7 stray `anon` SELECT grants + codify in `migration.sql`, per the carried-over 2026-06-26 finding.

Any of the above, when built, needs `data-architect` + `architect` sign-off per `CLAUDE.md`'s data-model-plan rule before it lands in `scripts/migration.sql`, since erasure/export/retention all touch the single migration source of truth and RLS/grant surface.
