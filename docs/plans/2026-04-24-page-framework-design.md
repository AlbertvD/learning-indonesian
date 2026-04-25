# Page Framework Design (skeleton)

**Date:** 2026-04-24
**Status:** draft — visual iteration pending via `/admin/page-lab`
**Scope:** primitive library for page chrome, card surfaces, and auth-page layout — mirroring the exercise framework structure at the page level. Includes a seam contract (`PageBody`) that formalizes how pages and the exercise frame agree on viewport-height math.
**Stack:** React 19.2 + TypeScript 6.0 + Vite (SWC) + Mantine v9.1 + Zustand 5 + React Router 7 + Bun.

---

## 1. Motivation

Eight page-level `.module.css` files re-implement the same layout patterns: outer padding, page title + action row, card rows with icon + content + chevron, status pills, loading/empty states. The `.displaySm` page-title rule is copy-pasted across Dashboard, Lessons, Leaderboard, and Podcasts. Dashboard alone carries five card variants inline when most share the same bordered-surface foundation.

Yesterday's `.live { min-height: 100dvh }` bug exposed a structural gap: there is no contract between page chrome and the exercise frame. `ExerciseFrame` decided viewport math without knowing the Session page had a header and bottom nav stacked around it. That bug class will recur with any future sticky header, nested scroll region, or safe-area-aware footer.

**Goals:**

- **One page-primitive library.** React components matching exercise framework style. One change → all pages update.
- **Seam contract.** Explicit ownership of viewport-height math in a single primitive (`PageBody`). Exercise frame becomes height-agnostic.
- **Consolidated tokens.** Page-layout tokens live in `main.tsx`'s `cssVariablesResolver` alongside exercise tokens.
- **Enforced boundaries.** CI lint rule blocks `100dvh/vh` outside the two primitives allowed to own viewport math.

**Non-goals:** data table abstraction (Coverage pages keep bespoke tables), rewriting Lesson's domain primitives — `dialogueBlock`, `phraseRow`, `spellingChip`, `sentenceRow`, etc. stay in `Lesson.module.css` (Lesson's outer chrome migrates; its content interior is a separate future project). Admin DesignLab route, touching exercise framework internals.

---

## 2. Architecture — three layers

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1 — Page tokens (src/main.tsx cssVariablesResolver)  │
│  --page-pad-x/y, --page-header-gap, --app-top-bar-h,        │
│  --app-bottom-nav-h, --sidebar-width, --page-form-max-w     │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2 — 13 primitives                                    │
│  src/components/page/primitives/                            │
│  Layout:   PageContainer · PageBody · PageHeader · SectionHeading │
│  Cards:    StatCard · ListCard · ActionCard · HeroCard · SettingsCard │
│  Atoms:    StatusPill · EmptyState · LoadingState · PageFormLayout │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 — Page implementations                             │
│  src/pages/*.tsx                                            │
│  Thin compositions of primitives. Per-page .module.css     │
│  deleted during migration.                                  │
└─────────────────────────────────────────────────────────────┘
```

Supporting infrastructure:
- `/admin/page-lab` route (permanent, admin-gated) — every primitive rendered with realistic content in isolation + composition. Dark/light toggle, mobile-width preview toggle.
- CI lint rule — grep-based shell script + ESLint `no-restricted-syntax` — blocks viewport-height math outside `PageContainer.module.css` and `PageBody.module.css`.

---

## 3. Primitive catalog

### Layout chrome (4)

1. **`PageContainer`** — outer wrapper. Props: `size?: 'sm' | 'md' | 'lg' | 'xl'`, `fit?: boolean`. Declares `container-name: page`. Sizes: 480 / 720 / 1080 / 1280. `fit` mode: flex column with `height: calc(100dvh - --app-top-bar-h - --app-bottom-nav-h - env(safe-area-inset-bottom))`.

2. **`PageBody`** — **the seam contract.** Props: `variant?: 'auto' | 'fit'` (default `auto`). `auto` = block flow — whole page scrolls naturally. `fit` = `flex: 1; min-height: 0; display: flex; flex-direction: column` (inside `<PageContainer fit>`) — contents fill remaining viewport space. Only two primitives in the codebase are allowed to own viewport math: `PageContainer` and `PageBody`. All other files are blocked by CI. A third variant for pinned-header-scrolling-body was considered and deferred — no current consumer (verified empirically against every page including Lesson.tsx), add back when one emerges.

3. **`PageHeader`** — page title + optional subtitle + optional action slot. Consolidates the `.displaySm` rule (`fs-3xl / fw-semibold / line-height 1.15 / letter-spacing -.01em`) currently duplicated across 4 pages.

4. **`SectionHeading`** — mid-page subsection divider. Wraps the `.section-label` pattern at `index.css:98-116` (uppercase, small hairline divider).

### Cards (5)

5. **`StatCard`** — metric display (label + value + optional ring/progress). Covers Dashboard's 4 `ringCard` scorecards.

6. **`ListCard`** — horizontal row (icon + title + optional subtitle + chevron/action). Covers Lessons' `lessonCard`, Dashboard's `secondaryCard`.

7. **`ActionCard`** — prominent CTA variant with colored left border + icon box + title/focus/reason stack. Covers Dashboard's `actionCard*` and `rescueCard`.

8. **`HeroCard`** — gradient-background signature card with stats row + big CTA. Covers Dashboard's `heroCardV2`.

9. **`SettingsCard`** — titled card (title + optional description + body slot). Collapses Profile's 8× inline `Paper + Stack + Title` pattern, absorbs the mobile frosted-glass / desktop bordered branch currently at `Profile.tsx:197-205`.

### Atoms & utilities (4)

10. **`StatusPill`** — small colored badge. Props: `tone: 'success' | 'warning' | 'danger' | 'accent' | 'neutral'`. Covers Dashboard's `.statusPill*` and Lessons' `.badge*`.

11. **`EmptyState`** — centered icon + message + optional CTA. Covers Leaderboard's `noEntries` and generic blank-slate pattern.

12. **`LoadingState`** — centered loader with optional caption. Replaces the 6+ `<Center h="50vh"><Loader size="xl" /></Center>` copies.

13. **`PageFormLayout`** — vertical-centered narrow Paper wrapper for full-page forms. Collapses the identical Login + Register outer shell.

Per-primitive props, CSS module structure, and variants get finalized in `/admin/page-lab` during visual iteration — not in this spec.

---

## 4. The seam contract

**Rule:** every page's content goes inside `<PageBody>`. Nothing below it (including `ExerciseFrame`) is permitted to set `min-height: 100(d|s|l)vh`, `height: 100(d|s|l)vh`, or `max-height: 100(d|s|l)vh`. Enforced via CI lint.

### 4.1 Contract rules

- **One `PageBody` per page.** Nesting `PageBody` is a dev-time error. The runtime warning in §8 walks ancestors and shouts on both counts: missing `PageContainer fit` parent AND presence of a second `PageBody` ancestor.
- **Two sticky regions allowed.** Session legitimately has a top progress header + bottom Doorgaan footer. `PageBody variant="fit"` establishes exactly one scroll container; `position: sticky` descendants stick within it regardless of how many exist. No special primitive needed for stickies.
- **Nested scroll regions are the caller's responsibility.** If a child inside `variant="fit"` (e.g. a long cloze with many blanks) needs its own scroll area, that child sets its own `min-height: 0; overflow-y: auto`. `PageBody` guarantees a bounded flex parent and nothing more.

### 4.2 Migration effects

**On the exercise framework:** `ExerciseFrame.module.css:.live` stays `min-height: 0` (yesterday's workaround) until Phase 5, then is deleted entirely. The frame becomes height-agnostic.

**On safe-area ownership:** `PageBody.fit` reads `env(safe-area-inset-bottom)` in its height calc. Today `MobileLayout.module.css:52` and `ExerciseFrame.module.css:39` both read it independently — duplication that ends post-migration.

### 4.3 Lint scope

- **Shell script** scans `src/components/exercises/**/*.css`, `src/pages/**/*.module.css`, and `src/components/**/*.module.css` for `min-height|height|max-height: 100(d|s|l)vh`.
- **ESLint `no-restricted-syntax`** catches JSX inline styles for `height`, `minHeight`, `maxHeight` with value matching `100(dvh|vh|svh|lvh)`. Covers `style={{ height: '100vh' }}` as well as the `minHeight` variant.
- **Allowlist** — files permitted to own viewport math:
  - `src/components/page/primitives/PageContainer.module.css`
  - `src/components/page/primitives/PageBody.module.css`
  - `src/components/page/primitives/PageFormLayout.module.css` (full-page form wrapper — IS the page on auth routes)
  - `src/components/MobileLayout.module.css` (mobile chrome root — legitimately owns `height: 100dvh` because it IS the outer shell, not a page)
  - `src/components/Layout.module.css` (desktop chrome root — owns `height: 100vh` for the desktop outer shell; Layout.tsx delegates entirely to this module post-Phase 0)
- Runs in pre-commit (after existing lint step) and in CI.
- Exceptions beyond the allowlist: `# skip-check: <reason>` comment on the offending line, or `// eslint-disable-next-line no-restricted-syntax -- reason` for JSX. Reviewer-gated.

---

## 5. Tokens (added to `main.tsx` `cssVariablesResolver`)

### New page-layout tokens

```
'--page-pad-x':         '16px',
'--page-pad-y-top':     '22px',
'--page-pad-y-bottom':  '36px',
'--page-header-gap':    '28px',
'--page-form-max-w':    '400px',
```

Desktop overrides via `@container page (min-width: 769px)` inside `PageContainer.module.css`: `--page-pad-x: 24px`, `--page-pad-y-top: 32px`, `--page-pad-y-bottom: 48px`.

### New app chrome tokens (fix existing drift)

```
'--app-top-bar-h':        '52px',   // mobile top bar
'--app-bottom-nav-h':     '60px',   // mobile bottom nav *excluding* safe-area inset
'--sidebar-width':        '230px',  // locked — Layout.tsx:83 canonical; fixes 220/230 drift
'--sidebar-width-closed': '64px',   // overlay mode when unlocked — was hardcoded at Layout.tsx:83
```

Phase 0 migrates these files off literals:
- `MobileLayout.module.css:4,11,51` — swap `100dvh` / `52px` literals for the chrome tokens. File stays on lint allowlist (§4.3) because it IS the mobile outer shell.
- `Layout.tsx:42,87` — `height: '100vh'` is inline; Phase 0 moves both into a new `Layout.module.css` (on the allowlist) so the outer shell's height ownership is visible and linted as CSS rather than scattered inline props.
- `Layout.tsx:83` — `paddingLeft: locked ? 230 : 64` → `paddingLeft: locked ? 'var(--sidebar-width)' : 'var(--sidebar-width-closed)'`. Eliminates the hardcoded number drift that the current lint rule would miss (no way to scan numeric inline styles without false positives).

### Reused tokens

Card surface (`--card-*`), typography (`--fs-*`, `--fw-*`), status (`--success/--danger/--warning`), radius (`--r-*`), motion (`--ease-smooth`), hero gradient (`--hero-*`). No duplication.

---

## 6. Visual iteration workflow

This is the primary review loop — replacing prose sign-off with visual review.

1. Build `/admin/page-lab` with every primitive rendered in isolation + realistic composition.
2. User clicks through; approves, tweaks, or rejects each primitive.
3. Each round: edit primitive CSS/props → HMR → re-review.
4. After visual sign-off, this spec gets updated with final props/tokens per primitive as an addendum ("Section 7 — Final primitive signatures"), committed as the definitive reference.

Success criterion: user can migrate any one page from its old `.module.css` to primitives without reaching for Mantine inline styles or writing new custom CSS.

---

## 7. Migration plan

Phasing — one page per PR, each PR deletes the corresponding old `.module.css`:

| Phase | Page | Validates |
|-------|------|-----------|
| 0 | Infrastructure — tokens, primitives, `/admin/page-lab`, CI lint rule, **outer-layout tokenization**, **seam contract smoke test** | All primitives render correctly in isolation + `variant="fit"` smoke test passes |
| 1 | `Lessons.tsx` | PageContainer size=lg, PageHeader, ListCard |
| 2 | `Leaderboard.tsx` | Same + EmptyState, LoadingState |
| 3 | `Podcasts.tsx` | Same primitives — no new surface area |
| 4 | `Dashboard.tsx` | StatCard, ActionCard, HeroCard, SectionHeading, StatusPill |
| 5 | `Session.tsx` | PageContainer `fit`, PageBody `variant="fit"` — the seam contract in production. **Deletes `src/pages/Session.module.css`.** |
| 6 | `Login.tsx` + `Register.tsx` | PageFormLayout. Deletes inline `minHeight: '100vh'` at `Login.tsx:34` / `Register.tsx:40`. |
| 7 | `Profile.tsx` | SettingsCard, PageContainer size=sm |
| 8 | `Lesson.tsx` (partial — outer chrome only) | PageContainer size=lg, PageHeader for the lesson title row, SectionHeading for section subnav. Domain primitives (`dialogueLine`, `phraseRow`, `spellingChip`, etc.) stay in `Lesson.module.css` untouched — those are a separate future project. |
| 9 | Cleanup — delete `.section-label` from `index.css`, remove `ExerciseFrame.module.css:.live`, remove deleted `.module.css` files from the commit history search path | Nothing left referencing retired patterns |

Each phase: run `/admin/page-lab` plus the migrated page; visual parity check against the pre-migration screenshot; verify CI lint passes.

### Phase 0 detail

Three sub-tasks that must all land before phase 1 starts:

1. **Outer-layout tokenization.** `Layout.tsx:42,83,87` carries inline `height: '100vh'`, `paddingLeft: 230` (and `64` unlocked), and `height: '100vh'` on the main element. Migrate to:
   - `Layout.tsx:42,87` → both `height: '100vh'` inline styles move into a new `src/components/Layout.module.css` file. The height stays as a literal `100vh` in that module (no token needed — it's the outer viewport shell, allowlisted).
   - `Layout.tsx:83` → `paddingLeft: locked ? 'var(--sidebar-width)' : 'var(--sidebar-width-closed)'`. Both tokens defined in §5.
   - `MobileLayout.module.css:4,11,51` → consume `--app-top-bar-h` and `--app-bottom-nav-h` instead of literal `52px` / `100dvh`.
2. **Seam contract smoke test.** `/admin/page-lab` includes a mock Session page — `PageContainer fit` wrapping `PageHeader` + `PageBody variant="fit"` holding a placeholder 4-option MCQ-shaped element with a sticky footer. Rendered at 390×844 mobile viewport. Proves the contract works before Phase 5 touches production.
3. **CI lint rule green on main.** With the allowlist in §4.3 applied and outer layouts tokenized, the lint scanner runs clean on the pre-migration tree. No allowlist exceptions beyond the four files in §4.3.

---

## 8. Testing

- **Primitive unit tests** (Vitest + RTL) — prop matrix rendering, `variant` switches, action slot rendering. Match exercise framework test depth (e.g. `ExerciseOption.test.tsx` patterns).
- **Seam contract runtime warning** — `PageBody` walks up the DOM in `useEffect` and logs a console error when:
  - `variant="fit"` is set without a `PageContainer fit` sentinel class ancestor.
  - **Any `PageBody` has another `PageBody` ancestor** (nesting is unsupported — §4.1).
  Production build strips the check via `process.env.NODE_ENV === 'production'` guard.
- **CI lint check** — dedicated CI step runs the viewport-math scanner. Passing means no file outside the allowlist (§4.3) touches viewport-height units.
- **Visual regression per phase** — 4 screenshots per migrated page (mobile-light, mobile-dark, desktop-light, desktop-dark) at 390×844 and 1280×800. Committed to `docs/plans/page-framework-screenshots/phase-N/<page>-<viewport>-<theme>.png`. Full matrix: 9 pages × 2 viewports × 2 themes = 36 baselines (Lessons, Leaderboard, Podcasts, Dashboard, Session, Login, Register, Profile, Lesson). Compared manually per phase against the pre-migration baseline captured during Phase 0. No automated diff — Playwright screenshot comparison is overkill for 36 images reviewed visually.

---

## 9. Risks and open questions

- **Mantine `Container` co-existence.** Migration deletes `<Container>` from pages touched in phases 1–7. Mantine Container stays available for admin / coverage pages not migrated. No conflict expected.
- **`HeroCard` is used once.** Kept as primitive rather than inlined because shared `--hero-*` tokens + mobile/desktop layout logic make extraction nearly free. Revisit if a second consumer never appears after 3 months.
- **Profile's mobile frosted-glass paper** (`Profile.tsx:197-205`) differs from desktop's bordered paper. Absorbing into `SettingsCard` via `@media (max-width: 768px)` eliminates the per-page branch; visual parity to be confirmed in page-lab.

---

## 10. Done definition

- All 13 primitives ship, rendered in `/admin/page-lab`, tests passing.
- Phases 1–7 migrated; each old page `.module.css` deleted.
- Phase 8 (Lesson partial) migrated — outer chrome uses primitives; domain primitives stay in `Lesson.module.css` flagged as scope for a future lesson-reader effort.
- Phase 9 cleanup complete: `.section-label` global class removed, `ExerciseFrame.module.css:.live` removed, `MobileLayout.module.css` consumes chrome tokens, `Layout.tsx` outer math moved to `Layout.module.css`.
- CI lint rule green across the entire repo — only the four files in the §4.3 allowlist reference viewport height.
- Spec file updated with a new section capturing finalized per-primitive signatures post visual iteration (the addendum documenting decisions made in `/admin/page-lab`).
