---
status: draft
implementation: null
reviewed_by: []
supersedes: []
implementation_paths: []
---

# Making the public pages findable

**Problem.** `kamoebisa.nl` does not appear in search for its own core term
(checked 2026-08-19: a web search for *"kamoebisa.nl Indonesisch leren
Nederlands"* returns NHA, Volksuniversiteit, 50languages, indonesischeles.nl —
the competitor set already documented in `competitive-messaging.md` §7 — and not
this site).

**Grounding.** `docs/target-architecture.md` carries **no constraints for this
surface**: its roster covers runtime modules under `src/lib/` and `src/services/`,
and this work touches the build output and the served HTML, neither of which it
models. No `docs/current-system/modules/` spec covers it either. The relevant
prior art is `docs/marketing/content-plan.md` §"The rendering constraint" and
`docs/roadmap.md`:113-120, which already names prerendering as the single
findability blocker — **that entry is incomplete, see §1.**

---

## 1. What is actually broken

Three things, in the order they should be fixed. The roadmap names only the
second.

### 1a. Every route declares the homepage as its canonical ⚠️ NOT previously recorded

All six public routes serve the identical `dist/index.html`, because
`not_found_handling: "single-page-application"` (`wrangler.jsonc:63`) returns
that one file for every unmatched path. Verified live 2026-08-19:

```
/hoe-het-werkt   → rel="canonical" href="https://kamoebisa.nl/"
/leenwoorden     → rel="canonical" href="https://kamoebisa.nl/"
/privacy         → rel="canonical" href="https://kamoebisa.nl/"
```

`og:url`, `og:title`, `<title>` and `meta description` are hardcoded to the
homepage's values the same way (`index.html:34-51`), and nothing manages the
head at runtime — there is no Helmet, no `document.title` write anywhere in
`src/` outside tests.

**Consequence.** A canonical tag is an instruction, not a hint. Every public page
tells Google *"I am a duplicate of `/`"*, which is a direct contradiction of
`public/sitemap.xml`, which submits all six as distinct URLs. Google obeys the
canonical. So `/leenwoorden` — the page with the most standalone search value,
173 Dutch→Indonesian loanwords no competitor publishes — **cannot be indexed as
itself today**, and a shared `/leenwoorden` link unfurls as the homepage.

This is why it comes first: prerendering pages that each declare themselves a
duplicate of the homepage buys nothing.

### 1b. The served body is empty

```
$ curl -s https://kamoebisa.nl/ | sed -n '/<body/,/<\/body>/p'
  <body>
    <div id="root"></div>
  </body>
```

7,123 bytes, all head. Google renders JS on a delayed second pass; social
unfurlers (WhatsApp, Signal, LinkedIn, Slack) and most LLM crawlers never do.
The static head is currently carrying the entire load, which is why `/` works at
all and the others do not.

### 1c. Nothing is submitted or measured

No Search Console property is visible from the repo, so there is no crawl data,
no index-coverage report, and no confirmation Google has fetched `sitemap.xml`.
Owner action, not code — but it belongs in the sequence, because without it 1a
and 1b ship blind.

**What is NOT broken**, and should not be re-done: `robots.txt` correctly allows
exactly the six public surfaces and disallows the session-gated ones;
`sitemap.xml` lists all six; `index.html` has a real Dutch `<title>`, a
description leading with the loanword hook, full OG/Twitter cards and JSON-LD.
The 2026-08-05 work was sound — it just stopped one route short of the problem.

---

## 2. Approach, and what was rejected

**Chosen: emit one static HTML file per public route at build time.**

The whole approach rests on two platform behaviours, so both were **verified
against Cloudflare's docs (2026-08-19)** rather than assumed:

1. *Exact asset match wins.* "By default, if a requested URL matches a file in
   the static assets directory, that file will be served… If no matching asset
   is found… `not_found_handling`"
   ([Static Assets § Routing behavior](https://developers.cloudflare.com/workers/static-assets/)).
   So the SPA fallback only fires where nothing matches, and stays the catch-all
   for `/leren`, `/lesson/<id>` and every gated route.
2. *Directory index serving is on by default.* `html_handling` defaults to
   `"auto-trailing-slash"`
   ([Wrangler configuration § assets](https://developers.cloudflare.com/workers/wrangler/configuration/)),
   and it is unset in `wrangler.jsonc` — so `dist/hoe-het-werkt/index.html` is
   served at `/hoe-het-werkt`.

Together: the six public routes get real files *in front of* the fallback.
**No change to `wrangler.jsonc`, no change to the SPA mechanism, no compute
Worker.** The homelab's nginx resolves the same layout via
`try_files $uri $uri/ /index.html` (`nginx.conf:68`), so one build output serves
both deployments — but assert that once rather than assuming it.

Rejected:

| Option | Why not |
|---|---|
| Runtime head management (Helmet or equivalent) | Sets the head *after* JS runs. Unfurlers and non-JS crawlers never see it — it solves nothing for the actual audience, and adds a dependency |
| A Worker script that rewrites the head per request | Turns an assets-only Worker into a compute Worker (`wrangler.jsonc:66` records the assets-only decision deliberately). Per-request cost forever, to produce output that is identical every time |
| Migrate to Next / Astro / Remix for SSG | Replaces the whole build for six pages. The rest of the app is authenticated and correctly a SPA |
| `vite-plugin-prerender` and similar | Pulls in a headless browser at build time. §3's slice 2 needs `renderToString` and nothing more; a browser is mechanism we do not need |

---

## 3. Two slices

The slices are ordered so that **slice 1 is independently valuable** — it is what
makes the other five URLs indexable at all — and slice 2 is a strict extension of
the same file layout.

### Slice 1 — per-route head (small, unblocks indexing)

One route table, one post-build step.

```
scripts/build-public-pages.ts     new — runs after `vite build`
src/pages/publicRoutes.ts         new — the route table, imported by the script
```

The table holds, per route: path, `<title>`, meta description, and whether it
belongs in `sitemap.xml`. The script reads `dist/index.html`, and for each route
swaps `<title>`, `meta[name=description]`, `link[rel=canonical]`, `og:url`,
`og:title`, `og:description` and the Twitter equivalents, then writes
`dist/<path>/index.html`. `/` patches `dist/index.html` in place.

**Omission test, per part:**

- *The route table* — without it the titles live in a build script, which is
  where nobody looks for copy. It also becomes the single source `sitemap.xml`
  is generated from, which deletes the "keep robots.txt and sitemap.xml in step
  with App.tsx by hand" instruction currently written in both files' comments.
- *The post-build script* — without it there is no per-route head, which is the
  whole defect.
- *Nothing else.* No new dependency, no config change, no runtime code.

**Copy constraint.** The per-route titles and descriptions are customer-facing
marketing copy: they go through the `marketing` + `marketing-copy` skills and
the claim rules, and the counts they quote (173 loanwords, 66 register pairs)
must trace to `docs/marketing/facts.md`, not be retyped.

### Slice 2 — prerendered body (larger)

`renderToString` each of the three *content* routes — `/`, `/hoe-het-werkt`,
`/leenwoorden` — and inject the markup into the `<div id="root">` of the file
slice 1 already emits. The three legal pages get slice 1 only; they need correct
canonicals, not crawlable prose.

Known complications, each to be settled before implementing, not during:

- **Router context.** `Landing.tsx:44` calls `useSearchParams` (imported at :26), so the render
  needs a `StaticRouter`/`MemoryRouter` wrapper. It renders the page component
  directly, never `App`, because `App.tsx:137`'s `showLanding` depends on auth
  state that does not exist at build time.
- **Hydration.** `main.tsx:394` uses `createRoot`. Against prerendered markup that
  discards and re-renders — correct, but a double paint. Switching to
  `hydrateRoot` avoids it and introduces hydration-mismatch risk on a page whose
  only dynamic value is `new Date().getFullYear()` in the footer
  (`Landing.tsx:372`). **Decide explicitly; do not drift into one.**
- **CSS.** The landing styles are in a lazy chunk, so prerendered markup paints
  unstyled until that chunk loads. Either preload the chunk's CSS from the
  emitted head or accept the flash — measure before choosing.
- **Mantine.** The three legal pages use Mantine components and the page-framework
  primitives; those are out of slice 2's scope precisely so their SSR behaviour
  does not need investigating.

### Not in scope

`/leenwoorden` content expansion, new SEO landing pages (that is `content-plan.md`
and Bet 4), and the EN front door (Bet 5, its own brand). This spec makes the six
pages that exist findable; it does not add pages.

---

## 4. Supabase Requirements

### Schema changes
**N/A** — no tables, columns, RLS policies or grants. This work is entirely
build-time and touches no database surface. The public pages read no data:
`docs/roadmap.md`:252 records that anon has no read grant on the `indonesian`
schema, which is why `/leenwoorden` already uses the committed static export
`src/lib/loanwords/revealPairs.ts` and `Landing.tsx:36` uses a committed
`REGISTER_PAIRS` constant rather than a query. Prerendering does not change that
— it makes it easier, since a build-time render has no session either.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A**, no new schema.
- [ ] Kong CORS — **N/A**, no new origin or header.
- [ ] GoTrue auth config — **N/A**.
- [ ] Storage buckets — **N/A**.

The homelab serves this app through nginx (`nginx.conf:68`, `try_files $uri $uri/ /index.html`), which
resolves `dist/<route>/index.html` the same way Workers does, so slice 1 needs no
homelab change either. Worth asserting once rather than assuming.

### Health check additions
- `scripts/check-cloud-config.ts` — **replace the vacuous check at line 278.**
  It asserts `/hoe-het-werkt` serves by testing for HTTP 200, but
  `not_found_handling: single-page-application` returns 200 for *every* path, so
  it cannot fail and did not fail while `main` had no such page at all (observed
  2026-08-18). Replace with an assertion on the response *body* — that the
  canonical matches the requested URL. That single change also becomes the
  regression test for 1a.
- Add: every URL in `sitemap.xml` returns a document whose canonical is itself.
  This is the check that would have caught the defect this spec exists to fix.

---

## 5. Acceptance

1. `curl https://kamoebisa.nl/hoe-het-werkt` returns a canonical, `og:url` and
   `<title>` that are its own, not the homepage's.
2. Every URL in `sitemap.xml` passes the same test, asserted by
   `make check-cloud-config`.
3. (slice 2) `curl https://kamoebisa.nl/` returns the hero copy in the body.
4. Search Console reports the sitemap fetched and the six URLs crawled — owner
   action, and the only acceptance criterion here that is not machine-checkable.

## 6. Follow-up for the roadmap

`docs/roadmap.md`:113 says *"'Findable' has exactly one real blocker left, and it
is not meta tags."* That is now falsified: the canonical defect **is** a meta-tag
problem, it is separate from prerendering, and it is the more severe of the two —
prerendering a page Google has been told to ignore changes nothing. Update that
entry when this spec is approved, so the roadmap stops asserting the narrower
diagnosis.
