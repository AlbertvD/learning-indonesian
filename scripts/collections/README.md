# Collections — frequency-band seed runbook

The collections feature ships in slices. **Built (offline, on `feat/collections-content`):**

| Piece | Where |
|---|---|
| Schema (tables, RPC, Common Words lesson) — slice 1 | `scripts/migration.sql` (merged #245) |
| Runtime gate-OR + membership — slice 2 | `src/lib/collections/`, `src/lib/session-builder/pedagogy.ts` |
| `setCollectionActivated` write — slice 3.1 | `src/lib/collections/activation.ts` |
| `get_collections_overview` coverage RPC — slice 3.2 | `scripts/migration.sql` |
| **Seed machinery + §8 gate-1/2 helper** | `scripts/collections/projection.ts`, `seed-collection.ts` |
| **§8 gate-3 live check (HC29) + RLS/grants** | `scripts/check-supabase-deep.ts` |
| **Woordenlijsten checklist UI** | `src/components/collections/Woordenlijsten*.tsx` (on the Lessons page) |
| **Home goal widget** | `src/components/collections/CommonWordsGoalCard.tsx` (on the Dashboard) |

**Not yet done — needs live DB access** (all blocked on the homelab Supabase write path):
the gap-word authoring, the Common Words publish, the seed run, and the live e2e.

---

## 0. Unblock DB access

Live-DB scripts use the homelab's internal Step-CA cert via `NODE_TLS_REJECT_UNAUTHORIZED=0`
(or `make migrate`'s SSH→`docker exec psql` path). In a restricted permission mode both are
blocked. Pick one: switch to accept-edits/bypass mode, add Bash permission rules for these
commands, or run the steps below yourself with the `!` prefix.

## 1. Measure the current residual

```bash
# /tmp/pbwl-top100.json holds the PBWL top-100 roots (rank, root, cefr, freq).
NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/collections/analyze-top100.ts
```
Prints `matched / gap` and the gap-word list. **Re-run after every harvest** — the grammar-table
harvest (commit 201c485) already closed many of the original 33; this is the authoritative detector.

## 2. Author the gap words (Common Words unit)

Gap words become normal vocab `learning_items` (with the full capability suite) by publishing them
as a **Stage-A `vocabulary` section** in the hidden **Common Words** lesson (spec §6). The
`lessons` row already exists (`module_id='common-words'`, `order_index=999`, `is_hidden=true`,
seeded in `migration.sql`). The lesson-stage upserts `lessons` by `(module_id, order_index)`, and
`publish-approved-content.ts <N>` reads `scripts/data/staging/lesson-<N>/`, so the unit lives at
**`scripts/data/staging/lesson-999/lesson.ts`**:

```ts
export const lesson = {
  title: 'Common Words',
  level: 'A1',
  module_id: 'common-words',
  order_index: 999,
  sections: [
    {
      title: 'Veelvoorkomende woorden',
      order_index: 0,
      content: {
        type: 'vocabulary',
        items: [
          // NL is the author-reviewed answer key; EN is also given (the enricher
          // fills EN when omitted, but the IndoDic-licensing note in
          // memory/project_monetization_direction says author OUR OWN EN, never PBWL's).
          { dutch: 'voor',   indonesian: 'untuk',  english: 'for' },
          { dutch: 'in',     indonesian: 'dalam',  english: 'in, inside' },
          { dutch: 'hij/zij', indonesian: 'dia',   english: 'he, she' },
          // … one row per residual gap word from step 1.
        ],
      },
    },
  ],
}
```
Resolve-or-create on `normalized_text` (the `itemSlug` contract) dedups against existing lesson
words, so a superset is safe — already-taught words are reused, not duplicated.

## 3. Publish the Common Words unit

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/publish-approved-content.ts 999
```
Vocab-only → Stage A writes the section + `learning_items` + vocab caps + distractors; Stage B is a
no-op for vocab. Per spec §6 a vocab-only unit trips no coverage gates (grammar CS18 / dialogue-cloze
CS22 only map over sections present). **Confirm this on the first live run** — it is the one
un-exercised path; if a gate misfires use `--skip-lint` and file the gate as needing a vocab-only
exemption.

## 4. Seed the collection (sets frequency_rank + materialises members)

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/collections/seed-collection.ts \
  --slug top-100 --name 'Top 100 woorden' --cutoff 100 --ranks /tmp/pbwl-top100.json
# --dry-run first to preview resolved vs. gap words without writing.
```
Sets `frequency_rank` on resolved items, upserts the `collections` row, materialises
`collection_items` as `frequency_rank <= 100`, and re-asserts the §8 gate-2 bidirectional invariant
(fails loud on drift). Any words still reported as gaps mean step 2/3 missed them.

## 5. Verify

```bash
make check-supabase-deep SUPABASE_SERVICE_KEY=<key>   # HC29 projection + collections RLS/grants green
```
Then in the app: **Lessons → Woordenlijsten** shows the Top-100 card with its coverage bar; toggle it
on; start a Home session and confirm gap-word caps appear (the §5 gate-OR). The Dashboard goal card
shows the headline band's coverage.

## 6. Scale to Top-1000

Same four steps with a top-1000 ranks file and `--slug top-1000 --name 'Top 1000 woorden'
--cutoff 1000`. The machinery is band-agnostic; only the corpus ranking + the residual gap-word
authoring change. (Commercial-cloud licensing for PBWL is pending the author's reply — homelab use is
already licensed; see `memory/project_monetization_direction`.)
