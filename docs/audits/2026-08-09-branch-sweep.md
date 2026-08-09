---
doc_type: audit
date: 2026-08-09
status: complete
---

# Branch sweep — 2026-08-09

The remote had accumulated **170 branches**. This records what was deleted and,
more importantly, *how it was proved safe*, because the obvious git tests are
wrong here.

## Method — and two wrong turns worth not repeating

- `git diff main...branch` (three-dot) shows a branch's changes **since the merge
  base**, whether or not they shipped. It reported all 69 survivors as carrying
  unmerged content. Wrong.
- `git cherry` compares by patch-id, which a **squash merge defeats**: N commits
  collapse into one, so no individual patch matches. `fold/lib-lessons` showed 8
  "new" commits despite PR #79 being merged and `src/lib/lessons/` being live.

**The PR state is the authority.** Git cannot see through a squash merge.

Deleted in two passes:

1. **93 branches** whose every commit was an ancestor of `main`
   (`git merge-base --is-ancestor`) — zero possible loss.
2. **69 branches** that failed that test but were each proved superseded: 61 had
   a MERGED PR, and the other 8 were verified artifact-by-artifact against
   `main` (table below).

Excluded throughout: `main`, and the head branch of every open PR — deleting
those would have closed the PRs.

## The 8 without a merged PR

| Branch | PR | Disposition |
|---|---|---|
| `pr3-capability-content-wireup` | #23 closed | `capabilityContentService.ts` absent from `main` — superseded by `src/lib/exercise-content/`; both specs archived in `204fcb19` |
| `pr4-delete-legacy` | #24 closed | Its goal was deleting `ExerciseShell`, which IS absent from `main`. Achieved via #75 |
| `feat/lessons-2-3-publish` | #82 closed | `lesson-2/Page.tsx` present in `main` — published another way |
| `worktree-agent-a9b863a3ec2bc1d42` | #103 closed | Slice 1 re-landed as PR #121 |
| `docs/slice4-census-refresh` | #149 closed | All 3 docs in `main`; teardown plan `status: shipped` |
| `feat/morphology-affix-pool-proposer` | #267 closed | ADR 0020 and `lesson-30/Page.tsx` both in `main` |
| `fix/voortgang-polish` | #419 closed | Superseded by its merged twin #420 |
| `docs/product-roadmap` | none | `docs/roadmap.md` in `main`; collections plan `status: shipped` |

The only two artifacts genuinely missing from `main` are missing **by design**:
one superseded by a fold, the other deliberately deleted.

## Full deleted set (69 with unmerged commits)

| Date | Branch | PR | Title |
|---|---|---|---|
| 2026-05-20 | `chore/exercises-ui-cleanup` | #84 MERGED | chore(exercises): retire legacy pre-framework renderers + add module s |
| 2026-05-19 | `chore/finish-exerciseshell-deletion` | #75 MERGED | chore: finish ExerciseShell deletion cleanup |
| 2026-05-20 | `chore/move-due-filter-into-session-builder` | #80 MERGED | chore(session-builder): fold dueFilter out of lib/capabilities |
| 2026-05-02 | `chore/pre-deploy-gate-makefile` | #29 MERGED | chore(ops): add pre-deploy Makefile gate + auto health check after mig |
| 2026-07-11 | `chore/tab-title-kamoe-bisa` | #442 MERGED | Tab title → Kamoe Bisa + warm the secondary-text tokens |
| 2026-07-10 | `chore/voortgang-dead-css-tidy` | #426 MERGED | chore(voortgang): remove dead ladder-headline CSS + i18n |
| 2026-06-12 | `docs/analytics-module-specs` | #232 MERGED | docs(analytics): module specs for the learner-progress read-model |
| 2026-06-15 | `docs/approved-morphology-rename-plans` | #252 MERGED | docs: approved morphology phase-(b) spec + §8 capability-rename plan |
| 2026-06-11 | `docs/at-risk-shipped` | #227 MERGED | docs(plans): mark at-risk-currently-failing shipped (PR #223) |
| 2026-06-12 | `docs/mastery-ladder-shipped` | #235 MERGED | docs(plan): mark mastery-ladder spec shipped |
| 2026-06-12 | `docs/mastery-ladder-spec` | #233 MERGED | docs(plan): approved spec — at-risk = lapse only + moeilijk stubborn-w |
| 2026-05-23 | `docs/migration-plan-lessons-from-pr1-1.5-1.6` | #90 MERGED | docs(plan): post-PR verification (§1.8) + bridge guidance (§1.4) — les |
| 2026-07-10 | `docs/ontdek-plan-shipped` | #428 MERGED | docs(plans): mark Ontdek harmonization plan shipped |
| 2026-06-13 | `docs/product-roadmap` |  |  |
| 2026-06-04 | `docs/slice4-census-refresh` | #149 CLOSED | docs: Slice 4 design groundwork — census refresh, target approval, tea |
| 2026-07-10 | `docs/spreektaal-pairs-owner-veto` | #416 MERGED | fix(spreektaal): remove owner-vetoed borderline register pairs (atau/m |
| 2026-07-10 | `feat/fold-vaardigheden` | #424 MERGED | feat(voortgang): fold Vaardigheden into Woordenschat |
| 2026-07-10 | `feat/g4-produce-grader-enrichment` | #422 MERGED | fix(grammar): produce-grader false negatives — audit + generate + appl |
| 2026-07-09 | `feat/home-mnemonic-weak-words` | #406 MERGED | feat(home): weak-word ezelsbruggetje surface (slice 1) |
| 2026-06-11 | `feat/home-streak-bar-deeplinks-movement-split` | #228 MERGED | feat(home): streak top-bar, deep-links to voortgang tabs, split moveme |
| 2026-05-17 | `feat/honor-profile-session-size` | #57 MERGED | Honor profile preferredSessionSize in standard mode |
| 2026-05-19 | `feat/in-session-redrill-until-correct` | #76 MERGED | feat(experience): in-session re-drill until every capability is correc |
| 2026-05-20 | `feat/lessons-2-3-publish` | #82 CLOSED | feat(lessons): publish lessons 2 and 3 — bespoke pages on canonical /l |
| 2026-05-19 | `feat/lessons-2-9` | #77 MERGED | fix(exercises): keep audio element alive across parent re-renders |
| 2026-06-12 | `feat/mastery-ladder-lapse-stubborn` | #234 MERGED | feat(mastery): at-risk = genuine lapse only + moeilijk stubborn-word s |
| 2026-06-12 | `feat/moeilijk-callout-ui` | #236 MERGED | feat(voortgang): moeilijke-woorden callout on the funnel tab |
| 2026-06-21 | `feat/morphology-affix-pool-proposer` | #267 CLOSED | Morphology affix-pool proposer (ADR 0020) + lessons 27–30, exercises & |
| 2026-07-10 | `feat/qol-level-sort-session-summary` | #437 MERGED | feat: CEFR level sections, session summary recap, streak + flawless ce |
| 2026-05-16 | `feat/queue-drying-wiring` | #48 MERGED | feat(session-builder): wire queue-drying detector (PR-B) |
| 2026-07-10 | `feat/spreektaal-lesson-weave` | #423 MERGED | content(spreektaal): weave all 66 register pairs into lesson staging ( |
| 2026-07-10 | `feat/spreektaal-register-pairs` | #415 MERGED | feat(spreektaal): register-pairs artifact + live-DB intersection repor |
| 2026-07-10 | `feat/spreektaal-schema-carrier` | #413 MERGED | feat(spreektaal): schema + carrier + generation rules (spec §9 steps 1 |
| 2026-07-10 | `feat/spreektaal-variant-seed` | #418 MERGED | feat(spreektaal): register-pair variant seed (spec §9 step 5) — applie |
| 2026-06-12 | `feat/streak-requires-completed-session` | #231 MERGED | feat(streak): require a completed session, not a single answer |
| 2026-07-09 | `feat/voortgang-hero-and-atrisk` | #408 MERGED | feat(voortgang): Jouw Indonesisch hero strip + at-risk → sheet |
| 2026-07-10 | `feat/voortgang-hub-redesign` | #412 MERGED | feat(voortgang): adopt Ontdek/Leren hub language |
| 2026-05-20 | `feature/retire-page-blocks-phase-1` | #85 MERGED | feat(pipeline): retire lesson_page_blocks production (Phase 1) |
| 2026-06-15 | `fix/admin-flag-capability-anchor` | #251 MERGED | fix(flag): anchor admin content-flags on capability_id so every exerci |
| 2026-07-12 | `fix/audit-scaling-security-leftovers` | #452 MERGED | fix: close the remaining scaling + security audit leftovers |
| 2026-07-11 | `fix/degrey-round2-switch-rulecard-bars` | #441 MERGED | De-grey round 2: switch off-state, RuleCard, remove left accent bars |
| 2026-07-11 | `fix/dimmed-remap-specificity` | #443 MERGED | Fix: dimmed→app-token bridge must be scheme-scoped (the recurring grey |
| 2026-06-11 | `fix/funnel-chevrons` | #226 MERGED | fix(voortgang): uniform chevron funnel + weekly movement counts distin |
| 2026-07-10 | `fix/harmonize-ontdek-cards` | #427 MERGED | fix(ontdek): harmonize sub-menu cards + back-navigation |
| 2026-07-11 | `fix/lesson-registry-content-split` | #446 MERGED | fix(bundle): stop shipping all 30 lessons' content.json in shared chun |
| 2026-07-12 | `fix/mastery-evidence-rpc-narrowing` | #445 MERGED | fix(analytics): RPC-narrow mastery evidence reads + share the fetch (C |
| 2026-07-12 | `fix/migration-drift-reconciliation` | #450 MERGED | fix(schema): reconcile migration.sql with the live DB + retire dead an |
| 2026-07-09 | `fix/moeilijke-woorden-sheet-layout` | #407 MERGED | fix(mnemonics): tidy grid for Moeilijke woorden + drop morphology |
| 2026-07-11 | `fix/security-headers-selfhosted-fonts` | #447 MERGED | fix(security): CSP + security headers in nginx, self-host Plus Jakarta |
| 2026-06-11 | `fix/streakbar-layout` | #230 MERGED | fix(home): streak bar layout — centred flame, counts inside bars |
| 2026-07-12 | `fix/ux-polish-batch` | #453 MERGED | fix(ux): audit polish batch — honest states everywhere data can fail |
| 2026-07-11 | `fix/ux-resilience-highs` | #448 MERGED | fix(ux): close the four resilience highs from the 2026-07-11 audit |
| 2026-07-10 | `fix/vaardigheden-below-graph` | #425 MERGED | fix(voortgang): skill breakdown below the graph |
| 2026-07-10 | `fix/voortgang-graph-atrisk` | #420 MERGED | fix(voortgang): at-risk red band below the growth axis |
| 2026-07-10 | `fix/voortgang-graph-axis` | #421 MERGED | fix(voortgang): weekly x-axis + drop misleading per-band strokes |
| 2026-07-10 | `fix/voortgang-polish` | #419 CLOSED | fix(voortgang): at-risk red band below the growth axis |
| 2026-05-19 | `fold/lib-lessons` | #79 MERGED | fold: lib/lessons/ — rename + barrel + adapter + lessonReadiness retir |
| 2026-05-23 | `pr-2-dialogue-line` | #91 MERGED | PR 2: dialogue_line source_kind — typed reader + writer + bridge |
| 2026-05-23 | `pr-3-affixed-form-pair` | #94 MERGED | PR 3: affixed_form_pair source_kind — typed reader + writer + validato |
| 2026-05-02 | `pr3-capability-content-wireup` | #23 CLOSED | PR-3: Wire capabilityContentService into ExperiencePlayer (closes empt |
| 2026-05-02 | `pr4-delete-legacy` | #24 CLOSED | PR-4: Delete legacy ExerciseShell + unused session modes |
| 2026-06-11 | `refactor/funnel-bucket-single-source` | #229 MERGED | refactor(analytics): single-source the vocab/grammar split via funnelB |
| 2026-05-07 | `retire/audio-multi-voice` | #34 MERGED | retire: audio multi-voice path (Phase 1 retirement #1) |
| 2026-05-07 | `retire/browser-fsrs` | #36 MERGED | retire/browser-fsrs: retire browser-side FSRS subsystem (-341 LOC) |
| 2026-05-07 | `retire/goal-subsystem` | #37 MERGED | Retire #4 — Goal subsystem + event log (-3400 LOC, 5 tables, 9 functio |
| 2026-05-07 | `retire/grammar-state` | #35 MERGED | Retire #2 — grammar-state subsystem (-221 LOC + table) |
| 2026-05-07 | `retire/session-lifecycle` | #38 MERGED | Retire #5 — Session lifecycle module (-221 LOC + 1 fn + 1 cron + 1 RLS |
| 2026-07-11 | `tweak/leren-subtitle-and-hoorhetverschil-font` | #444 MERGED | Larger Hoor-het-verschil text + Leren page subtitle |
| 2026-07-11 | `tweak/uitspraak-warmth-and-audio-color` | #440 MERGED | De-grey sweep: warm the uitspraak sections, audio players, lesson nav, |
| 2026-05-25 | `worktree-agent-a9b863a3ec2bc1d42` | #103 CLOSED | Slice 1: capability-stage DB→DB spine — item source_kind end-to-end (# |

## Note for next time

The pre-push hook runs the full 3,300-test suite on **every** push, including
delete-only pushes, where it buys nothing. That turned this sweep into several
timed-out batches. A guard that skips the suite when a push contains only
deletions would make future cleanup instant without weakening the hook.
