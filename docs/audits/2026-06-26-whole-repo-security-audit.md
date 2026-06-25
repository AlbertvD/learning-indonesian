# Whole-repo security audit — 2026-06-26

**Method:** multi-agent fan-out (6 surface-finders → adversarial verify per finding → synthesis),
each agent reading source + introspecting the **live** `indonesian` schema (SSH → `psql`). 26 agents,
20 raw findings, 9 confirmed / 11 refuted after the verify pass.

**Architecture lens that decides severity:** frontend-only SPA, no custom application server.
The backend is Supabase (Kong → PostgREST + GoTrue + Storage + Postgres). The anon key ships in the
public bundle and is baked into Kong, so any attacker can replay client requests straight at PostgREST.
**The entire security boundary is declarative — Postgres RLS + grants + `SECURITY DEFINER` functions.**
A client-side check is cosmetic; an RLS/grant gap is the real attack surface. Operating context
(pre-launch, single real learner, disposable data) means DoS / multi-tenant hardening / secrets-rotation
are launch-gate, but **owner-scoping is in scope now** because it is the architecture that will carry real users.

## Posture summary

- ✅ RLS coverage: 46/46 tables RLS-enabled, all with ≥1 policy. No "RLS-no-policy" regression.
- ✅ `user_roles` self-escalation closed (SELECT-only grant, no write policy, no SECDEF writer).
- ✅ 5 of 6 `SECURITY DEFINER` functions correctly guarded (`commit_capability_answer_report` is
  service-role-only + fully validates its freeform jsonb; the activation/session RPCs gate on `auth.uid()`).
- ✅ All 3 dev auth bypasses (`bypassAuth`, `dev-user`, `force_capability`) dead-code-eliminated from a
  real production build (verified by grepping `dist/`).
- ✅ `isAdmin` is DB-derived (not client-spoofable for data); no injection sinks (`dangerouslySetInnerHTML`/
  `eval`/HTML-render of content); `logError` leaks no PII/token; `error_logs` write-only; no secrets in repo or git history.
- ✅ Pipeline writes content via parameterized PostgREST/tagged-template only — no SQL-injection sink despite OCR/LLM input.

## Confirmed findings + remediation (all FIXED in this PR)

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | **Critical** | `apply_review_to_skill_state` — `SECURITY DEFINER` (RLS-bypassing) write taking a caller-supplied `p_user_id` with **no ownership guard**, and (uniquely among the SECDEF functions) never `REVOKE`d from `PUBLIC` → the default anon `EXECUTE` let any holder of the public anon key overwrite **any** user's FSRS skill-state rows, unauthenticated. Dead surface: only caller (`learnerStateService`) was imported by nothing but its own test; live path is `commit_capability_answer_report` (ADR 0004). | **Dropped** the function (cut dead mechanism > guard it) + deleted `learnerStateService.ts`, its test, and the `LearnerSkillState` type. `learner_skill_state` table left inert (owner-scoped). |
| 2 | Medium | `profiles` SELECT `USING(true)` — any authenticated user reads every learner's `display_name` + study prefs. Leaderboard (the original justification) is decommissioned. | `profiles_read` → `USING (id = auth.uid())`. |
| 3 | Low | `learning_sessions` + `lesson_progress` SELECT `USING(true)` — cross-learner read of session timings / lesson progress. Read only by `SECURITY INVOKER` analytics RPCs that already filter `user_id = p_user_id` (their documented intent). | both read policies → `USING (user_id = auth.uid())`. |
| 4 | Low | `schema_health()` retained `PUBLIC` EXECUTE → anon could dump the entire security topology (tables, grants, every policy predicate). | `REVOKE ALL ON FUNCTION schema_health() FROM PUBLIC`. |
| 5 | Low (latent) | `learning_sessions` still carried `authenticated INSERT/UPDATE/DELETE` grants the 2026-05-07 "retirement #5" comment claimed were revoked but never were — inert today (no write policy), landmine if a permissive policy is ever added. | `REVOKE INSERT, UPDATE, DELETE ON learning_sessions FROM authenticated`. |

All five verified live post-`make migrate`:
`apply_review_to_skill_state` count=0 · `profiles_read`=`(id = auth.uid())` ·
`learning_sessions_read`/`lesson_progress_read`=`(user_id = auth.uid())` ·
`schema_health` anon-exec=false · `learning_sessions` authenticated writes=NONE.

## Refuted (verified non-vulnerabilities)

`commit_capability_answer_report` jsonb forgery (service-role-only, unreachable from a browser JWT);
the other 3 guarded SECDEF functions; all 3 dev bypasses (DCE-verified in `dist/`); `isAdmin` spoofing
(RLS re-checks server-side); cookie `.duin.home` SSO scope (intended; bearer-token API, no CSRF);
module-level access-token mirror (no sink); all client injection/PII/secrets checks.

## Drift recorded but NOT fixed here (hygiene, refuted as vulns — RLS denies today)

- **7 undocumented `anon` SELECT grants** (incl. `profiles`) live in the DB but in no repo SQL. Inert —
  every policy on those tables is `TO authenticated`, so anon reads zero rows. Recommend `REVOKE … FROM anon`
  + codify, and add an anon-grant assertion to `check-supabase-deep`.
- **`content_units` / `capability_content_units` lifecycle** lives only in
  `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql`, not canonical `migration.sql` (the file's
  own header documents this carve-out; rebuild procedure includes the standalone file, so no real lockout).

## Supply chain (`bun audit`, the OSINT MCP being unavailable this session)

No client-runtime CVEs. All advisories are in **build/dev/test tooling** —
`vite` (dev-server `fs.deny` bypass, Windows-only), `vite-plugin-pwa`→`workbox-build`→`lodash`/`serialize-javascript`,
`eslint`→`minimatch`→`brace-expansion`, `vitest`→`vite`, `jsdom`→`undici`. The app ships as a static Nginx
bundle, so the dev-server / build-host CVEs have no production runtime. Low priority; bump `vite` + `vite-plugin-pwa`
opportunistically. Recommend wiring `bun audit` into the pre-deploy gate so future CVEs surface deterministically
without depending on the OSINT MCP.

## Launch-gate follow-ups (re-open at launch, per Operating Context)

Cookie `.duin.home` trust-zone (gate which apps may join the shared cookie domain); revoke the inert anon
SELECT grants; fold the `content_units` lifecycle into canonical `migration.sql`; restore the security-mcp
endpoint and re-run a real CVE/KEV scan; consider a CI grep-gate over `dist/` for `bypassAuth`/`dev-user`.
