# Postgres restore runbook (Supabase / learning-indonesian)

First drilled: **2026-07-02** (results in §5). Re-drill quarterly — a backup that has
never been restored is not a backup. Non-destructive drill script staged at
`/tmp/restore-drill.sh` on master-docker (recreate from §3 if gone).

## 1. What the backup is

- **Nightly whole-DB `pg_dump --format=custom`** at 02:30 by the
  `openbrain-postgres-backup` container (defined in
  `homelab-configs/services/openbrain/docker-compose.yml`, script
  `services/openbrain/scripts/backup.sh`). Covers ALL schemas: `indonesian` (44
  tables incl. all learner FSRS state), `auth` (users + identities), `storage`
  (bucket **metadata**), plus openbrain/public.
- **Storage-bucket bytes** (the ~4 GB of audio) sync nightly to
  `root@proxmox:/mnt/pve/backups/supabase-storage/` (backup.sh step 3b, added
  2026-07-02 — the dump alone restores `storage.objects` rows pointing at
  files that would not exist).
- Dumps: 7 days local (`/opt/docker/appdata/backups/postgres/`), 30 days on
  Proxmox (`/mnt/pve/backups/postgres/`). ntfy push on success/failure.
- **NOT covered:** off-site copy (skipped 2026-07-02 by explicit decision —
  fire/theft = total loss until added), the Supabase `.env` secrets
  (JWT_SECRET, POSTGRES_PASSWORD, keys — keep a password-manager copy;
  restore needs them), and the author Mac's `content/` source dirs.

## 2. Preconditions for any restore

1. Newest dump: `ls -t /opt/docker/appdata/backups/postgres/postgres_*.dump | head -1`
   (fallback: Proxmox `/mnt/pve/backups/postgres/`).
2. Integrity: `pg_restore --list <dump> | head` must print a TOC.
3. Supabase `.env` secrets at hand (password manager).

## 3. Non-destructive drill (quarterly)

Throwaway container; **never touches `supabase-db`**. Two hard-won gotchas from
the 2026-07-02 drill — both cost a failed attempt each:

- **Use the upstream base image `supabase/postgres:15.8.1.085`, NOT the custom
  `supabase-db` image.** The custom image bakes openbrain init SQL that fails
  on a fresh volume (`schema "extensions" does not exist`) and the container
  exits before postgres comes up.
- **Restore as `supabase_admin` over TCP** (`-h 127.0.0.1 -U supabase_admin -d
  postgres`, password = the container's `POSTGRES_PASSWORD`). It is the only
  superuser in the image; restoring as `postgres` leaves `auth.*` and
  `storage.*` at 0 rows (`permission denied` / `must be owner`) while
  `indonesian.*` restores fine — a silently-partial restore.
- Also: wait for **stable** readiness (5 consecutive OK polls, 2s apart). The
  supabase entrypoint restarts postgres mid-init; a single `pg_isready` pass
  races it.

```bash
IMG=supabase/postgres:15.8.1.085
sudo docker run -d --name restore-drill -e POSTGRES_PASSWORD=drilltest \
  -v /opt/docker/appdata/backups/postgres:/dumps:ro --memory 2g "$IMG"
# wait for STABLE readiness (see above), then:
sudo docker exec -e PGPASSWORD=drilltest restore-drill sh -c \
  "pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists /dumps/<dump>"
# assert (drill vs live): counts of indonesian.learner_capability_state,
# indonesian.capability_review_events, indonesian.learning_capabilities,
# auth.users, storage.objects; max(created_at) of review events;
# count of pg_policies where schemaname='indonesian'
sudo docker rm -f restore-drill
```

Expected noise: ~7 `schema ... already exists / cannot drop schema` errors for
`extensions`/`storage`/`graphql_public` (the image pre-creates them; `--clean`
cannot drop them). Data is unaffected.

## 4. Real restore (disaster)

1. Stop app-facing services: kong, rest (PostgREST), auth (GoTrue), storage,
   edge-functions containers.
2. Recreate a fresh `supabase-db` from `homelab-configs/services/supabase/`
   compose (its init.sh + pg_hba baked image) with the `.env` secrets.
3. `pg_restore` the dump **as `supabase_admin` over TCP** (gotcha §3), flags
   `--clean --if-exists`.
4. rsync storage bytes back: Proxmox `/mnt/pve/backups/supabase-storage/` →
   `/opt/docker/appdata/supabase/storage/`.
5. Re-place edge functions from this repo: `supabase/functions/*` →
   `/opt/docker/appdata/supabase/functions/` + restart `supabase-edge-functions`.
6. Restart the stack; acceptance gate: `make check-supabase && make
   check-supabase-deep` from this repo, then one live login + one session build.
7. Append a drill-log entry to §5.

## 5. Drill log

| Date | Dump | Result | Duration | Surprises |
|---|---|---|---|---|
| 2026-07-02 | `postgres_2026-07-02_10-05.dump` (13.1 MB) | **PASS** — drill counts byte-identical to live: learner_capability_state 1531, capability_review_events 2242, learning_capabilities 13870, auth.users 10, storage.objects 4601, 56 `indonesian` RLS policies | restore 4s; whole drill ~3 min | The two §3 gotchas (custom image fails fresh-init; `postgres` role restores `indonesian` but silently zero-restores `auth`/`storage` — always assert auth.users > 0) |


---

## Cloud backups (Supabase Cloud, added 2026-08-02)

Everything above covers the **homelab** Postgres. The cloud project
(`wodpkxsmildtgndnbraa`) is a separate system that the homelab backup container
never touches. Supabase *does* take daily backups on the Free plan, but they are
only **accessible after upgrading to Pro** — so until then this script is the
only restorable copy of cloud learner data.

    make backup-cloud        # learner + auth data  (~0.12 MB, seconds)
    make backup-cloud-full   # entire database incl. content

Output: `~/kamoebisa-backups/postgres/cloud_<kind>_<iso>.dump`
(override with `BACKUP_DIR`; retention via `KEEP_DUMPS`, default 30).

### What it covers, and what it deliberately does not

**Backed up** — the irreplaceable half: the whole `auth` schema (users AND
identities) plus `learner_capability_state`, `capability_review_events`,
`learning_sessions`, `learner_lesson_activation`, `profiles`, `entitlements`,
`stripe_webhook_events`, `user_roles`, `error_logs`.

**Not backed up, by design:**

- **Lesson/reader content** — pipeline-is-writer (ADR 0011); staging files are
  canonical and a re-publish regenerates every row.
- **Storage bytes** (~462 MB) — masters live on the author Mac under `content/`,
  TTS is regenerable. A nightly full pull would also be **13.9 GB/month against
  the Free plan's 5 GB egress quota** — the backup would break the budget it
  runs inside.
- **Capability content** — regenerable by re-seeding. ⚠ Residual: ADR 0011 makes
  it DB-authoritative *after* seeding, so post-publish corrections from the
  flag→review loop live only in the DB and would need redoing after a restore.
  Accepted: content is replaceable effort, learner history is not.

### Two traps this script exists to avoid

Both were found on 2026-08-02 by inspecting a dump's contents rather than
trusting its exit code, and both are now asserted on every run:

1. **`-n auth` does NOT work with `-t`.** pg_dump does not union schema and
   table selectors — when both are given the `-t` filter wins and the schema
   contributes nothing. `-n auth -t indonesian.x` produced a dump with **zero
   auth tables**, at non-zero size, with a valid TOC and a clean exit. Restoring
   it would have yielded learner rows keyed to user IDs that no longer exist.
   The correct form is `-t 'auth.*'`. `auth.identities` is the load-bearing
   table: without it every Google login is orphaned even if `auth.users`
   survives.
2. **A failed `pg_dump` leaves a 0-byte file.** pg_dump creates the output
   before it can fail, so a bad credential leaves an artefact that a naive
   retention sweep counts as a backup. The script now deletes the file on any
   failure.

The script asserts `auth.users`, `auth.identities`,
`indonesian.learner_capability_state` and `indonesian.profiles` are present in
the dump's manifest, and exits non-zero if any is missing.

### Restoring

    createdb kamoebisa_restore
    pg_restore -d kamoebisa_restore --no-owner --no-privileges <dump>

⚠ **Not yet drilled against a real target** — there is no local Postgres server
on the author Mac. Per this runbook's own opening principle, *a backup that has
never been restored is not a backup*: schedule a drill (a scratch Supabase
branch, or a local `postgresql@17`) before relying on it. Structural and content
verification pass on every run, which is necessary but not sufficient.
