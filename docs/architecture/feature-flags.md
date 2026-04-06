# Feature Flags

`src/lib/featureFlags.ts`

---

## Overview

Feature flags control gradual rollout of exercise types and content pipeline features. All flags are `VITE_FEATURE_*` environment variables parsed at **build time** by Vite. Setting them at runtime has no effect — they are baked into the bundle.

Two independent gate systems exist for exercise types:

1. **Env-var flags** — `featureFlags` object, checked by `isExerciseTypeEnabled()`. These take **precedence**: if the flag disables a type, it is filtered regardless of DB state.

2. **DB availability gate** — `exercise_type_availability` table, checked in session policy layer 1. If the env-var flag is enabled, the DB gate is checked next. Missing DB records are fail-open (the type passes through).

---

## Flag parsing

```ts
function parseEnvFlag(key: string): boolean {
  const value = import.meta.env[key]
  if (value === undefined || value === '') return true   // absent = enabled
  if (value === 'false' || value === '0') return false   // explicit disable
  return true                                            // anything else = enabled
}
```

**Default is enabled.** To disable a flag, explicitly set it to `false` or `0` in the build environment. An absent or empty variable is treated as enabled.

---

## Exercise type flags

| Flag | Exercise type | Default | Notes |
|---|---|---|---|
| `VITE_FEATURE_CUED_RECALL` | `cued_recall` | Enabled | Reverse MCQ — translation → pick Indonesian |
| `VITE_FEATURE_CONTRAST_PAIR` | `contrast_pair` | Enabled | Grammar: pick between two confusable forms |
| `VITE_FEATURE_SENTENCE_TRANSFORMATION` | `sentence_transformation` | Enabled | Grammar: transform a sentence |
| `VITE_FEATURE_CONSTRAINED_TRANSLATION` | `constrained_translation` | Enabled | Grammar: translate using a required pattern |
| `VITE_FEATURE_SPEAKING` | `speaking` | Enabled (flag); disabled via DB | Speaking exercises — no speech recognition wired up |

**Hardcoded-enabled types** (cannot be disabled via flags):

| Type | Reason |
|---|---|
| `recognition_mcq` | Core vocabulary type, always needed |
| `typed_recall` | Core vocabulary type, always needed |
| `cloze` | Core vocabulary type, always needed |

```ts
case 'recognition_mcq':
case 'typed_recall':
case 'cloze':
  return true  // always enabled regardless of env var
default:
  return false // unknown types are fail-closed — silently blocked
```

**Unknown types are fail-closed.** Any exercise type not explicitly listed in the switch returns `false`. If a new type is added to the DB but not yet added to `isExerciseTypeEnabled`, it will be silently blocked even if the DB says `session_enabled = true`.

`speaking` is effectively disabled in production: the DB `exercise_type_availability` row has `session_enabled = false`, so even if the env-var flag allows it, the DB gate blocks it in session policies.

---

## Content pipeline flags

| Flag | Function | Default |
|---|---|---|
| `VITE_FEATURE_TEXTBOOK_IMPORT` | `isTextbookImportEnabled()` | Enabled |
| `VITE_FEATURE_AI_GENERATION` | `isAiGenerationEnabled()` | Enabled |

`isTextbookImportEnabled()` and `isAiGenerationEnabled()` are also exported as standalone functions for callers that need to gate only one branch. `isContentPipelineEnabled()` returns `true` only when **both** flags are enabled:

```ts
export function isContentPipelineEnabled(): boolean {
  return featureFlags.textbookImport && featureFlags.aiGeneration
}
```

These flags gate the textbook import UI and AI-assisted lesson parsing pipeline. Disabling `VITE_FEATURE_AI_GENERATION` prevents the app from attempting AI-generation workflows that would fail without an API key.

---

## DB availability gate

The `exercise_type_availability` table provides a second, independently-controllable gate:

```sql
exercise_type          text PK
session_enabled        boolean   -- whether the type appears in sessions
authoring_enabled      boolean   -- whether new content can be authored for this type
requires_approved_content boolean
rollout_phase          text      -- informational: 'phase1', 'phase2', etc.
notes                  text
```

This gate is checked in session policy layer 1 (`filterByExerciseAvailability`). The env-var flag is always checked first. If the env-var disables the type, the DB record is not consulted.

**Fail-open behavior — two distinct cases:**
1. If `context.exerciseTypeAvailability` is `undefined` (the map itself was never loaded), the entire filter function returns the queue unchanged — the feature-flag check also does not run.
2. If the map is loaded but a specific exercise type has no record, that type passes through (per-type fail-open).

A transient DB failure should not break sessions.

---

## Interaction between the two gates

```
isExerciseTypeEnabled(type) === false  →  FILTERED (env wins, DB not checked)
isExerciseTypeEnabled(type) === true
  → availability record missing         →  PASS (fail-open)
  → availability.session_enabled = false →  FILTERED
  → availability.session_enabled = true  →  PASS
```

---

## Setting flags at build time

```bash
# In docker build:
docker build \
  --build-arg VITE_FEATURE_CUED_RECALL=false \
  --build-arg VITE_FEATURE_SPEAKING=false \
  ...

# In .env.local for local dev:
VITE_FEATURE_SPEAKING=false
```

For homelab deployment, build args are passed via `docker-compose.yml` in `homelab-configs`. Since Vite bakes these at build time, changing a flag requires rebuilding and redeploying the container.

---

## Adding a new flag

1. Add the key to the `FeatureFlags` interface in `featureFlags.ts`.
2. Add `parseEnvFlag('VITE_FEATURE_YOUR_FLAG')` to the `featureFlags` object.
3. Add a `case 'your_exercise_type': return featureFlags.yourFlag` branch to `isExerciseTypeEnabled`.
4. Insert a row into `exercise_type_availability` via migration.
5. Document the flag in this file and in the relevant exercise type entry in [exercise-types.md](exercise-types.md).
