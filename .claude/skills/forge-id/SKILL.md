---
name: forge-id
description: >-
  Thin launcher for the learning-indonesian dev-workflow loop. Use when the user
  says "/forge-id", "forge-id", "start the loop", "where am I in the workflow",
  "what's next", "context load for <area>", or wants orientation before designing
  / building / reviewing a feature or fix. It does TWO things only: (1) phase-0
  context load (CONTEXT.md glossary + OpenBrain recall + relevant ADRs/module
  specs for the area), and (2) prints the loop map with "you are here → next".
  It is NOT a process-owner and does NOT drive phases — it orients you, then hands
  control to the composable Pocock skills. For the canonical loop reference see
  docs/process/dev-workflow.md.
---

# /forge-id — dev-workflow launcher (thin, by design)

You are a **launcher**, not an orchestrator. The dev-workflow is deliberately
**composable, not a monolith** (Pocock philosophy — nothing auto-advances; the
user stays in control). This skill orients the user and then **stops**. It never
runs the next phase itself, never chains skills, never owns the process. If you
feel the urge to "just also run to-prd" — don't. Orient, suggest, hand off.

Full reference: `docs/process/dev-workflow.md`. Recall/capture recipes:
`docs/process/openbrain-recall-capture.md`.

## What you do — exactly two things

### 1. Phase-0 context load (for the area the user named)

- Read the `CONTEXT.md` glossary and adopt its vocabulary.
- **Recall** prior lessons for the area: `mcp__openbrain__get_repo_profile`, then
  `mcp__openbrain__match_deployment_lessons({ query: "<the area / feature / bug>" })`
  (add `eval_type: "pre_deploy"` or `"invariant"` for schema/migration work).
  Surface the top 2–3 lessons by gist — these are the landmines to avoid.
- Point at the relevant `docs/adr/*.md` and `docs/current-system/modules/<name>.md`
  for the area (don't summarise from memory — name the files to read).
- If the user named no area, ask once for it (one line), or print the loop map and
  let them choose where to start.

### 2. Print the loop map — "you are here → next"

Identify where the user is from what they said (a new idea → DESIGN; a bug →
TRIAGE; "I just finished building" → REVIEW; etc.), mark it, and show the next hop.

```
feature idea ─► DESIGN ─► PRD ─► SLICE ─► TRIAGE ─► BUILD ─► REVIEW ─► TEST ─► FINISH
bug report ───────────────────────────────► TRIAGE ┘
```

| Phase | Run (skill) | Agent(s) | Recall | Gate |
|---|---|---|---|---|
| DESIGN | `grill-with-docs` | architect (+ data-architect*) | `match_deployment_lessons` (pre_deploy/invariant) | **Durability Gate** |
| PRD | `to-prd` | — | — | gate must have passed |
| SLICE | `to-issues` | — | — | — |
| TRIAGE | `triage` | — | `.out-of-scope` + lessons | — |
| BUILD | `tdd` | engineer (`developer`) | file/area lessons | gate on your code |
| REVIEW | `requesting-code-review` | architect + data-architect* | `search_deployment_lessons` (bug) | **Durability Gate** |
| TEST | coverage / `diagnose` | tester | bug-class lessons | gate on the fix |
| FINISH | `finishing-a-development-branch` | — | — | **finish gate** (lesson trailer + PR-1 verify) |

`*` data-architect only when the data model is touched. A data-model spec needs
**both** architect and data-architect sign-off before `status: approved`.

## Then hand off — and stop

Close with the standard phase-transition footer and **return control to the user**:

> ✅ Oriented. You are at **\<phase\>**. Next → run `\<skill\>` (agent: \<X\>; recall: \<query\>; the Durability Gate applies). — Or: bug → `diagnose` → BUILD.

Do not invoke the next skill yourself. The user runs it when ready.
