# Backups & observability proposal — 2026-07-02 — pre-cloud-hardening (Follow-up D)

**Sources read:** `/Users/albert/home/homelab-configs/services/openbrain/docker-compose.yml` (the
`postgres-backup` service), `/Users/albert/home/homelab-configs/services/openbrain/scripts/backup.sh` +
`scripts/docker-entrypoint.sh` (the scheduler loop), `/Users/albert/home/homelab-configs/scripts/backup-storage.sh`,
`/Users/albert/home/homelab-configs/architecture.md`, `/Users/albert/home/homelab-configs/NETWORK.md`,
`/Users/albert/home/homelab-configs/services/supabase/docker-compose.yml`, `services/supabase/kong/kong.yml`,
`services/prometheus/{docker-compose.yml,prometheus.yml,alertmanager.yml}`, `services/grafana/docker-compose.yml`,
`services/monitoring-exporters/docker-compose.yml`, this repo's `Makefile`, `src/lib/logger.ts`,
`src/App.tsx`, `src/main.tsx`, `src/components/exercises/ExerciseErrorBoundary.tsx`,
`docs/process/content-pipeline.md`, `docs/current-system/infrastructure.md`,
`supabase/functions/{commit-capability-answer-report,signup-with-invite}/index.ts`, `.gitignore`.
**Live checks run (read-only, over `ssh mrblond@master-docker`):** listed the on-disk dump directory,
storage-bucket directory sizes, and pulled one dump locally to inspect its table-of-contents with
`pg_restore --list` (the local copy was deleted immediately after inspection — it contains real
`auth.users` data). No infra was changed; nothing is committed.

**Scope note:** this is a proposal document. Every option in §4 is a decision for the user;
§6 splits decisions from agent-runnable follow-ups.

---

## Executive summary

1. **A nightly Postgres backup already exists and it covers this app's data.** The `openbrain-postgres-backup` container (`homelab-configs/services/openbrain/docker-compose.yml:117-146`) runs `pg_dump --format=custom` of the **whole `postgres` database** on `supabase-db` daily at 02:30, verifies the dump with `pg_restore --list`, rsyncs it to the Proxmox host (`/mnt/pve/backups/postgres/`), prunes local copies after 7 days, and sends ntfy success/failure notifications (`services/openbrain/scripts/backup.sh`). Despite living under `openbrain/`, it dumps `PGDATABASE=postgres` — I verified the 2026-07-02 dump's TOC directly: it contains **44 `indonesian.*` tables (incl. `learner_capability_state`, `learning_sessions`, `profiles`, `error_logs`), 23 `auth.*` tables (incl. `auth.users`), and `storage.buckets`/`storage.objects` metadata**.
2. **What that backup does NOT cover:** the **storage bucket files themselves** (4.0 GB of audio at `/opt/docker/appdata/supabase/storage/` on master-docker — `storage.objects` rows are in the dump, the bytes are not), the **edge-function deployment** at `/opt/docker/appdata/supabase/functions/` (source is in this repo's `supabase/functions/`, but the deployed copy is hand-placed), and **local retention depth is only 7 days on-VM** (Proxmox-side retention/pruning of the rsynced copies is not defined in any config I could find — unknown, and the Proxmox `backups` disk is a single 3.6 TB HDD; PBS storage was already flagged "94% capacity" in `architecture.md` §5).
3. **The single biggest gap is not the backup — it's that a restore has never been tested**, and there is no documented restore runbook anywhere in either repo. Second biggest: retention/off-site — every copy of the dump lives in the same house.
4. **Observability today:** Prometheus + Alertmanager + Grafana + cadvisor/node-exporter run on the homelab (`services/prometheus/`, `services/monitoring-exporters/`), but **Alertmanager's only receiver is a dead webhook** (`alertmanager.yml:10` → `http://127.0.0.1:5001/`, nothing listens there — Lute's 5001 is a different container), there is **no blackbox/HTTP probe job** (grep for `blackbox` in homelab-configs: zero hits), so **nothing checks `indonesian.duin.home` or `api.supabase.duin.home` uptime**. No uptime-kuma/healthchecks service exists.
5. **App-side observability:** `error_logs` is write-only (writer `src/lib/logger.ts:34`; zero readers in `src/` — confirmed by grep), render crashes inside an exercise DO reach `error_logs` via `ExerciseErrorBoundary.componentDidCatch` (`src/components/exercises/ExerciseErrorBoundary.tsx:47-52`), but **there is no top-level ErrorBoundary in `App.tsx`/`main.tsx`** — a crash in any page outside an exercise is a white screen that never reaches `error_logs`. No Sentry/PostHog/web-vitals dependency exists (`package.json` grep: none).
6. Proposals below are sized for a <50-user preview under Minimum Mechanism: mostly *reuse the existing, working openbrain backup machinery* (extend, don't duplicate), one rsync job for the bucket files, a `make errors-review` target, one blackbox-exporter job + a real Alertmanager receiver (ntfy, which the backup script already uses), and a one-page tested-restore runbook.

---

## 1. Current backup state (verified)

### 1.1 What exists

| Mechanism | Where defined | What it does | Verified how |
|---|---|---|---|
| **Nightly full-DB pg_dump** | `homelab-configs/services/openbrain/docker-compose.yml:117-146` (service `postgres-backup`, container `openbrain-postgres-backup`) + `services/openbrain/scripts/backup.sh` + `scripts/docker-entrypoint.sh` | `pg_dump --host=supabase-db --dbname=postgres --format=custom --compress=9` daily at 02:30 → `pg_restore --list` integrity check → rsync to `root@$PROXMOX_HOST:/mnt/pve/backups/postgres/` → prune local dumps >7 days → ntfy notification on success/failure/partial-failure | Listed `/opt/docker/appdata/backups/postgres/` on master-docker: 8 consecutive daily dumps (2026-06-25 → 2026-07-02, ~13-14 MB each) — **it is running and current** |
| **Proxmox-host rsync backup** | `homelab-configs/scripts/backup-storage.sh`; `architecture.md` §4.1 says it runs daily at 02:00 via cron on the Proxmox host | rsyncs `/mnt/storage/{immich/library,nextcloud_data,media}` → `/mnt/pve/backups/…` | Read the script: **its `BACKUP_PATHS` map does not include anything Supabase-related** — it is media/Nextcloud only |
| **Proxmox Backup Server (PBS)** | VM 100 at `192.168.2.38` (`NETWORK.md`), homepage widget configured | VM-level backups presumably exist (datastore `backups`) | Not verifiable from configs alone; `architecture.md` §5 flags "PBS storage is at 94% capacity". Whether VM 201 (`master-docker`, which holds the Postgres volume) is in a PBS backup job is **not recorded in either repo** — treat as unknown |
| **Git remotes** | both repos | `learning-indonesian` → `git@github.com:AlbertvD/learning-indonesian.git`; `homelab-configs` → `https://github.com/AlbertvD/homelab-configs` | `git remote -v` in both — **both repos are on GitHub**, so code + configs + staging content are off-site by construction |

### 1.2 What the nightly dump covers (verified against the actual 2026-07-02 dump TOC)

I copied `postgres_2026-07-02_02-30.dump` locally and ran `pg_restore --list`:

- **`indonesian` schema: 44 tables with data** — including the irreplaceable learner tables
  (`learner_capability_state`, `capability_review_events`, `learning_sessions`, `profiles`,
  `learner_lesson_activation`, `error_logs`, `content_flags`, `signup_invite_codes`) and all
  content tables.
- **`auth` schema: 23 tables with data** — including `auth.users`, `auth.identities`,
  `auth.sessions`. Login identities survive a restore.
- **`storage` schema: `buckets` + `objects` rows** — the *metadata* of every bucket file.
- Also `public`, `openbrain`, `graphql_public`, `extensions`, `cron` schemas (whole-DB dump).

So a restore of this dump reproduces every row this app owns, plus auth. The dump is
custom-format (per-table selective restore is possible with `pg_restore -n indonesian`).

### 1.3 What is demonstrably NOT covered

| Asset | Status | Evidence |
|---|---|---|
| **Storage bucket file bytes** (`indonesian-lessons`, `indonesian-podcasts`, `indonesian-tts`) | **NOT backed up.** 4.0 GB at `/opt/docker/appdata/supabase/storage/stub/stub/` on master-docker (`STORAGE_BACKEND: file`, `services/supabase/docker-compose.yml:120-124`). Not in `backup.sh` (DB only), not in `backup-storage.sh` (media paths only). A restore would produce `storage.objects` rows pointing at files that don't exist. | ssh `du -sh` = 4.0G; both backup scripts read in full |
| **Deployed edge functions** | Source-of-truth is this repo (`supabase/functions/commit-capability-answer-report/`, `supabase/functions/signup-with-invite/`, both on GitHub) — so *recoverable*, but the deployed copy at `/opt/docker/appdata/supabase/functions/` is hand-placed and not captured by any backup. Re-deploy = re-copy from the repo. Low risk, needs a runbook line, not a backup. | compose mounts `/opt/docker/appdata/supabase/functions:/home/deno/functions` |
| **Kong/GoTrue/Postgres container config** | In git (`homelab-configs/services/supabase/` — Dockerfile, kong.yml, init.sh, compose) → GitHub. Covered. The `.env` with `POSTGRES_PASSWORD`/`JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` on master-docker is **NOT in git (correctly) and NOT in any backup** — losing `JWT_SECRET` invalidates every session and the baked ANON_KEY; losing `POSTGRES_PASSWORD` complicates restore. | compose references `${POSTGRES_PASSWORD}` etc.; no secrets file in repo |
| **Off-site copy** | **None.** Dumps live on master-docker (7 days) and the Proxmox host's backup disk — same physical house, same power/fire/theft domain. GitHub covers code/config only. | `backup.sh:55-69` rsync destination is the local Proxmox host |
| **Proxmox-side retention** | **Undefined in code.** `backup.sh` prunes only the *local* copies (`:71`). Nothing in either repo prunes `/mnt/pve/backups/postgres/` — it either grows unbounded (~14 MB/day, so slowly) or is pruned by something unrecorded. | grep of both repos |
| **WAL archiving / PITR** | None. `wal_level`/`archive_mode` untouched (`services/supabase/postgres/Dockerfile` only adds pg_hba + pg_stat_statements). RPO is therefore up to 24h. | Dockerfile + conf read in full |

### 1.4 Bottom line for §1

**A real, running, integrity-checked nightly backup exists and covers the `indonesian` + `auth`
schemas.** The genuine gaps are: (a) bucket file bytes, (b) no off-site copy, (c) no tested
restore / no runbook, (d) the Supabase `.env` secrets, (e) undefined long-term retention.

---

## 2. What must be backed up for this app (post-launch inventory)

Ordered by irreplaceability:

| # | Asset | Irreplaceable? | Currently covered? |
|---|---|---|---|
| 1 | **`indonesian` learner state** — `learner_capability_state`, `capability_review_events`, `learning_sessions`, `profiles`, `learner_lesson_activation`, collections activation | **Yes — this is the product for a paying learner.** FSRS history cannot be re-derived. | ✅ nightly dump (RPO ≤24h, on-site only) |
| 2 | **`auth.users` + identities** | Yes — losing it strands every customer login | ✅ nightly dump (same caveats) |
| 3 | **`indonesian` content tables** (capabilities, items, exercises, lessons…) | *Mostly* re-derivable: lesson content re-publishes from staging (`scripts/data/staging/`, in git). **BUT** capability content is DB-authoritative after seeding (ADR 0011) — post-publish corrections via the flag→review loop live only in the DB. So: partially irreplaceable. | ✅ nightly dump |
| 4 | **Storage bucket bytes** (4.0 GB audio) | *Technically* re-derivable but expensively: per-clip TTS re-synthesizes from staging via the Lesson Stage (Google TTS cost + hours of re-publish runs); lesson-explanation `.m4a` and podcast audio come from `content/lessons/` + `content/podcasts/` which are **gitignored local-Mac-only directories** (`.gitignore:9-10`) — if both the Mac copy and the bucket are lost, the NotebookLM/narration audio is gone. Treat as: bucket backup is cheaper than guaranteed re-derivation. | ❌ not covered |
| 5 | **Supabase stack `.env` secrets** (JWT_SECRET, POSTGRES_PASSWORD, ANON/SERVICE keys) on master-docker | Rotatable but a rotation invalidates sessions + requires image rebuilds; needed for any restore | ❌ not covered (by design not in git; needs a password-manager/off-site copy) |
| 6 | **Edge functions (deployed copies)** | No — source in this repo on GitHub; redeploy is a copy | ✅ via git (deploy step needs a runbook line) |
| 7 | **homelab-configs repo** | No — on GitHub (`https://github.com/AlbertvD/homelab-configs`, verified `git remote -v`) | ✅ |
| 8 | **This repo incl. staging content** | No — on GitHub | ✅ |
| 9 | **`content/` local directories** (raw photos, OCR, source audio) | Semi — the *inputs* to re-derivation of #4; exist only on the author's Mac (gitignored) | ❌ (out of homelab scope; rely on Mac backup — flag to user) |

---

## 3. Observability gaps

### 3.1 What already runs (reusable substrate)

- **Prometheus** (`prometheus.duin.home`) + **Alertmanager** (`alertmanager.duin.home`) +
  **Grafana** (`grafana.duin.home`) + cadvisor + node-exporter + pve-exporter — all live
  (`services/prometheus/`, `services/monitoring-exporters/`, `services/grafana/`). Traefik metrics
  are scraped (`prometheus.yml` job `traefik`).
- **ntfy push channel** — already proven by the backup script (`backup.sh` `ntfy()` → `ntfy.sh/$NTFY_TOPIC`).

### 3.2 The gaps

1. **No HTTP uptime probing at all.** No blackbox-exporter, no uptime-kuma, no healthchecks.io
   service anywhere in homelab-configs (greps: zero hits). Prometheus scrapes container/host
   metrics, so it would notice the *container* dying, but nothing exercises
   `https://indonesian.duin.home` or `https://api.supabase.duin.home` end-to-end
   (Traefik routing, TLS chain, Kong, PostgREST). The 2026-05-02 class of failure — service up,
   RLS/routing broken — is invisible.
2. **Alertmanager alerts go nowhere.** The sole receiver is `webhook_configs.url:
   'http://127.0.0.1:5001/'` (`services/prometheus/alertmanager.yml:8-10`) — nothing listens on
   5001 on master-docker's loopback (Lute's 5001 is an internal container port behind Traefik).
   Any alert rule that fires today evaporates.
3. **`error_logs` is write-only.** Writer: `src/lib/logger.ts:34` (`insert` into
   `indonesian.error_logs`, RLS insert-only for `authenticated`, `scripts/migration.sql:354,460-472`).
   Readers in `src/`: **none** (grep hits only the writer + its test). Admin must query Studio
   manually and — per this audit's finding — never does on a schedule. The GDPR audit
   (`docs/audits/2026-07-02-gdpr-pii-audit.md` §4) additionally flags its unbounded retention.
4. **No top-level React error boundary.** `App.tsx`/`main.tsx` mount the router with no
   ErrorBoundary; the only boundary is per-exercise
   (`src/components/exercises/ExerciseErrorBoundary.tsx`, which *does* `logError` render crashes,
   `:47-52`). A render crash on Dashboard/Lessons/Progress/etc. = white screen, **never reaches
   `error_logs`**, invisible to the operator.
5. **No Web Vitals / frontend telemetry** — no sentry/posthog/web-vitals in `package.json`
   (verified grep). For a <50-user preview this is acceptable; noted for completeness, not proposed.

---

## 4. Proposals

Minimum-Mechanism framing throughout: the homelab already has a working dump pipeline, a
Prometheus/Alertmanager/Grafana stack, and an ntfy channel. Every option below that *reuses*
those is preferred over introducing a new service.

### 4a. Postgres backup

| Option | What | Tradeoff (one line) | Effort |
|---|---|---|---|
| **a1 (recommended)** | **Keep the existing nightly whole-DB dump; add an off-site leg + defined retention.** Add one step to `backup.sh` (or a sibling script): push the verified dump to an encrypted cloud target (restic → Backblaze B2/S3, or even `rclone copy` to any cloud drive); prune Proxmox copies >30d, cloud >90d. | Cheapest path to real durability; RPO stays 24h; ~$0.1/month at 14 MB/day | ~half a day (script + credentials + one restore test) |
| a2 | a1 + **second intraday dump** (e.g. 14:30) for RPO ≈ 12h | Doubles dump count for a small RPO gain; dump is 14 MB/2min so cost is trivial — worth it once strangers' review history is at stake | +1 hour on top of a1 |
| a3 | **WAL archiving / PITR** (wal-g or pgBackRest to S3; `archive_mode=on` in the custom Postgres image) | RPO → minutes, but a new moving system on a shared 3-app database, Postgres image changes, restore complexity ×5 — oversized for <50 preview users; revisit at real launch | 2–3 days + ongoing care |

Note: a1/a2 keep the dump whole-DB (it already is, it's 14 MB, and it makes auth+storage-metadata
restore atomic). Do **not** narrow to `-n indonesian -n auth` — that would *add* mechanism (a second
dump variant) to save nothing.

### 4b. Storage bucket backup (or documented re-derivation)

| Option | What | Tradeoff | Effort |
|---|---|---|---|
| **b1 (recommended)** | **Nightly rsync of `/opt/docker/appdata/supabase/storage/` → Proxmox backup disk**, i.e. add one entry to the `BACKUP_PATHS` map in `homelab-configs/scripts/backup-storage.sh` (the mechanism already exists and runs nightly at 02:00); include it in the a1 off-site leg (restic dedups, 4 GB once + tiny deltas). | One line in an existing script + off-site config; makes `storage.objects` rows restorable to working files | ~1 hour |
| b2 | **Documented re-derivation only** (no byte backup): per-clip TTS re-synthesizes via Lesson Stage re-publish; podcast/lesson-explanation audio re-uploads from the Mac's `content/` dirs | Zero new infra, but recovery depends on the author's Mac surviving too, costs TTS money + a day of re-publishing, and pre-supposes `content/` is itself backed up (it's gitignored) — fragile chain for 4 GB | ~2 hours (write the runbook) |
| b3 | Supabase Storage → S3 backend migration (`STORAGE_BACKEND: s3`), letting the cloud hold the bytes | Solves durability structurally but is a live-infra change with new failure modes right before a preview; better done as part of the eventual Supabase Cloud move (commercialization roadmap Phase options) | 1–2 days |

### 4c. Error-log triage routine

| Option | What | Tradeoff | Effort |
|---|---|---|---|
| **c1 (recommended)** | **`make errors-review` target**: a ~40-line bun script (service key) that prints the last 7 days of `error_logs` grouped by `page`/`action`/`error_code` with counts + first/last seen; run weekly (calendar reminder or as a line in the existing ops rhythm). Pair with the GDPR audit's retention proposal (delete >90d) so the table stays scannable. | Cheapest possible reader for a write-only table; human-in-the-loop, no new infra; relies on the human actually running it | ~2 hours |
| c2 | c1 + **daily count alert**: a tiny cron/edge check that ntfy-pings when >N errors/24h (threshold, not content) | Converts "weekly maybe" into push-on-spike; one more scheduled thing to own | +2 hours |
| c3 | Ship errors to Sentry (free tier) instead of/alongside `error_logs` | Real grouping/alerting/source-maps, but a third-party processor of user-adjacent data (GDPR sub-processor list grows), an SDK in the bundle, and overlap with the existing table — oversized now | ~1 day incl. privacy-policy update |

**Also (cheap, do regardless):** add a top-level ErrorBoundary in `App.tsx` that calls the existing
`logError` (`page: 'app-shell'`) and renders a friendly reload screen — without it, §3.2(4) means the
worst failures never enter *any* triage routine. ~1 hour, pattern already exists in
`ExerciseErrorBoundary.tsx`.

### 4d. Uptime checks on `indonesian.duin.home` + `api.supabase.duin.home`

| Option | What | Tradeoff | Effort |
|---|---|---|---|
| **d1 (recommended)** | **blackbox-exporter** container + 2 probe targets in the existing `prometheus.yml` (`https://indonesian.duin.home` expecting the 307 auth-redirect, `https://api.supabase.duin.home/rest/v1/` expecting 200/401) + a `probe_success == 0 for 5m` alert rule + **fix the Alertmanager receiver to ntfy** (it supports plain webhook posts; the topic already exists from backups). | Reuses the running Prometheus stack; also fixes the dead-receiver problem for *all* future alerts; internal-only vantage point (see caveat) | ~half a day |
| d2 | **uptime-kuma** container (one compose file, web UI, built-in ntfy notifier, keyword checks) | Simpler mental model + status page for free, but a *second* monitoring system next to Prometheus — duplication the Minimum-Mechanism table warns about; choose it only if the status-page UI is wanted | ~2 hours |
| d3 | External SaaS probe (Healthchecks.io / Better Stack free tier) | The only option that detects "the whole homelab/ISP is down" — but these domains are **internal** (`*.duin.home` resolves only inside the LAN, TLS via internal Step-CA), so an external prober can't reach them until the app has a public endpoint. Parked until the cloud preview exposes a public URL — then it becomes the *right* answer. | ~1 hour when applicable |
| — | Caveat to d1/d2: an on-homelab prober can't see homelab-wide outages. For a preview where users are external, pair d1 now + d3 at public-URL time. | | |

### 4e. Tested-restore drill (a backup that's never been restored is not a backup)

| Option | What | Tradeoff | Effort |
|---|---|---|---|
| **e1 (recommended)** | **One-page runbook + one real drill now, re-drill quarterly.** Outline below. Restore target: a throwaway Postgres container on master-docker (not the live one). | Proves the dump actually restores; quarterly cadence is enough at this scale | ~half a day for the first drill incl. writing the runbook |
| e2 | Automated monthly restore-verify job (spin up postgres:15 container, `pg_restore`, run assertion queries, ntfy result) | Removes the "human forgets" risk; one more owned automation — nice second step after e1 proves the procedure | ~1 day |

**Runbook outline (`docs/process/restore-runbook.md` when built):**

1. **Preconditions** — locate newest dump (`/opt/docker/appdata/backups/postgres/` or Proxmox
   `/mnt/pve/backups/postgres/`); locate Supabase `.env` secrets (password manager — see §2 #5);
   confirm dump integrity: `pg_restore --list <dump> | head`.
2. **Drill (non-destructive)** — `docker run -d --name restore-test -e POSTGRES_PASSWORD=test postgres:15`
   → `pg_restore -h ... -U postgres -d postgres --clean --if-exists <dump>` → assertion queries:
   `select count(*) from indonesian.learner_capability_state;`, `select count(*) from auth.users;`,
   spot-check one learner's `next_due_at`. Tear down.
3. **Real restore (disaster)** — stop app-facing containers (kong, rest, auth, storage, functions);
   restore into a fresh `supabase-db` (recreate via compose so init.sh/pg_hba run); restart stack;
   run this repo's `make check-supabase && make check-supabase-deep` as the acceptance gate
   (they already verify schema exposure, RLS, grants, storage); re-place edge functions from
   `supabase/functions/`; verify one live login + one session build.
4. **Bucket files** — rsync back from the b1 destination; `make check-supabase` covers bucket
   reachability.
5. **Log the drill** — date + dump used + duration + surprises, appended to the runbook.

---

## 5. RTO/RPO framing (<50-user preview)

| Data class | Proposed RPO | Proposed RTO | Met by |
|---|---|---|---|
| Learner FSRS state + auth (`indonesian` + `auth`) | **24h** (12h with a2) | **half a day** | a1 (+e1 proving it) — a learner losing ≤1 day of reviews is annoying, not fatal; FSRS self-corrects on next review |
| Content tables (incl. DB-authoritative capability corrections) | 24h | half a day | same dump; worst case re-publish from staging closes any gap |
| Storage bucket audio | 24h | 1 day (rsync back is trivial; re-derivation path is the slow fallback) | b1 |
| App availability (uptime) | n/a | **detect <5 min, restore <1h** (container recreate per `docs/process/deploy.md`) | d1 |
| Full-homelab loss (fire/theft) | 24h (off-site dump + bucket copy) | 1–2 days (rebuild from homelab-configs + GitHub images + cloud restore) | a1 off-site leg + b1-in-restic; without the off-site leg this scenario is **total loss of learner data** |

Sanity anchor: at <50 preview users, a 24h RPO loses at most one day of reviews for a free/cheap
preview cohort — acceptable if communicated. What is *not* acceptable at any scale is the
current fire-domain concentration (every copy in one house) and the untested restore.

---

## 6. Decisions for the user vs agent-runnable

### Decisions for the user (pick one per letter)

- **(a)** Postgres: a1 (off-site + retention, recommended) / a2 (+ intraday dump) / a3 (PITR — advise against now). Also: pick the off-site target (Backblaze B2 / S3 / other) and confirm the ntfy topic keeps double-duty.
- **(b)** Buckets: b1 (rsync line + off-site, recommended) / b2 (runbook-only) / b3 (S3 backend — advise deferring to the cloud migration).
- **(c)** Error triage: c1 (weekly `make errors-review`, recommended) / c2 (+ spike alert) / c3 (Sentry — advise against now). Separate cheap yes/no: add the top-level ErrorBoundary (recommend **yes** regardless of c-choice).
- **(d)** Uptime: d1 (blackbox + fix Alertmanager receiver, recommended) / d2 (uptime-kuma) / d3 (external SaaS — auto-triggers when a public URL exists; note it as a launch-gate item).
- **(e)** Restore drill: e1 now (recommended) / e1+e2 (add automated verify). Also decide the drill cadence (quarterly proposed).
- **Secrets:** where the Supabase `.env` (JWT_SECRET, POSTGRES_PASSWORD, keys) gets an off-site copy (password manager). Nobody but the user can do this.
- **Mac `content/` dirs:** confirm the Mac itself is backed up (Time Machine/other) — it holds the only copy of source audio inputs (§2 #9).
- **Proxmox/PBS question:** confirm whether VM 201 is in a PBS backup job (§1.1 — unknown from configs) and address the "PBS 94% full" flag.

### Agent-runnable once decided

- a1/a2: edit `homelab-configs/services/openbrain/scripts/backup.sh` (+ compose env) — off-site push + Proxmox-side retention; test run; commit to homelab-configs.
- b1: one-line `BACKUP_PATHS` addition to `homelab-configs/scripts/backup-storage.sh` (+ restic include); commit.
- c1: new `scripts/errors-review.ts` + `make errors-review` target in this repo; pairs with the GDPR audit's retention DDL if approved.
- ErrorBoundary: new `src/components/AppErrorBoundary.tsx` wrapping routes in `App.tsx`, reusing `logError` — tests included.
- d1: blackbox-exporter service in `homelab-configs/services/monitoring-exporters/` (or sibling), two `prometheus.yml` probe jobs, `alerts.yml` rule, Alertmanager ntfy receiver; commit + deploy steps documented.
- e1: write `docs/process/restore-runbook.md` in this repo and execute the non-destructive drill over ssh, logging results (destructive steps stay user-approved).

---

*Read-only audit. No infrastructure changed; nothing committed. The one live artifact touched — a
local copy of one dump for TOC inspection — was deleted after use.*
