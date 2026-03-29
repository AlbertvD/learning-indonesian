# apex-hunter Security Report

**Scope:** Full security audit of learning-indonesian (React 19 + TypeScript + Vite, frontend-only, Supabase backend)
**Audit Date:** 2026-03-20
**Verdict:** WARN
**Risk Level:** Medium (no Critical findings; multiple Low/Medium; one informational note on by-design anon key exposure)

> Checked via osint-agent-public at /Users/albert/home/splinterlabs/osint-agent-public

---

## Summary

This is a personal homelab language-learning app with a small, trusted user base. It has no custom backend — all data flows through a self-hosted Supabase instance via the anon key. The architecture is sound for a homelab context. There are no Critical findings. The most significant risks are the absence of HTTP security headers on the Nginx container, an open-redirect possibility in the `ProtectedRoute` auth redirect, and the lack of server-side ownership enforcement in some Supabase service calls (relying entirely on RLS policies that could not be verified from this audit). Dependency CVE exposure is low — all packages are at recent versions with no unpatched Critical/High CVEs in the shipping bundle.

---

## Findings

---

## [MEDIUM] Missing HTTP Security Headers in Nginx

- **What:** The `nginx.conf` serves the app with no HTTP security headers. There is no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` header set.
- **Where:** `nginx.conf` (lines 1–12)
- **Risk:** Without a CSP, any XSS payload introduced via compromised dependencies or future injection bugs has unrestricted access to the DOM, cookies, and the Supabase session. Without `X-Frame-Options` or `frame-ancestors` in CSP, the app can be embedded in an iframe on another origin (clickjacking). Without `X-Content-Type-Options: nosniff`, browsers may MIME-sniff script content from storage buckets.
- **Fix:** Add the following to the Nginx `server` block:
  ```nginx
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://api.supabase.duin.home https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" always;
  ```
  The `connect-src` directive must include the Supabase URL and Google Fonts to avoid blocking legitimate requests. Adjust `style-src` based on whether Mantine injects inline styles (it does — `'unsafe-inline'` is needed unless nonces are used).

---

## [MEDIUM] Open Redirect via Unvalidated `next` Parameter in ProtectedRoute

- **What:** `ProtectedRoute` constructs the `next` redirect URL from `window.location.href` and passes it to `https://auth.duin.home/login?next=<encoded>`. The auth portal at `auth.duin.home` presumably reads this `next` parameter and redirects back to it after login.
- **Where:** `src/components/ProtectedRoute.tsx` line 11; `src/pages/Login.tsx` line 6–7; `src/pages/Register.tsx` line 6–7
- **Risk:** The risk is in the auth portal (`auth.duin.home`), not in this app — but this app is the origin of the `next` value. If a user is socially engineered to visit `indonesian.duin.home/sets?evil=https://attacker.com` and the auth portal does not validate that `next` is restricted to the `.duin.home` domain, an attacker could redirect post-login to a phishing page. Moderate risk for a homelab, lower because `window.location.origin + '/'` is used in the Login/Register pages (safer), but `window.location.href` (full URL including query string) is used in `ProtectedRoute`.
- **Fix:** Verify that `auth.duin.home` validates the `next` parameter against an allowlist of known domains (e.g., `*.duin.home`). In this app, consider replacing `window.location.href` in `ProtectedRoute` with `window.location.origin + '/'` to strip potentially attacker-controlled path/query components, matching the safer pattern already used in `Login.tsx` and `Register.tsx`.

---

## [MEDIUM] No Server-Side Ownership Checks in `cardService` — RLS Is the Only Guard

- **What:** Several `cardService` operations accept `setId` directly from URL params (`useParams`) and perform mutations (visibility change, share, unshare) without a client-side re-verification that the calling user owns the set. The ownership check `set.owner_id !== user.id` in `Set.tsx` is a UI guard only (line 67); it can be bypassed by calling the service layer directly from browser devtools. The actual enforcement relies entirely on Supabase RLS policies.
- **Where:** `src/services/cardService.ts` — `updateCardSetVisibility`, `shareCardSet`, `unshareCardSet`; `src/pages/Set.tsx` line 67
- **Risk:** If RLS policies on `card_sets` and `card_set_shares` are correctly configured with `auth.uid() = owner_id` checks, there is no exploitable vulnerability. However, the app's source code does not contain the RLS definitions, so they could not be verified in this audit. If RLS is absent or misconfigured on any of these tables, any authenticated user could change visibility or share/unshare any other user's card set by crafting a direct API call with an arbitrary `setId`.
- **Fix:** Verify via `make check-supabase-deep` or the Supabase Studio policies view that `card_sets` has an RLS policy of the form `USING (owner_id = auth.uid())` on UPDATE and DELETE, and that `card_set_shares` restricts INSERT/DELETE to the card set owner. Document the RLS policies in `scripts/migration.sql`.

---

## [LOW] Anon Key and Supabase URL Baked Into Production Bundle

- **What:** The Supabase anon JWT (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`) and the API URL (`https://api.supabase.duin.home`) are embedded in plaintext inside `dist/assets/index-BTCwQG7r.js`. The anon key decodes to role `anon`, issued 2026-03-12, expires 2036-03-09.
- **Where:** `dist/assets/index-BTCwQG7r.js` (minified bundle); baked in via `Dockerfile` build args `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- **Risk:** This is intentional and unavoidable for a frontend-only Supabase app — the anon key must be shipped to the browser. The anon key is not a secret; it is scoped to the `anon` role and its permissions are controlled entirely by RLS policies and Supabase grants. The real risk would be if the Supabase instance were publicly routable on the internet without RLS, but `api.supabase.duin.home` is an internal homelab domain not accessible from the public internet. The 10-year expiry is long but acceptable for a homelab with no rotation infrastructure. Note: the anon key in the `dist/` directory is from a previous build — the live build uses whatever key was passed at build time.
- **Fix:** No code change required. Verify that `api.supabase.duin.home` is not exposed to the public internet via Traefik. Consider rotating the anon key if it is ever leaked outside the homelab network. Ensure `.env.local` stays in `.gitignore` (it is currently excluded correctly).

---

## [LOW] `searchProfiles` Uses `ilike` Pattern Match Without Length Validation

- **What:** `cardService.searchProfiles(query)` passes user input directly as `%${query}%` in an `ilike` pattern to PostgREST. There is a 2-character minimum in the UI (`if (search.length >= 2)`), but this is a client-side check only.
- **Where:** `src/services/cardService.ts` line 121; `src/components/ShareCardSetModal.tsx` lines 45–51
- **Risk:** A user who calls the Supabase API directly could send a query of length 1 or an empty string, performing a full-table scan on `profiles.display_name`. With a small user base (homelab family app) this has negligible performance impact. There is no SQL injection risk because PostgREST parameterises all queries. Wildcard `%` as a query input would match all rows — effectively a profile enumeration endpoint returning up to 10 display names, which is the intended use case.
- **Fix:** Add a server-side minimum length guard using a PostgREST `check` constraint on the `profiles` table, or implement a Supabase Edge Function for the search. For a homelab, this is low priority. Consider noting in the RLS policy that all authenticated users can read `profiles.display_name` by design (for sharing).

---

## [LOW] Error Log Contains Unredacted Technical Error Messages

- **What:** `src/lib/logger.ts` writes raw `error.message` and `error.code` values to `indonesian.error_logs` in Supabase. This includes stack traces or internal Supabase PostgREST error messages.
- **Where:** `src/lib/logger.ts` lines 11–16
- **Risk:** The `error_logs` table is described as write-only for authenticated users (no SELECT grant via app). If this RLS constraint is correct, regular users cannot read their own or other users' error logs, so sensitive details in `error_message` are not directly exposed. If the SELECT restriction is misconfigured, error messages could leak internal schema structure (table names, column names, constraint names) to authenticated users querying the table. This is an information-disclosure risk.
- **Fix:** Verify that `error_logs` has no SELECT RLS grant for the `authenticated` role — only INSERT. The description in `CLAUDE.md` states this is write-only, which is correct design. No code change required if RLS is enforced; verify with `make check-supabase-deep`.

---

## [LOW] Google Fonts Loaded From External CDN in `index.html`

- **What:** `index.html` includes two `<link>` preconnect tags and a stylesheet link to `https://fonts.googleapis.com` and `https://fonts.gstatic.com`.
- **Where:** `index.html` lines 7–9
- **Risk:** This is an internal homelab app served at `indonesian.duin.home`. Loading fonts from Google's CDN introduces an external dependency: (1) if the homelab has no outbound internet access, fonts will fail to load silently; (2) Google receives the request IP and User-Agent of every page load — minimal privacy concern for a personal app but worth noting. There is no security risk (Google Fonts is not a threat vector in this context).
- **Fix:** For a fully self-contained homelab deployment, download the Poppins and Open Sans font files and serve them from the Nginx container. This eliminates the external CDN dependency and removes the need to allow `fonts.googleapis.com` and `fonts.gstatic.com` in a future CSP.

---

## [LOW] `postgres` Package Listed as Runtime Dependency

- **What:** The `postgres` package (a Node.js PostgreSQL client, `^3.4.8`) is listed as a `dependency` in `package.json` rather than `devDependencies`. It is only imported in `scripts/migrate-run.ts` and `scripts/check-admin.ts`, which are server-side admin scripts never bundled for the browser.
- **Where:** `package.json` line 17
- **Risk:** Vite's bundle analysis will include `postgres` in the dependency tree visible to the bundler. Because the package is never imported from `src/`, Vite's tree-shaking ensures it is not included in the production bundle (confirmed: no `postgres` symbols appear in `dist/`). However, listing it as a runtime dependency is misleading and could cause confusion during dependency auditing or if a future developer accidentally imports it from frontend code.
- **Fix:** Move `postgres` from `dependencies` to `devDependencies` in `package.json`, since it is only used in local admin scripts and should never reach the browser bundle.

---

## [INFO] Vite Dev Server Path Traversal CVE (CVE-2025-30208) — Not Applicable in Production

- **What:** Vite 8.0.0 (installed) is theoretically subject to CVE-2025-30208 (CVSS 5.3) where `?raw??` query string suffixes can bypass `@fs` allow-list protections and return arbitrary file contents from the dev server.
- **Where:** Dev server only — `bun run dev`
- **Risk:** This vulnerability affects the Vite **development** server, not the production build served by Nginx. The production deployment ships a static Nginx container with no Vite process running. The risk exists only when running `bun run dev` on a developer machine. In a homelab where the dev server runs on localhost, the attack surface is minimal.
- **Fix:** The fix is included in Vite 6.2.3+ for the v6 branch. Vite 8.0.0 is a newer major release; confirm it includes the CVE-2025-30208 fix by reviewing the Vite 8 release notes. If uncertain, avoid running the dev server on a network-accessible interface (do not bind to `0.0.0.0`). The Vite config does not override the default `host: 'localhost'` binding, so this is already correctly scoped.

---

## [INFO] IOC Sweep Results

All domains and indicators extracted from the codebase were checked against the local OSINT IOC database:

| Indicator | Type | Result |
|-----------|------|--------|
| `api.supabase.duin.home` | Domain | No match — internal homelab domain |
| `auth.duin.home` | Domain | No match — internal homelab domain |
| `indonesian.duin.home` | Domain | No match — internal homelab domain |
| `fonts.googleapis.com` | Domain | No match — known-good Google CDN |

No known-malicious IOCs found. All external domains are either Google CDN or internal `.duin.home` homelab addresses not reachable from the public internet.

---

## [INFO] Dependency CVE Summary

| Package | Installed Version | CVE Checked | CVSS | Verdict |
|---------|------------------|-------------|------|---------|
| `vite` | 8.0.0 | CVE-2025-30208 | 5.3 | Dev server only, not in prod |
| `react-router-dom` | 7.13.1 | CVE-2024-45296 (path-to-regexp) | 7.5 | path-to-regexp not a direct dep in RRD v7; not in installed node_modules |
| `@supabase/supabase-js` | 2.99.2 | No current active CVEs | — | Pass |
| `@supabase/ssr` | 0.9.0 | No current active CVEs | — | Pass |
| `nanoid` | 3.3.11 | CVE-2024-55565 (fixed in 3.3.8) | 4.3 | Pass — installed version is patched |
| `postgres` | 3.4.8 | No current active CVEs | — | Pass (scripts-only, not shipped) |

No Critical or High unpatched CVEs found in the production-shipping dependency set.

---

## Recommendations (Priority Order)

1. **[HIGH PRIORITY]** Add HTTP security headers to `nginx.conf`: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a `Content-Security-Policy`. This is a single-file change with broad impact.

2. **[MEDIUM PRIORITY]** Verify and document RLS policies on `card_sets`, `card_set_shares`, `error_logs`, and all user-owned tables. Run `make check-supabase-deep` and save the output. Add RLS policy definitions to `scripts/migration.sql` as comments so they are auditable from the repo.

3. **[MEDIUM PRIORITY]** Review `auth.duin.home`'s handling of the `next` parameter. Confirm it validates the redirect target against a `*.duin.home` allowlist before redirecting post-login. Change `ProtectedRoute` to use `window.location.origin + '/'` instead of `window.location.href` to reduce the blast radius of any open-redirect flaw in the auth portal.

4. **[LOW PRIORITY]** Move `postgres` from `dependencies` to `devDependencies` in `package.json`.

5. **[LOW PRIORITY]** Self-host Poppins and Open Sans fonts inside the Nginx container to eliminate the Google Fonts CDN dependency and simplify the future CSP `font-src` directive.

6. **[INFORMATIONAL]** Confirm Vite 8.0.0 includes the CVE-2025-30208 fix. Check Vite 8 changelog; if not included, consider upgrading to a confirmed-patched minor release.
