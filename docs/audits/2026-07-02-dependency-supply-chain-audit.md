# Dependency & Supply-Chain Audit — 2026-07-02

**Scope:** Follow-up E of the pre-cloud-hardening run (branch `feat/pre-cloud-hardening`).
**Mode:** READ-ONLY — findings + recommendations only; nothing upgraded, nothing committed.
**Context:** app about to be exposed to internet customers.

**Tooling used:** `bun audit` v1.3.10 (GHSA advisory DB — authoritative for the JS tree), `bun outdated`, direct reads of `package.json`, `Dockerfile`, `.github/workflows/*`, `supabase/functions/*/index.ts`, and `homelab-configs/services/supabase/docker-compose.yml`, plus web checks for ts-fsrs and supabase/edge-runtime release currency.
**Note:** the homelab `security_*` MCP tools (security-mcp.duin.home) were **not registered in this session** — CVE data below comes from `bun audit`'s GHSA feed and release-page checks instead. No NVD/CISA-KEV cross-check was possible; none of the findings are in a category (internet-facing server software) where KEV listing is plausible, so this does not change the verdict.

---

## Executive summary

| Metric | Count |
|---|---|
| Critical CVEs affecting **shipped runtime** code | **0** |
| High advisories (whole install tree, incl. dev/build) | **8** |
| Moderate advisories | 8 |
| Low advisories | 4 |
| High/critical advisories in code that **ships to the browser** | **0** |

**Verdict: WARN — no runtime CVE blocks the preview, but three structural supply-chain issues should be fixed first:** (1) a **public repo running `pull_request` CI on self-hosted homelab runners**, (2) floating Docker base-image tags (`oven/bun:1`, `nginx:alpine`) + floating `latest` deploy tag, (3) a stale duplicate `package-lock.json` alongside the live `bun.lock`.

The key mitigating architecture fact: this is a **static frontend** — only what Vite bundles into `dist/` reaches customers. Every one of the 20 `bun audit` findings sits in dev/build/pipeline tooling (eslint, workbox-build/babel, jsdom/undici, tsx/esbuild, picomatch, `@google/genai`→protobufjs), **not** in the browser-shipped dependency set (react, react-dom, react-router-dom, @supabase/\*, @mantine/\*, zustand, @tabler/icons-react — all clean per audit).

---

## 1. App dependencies

### 1.1 Direct dependencies — currency

Source: `package.json`, `bun outdated` (2026-07-02). Packages not listed by `bun outdated` are at latest.

| Dependency | Current | Latest | Delta | Known CVEs @ current | Upgrade risk |
|---|---|---|---|---|---|
| react / react-dom | 19.2.7 | 19.2.7 | — | none | — |
| react-router-dom | 7.18.0 | 7.18.1 | patch | none (CVE-2025-43864/-43865 fixed in 7.5.x, long past) | trivial |
| @supabase/supabase-js | 2.108.2 | 2.110.0 | minor | none | low |
| @supabase/ssr | 0.10.3 | **0.12.0** | 0.x minor (semver-breaking allowed) | none | **medium** — pre-1.0; cookie-handling changes possible; test SSO cookie on `.duin.home` after bump |
| @mantine/core, hooks, notifications | 9.4.0 | 9.4.1 | patch | none | trivial |
| zustand | 5.0.14 | 5.0.14 | — | none | — |
| @tabler/icons-react | 3.44.0 | — | — | none | — |
| @google/genai | 2.10.0 | — | — | pulls vulnerable **protobufjs ≤7.6.2** (GHSA-f38q-mgvj-vph7, moderate) | see 1.3 |
| vite (dev) | 8.1.0 | 8.1.3 | patch | dev-server-only esbuild advisory (see 1.2) | trivial |
| vitest (dev) | 4.1.9 | 4.1.9 | — | transitive picomatch (see 1.2) | — |
| vite-plugin-pwa (dev) | 1.3.0 | 1.3.0 | — | transitive workbox-build/babel chain (see 1.2) | — |
| @anthropic-ai/sdk (dev) | 0.82.0 | 0.109.1 | 27 minors | **GHSA-p7fg-763f-g4gf** (moderate — insecure default file perms in local memory tool; scripts-only exposure) | low (scripts only) |
| typescript (dev) | 6.0.3 | — | — | none | — |
| eslint (dev) | 10.5.0 | 10.6.0 | minor | transitive fast-uri/flatted/brace-expansion (see 1.2) | trivial |

### 1.2 `bun audit` findings — full list with runtime classification

`bun audit` (GHSA feed): **20 vulnerabilities — 8 high, 8 moderate, 4 low, 0 critical.**

| Package (vulnerable range) | Sev | Advisory | Reached via | Ships to browser? | Real-world exposure |
|---|---|---|---|---|---|
| picomatch ≥4.0.0 <4.0.4 | **high** (ReDoS GHSA-c2c7-rcm5-vvqj) + mod (GHSA-3v7f-55p6-f55p) | vite, vitest, vite-plugin-pwa, typescript-eslint (via tinyglobby/fdir) | No | Build/test-time glob matching of repo-controlled patterns — negligible |
| fast-uri ≤3.1.1 | **high** ×2 (GHSA-v39h-62p7-jpjc host confusion, GHSA-q3j6-qgpj-74h6 path traversal) | eslint › ajv; workbox-build › ajv | No | Lint/build-time schema validation of repo-controlled input — negligible |
| flatted ≤3.4.1 | **high** (proto pollution GHSA-rf6f-7fwh-wjgh) | eslint › flat-cache | No | Lint cache — negligible |
| undici ≥7.23.0 <7.28.0 | **high** ×3 (GHSA-vmh5-mc38-953g TLS bypass, GHSA-vxpw-j846-p89q WS DoS, GHSA-hm92-r4w5-c3mj SOCKS5) + mod/low ×4 | jsdom (test env only) | No | Test runtime only — negligible |
| @babel/plugin-transform-modules-systemjs ≥7.12.0 ≤7.29.3 | **high** (GHSA-fv7c-fp4j-7gwp arbitrary code on malicious input) | vite-plugin-pwa › workbox-build | No | Compiles the project's own service-worker code, not attacker input — low; still the one high finding in the *production build chain*, clear via update |
| brace-expansion ≥5.0.0 <5.0.6 | mod ×3 (GHSA-jxxr-4gwj-5jf2, GHSA-f886-m6hf-6m8v) | eslint, typescript-eslint, workbox-build (via minimatch) | No | negligible |
| protobufjs ≤7.6.2 | mod (GHSA-f38q-mgvj-vph7 property shadowing) | **@google/genai**, @huggingface/transformers | No — genai is imported only by `scripts/podcasts/*` + `scripts/grammar-podcast/quality-gate.ts` | Pipeline scripts on the author's machine only |
| @anthropic-ai/sdk ≥0.79.0 <0.91.1 | mod (GHSA-p7fg-763f-g4gf) | direct devDep, scripts-only importers | No | Local scripts — low; fixed ≥0.91.1 |
| @babel/core ≤7.29.0 | low (GHSA-4x5r-pxfx-6jf8 file read via sourceMappingURL) | eslint-plugin-react-hooks, workbox-build | No | negligible |
| esbuild ≥0.27.3 <0.28.1 | low (GHSA-g7r4-m6w7-qqqr dev-server file read, Windows) | tsx, vite | No | Dev server only, macOS/Linux hosts — negligible |

**Conclusion:** zero advisories touch code delivered to customers. Most of the table clears with a single `bun update` (all fixes are within existing semver ranges). This is hygiene, not fire.

### 1.3 Dependency-placement smells (not CVEs)

- **`@google/genai` and `@testing-library/dom` are in `dependencies`** but are used only by pipeline scripts / as a test peer. Nothing ships from `node_modules` (static bundle), so this is cosmetic — but moving them to `devDependencies` makes `bun audit --prod`-style reasoning and future SBOMs honest.
- `postgres`, `tsx`, `@huggingface/transformers`, `@anthropic-ai/sdk`, `@playwright/test` are correctly dev-scoped.

---

## 2. Edge Function runtime

### 2.1 ts-fsrs pin

- `supabase/functions/commit-capability-answer-report/index.ts:1-2` pins **`npm:ts-fsrs@5.3.2`** (exact pin — good).
- `supabase/functions/signup-with-invite/index.ts` imports **no npm packages** at all (pure Deno idioms) — zero third-party surface. Good.
- Latest ts-fsrs is **5.4.1** (2026-05-22). Between 5.3.2 → 5.4.1: **no security advisories** ([releases](https://github.com/open-spaced-repetition/ts-fsrs/releases)); changes are bugfix/behavioral (5.3.3 NaN-clamping fix, 5.4.0 FSRSError/validation, 5.4.1 relearning constraint fixes). The 5.3.3 NaN-clamp and 5.4.1 relearning fixes are *correctness* (scheduling) improvements worth taking eventually, but they change scheduling behavior — bump deliberately with FSRS regression tests, **not** as part of security hardening.

### 2.2 Edge-runtime container (homelab)

`/Users/albert/home/homelab-configs/services/supabase/docker-compose.yml:137-159`:

- Image: **`supabase/edge-runtime:v1.71.2`** — **pinned (good)** but **3 minor versions stale**; latest is **v1.74.1** (2026-06-10). No published security advisories found for the intervening versions, but this Deno-based runtime is about to sit on an internet-facing request path — track it in the normal image-bump cadence.
- **`VERIFY_JWT: "false"`** (line 151) — the runtime does no JWT verification; every function must self-authenticate. `signup-with-invite` is *deliberately* pre-auth (invite-gated signup with per-IP rate limit), but confirm `commit-capability-answer-report` validates the caller's JWT itself before trusting `user_id`-shaped input. Out of scope for a dependency audit, in scope for the hardening run — flagging the seam.
- Deno module cache is a persistent volume (`deno-cache`) and there is **no Deno lockfile** for the functions — the `@5.3.2` exact pin is the integrity mechanism. Acceptable; a `deno.lock` would add hash-pinning if you want belt-and-braces.

---

## 3. Docker images

`Dockerfile` (repo root) + `.github/workflows/deploy.yml`:

| Image | Where | Tag | Pinned? | Risk |
|---|---|---|---|---|
| `oven/bun:1` | builder stage | floating major | **No** | Build reproducibility + supply-chain: every CI build silently absorbs whatever bun 1.x image is current. A compromised or regressed upstream push flows straight into the next build. |
| `nginx:alpine` | runtime stage | floating | **No** | Same class, worse position: this is the **internet-facing** process. You cannot CVE-assess a floating tag — the deployed nginx version is whatever the last build pulled. Pin to a digest (e.g. `nginx:1.29-alpine@sha256:…`) so the running version is knowable and bumps are deliberate. |
| `ghcr.io/albertvd/learning-indonesian:latest` | deploy artifact | `latest` + `sha` | sha tag exists, but the **homelab recreate procedure pulls `latest`** | Deploys are not reproducible/rollback-addressable by tag; a bad/hijacked push to `latest` deploys on next recreate. Prefer deploying the `sha-…` tag that CI also emits (`type=sha,format=long` is already configured — use it). |

Mitigations already in place: multi-stage build (bun toolchain never reaches the runtime image), `bun install --frozen-lockfile` in the Dockerfile (lockfile-enforced install), static nginx serving only `dist/`.

No CVE scan of the *current* floating images is meaningful (contents change per pull) — that is precisely the finding. After pinning, add the platform's image-scan (trivy/grype) to CI if the reusable `dependency-audit.yml` doesn't already cover images.

---

## 4. Supply-chain hygiene

### 4.1 Lockfiles

- ✅ `bun.lock` committed and fresh (last touched 2026-07-02); Dockerfile enforces `--frozen-lockfile`.
- ⚠️ **Stale duplicate `package-lock.json`** committed (last touched **2026-04-26**, lockfileVersion 3). Two lockfiles for one manifest is a classic drift/confusion vector: any npm-based tool (Dependabot, `npm audit`, another dev's `npm install`) resolves against a 2-month-stale tree. **Delete it** (or regenerate + document why both exist). `tools/review/bun.lock` is a separate sub-tool and fine.

### 4.2 Install scripts posture

- ✅ Bun blocks lifecycle scripts by default; `trustedDependencies` allows only `onnxruntime-node` (needed by the local transformers tooling). Tight allowlist — good.
- ✅ `deploy.yml` installs with `--ignore-scripts` explicitly.

### 4.3 GitHub Actions workflows

**Pinning:**

| Action / workflow | Ref | Verdict |
|---|---|---|
| `actions/checkout` | SHA-pinned (`9c091bb…` # v7) | ✅ |
| `docker/login-action`, `metadata-action`, `build-push-action` | SHA-pinned | ✅ |
| `oven-sh/setup-bun` | **`@v2` floating tag** | ⚠️ pin by SHA like the others — a tag can be moved; this action handles the toolchain that builds the shipped bundle |
| `AlbertvD/homelab-platform/.github/workflows/{safety,dependency-audit,cache-cleanup}.yml` | **`@v1` floating tag** + `secrets: inherit` | ⚠️ own repo, so trust is self-referential — but `secrets: inherit` means anyone who can move the `v1` tag in homelab-platform gets this repo's secrets. Pin to a SHA or at least protect the tag. |

**Secrets exposure:**

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are passed as build-args and baked into the image. The anon key is public-by-design in the Supabase model (RLS is the boundary) — **acceptable**, no change needed, but be conscious that customer-facing = the anon key is now truly public; RLS reviews elsewhere in this hardening run carry that weight.
- `GITHUB_TOKEN` is scoped `contents: read, packages: write` in deploy — appropriate.
- No plaintext secrets in any workflow file.

**⚠️⚠️ The big one — public repo + self-hosted runners on `pull_request`:**

- The repo is **PUBLIC** (`gh repo view` → `PUBLIC`).
- `ci.yml` triggers on `pull_request` and runs jobs on **`self-hosted` / `[self-hosted, master-docker]`** — i.e., the homelab Docker host that also runs Supabase, Traefik, and the production app.
- GitHub's own guidance: *do not use self-hosted runners with public repositories.* With the default "require approval for first-time contributors" setting, **any account with one previously-merged PR (e.g. a typo fix) can open a PR whose workflow executes arbitrary code on `master-docker`** — inside the network perimeter, adjacent to the Supabase service keys and the `proxy` network. This is the single largest supply-chain finding of the audit; it becomes materially more attractive to attackers the moment the app has public customers.
- Fixes (any one of): (a) make the repo private; (b) route `pull_request` jobs to GitHub-hosted runners and keep self-hosted only for `push`-to-main/`workflow_dispatch`/`workflow_run` (deploy.yml is already safe — it triggers only off CI-on-main + manual dispatch); (c) set Actions → "Require approval for **all** outside collaborators" *and* use ephemeral, isolated runners. Option (b) is the cheapest that preserves the current workflow.

---

## 5. Verdict table — ranked actions

| # | Action | When | Why (one line) |
|---|---|---|---|
| 1 | **Stop running `pull_request` CI on the homelab self-hosted runner** (public repo) — move PR jobs to GitHub-hosted, keep self-hosted for main-branch/deploy only | **Before preview** | Any prior contributor can execute arbitrary code on the box that hosts prod + Supabase keys |
| 2 | **Pin Docker base images** — `oven/bun:1` and especially runtime `nginx:alpine` → version+digest; deploy the `sha-…` image tag instead of `latest` | **Before preview** | The internet-facing nginx version is currently unknowable and silently mutable |
| 3 | **Run `bun update`** (compatible ranges) — clears picomatch/fast-uri/flatted/undici/babel/brace-expansion, i.e. all 8 highs; also picks up mantine/eslint/vite/react-router patches | **Before preview** | One command removes every high advisory from the tree; all dev-chain, so regression risk ≈ 0 |
| 4 | **Delete stale `package-lock.json`** (bun.lock is the lockfile) | Before preview (trivial) | Dual lockfiles = stale-resolution drift for any npm-based tooling |
| 5 | Pin `oven-sh/setup-bun` and the `homelab-platform@v1` reusable workflows by SHA (or protect the tag) | Before preview (5 min) | `secrets: inherit` through a movable tag = tag-move → secret exfiltration path |
| 6 | Bump `@anthropic-ai/sdk` ≥0.91.1 (clears GHSA-p7fg-763f-g4gf); move `@google/genai` + `@testing-library/dom` to devDependencies | Can wait (scripts-only exposure) | Hygiene; no customer-facing surface |
| 7 | Bump `@supabase/ssr` 0.10.3 → 0.12.0 with an SSO-cookie smoke test; `@supabase/supabase-js` → 2.110.0 | Can wait — do as its own tested change | Pre-1.0 cookie-layer package on the auth path; don't bundle into a hardening sweep |
| 8 | Bump `supabase/edge-runtime` v1.71.2 → v1.74.1 in homelab-configs; consider a `deno.lock` for the functions | Can wait (no known advisories) | Keep the soon-internet-facing Deno runtime on cadence |
| 9 | Bump `npm:ts-fsrs@5.3.2` → 5.4.1 **as a deliberate scheduling-behavior change with FSRS regression tests** | After preview | No security content; 5.3.3+ fixes are correctness (NaN clamp, relearning constraints), not CVEs |
| 10 | Verify `commit-capability-answer-report` self-validates JWTs (`VERIFY_JWT: "false"` at the runtime level) | Fold into the hardening run's auth review | Dependency-audit-adjacent seam, flagged for the owning follow-up |

---

## Sources

- `bun audit` v1.3.10 (GHSA advisory database), `bun outdated` — run 2026-07-02 in repo root
- [ts-fsrs releases](https://github.com/open-spaced-repetition/ts-fsrs/releases) · [ts-fsrs on npm](https://www.npmjs.com/package/ts-fsrs)
- [supabase/edge-runtime releases](https://github.com/supabase/edge-runtime/releases)
- Repo files: `package.json`, `bun.lock`, `package-lock.json`, `Dockerfile`, `.github/workflows/{ci,deploy,cache-cleanup}.yml`, `supabase/functions/{commit-capability-answer-report,signup-with-invite}/index.ts`
- `/Users/albert/home/homelab-configs/services/supabase/docker-compose.yml:137-159`
