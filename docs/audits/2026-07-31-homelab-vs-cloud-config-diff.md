# Homelab vs Supabase Cloud — configuration diff (2026-07-31)

Motivation: the homelab is intended as a **staging environment** for cloud
releases. Staging only has value where it matches production, so this
enumerates every DB-layer difference. Method: identical catalog query run
against both, output sorted and diffed
(`scratchpad/env-diff.sql`).

**Scope limit — the DB layer only.** Gateway (Kong vs Supabase's), edge-runtime
config (`VERIFY_JWT` is global self-hosted, per-function on cloud), and GoTrue
env are NOT visible from SQL and are not covered here.

---

## 1. `statement_timeout` — the one that matters most

```
homelab   statement_timeout = 0        (unlimited; no per-role limits)
cloud     statement_timeout = 120000   global
          anon          = 3s           per-role
          authenticated = 8s           per-role
```

**Every query the app issues as a signed-in user is killed after 8 seconds on
cloud.** On the homelab there is no limit at all, so a slow query is merely
slow. A regression that pushes a read past 8s therefore passes staging and
fails production — the exact blind spot staging is supposed to remove.

**Current headroom is large.** Measured on cloud:

| query | time |
|---|---|
| `count(*) learning_capabilities` (15,944) | 100 ms |
| `count(*) distractors` (21,447) | 101 ms |
| `count(*) capability_content_units` (17,162) | 80 ms |

~80× under budget. Not a live problem; a constraint to design within as data
grows, and the first thing to suspect if a page starts failing on cloud but not
locally. Analytics surfaces are the likeliest to approach it.

## 2. `search_path` differs for the app roles

```
homelab   anon / authenticated / service_role → "storage, public"
          (server default also "storage, public")
cloud     anon / authenticated → no search_path set (only statement_timeout)
          (server default "$user", public, extensions)
```

Any **unqualified** reference resolves differently. On the homelab `storage` is
searched; on cloud `extensions` is. This is the mechanism behind the
`unaccent` problem already fixed in PR #464 — and the fix is robust precisely
because `immutable_unaccent` sets its *own* `search_path` rather than relying
on the role's. Worth remembering when adding SECURITY DEFINER functions: pin
`search_path` explicitly and never inherit it.

## 3. `postgres` role privileges

```
homelab   super=true   bypassrls=false  createrole=false
cloud     super=false  bypassrls=true   createrole=true
```

Cloud's `postgres` is **not a superuser**. This is why
`CREATE EXTENSION ... WITH SCHEMA storage` failed there (PR #464): `storage` is
owned by `supabase_storage_admin`. Any migration relying on superuser
behaviour will pass on the homelab and fail on cloud.

## 4. Extensions

| extension | homelab | cloud |
|---|---|---|
| `unaccent` | 1.1 in **storage** | 1.1 in **extensions** |
| `pg_stat_statements` | 1.10 in **storage** | 1.11 in **extensions** |
| `pg_cron` | 1.6 | 1.6.4 |
| `vector` | 0.8.0 | 0.8.2 |
| `pgjwt` | **0.2.0 present** | **absent** |
| `supabase_vault` | absent | 0.3.1 |

`pgjwt` being absent on cloud is the one worth a grep — nothing in
`migration.sql` appears to use it, but confirm before assuming.

## 5. Connections

```
homelab  max_connections = 100   (direct)
cloud    max_connections = 60    (plus the pooler in front)
```

Lower ceiling on cloud, mitigated by pooling. Relevant only under real
concurrency.

## 6. Collation — IDENTICAL ✅

```
both: lc_collate = en_US.UTF-8   lc_ctype = en_US.UTF-8
```

Explicitly checked because a collation mismatch silently changes `ORDER BY`
results for accented text — which would matter for Indonesian/Dutch sorting.
It is not a risk here.

## 7. Storage bucket config

```
homelab   public=true   file_size_limit=209715200 (200 MB) on lessons+podcasts
cloud     public=false  file_size_limit=none at bucket level
```

Cloud's per-file limit is enforced by the **plan**, not the bucket row — which
is why the 97 MB grammar files uploaded happily to the homelab and were
rejected on the free tier at 50 MB.

## 8. Object counts — fully explained, no mystery drift ✅

```
              homelab   cloud   delta
tables            45      46      +1
rls_enabled       45      46      +1
policies          56      57      +1
functions         26      27      +1
indexes          129     131      +2
```

Exactly what PR #461 predicts: **+2** tables (`entitlements`,
`stripe_webhook_events`) **−1** (`signup_invite_codes`); **+3** functions
(`has_active_entitlement`, `can_read_media`, `is_free_tier_lesson`) **−2**
(`redeem_invite_code`, `restore_invite_code`). Nothing unaccounted for.

## 9. Grants — known drift

```
homelab   anon SELECT on 7 indonesian tables
cloud     anon SELECT on 0
```

Undeclared in `migration.sql`. Verified harmless (RLS enabled on all 7, no
policy admits `anon` or `public`, so anon receives an empty set) — but cloud is
the tighter, intended posture.

---

## What this means for homelab-as-staging

**Catches:** application regressions — logic, rendering, data corruption,
migration errors that are version-independent.

**Cannot catch:** the `statement_timeout` cliff (§1), superuser-dependent
migrations (§3), the PG 15 vs 17 behavioural differences already seen
(`DROP POLICY IF EXISTS`), or anything gateway/edge-runtime shaped.

Two of those close cheaply if wanted:

```sql
-- match cloud's per-role budgets on the homelab
alter role authenticated set statement_timeout = '8s';
alter role anon          set statement_timeout = '3s';
```

That is arguably higher value than the Postgres major upgrade: it makes the
most dangerous invisible difference visible in staging, in two statements, with
no downtime and no shared-instance risk (note the instance is shared with
family-hub, so it would apply to that app too — check its queries first).

The **1000-row cap** difference no longer applies: cloud's was raised to
100,000, so both environments now behave the same. See
`2026-07-30-postgrest-row-cap-audit.md` — but note that setting was applied
over SQL and a dashboard write could revert it.
