---
doc_type: process
surface: .github/workflows/, homelab container management
last_verified_against_code: 2026-06-08
status: stable
---

# Deployment

How a code change reaches `https://indonesian.duin.home`.

The build is **fully automated**; the container recreate on the homelab is **manual** until further notice (Portainer or SSH). No CD pipeline pushes the new image into Docker.

---

## 1. Build trigger

Every push to `main` triggers the GitHub Actions workflow "Build and Push Docker Image" (`.github/workflows/`). Result: a fresh image pushed to `ghcr.io/albertvd/learning-indonesian:latest`.

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
  --label 'traefik.http.routers.learning-indonesian-static.rule=Host(\`indonesian.duin.home\`) && (Path(\`/manifest.webmanifest\`) || PathRegexp(\`^/pwa-icon\`))' \
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
- Pre-deploy gauntlet: run `make pre-deploy` locally before merging anything that touches `scripts/migration.sql`. GitHub Actions cannot reach the homelab; the gauntlet runs locally.
