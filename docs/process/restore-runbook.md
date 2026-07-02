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
