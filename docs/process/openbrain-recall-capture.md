---
doc_type: process
surface: .claude/agents/, ~/.claude/vendor/mattpocock-skills/skills/engineering/
last_verified_against_code: 2026-06-03
status: stable
---

# OpenBrain recall / capture — the shared convention

This is the **single source of truth** for how every agent and skill in the dev-workflow
loop reads from and writes to OpenBrain. The agent preambles (`.claude/agents/*.md`) carry
the three standing obligations and point here for the exact calls — so the recipes live in
one place and don't drift across callers (the goal of slice #138).

For *where each call sits in the loop* see `docs/process/dev-workflow.md`. This doc is the
*how*: which tool, which parameters, which valid values.

## Valid parameter values (read this first)

OpenBrain's `deployment_lessons` store is **homelab-wide and shared** — its enums are not
app-specific. Use these values for this repo:

- **`stack`** (free text) — `learning-indonesian` for app/pipeline lessons. Use a more
  specific sub-area only when it genuinely narrows search (e.g. `supabase` for shared-DB
  infra lessons that aren't app-specific).
- **`category`** (enum) — pick the closest of: `supabase` (schema · migration · RLS · grants
  · PostgREST), `frontend` (React · Mantine · session/exercise UI), `ci` (publish pipeline ·
  build · GitHub Actions), `security`, `auth`, `docker`, `other`. There is **no** `migration`
  / `rls` / `pipeline` value — those map to `supabase` / `ci`.
- **`eval_type`** (enum) — `pre_deploy` (caught before shipping), `post_deploy`,
  `invariant` (a cross-module rule that must always hold), `runtime`.
- **`severity`** (enum) — `outage`, `bug`, `friction`, `optimization`.

Inventing an enum value silently narrows or drops results. When unsure, omit the optional
filter rather than guess.

## Recall — read before you act

Pull prior lessons for the area you're touching *before* designing, building, or reviewing.

| Phase | Tool | Call shape |
|---|---|---|
| 0 · Context | `mcp__openbrain__get_repo_profile` then `mcp__openbrain__match_deployment_lessons` | `match_deployment_lessons({ query: "<the area being entered>" })` |
| 1 · Design (grill) | `mcp__openbrain__match_deployment_lessons` | `{ query: "<feature/schema>", eval_type: "pre_deploy" }` — or `eval_type: "invariant"` for schema/migration work. Surfaces migration · RLS · grant · additive landmines. |
| 4 · Build (tdd) | `mcp__openbrain__match_deployment_lessons` | `{ query: "<files/modules>" }` — pagination · counters · destructive-op watch-outs. |
| 5 · Review | `mcp__openbrain__search_deployment_lessons` | `{ category: "<area>", severity: "bug" }` — the "bugs we've hit here" checklist. |

Also read the `CONTEXT.md` glossary + any `docs/adr/` in the area and use that vocabulary.
`match_*` is semantic (natural-language query); `search_*` is keyword/structured-filter.

## Capture — route by always-on vs area-specific

When you hit or prevent a reusable issue, record it — **routed by kind**, not dumped in one
place:

| Kind of lesson | Where | Call |
|---|---|---|
| **Area-specific ops** (RLS folding, pagination, grants, migration mechanics, pipeline gates) | OpenBrain `deployment_lesson` **only** | `mcp__openbrain__add_deployment_lesson({ stack, category, severity, lesson, root_cause?, guardrail })` — always include a `guardrail` (the check that prevents recurrence). |
| **Always-on methodology** (data-exists≠renders, fold-vs-redesign, spec-grounding, post-PR-verify) | **both** a `memory/feedback_*` file-memory **and** OpenBrain | file-memory (in every session) + `add_deployment_lesson` or `add_thought` (surfaces on semantic match). |
| **Soft / uncertain** | a thought, promoted later | `mcp__openbrain__add_thought({ content })`; promote with `promote_thought_to_lesson` once it proves durable. |

**Capture points in the loop:** Design (decisions → ADRs; insight → thought) · Review
(`add_deployment_lesson` + guardrail) · Test/diagnose (`add_deployment_lesson`
`severity: "bug"`, guardrail = the regression test) · Finish (mandatory sweep, routed per
the table above).

## Tool access

The four dev agents (`architect`, `data-architect`, `developer`, `tester`) are granted the
recall + capture tools in their `tools:` frontmatter:
`match_deployment_lessons`, `search_deployment_lessons`, `add_deployment_lesson`,
`add_thought`.

`promote_thought_to_lesson` is **deliberately withheld** from the subagents — promoting a
thought to a durable lesson is a curation decision that stays with the human / main loop, so
soft thoughts are reviewed before they become guardrails.
