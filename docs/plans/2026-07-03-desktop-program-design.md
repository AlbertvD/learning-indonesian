---
status: implementing
implementation: PR #345 (slice 1 — landing, merged) · PR #346 (slice 2 — rail shell, merged) · PR #347 (slice 3 — Home launchpad, merged) · PR #348 (slice 4 — per-page passes)
reviewed_by: [architect]   # APPROVE-WITH-CHANGES 2026-07-03; C1 (CRIT-1 already fixed on main), C2 (ProfileMenu carries lang/logout not admin links), C3 (checklist step-1 derivation) all folded in inline. No data-model touch → no data-architect needed.
supersedes: []
---

# Desktop program — landing page, app shell, Home launchpad (design)

> **Owner's ask (verbatim):** "completely design the UI for desktop to ensure it looks and feels like a
> professional learning application, with proper landing page, clear instructions for new users, good
> home and navigation of all the features etc."
>
> **Scope decision (owner, 2026-07-03):** design from a marketing / sign-up / first-user perspective,
> **without** scoping the Supabase-Cloud migration or public-domain move — that stays parked
> (`memory/project_pre_cloud_hardening_shipped`). The landing page is designed public-grade but ships on
> the current homelab URL.
>
> **Companion mockup:** `docs/plans/mockups/2026-07-03-desktop-program-mockups.html` — four framed
> screens (landing, shell+Home, first-run checklist, dark mode), approved by the owner 2026-07-03.

## Grounding (per the plan-grounding rule)

- **`lib/session-builder/`** — the only `src/lib/` module this program touches, read-only. The target
  architecture explicitly blesses this exact use: "Called from the preview screen on a button press, and
  freely from anywhere else that wants to know what would be in the next session (**Dashboard preview**,
  tests, dev surfaces). Pure read: no DB writes, no side effects" (`docs/target-architecture.md:344`).
  The session-preview hero is that Dashboard preview. No new `lib/` module; no module spec drift.
- **Page framework** — all new/changed pages compose `PageContainer`/`PageBody`/`PageHeader` + card
  primitives (`docs/current-system/page-framework-status.md`; 16/18 surfaces already on it). The landing
  page is the one deliberate exception: it is a marketing surface with its own layout, kept as an
  isolated lazy chunk (see slice 1).
- **5-tab IA** — shipped (foundation plan §7.5, `docs/plans/2026-06-13-app-architecture-foundation.md`).
  This program is the §7.6 deferred item: "desktop platform layout." Nothing here reopens the IA.
- **Type tokens** — the mobile `--ex-fs-*` tier (PRs #335+) is untouched; the session player's exercise
  surface is explicitly out of scope. New desktop surfaces use the existing `--fs-*` scale + page
  framework; any new tokens land in `src/main.tsx` `cssVariablesResolver` like the existing tiers.
- **A11y** — must not re-introduce the fixed criticals (`docs/audits/2026-07-02-a11y-i18n-audit.md`);
  the landing page adds the skip-link opportunity (audit MIN-1) but that is not load-bearing here.

## Audit findings this program resolves

| Finding | Source | Resolved by |
|---|---|---|
| CRIT-1 — logged-out visits bounce to the unusable `auth.duin.home` SSO form | ux-failure-modes audit §1 | **Already fixed on main** (2026-07-02): `ProtectedRoute` now renders `<Navigate to="/login?next=…">` (`ProtectedRoute.tsx:43-58`) with a regression test. Slice 1 builds the landing surface that flow lands on. |
| §A first-run — new user lands on empty dashboard, no guidance | ux-failure-modes audit §A | Slice 3 (checklist) |
| MAJ-3 — "Niets te doen" recap has no diagnosis or CTA | ux-failure-modes audit §5 | Slice 3 (recap CTA) |
| Sidebar brands the app "Bahasa Indonesia", not "Kamoe Bisa" | this program's grounding pass | Slice 2 |

## Design language (locked with owner)

**Warm editorial** — Babbel/Notion calm, matured travel-journal feel. NL-primary copy.

- **Palette:** warm paper `#FBF8F2` ground · green-black ink `#22302B` · deep batik-green rail
  `#1F3D36` (the one bold move; identical in both themes — the brand constant) · tamarind
  `#C94F2B` as the single action color · muted gold `#C9973C` for streak/goal · sand borders `#E7DFD2`.
- **Dark mode:** warm green-black (`#161D1A` ground, `#1E2823` cards), never pure black; rail unchanged;
  tamarind text-accent lightened for contrast. Landing page is light-only (marketing surface; theming
  starts inside the app). The session player's dark exercise canvas is unchanged in both themes.
- **Type:** editorial serif display (Iowan Old Style / Palatino / Charter system stack) for headlines +
  wordmark; existing sans for UI/body; `tabular-nums` for stats. Final face choice (system stack vs a
  self-hosted webfont) is a slice-1 implementation decision — no CDN fonts (CSP/bundle discipline).
- **Exact values are direction, not pixel-spec** — tokens get named and placed in `main.tsx` during
  slice 1; light/dark contrast must pass WCAG AA (the a11y audit's light-mode token audit is the
  precedent).

### Token discipline (binding — this is where the changes land)

All visual changes go through the app's existing two-layer framework, never bespoke per-page values:

1. **Design tokens** — every new color/type/radius value lands as a semantic token in `src/main.tsx`
   `cssVariablesResolver` (`main.tsx:55`), theme-scoped in the light and dark blocks like the existing
   `--accent-primary` / `--text-*` / `--card-*` roles. New tokens this program adds: a `--rail-*` group
   (surface, ink, muted, hairline), a `--font-display` serif stack, and warm surface/border retunes.
   The mockup's raw hexes are pitch-only; components reference tokens exclusively.
2. **Page framework primitives** — new/changed pages compose `PageContainer`/`PageBody`/`PageHeader` +
   card primitives (`src/components/page/primitives/`); the rail is a new shell component styled via
   the tokens. Verify primitive ripple in `/admin/page-lab` per slice.
3. **Accent decision:** the global `--accent-primary` is currently cyan `#00E5FF` (`main.tsx:173`).
   The warm direction retunes this token per theme (tamarind on light; contrast-checked variant on
   dark) rather than adding a parallel accent — the `--ex-*` exercise tier keeps its own values and is
   untouched, so the session player does not shift. The page-lab pass is the ripple check.

## The four slices (each one PR, shippable alone, in order)

### Slice 1 — Landing page + CRIT-1 fix

**Route behavior.** The SSO bounce (audit CRIT-1) is **already fixed on main** — `ProtectedRoute`
renders `<Navigate to="/login?next=…">` (`ProtectedRoute.tsx:43-58`, regression-tested). Slice 1's
actual route work: (a) `/` currently sits inside the `ProtectedRoute`+`Layout` wrapper
(`App.tsx:99-107`), so logged-out visitors are redirected to `/login` — move `/` out of that wrapper
for the unauthenticated case so it renders the **public landing page** (authenticated users see Home
exactly as now); (b) retarget the logged-out redirect from `/login` to the landing page, preserving
the `next` destination.

**Bundle discipline.** The landing page is a `React.lazy` route chunk; the app entry chunk must not
grow (round-1 split baseline: 252 KB gz first visit). Screenshots/product imagery as optimized static
assets in the landing chunk only.

**Structure (top → bottom), all copy NL-primary with EN via `i18n.ts`:**

1. **Header** — Kamoe Bisa wordmark (sun mark + serif name); right: "Inloggen" (ghost) +
   "Registreer met code" (filled tamarind).
2. **Hero** — serif headline ("Leer Indonesisch dat *blijft hangen*" register), one-line method subline,
   primary CTA "Ik heb een uitnodigingscode" → `/register`, secondary "Inloggen" as a quiet text link.
   Right: a **flashcard "specimen"** as the memorable moment — the word *pasar* set large in serif with
   phonetics, gloss, example sentence, and "volgende herhaling over 3 dagen" (communicates spaced
   repetition honestly), rendered as a subtly stacked deck. (ui-designer decision 2026-07-03, replacing
   the tilted-device-screenshot cliché; a real product screenshot can be reconsidered at build time.)
3. **"Zo werkt het"** — 3 numbered steps: lees een les → oefen dagelijks één sessie (FSRS in human
   words) → zie je woordenschat groeien.
4. **Feature band** — 4 cards: Lessen · Podcasts & verhalen · Uitspraak & woordbouw · Voortgang.
5. **Invite banner** — deep-green band: "Kamoe Bisa is momenteel op uitnodiging," framed as exclusive
   preview, CTA repeated.
6. **Footer** — Privacy (`/privacy`), Contact, NL/EN switch.

**Explicitly not included:** pricing, testimonials, waitlist/interest-capture mechanism (owner decision:
invite-first CTA, zero new mechanism).

**Copy-honesty rule (owner, 2026-07-03):** all audio in the app is AI-generated (TTS). Marketing and
onboarding copy must never claim native speakers or human narration, and audio is not a lead selling
point — mention it neutrally where it describes a real feature (podcast follow-along), nowhere else.
Same discipline as the empty-recap fix: no promises the product doesn't keep.

### Slice 2 — Desktop app shell (persistent rail)

Fixed 240 px rail, always visible ≥769 px (existing breakpoint; `MobileLayout` untouched). The
pin/unpin/hamburger machinery in `Layout.tsx` + the `sidebar-locked` localStorage key are **deleted** —
one mode. Accepted trade-off: power users lose the full-width-content option.

Rail contents (top → bottom):
1. **Kamoe Bisa wordmark** (replaces "Bahasa Indonesia").
2. **"Start sessie" CTA** — filled tamarind, routes to the session exactly like the Dashboard button.
3. **5 destinations** — Home · Leren · Ontdek · Voortgang · **Profiel** (promoted to a real nav item —
   realigning to foundation §7.1, which always listed Profiel as a primary destination). The footer
   `ProfileMenu` is deleted; everything it carries — language switch, profile link, logout
   (`ProfileMenu.tsx:33-37,92-95`) — already exists on the Profiel page (`Profile.tsx:63,207,307`).
   Stated UX delta: logout goes from a 1-click popover to Profiel → sign out (accepted).
4. **Admin section** — unchanged: divider + admin links, admins only.
5. **Footer glance** — streak + today's-goal in one compact row (same store Home reads; taps through to
   Home), plus the theme toggle.

### Slice 3 — Home launchpad + first-run checklist + recap fix

**Desktop layout:** two-zone grid. Left (~2/3): **session-preview hero** — "Vandaag: 24 oefeningen —
12 herhalingen · 6 nieuw · 4 grammatica · 2 luisteren" + Start CTA (the foundation plan §7.2 card,
finally built) — then continue-shortcut + study-tips. Right (~1/3): streak + weekly movement +
read-only woordenschat pulse → Voortgang. Mobile keeps a single column (same components, stacked).

**Session-preview data:** call `buildSession` as a pure read for plan counts only (no render contexts,
no audio resolution) — the exact use `target-architecture.md:344` anticipates. **Fallback if too heavy
in practice:** ship "X kaarten klaar" from the existing due-count and make the full breakdown a
fast-follow. Measure, don't guess, in the slice-3 PR.

**First-run checklist ("Aan de slag")** — replaces the hero position for new accounts, on desktop AND
mobile:
- ① *Bekijk je eerste les* → `/leren`; done via a **localStorage flag set on first lesson-reader
  open**. (No persisted signal exists: the reader is passive per ADR 0005, and lesson-activation rows
  can't serve — lessons 1–3 are auto-activated at signup, so activation is already-true for every new
  account.)
- ② *Doe je eerste sessie* → session; done when `learning_sessions` has a completed row (existing data).
- ③ *Ontdek podcasts & verhalen* → `/ontdek`; done on first visit (localStorage flag) or dismissable.
- **Zero Supabase changes**: ② reads existing account state; ① and ③ are per-device localStorage
  flags — acceptable for a nudge card (worst case: a device switch re-shows a step). Card disappears
  once all steps complete.

**Empty-recap fix (MAJ-3):** RecapScreen's "Niets te doen" distinguishes *geen les geactiveerd*
(CTA → `/leren`) from *alles gedaan voor vandaag* (positive framing + link to Ontdek).

### Slice 4 — Per-page desktop passes

Leren, Ontdek, Voortgang, and lesson-reader width use, each a small pass **after** the shell exists so
pages are designed inside their real frame. Not detailed here (target-arch Rule 10 discipline): each is
a small PR with its own before/after screenshots; no new modules, no schema.

## Onboarding decision record

Owner picked **first-run checklist only** — explicitly rejected: guided routing into lesson 1 after
registration, spotlight tour overlay. A slim "zo werkt het" lives on the landing page as marketing, not
as an app mechanism.

## Supabase Requirements

### Schema changes
- **N/A** — no new tables, columns, RLS, or grants. Checklist state derives from existing
  `learning_sessions` (step ②) + two per-device localStorage flags (steps ① and ③); session preview is
  a pure read of existing data.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema surface).
- [ ] Kong CORS — **N/A** (same origin).
- [ ] GoTrue — **N/A** (register flow unchanged; invite edge function untouched).
- [ ] Storage — **N/A** (landing imagery ships in the app bundle/static assets, not a bucket).

### Health check additions
- **N/A** — no new API surface. (The slice-1 PR should keep `make pre-deploy` green as usual; no new
  checks needed.)

## Testing

- **Slice 1:** RTL — logged-out `/` renders landing; logged-in `/` renders Home; logged-out protected
  route redirects to the landing page and returns to the `next` destination after login (extends the
  existing `ProtectedRoute.test.tsx` regression test). Bundle-size assertion or manual check that the
  entry chunk didn't grow.
- **Slice 2:** RTL — rail renders 5 destinations + CTA; admin links admin-only; no `sidebar-locked`
  reads remain (grep).
- **Slice 3:** RTL — checklist step states derive correctly from mocked account state; card absent for
  established accounts; recap shows the activate-CTA when nothing is activated vs the caught-up copy
  when done. Unit test for the preview-count summarizer.
- **Visual:** re-capture desktop light+dark screenshots per slice (the mobile audit's capture-harness
  pattern) as the review artifact.

## Out of scope (explicit)

Supabase-Cloud migration / public domain (parked) · pricing & entitlements (foundation doc phase 2) ·
docked audio player + card grammar-preview-play (foundation §7.4) · session-player/exercise surface
restyle (just shipped for mobile) · waitlist mechanism · MobileLayout changes beyond the shared
checklist card.
