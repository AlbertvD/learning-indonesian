# PostgREST 1000-row cap — exposure audit (2026-07-30)

**Status: findings only. No app code changed.** One confirmed defect, one
conditional, two cleared.

## The difference that caused this

Managed Supabase enforces `db-max-rows = 1000`; self-hosted PostgREST has **no
cap**. Proven on `audio_clips`: cloud returned `content-range: 0-999/5132`,
homelab returned all 5132. **Truncation is silent** — HTTP 200, no error, no
warning header the client checks.

So any unpaginated read of a large table works perfectly on the homelab and
quietly returns partial data on cloud. This is a *cloud-migration* bug class
that six months of homelab development could not have surfaced.

**Currently mitigated**, not fixed:
```sql
alter role authenticator set pgrst.db_max_rows = '100000';
notify pgrst, 'reload config';
```
That restored parity (deep check went 190/7 → 196/2). ⚠️ It was set over SQL;
the dashboard's **Settings → API → Max rows** may overwrite it, so re-check
after any API-settings change. Revert with
`alter role authenticator reset pgrst.db_max_rows;`

## Findings

### 🔴 CONFIRMED — `src/lib/collections/adapter.ts:55`

```ts
.from('collection_items')
.select('learning_items(normalized_text)')
.in('collection_id', collectionIds as string[])
```

No `.range()`, no `.limit()`. Measured:

| | rows |
|---|---|
| largest single collection | **exactly 1000** |
| all collection_items | 2253 |

The top-1000 frequency band contains **precisely 1000 items** — it sits exactly
on the default cap. At that boundary a truncated response and a complete one
are indistinguishable, so a regression here would never announce itself. Any
learner with **two or more collections activated** exceeds the cap outright and
silently loses vocabulary from their collection scope.

Because collections feed vocabulary selection, the failure is not a visible
error — it is a learner quietly never being shown part of the material they
activated.

### ⚠️ CONDITIONAL — `src/lib/exercise-content/byKind/item.ts:171`

```ts
.from('item_contexts').select('learning_item_id').in('source_lesson_id', lessonIds)
```

Max `item_contexts` for a **single** lesson is **738** — safe alone. But the
parameter is `lessonIds` (plural); **two average lessons in scope exceed 1000.**
The sibling `.in('learning_item_id', itemIds)` reads on `item_contexts` (3657
rows) and `item_answer_variants` (3094) have the same shape, and the file's own
comment notes the distractor-pool path "can pass several hundred ids".

Note this file already chunks for *Kong URL length*, which is a different
constraint from *response row count* — chunking the request does not bound the
response, so the existing mitigation does not help here.

### ✅ CLEARED — `src/lib/session-builder/adapter.ts:456`

`.eq('register', 'informal')` → **66 rows**. Two orders of magnitude clear.

### ✅ CLEARED — `src/lib/analytics/mastery/masteryModel.ts:1200`

`.eq('content_unit_id', …)` → max **6** rows per content unit. The sibling at
:1212 filters to a single grammar pattern; likewise small.

Also cleared by inspection: `session-builder/adapter.ts:377`
(`.eq('canonical_key') .limit(1)`).

## Recommendation

Raising the cap is a **mitigation, not a fix**. Shipping 1000+ rows to the
browser contradicts CLAUDE.md's own preferred-solutions table:

> Read aggregation: server-side RPC aggregation (small result) > ship rows to
> crunch client-side

Both live findings only need the *identifiers* they extract
(`normalized_text`, `learning_item_id`) — neither needs whole rows client-side,
so both are natural candidates for the RPC-aggregation seam the architecture
already prefers, rather than for pagination loops.

If pagination is chosen instead, note the existing house rule: a `.range()`
loop **must** carry a stable `.order()` or pages duplicate and drop rows — see
[[project-range-needs-order-pagination]], which caused a flaky HC49 false
positive once already.

## Scripts (not assessed)

Many `scripts/*` also read these tables unpaginated. Deliberately out of scope:
they are operator-run, their output is inspected, and truncation there is
visible rather than silent. Worth a pass before any of them is automated.

## Guardrail worth adding

A health check asserting `pgrst.db_max_rows` is still raised would catch a
dashboard-side overwrite before it silently truncates a learner's session.
Currently nothing detects that regression.
