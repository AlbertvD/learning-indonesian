# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

This is a **single-context** repo: one `CONTEXT.md` + one `docs/adr/` at the root. There is no `CONTEXT-MAP.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; the producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/                      ← architectural decisions (0001…)
│   ├── current-system/modules/   ← living per-module specs
│   └── plans/                    ← forward-looking specs (status-tagged)
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids. If the concept isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (receptive-before-productive staging) — but worth reopening because…_

## Repo-specific: module specs and plan status

Beyond `CONTEXT.md` + `docs/adr/`, this repo keeps two more doc surfaces that skills should treat as part of the domain map:

- **`docs/current-system/modules/<name>.md`** — living per-module specs. Use their §5 "Seams" to navigate between modules; treat every `file:line` cite as verifiable, not authoritative (re-check against the code, per `CLAUDE.md`).
- **`docs/plans/*.md`** — forward-looking specs carrying a `status:` frontmatter (`draft` / `approved` / `implementing` / `shipped`). **Read the status before reasoning from a plan.** A `shipped` plan is a changelog, not a spec — anchor to the code at its `implementation_paths`, not its prose.

## Freshness caveat (2026-05-25)

`CONTEXT.md`'s **`Typed Artifact`** and **`Capability Contract`** entries still describe the generic `capability_artifacts` model that ADR 0009/0011 + the typed-table migration are retiring. Treat those two glossary entries as stale pending a reconciliation pass; trust the typed satellite tables + the ADRs over them. (The pipeline terms — `Lesson Stage`, `Capability Stage`, `Stage Contract`, `Capability Review`, `Learning Item`, `Capability Type` — are current as of this date.)
