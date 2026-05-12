# podcast-stage — INVENTORY

This directory will become the next deep module to be folded after
capability-stage. It currently ships only the projection rule extracted
from `src/lib/capabilities/capabilityCatalog.ts:164–192` per fold §4
Decision 4. The rest of the deep-module shape — loader, runner, adapter,
agents, validators, verify hooks — is deferred to a follow-up fold.

## What landed in this fold

- `podcastProjectionRules.ts` — pure rule function emitting
  `podcast_gist` + `meaning_recall` capabilities for podcast segments
  and phrases. Verbatim extraction from the shared catalog. Four callers
  updated per §11 #17.

## Pending work (separate fold)

| File | Sourced from | Notes |
|---|---|---|
| `loader.ts` | `scripts/data/staging/podcast-warung-market/{podcast-segments,podcast-phrases}.ts` | Read podcast segments + phrases from DB once they land in real tables. Today these only exist as staging files. |
| `runner.ts` | TBD | Mirror lesson-stage / capability-stage shape. Author podcast-specific agents (gist prompts, phrase pairs) and project to capability rows. |
| `adapter.ts` | TBD | All Supabase writes for podcast tables. |
| `authoring/` | new agents | `podcast-gist-prompt-creator`, `podcast-phrase-pair-author`. |
| `validators/` | TBD | Podcast-specific gates (segment timecode coverage, transcript fidelity). |
| `verify/` | TBD | Post-write hooks paralleling capability-stage's `countParity` /
   `contentNonEmpty` / `seedIntegrity`. |
| `__tests__/` | new | TDD coverage per CLAUDE.md. |

## Caller wiring (post fold)

Today's four `projectCapabilities` callers run podcast rules alongside the
shared catalog (one-line additive update, fold §11 #17):

```ts
const projection = projectCapabilities(snapshot)
const podcastCapabilities = projectPodcastCapabilities(snapshot)
const allCapabilities = [...projection.capabilities, ...podcastCapabilities]
```

Callers updated:

- `scripts/materialize-capabilities.ts:268`
- `scripts/check-capability-health.ts:441`
- `scripts/lib/content-pipeline-output.ts:360`
- `scripts/data/staging/podcast-warung-market/capabilities.ts:5`

The deep-module fold will replace those call sites with `runPodcastStage`
following the lesson-stage / capability-stage pattern.

## Staging directory retention

`scripts/data/staging/podcast-warung-market/` stays intact (fold §11 #18).
Its retirement is part of the future podcast deep-module fold once the
podcast tables exist in DB.
