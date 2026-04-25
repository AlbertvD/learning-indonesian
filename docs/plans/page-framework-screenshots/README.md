# Page Framework Screenshots

Visual regression evidence for the page-framework migration phases. Each migration phase commits 4 screenshots to `phase-N/` (mobile-light, mobile-dark, desktop-light, desktop-dark) at 390×844 and 1280×800.

## Baseline (`baseline/`)

The full pre-migration baseline matrix — 9 pages × 2 viewports × 2 themes = **36 screenshots** — is captured at the kickoff of **Phase 1** (Lessons migration), not at the end of Phase 0.

**Rationale.** Phase 0 ships only:
- Token additions to `main.tsx`
- New `Layout.module.css` (desktop chrome — owns viewport math, semantically equivalent to the inline styles it replaced)
- Tokenized `MobileLayout.module.css` (literal-for-token swap, no visual change)
- 13 new primitives in `src/components/page/primitives/` (no consumers yet)
- The `/admin/page-lab` route (new admin surface — no impact on existing pages)
- CI lint rule (no runtime effect)

**No existing page is modified during Phase 0.** Capturing 36 baselines today and 36 again at Phase 1 kickoff would produce identical sets. To save the redundant capture, Phase 1's first sub-task is "capture the baseline screenshot matrix" — see `docs/plans/2026-04-24-page-framework-implementation.md` for the matrix specification.

## Pages × Viewports × Themes matrix

| Page | Path | Auth | Notes |
|---|---|---|---|
| Dashboard | `/` | yes | Most card-dense — Phase 4 target |
| Lessons | `/lessons` | yes | Phase 1 target |
| Leaderboard | `/leaderboard` | yes | Phase 2 target |
| Podcasts | `/podcasts` | yes | Phase 3 target |
| Session | `/session?mode=standard` | yes | Phase 5 — seam contract validation |
| Login | `/login` | no | Phase 6 |
| Register | `/register` | no | Phase 6 |
| Profile | `/profile` | yes | Phase 7 |
| Lesson | `/lesson/<id>` | yes | Phase 8 — partial migration (outer chrome only) |

**Viewports:** mobile 390×844, desktop 1280×800.
**Themes:** dark (default), light (toggle in Profile or via DOM data attribute).

Capture conventions:
- Filename pattern: `<page>-<viewport>-<theme>.png` (e.g. `dashboard-mobile-dark.png`).
- PNG, viewport-only (not full page) unless the page legitimately requires scroll to evaluate.
- Browser: Chromium via Playwright, css-pixel scale.
