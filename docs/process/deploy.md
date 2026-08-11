---
doc_type: process
surface: .github/workflows/, homelab container management
last_verified_against_code: 2026-07-05
status: stable
---

# Deployment

How a code change reaches `https://indonesian.duin.home`.

The build is **fully automated**; the container recreate on the homelab is **manual** until further notice (Portainer or SSH). No CD pipeline pushes the new image into Docker.

> ## ⚠ Read § 6 first — the homelab is now STAGING, and it needs a one-time cutover
>
> Customers are on Cloudflare Workers → `https://kamoebisa.nl`, backed by Supabase
> Cloud (`docs/process/launch-runbook.md`). `indonesian.duin.home` is no longer
> the product; it is where changes get rehearsed before they reach paying users.
>
> **Until the § 6 cutover runs, treat §§ 1–4 as armed.** Once `:latest` contains
> the entitlement build, it plays audio only through signed URLs, and the
> homelab has no storage policy to authorize signing — so recreating the
> container makes every audio clip silently stop working. The image is correct;
> the database it points at has not caught up.
>
> **Timing, verified 2026-08-06:** `:latest` is still `sha-9b9b43c0` from
> 2026-07-31 — the PRE-entitlement build — even though #461 merged on 08-06. CI
> did not fire on `main` for the merge commit, and `deploy.yml` only runs on
> `workflow_run` *after* CI succeeds there, so no new image was published. The
> homelab is therefore safe **right now**, and stops being safe the moment CI
> next runs on `main`. Check before you pull:
>
> ```bash
> gh api users/AlbertvD/packages/container/learning-indonesian/versions?per_page=1 \
>   --jq '.[] | .updated_at + "  " + (.metadata.container.tags | tostring)'
> ```
>
> A `:latest` dated after 2026-08-06 is the entitlement build. Do the § 6
> cutover before recreating with it.

---

## 1. Build trigger

Every push to `main` triggers the GitHub Actions workflow "Build and Push Docker Image" (`.github/workflows/`). Result: a fresh image pushed to `ghcr.io/albertvd/learning-indonesian:latest`. CI also tags the same build `sha-<full-sha>`; pull that tag instead of `latest` when you need a reproducible, rollback-addressable deploy rather than "whatever was last pushed."

Monitor a build:

```bash
gh run list --repo AlbertvD/learning-indonesian --limit 5
gh run watch <run-id> --repo AlbertvD/learning-indonesian
```

---

## 2. Pull the new image on the homelab

Two paths. **Portainer is preferred** — no SSH session needed. SSH is the documented fallback.

### Via Portainer MCP (verified working 2026-05-09)

```
mcp__portainer__dockerProxy
  environmentId: 3
  method: POST
  dockerAPIPath: /images/create
  queryParams:
    - { key: fromImage, value: ghcr.io/albertvd/learning-indonesian }
    - { key: tag,       value: latest }
```

### Via SSH

```bash
ssh mrblond@master-docker "sudo docker pull ghcr.io/albertvd/learning-indonesian:latest"
```

---

## 3. Recreate the container

Stop, remove, and relaunch with the same labels. Traefik labels are baked into the SSH command below — keep them in sync if you ever edit them.

### Via Portainer MCP

Sequence of `dockerProxy` calls:

```
POST /containers/learning-indonesian/stop  (queryParams: t=10)
DELETE /containers/learning-indonesian
POST /containers/create  (queryParams: name=learning-indonesian)
  headers: [{ key: "Content-Type", value: "application/json" }]   # REQUIRED — see note
  body:
    {
      "Image": "ghcr.io/albertvd/learning-indonesian:latest",
      "Labels": { ... see SSH command below for the full Traefik label set ... },
      "HostConfig": {
        "NetworkMode": "proxy",
        "RestartPolicy": { "Name": "unless-stopped" }
      }
    }
POST /containers/learning-indonesian/start
```

> **`/containers/create` MUST send `Content-Type: application/json`** via the `dockerProxy` `headers` param. Without it the Docker engine rejects the body with `malformed Content-Type header (): mime: no media type` and no container is created — leaving the site **down** since you already stopped + removed the old one. The other calls (`/images/create` pull, `/stop`, `DELETE`, `/start`) carry no body and don't need it. Only pass the **Traefik** labels in the body; the `org.opencontainers.*` + `maintainer` labels are inherited from the image (so the new revision shows up automatically). **Pull the image *first*** (step 2) so the down-window between `DELETE` and `start` stays short, and confirm the pulled image actually contains your change — its `org.opencontainers.image.revision` is the `main` HEAD at *build* time, which can be newer than your merge if other PRs landed in between (`git merge-base --is-ancestor <your-commit> <revision>`).

### Via SSH — single command, full label set baked in

```bash
ssh mrblond@master-docker "sudo docker stop learning-indonesian && sudo docker rm learning-indonesian && sudo docker run -d \
  --name learning-indonesian \
  --restart unless-stopped \
  --network proxy \
  --label 'traefik.enable=true' \
  --label 'traefik.http.routers.learning-indonesian.rule=Host(\`indonesian.duin.home\`)' \
  --label 'traefik.http.routers.learning-indonesian.entrypoints=websecure' \
  --label 'traefik.http.routers.learning-indonesian.tls.certresolver=stepca' \
  --label 'traefik.http.routers.learning-indonesian.middlewares=duinhuis-auth@docker' \
  --label 'traefik.http.services.learning-indonesian.loadbalancer.server.port=80' \
  --label 'traefik.http.routers.learning-indonesian-static.rule=Host(\`indonesian.duin.home\`) && (Path(\`/manifest.webmanifest\`) || Path(\`/sw.js\`) || PathPrefix(\`/pwa-icon\`) || PathPrefix(\`/workbox-\`))' \
  --label 'traefik.http.routers.learning-indonesian-static.entrypoints=websecure' \
  --label 'traefik.http.routers.learning-indonesian-static.tls.certresolver=stepca' \
  --label 'traefik.http.routers.learning-indonesian-static.service=learning-indonesian' \
  ghcr.io/albertvd/learning-indonesian:latest"
```

---

## 4. Verify

### Via Portainer MCP

```
GET /containers/learning-indonesian/json
  → check State.Running + Config.Labels.org.opencontainers.image.revision
```

### Via SSH

```bash
ssh mrblond@master-docker "sudo docker inspect learning-indonesian --format '{{.State.Status}} — image: {{.Config.Image}}'"
```

A successful deploy ends with `Status: running` and a recent image digest.

---

## 5. Notes

- Docker is **not** installed locally. All image operations happen on the homelab. There is no `docker` command to run from your laptop.
- The Portainer MCP `local` environment id is `3`. Its `dockerProxy` tool can pull images and recreate containers — verified 2026-05-09.
- SSH to `mrblond@master-docker` remains available as the fallback when Portainer is offline.
- The `docker-compose.yml` reference in `homelab-configs/services/learning-indonesian/` is kept for documentation. The container is managed directly via `docker run` as above — the compose file is not the source of truth.
- **Two routers on purpose.** The main router carries `duinhuis-auth@docker` (the whole app is behind forward-auth). The `-static` router has **no** auth middleware and matches only the **public PWA plumbing** — `/manifest.webmanifest`, `/sw.js`, `/pwa-icon*`, `/workbox-*` — so the browser can fetch the manifest, install/**update** the service worker, and load its workbox chunk **without** a login cookie. This matters because a service-worker script fetch that gets *redirected* (307→auth on a stale cookie) fails per spec and silently kills the update — the "deploys invisible" symptom. Its longer rule gives it higher default priority, so it wins for those paths; everything else falls through to the auth'd main router. **Use `Path`/`PathPrefix`, NOT `PathRegexp`** — the homelab Traefik build rejects `PathRegexp` ("unsupported function"), which silently *disables* the router (the bug this replaced; found 2026-07-05). Verify after a recreate: cookieless `curl -k https://indonesian.duin.home/sw.js` must be `200`, and `curl -k https://indonesian.duin.home/` must be `307`.
- Pre-deploy gauntlet: run `make pre-deploy` locally before merging anything that touches `scripts/migration.sql`. GitHub Actions cannot reach the homelab; the gauntlet runs locally. Note it targets **cloud** by default (`TARGET=homelab` for the old behaviour) — cloud is production.

---

## 6. Homelab cutover — making staging faithful again (✅ DONE)

> **Completed and verified 2026-08-11.** `make check-supabase-deep TARGET=homelab`
> returns "All structural checks passed" — HC54–HC58 (the entitlement objects,
> private buckets, `indonesian_media_read`, invite system retired) are all green,
> and HC55 reports the same `free<=1` boundary as cloud. **Staging is faithful:
> the paywall, signed URLs and activation gating can now be rehearsed on the
> homelab instead of on production.**
>
> The procedure below is kept as the record of what was run and as the template
> for any future schema divergence. Do not re-run it as if pending.

**Why.** After the entitlement cutover (PR #461, merged 2026-08-06) production and
the homelab run different schemas. The homelab has no `entitlements` table, no
`can_read_media`, public buckets, and the retired invite system still present.
That makes it a *degraded* staging environment: you can rehearse content and most
UI there, but **not** the paywall, signed URLs, or activation gating — the newest
and riskiest surfaces in the app, which currently have nowhere to be tested but
production.

Proof, any time you want it (both sides green since the 2026-08-11 cutover; the
comment records what they showed *before* it):

```bash
make check-supabase-deep TARGET=homelab   # was HC54–HC58 red, now green
make check-supabase-deep                  # same checks green on cloud
```

**Why it is cheap.** The homelab has 11 accounts but only three with learning
data, and the only real learner (`albert@duin.home`) is an **admin**.
`has_active_entitlement()` returns true for admins, so the migration locks nobody
out and **no comp rows are needed**. `testuser@duin.home` is deliberately *not* an
admin — after the cutover it becomes a ready-made non-entitled account for testing
the paywall, so one instance gives you both views.

**The one real constraint.** The migration flips the buckets private while the
running container still builds public `/object/public/…` URLs, so audio is broken
between the two steps. Keep them adjacent. This is spec §7's coordinated rollout
window: the cloud pivot deleted it *for cloud* (a fresh project had no cohort),
but it never stopped applying here — it just moved, and nobody wrote that down.

### Order

```bash
# 0. Backup first — this touches learner data (4,127 review events live here).
#    Homelab dumps are the nightly job; confirm one exists before proceeding.

# 1. Rehearse. Applies migration.sql to the HOMELAB twice and diffs the health
#    output. `migrate` targets the homelab unconditionally — scripts/migrate.ts
#    SSHes to HOMELAB_SSH and has no cloud path.
make migrate-idempotent-check

# 2. Apply. Chains the deep check against the homelab (fixed 2026-08-06 — it
#    used to migrate the homelab and then certify CLOUD).
make migrate

# 3. Immediately recreate the container from :latest (§§ 2–3 above). The image
#    already contains the signed-URL build; it is the DB that was behind.

# 4. Verify — HC54–HC58 should now be green on the homelab too.
make check-supabase-deep TARGET=homelab
```

### Then verify by hand, as a human

- Sign in as `albert@duin.home` (admin) → audio plays on any lesson, no paywall.
- Sign in as `testuser@duin.home` (not an admin, not entitled) → lessons 1–3
  work; lesson 4+ shows the paywall CTA; paid audio is gated. **This is the view
  no environment could show you before.**

### Rollback

The migration is additive except the bucket flip. If audio must come back
immediately without recreating the container:

```sql
update storage.buckets set public = true
where id in ('indonesian-lessons','indonesian-podcasts','indonesian-tts');
```

That re-opens the `/object/public/` path and the old image works again. Note it
also disables the paywall on the homelab — acceptable there, never on cloud.

### What still cannot be rehearsed here

**Stripe.** The homelab's edge-functions container has no Stripe keys, so
checkout, the webhook and the portal cannot run against it. Those stay covered by
`make verify-stripe-lifecycle` against the Stripe **sandbox**, which is the better
test anyway — it exercises real Stripe rather than a local fake.

### Why `deploy.yml` stays

It was briefly a candidate for retirement, on the grounds that it publishes an
image that breaks the homelab. That reasoning was backwards: the image is
correct, and after this cutover it is exactly the image staging needs. The
workflow is how you refresh the staging container. Keep it.
