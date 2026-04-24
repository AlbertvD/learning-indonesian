# Page Framework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the page primitive library + seam contract + CI enforcement scaffolded in `docs/plans/2026-04-24-page-framework-design.md`, starting with Phase 0 infrastructure. Phases 1–9 (page migrations + cleanup) are re-planned per-phase because primitive shapes will firm up through visual iteration in `/admin/page-lab`.

**Architecture:** Three-layer structure matching the exercise framework (tokens in `main.tsx` → 13 primitives in `src/components/page/primitives/` → page implementations). Seam contract lives in `PageBody` + `PageContainer`; CI lint rule enforces that no other file touches viewport height. `/admin/page-lab` renders every primitive in isolation + composition for visual review.

**Tech Stack:** React 19.2 · TypeScript 6.0 · Vite (SWC) · Mantine v9.1 · Vitest + RTL · Bun · ESLint (flat config) · Husky v9.

**Spec reference:** `docs/plans/2026-04-24-page-framework-design.md` (approved 2026-04-24 after two architect review rounds).

---

## Scope of this plan

- **Phase 0 — Infrastructure.** Fully detailed tasks below. This plan is executable end-to-end for Phase 0.
- **Phases 1–9 — Migrations.** Milestones + acceptance criteria listed. Each phase will receive its own implementation plan when it's next, written against the final primitive signatures captured in `/admin/page-lab`.

Do not attempt phases 1–9 from this plan. Stop after Phase 0 completes, then brainstorm/plan Phase 1 fresh.

---

## Phase 0 task map (46 tasks)

| Group | Tasks | Covers |
|---|---|---|
| A. Tokens + outer layout | 1–6 | Adds tokens, migrates `Layout.tsx` and `MobileLayout.module.css` to consume them |
| B. Primitive scaffolding | 7–34 | 13 empty primitives + barrel exports + test fixtures |
| C. CI lint rule | 35–40 | Viewport-math scanner shell script + ESLint rule + pre-commit wiring |
| D. `/admin/page-lab` route | 41–45 | Route + AdminGuard + isolation demos + composition demo + seam contract smoke test |
| E. Verification | 46 | Full suite green on mobile + desktop before Phase 1 |

Commits after each logical task per CLAUDE.md guidance ("Commit after each logical task"). Expect ~25–30 commits across Phase 0.

---

## Group A — Tokens & outer layout

### Task 1: Add page-layout tokens to the Mantine resolver

**Files:**
- Modify: `src/main.tsx` (around line 85–93, inside `cssVariablesResolver` → `variables` block)

**Step 1: Locate the insertion point.** The existing `// Exercise framework — spacing tokens` block lives immediately above. Insert the page tokens directly below it with a comment header.

**Step 2: Add the tokens.**

```typescript
// Page framework — layout tokens (mobile values; desktop via @container in primitives)
'--page-pad-x':         '16px',
'--page-pad-y-top':     '22px',
'--page-pad-y-bottom':  '36px',
'--page-header-gap':    '28px',
'--page-form-max-w':    '400px',
```

**Step 3: Commit.**
```bash
git add src/main.tsx
git commit -m "feat(page-framework): add page-layout tokens to Mantine resolver"
```

---

### Task 2: Add app-chrome tokens + fix sidebar-width drift

**Files:**
- Modify: `src/main.tsx` (same resolver block — after the page tokens from Task 1, and replacing the existing `'--sidebar-width': '220px'` on line 132)

**Step 1: Add new chrome tokens.**

```typescript
// App chrome — canonical values for the seam contract
'--app-top-bar-h':        '52px',    // mobile top bar (MobileLayout.module.css:11)
'--app-bottom-nav-h':     '60px',    // mobile bottom nav, excludes safe-area inset
'--sidebar-width-closed': '64px',    // overlay mode when sidebar is unlocked
```

**Step 2: Replace `--sidebar-width: 220px` with `'230px'`.** The canonical value comes from `Layout.tsx:83`; `220` was drift.

**Step 3: Commit.**
```bash
git add src/main.tsx
git commit -m "feat(page-framework): add app-chrome tokens, fix --sidebar-width 220→230 drift"
```

---

### Task 3: Create `Layout.module.css` for the desktop outer shell

**Files:**
- Create: `src/components/Layout.module.css`

**Step 1: Write the module.**

```css
.root {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.main {
  flex: 1;
  padding-right: 24px;
  transition: padding-left .22s cubic-bezier(.4, 0, .2, 1);
  overflow: auto;
  height: 100vh;
  box-sizing: border-box;
  min-width: 0;
}

.mainLocked   { padding-left: var(--sidebar-width); }
.mainUnlocked { padding-left: var(--sidebar-width-closed); }
```

No container queries or theme variants — this IS the allowlisted viewport-math file (§4.3 of the spec).

**Step 2: Commit.**
```bash
git add src/components/Layout.module.css
git commit -m "feat(page-framework): create Layout.module.css for desktop outer shell"
```

---

### Task 4: Migrate `Layout.tsx` inline styles to the module + tokenized sidebar padding

**Files:**
- Modify: `src/components/Layout.tsx` (lines 42, 81–90)

**Step 1: Import the module.** Add near existing imports:
```typescript
import classes from './Layout.module.css'
```

**Step 2: Replace the root `<div>` (line 42).**
```tsx
// Before:
<div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
// After:
<div className={classes.root}>
```

**Step 3: Replace the `<main>` (lines 81–90).**
```tsx
<main className={`${classes.main} ${locked ? classes.mainLocked : classes.mainUnlocked}`}>
  <Outlet />
</main>
```

Drop the entire inline style prop. The transition and padding math now live in the module.

**Step 4: Verify the app loads.**

```bash
bun run dev
# Open http://localhost:5173/ — sidebar locks/unlocks with the same padding offsets, no visual regression.
```

**Step 5: Type-check + lint.**
```bash
bun run tsc -b --noEmit
bun run lint
```
Expected: zero new errors.

**Step 6: Commit.**
```bash
git add src/components/Layout.tsx
git commit -m "refactor(layout): move desktop viewport-height + sidebar padding into Layout.module.css"
```

---

### Task 5: Migrate `MobileLayout.module.css` to chrome tokens

**Files:**
- Modify: `src/components/MobileLayout.module.css` (lines 4, 11, 51)

**Step 1: Replace `height: 100dvh` on `.root` (line 4).** Leave as-is — this file is on the allowlist (§4.3). But do replace the hardcoded top/bottom nav heights.

**Step 2: Replace top-bar literal.** On `.topBar` (line 11), change `height: 52px` → `height: var(--app-top-bar-h)`.

**Step 3: Replace bottom-nav literal.** The computed height (`.bottomNav`) uses implicit sizing via its padding; only the `.content` bottom padding references a value (`padding-bottom: 90px` on line 34). Replace:
```css
.content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(var(--app-bottom-nav-h) + env(safe-area-inset-bottom) + 16px);
}
```

This keeps the 16px visual clearance that the 90px-approximation was giving, but now tracks chrome-height changes automatically.

**Step 4: Verify on mobile viewport.**

```bash
bun run dev
```
Open at 390×844 in a browser devtools mobile emulator; verify top bar and bottom nav sit correctly, content has breathing room above the nav.

**Step 5: Commit.**
```bash
git add src/components/MobileLayout.module.css
git commit -m "refactor(layout): tokenize MobileLayout chrome heights"
```

---

### Task 6: Smoke-test outer layout before primitives

**Files:** none modified.

**Step 1: Run the full test suite.**
```bash
bun run test
```
Expected: **447 passed** (the baseline before this plan). Any regression here is from Tasks 1–5 and must be fixed before continuing.

**Step 2: Full HMR visual check.**
- Desktop (>769px): sidebar lock/unlock transitions cleanly.
- Mobile (<769px via devtools): top bar fixed, bottom nav fixed, content scrolls between.

No commit for this task — it's a gate.

---

## Group B — Primitive scaffolding

13 primitives ship as **empty shells with passing tests**. Visuals and final props get iterated in `/admin/page-lab` (Group D). Each primitive task below is structurally identical; the table after Task 7 captures the variations.

### Task 7: Create the primitives directory + barrel

**Files:**
- Create: `src/components/page/primitives/index.ts`

**Step 1: Ensure parent directory exists.**
```bash
mkdir -p src/components/page/primitives
```

**Step 2: Create an empty barrel.**
```typescript
// src/components/page/primitives/index.ts
// Re-exports appended as each primitive lands.
export {}
```

**Step 3: Commit.**
```bash
git add src/components/page/primitives/index.ts
git commit -m "chore(page-framework): create primitives directory + barrel"
```

---

### Task 8 (template): Scaffold a primitive — `PageContainer`

**Files:**
- Create: `src/components/page/primitives/PageContainer.tsx`
- Create: `src/components/page/primitives/PageContainer.module.css`
- Create: `src/__tests__/page-primitives/PageContainer.test.tsx`
- Modify: `src/components/page/primitives/index.ts` (add export)

**Step 1: Write the failing test.**

```tsx
// src/__tests__/page-primitives/PageContainer.test.tsx
import { render, screen } from '@testing-library/react'
import { PageContainer } from '@/components/page/primitives/PageContainer'

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer><span data-testid="child">hi</span></PageContainer>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('applies the size class', () => {
    const { container } = render(<PageContainer size="lg">x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/lg/)
  })

  it('applies the fit class when fit=true', () => {
    const { container } = render(<PageContainer fit>x</PageContainer>)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/fit/)
  })
})
```

**Step 2: Run test to verify it fails.**
```bash
bun run test -- PageContainer
```
Expected: FAIL — module not found.

**Step 3: Write the minimal component.**

```tsx
// src/components/page/primitives/PageContainer.tsx
import type { ReactNode } from 'react'
import classes from './PageContainer.module.css'

export interface PageContainerProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  fit?: boolean
}

const SIZE_CLASS: Record<NonNullable<PageContainerProps['size']>, string> = {
  sm: classes.sm,
  md: classes.md,
  lg: classes.lg,
  xl: classes.xl,
}

export function PageContainer({ children, size = 'md', fit = false }: PageContainerProps) {
  return (
    <div className={`${classes.root} ${SIZE_CLASS[size]} ${fit ? classes.fit : ''}`}>
      {children}
    </div>
  )
}
```

**Step 4: Write the CSS module shell.**

```css
/* src/components/page/primitives/PageContainer.module.css */
.root {
  container-name: page;
  container-type: inline-size;
  margin-inline: auto;
  padding: var(--page-pad-y-top) var(--page-pad-x) var(--page-pad-y-bottom);
}

.sm { max-width: 480px; }
.md { max-width: 720px; }
.lg { max-width: 1080px; }
.xl { max-width: 1280px; }

.fit {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--app-top-bar-h) - var(--app-bottom-nav-h) - env(safe-area-inset-bottom));
  padding-bottom: 0;
}

@container page (min-width: 769px) {
  .root {
    padding: 32px var(--page-pad-x) 48px;
  }
  .fit {
    height: 100dvh;
    padding: 0 var(--page-pad-x);
  }
}
```

**Step 5: Export from barrel.**

```typescript
// src/components/page/primitives/index.ts
export { PageContainer } from './PageContainer'
export type { PageContainerProps } from './PageContainer'
```

**Step 6: Run test to verify it passes.**
```bash
bun run test -- PageContainer
```
Expected: PASS (3 tests).

**Step 7: Commit.**
```bash
git add src/components/page/primitives/PageContainer.tsx \
        src/components/page/primitives/PageContainer.module.css \
        src/components/page/primitives/index.ts \
        src/__tests__/page-primitives/PageContainer.test.tsx
git commit -m "feat(page-framework): scaffold PageContainer primitive"
```

---

### Tasks 9–20: Scaffold remaining 12 primitives

Each follows the Task 8 template exactly — test → fail → implement → CSS → barrel → pass → commit. The table below captures what varies per primitive. **For each row, write a test that verifies the stated minimal behavior and a minimal component that passes it. Visual detail is deferred to Group D.**

| # | Primitive | Minimal behavior to test | Props to expose | CSS module rough outline |
|---|---|---|---|---|
| 9 | `PageBody` | renders children; applies variant class (`auto`/`fit`); runtime warns in dev if `variant="fit"` without `PageContainer fit` ancestor; warns if another `PageBody` is an ancestor | `children`, `variant?: 'auto' \| 'fit'` | `.root { display: block }` for auto; `.fit { flex: 1; min-height: 0; display: flex; flex-direction: column }` |
| 10 | `PageHeader` | renders title; renders subtitle when given; renders action slot when given; applies `.displaySm`-equivalent class to title | `title: string`, `subtitle?: string`, `action?: ReactNode` | flex row, space-between; `.title { font-size: var(--fs-3xl); font-weight: var(--fw-semibold); line-height: 1.15; letter-spacing: -0.01em }` |
| 11 | `SectionHeading` | renders children as label; renders action slot when given; root has hairline `::after` divider | `children`, `action?: ReactNode` | flex row; label uses existing section-label rule; `::after` pseudo for divider |
| 12 | `StatCard` | renders label + value; renders optional ring (pass-through slot for now) | `label: string`, `value: ReactNode`, `ring?: ReactNode` | bordered card, flex column, centered |
| 13 | `ListCard` | renders icon + title (+ subtitle); chevron shown by default; renders as `<Link>` when `to` prop given | `to?: string`, `icon: ReactNode`, `title: string`, `subtitle?: string`, `trailing?: ReactNode` | flex row, gap 14px, padding 14/16, card bg + border |
| 14 | `ActionCard` | renders icon box + title + focus line + reason; colored left border via `tone` prop | `tone: 'accent' \| 'warning' \| 'danger'`, `to?: string`, `icon: ReactNode`, `title: string`, `focus?: string`, `reason?: string` | same as ListCard + `border-left: 3px solid var(--<tone>)` |
| 15 | `HeroCard` | renders children inside gradient bg; renders optional CTA button via `cta` prop | `children`, `cta?: ReactNode` | `background: var(--hero-gradient); border: 1px solid var(--hero-border); border-radius: var(--r-lg); padding: 28px 24px` |
| 16 | `SettingsCard` | renders title + optional description + children as body | `title: string`, `description?: string`, `children: ReactNode` | Paper-like card; `@media (max-width: 768px)` applies frosted-glass styles replacing `Profile.tsx:197-205` branch |
| 17 | `StatusPill` | renders children; applies correct tone class | `children`, `tone: 'success' \| 'warning' \| 'danger' \| 'accent' \| 'neutral'` | small inline-flex badge, padding 2/8, tone maps to subtle-bg + fg tokens |
| 18 | `EmptyState` | renders icon + message; renders CTA when given | `icon: ReactNode`, `message: string`, `cta?: ReactNode` | centered flex column, padding 32, `color: var(--text-secondary)` |
| 19 | `LoadingState` | renders Mantine `<Loader>` centered; renders caption when given | `caption?: string` | `<Center h="50vh">` equivalent via flex |
| 20 | `PageFormLayout` | renders children inside narrow centered Paper; applies `--page-form-max-w` | `children: ReactNode`, `title?: string` | flex center, `min-height: 100vh` (allowlisted — this primitive is allowed viewport math; update §4.3 allowlist accordingly) |

**Important: update §4.3 allowlist in the spec.** Task 20 introduces `PageFormLayout.module.css` as a fifth allowlisted file. Add it to the spec during Task 20's commit.

Each of Tasks 9–20 ends with a commit: `feat(page-framework): scaffold <PrimitiveName> primitive`.

---

### Task 21: Re-export all primitives from the barrel

**Files:**
- Modify: `src/components/page/primitives/index.ts`

**Step 1: Final barrel state.**

```typescript
export { PageContainer } from './PageContainer'
export type { PageContainerProps } from './PageContainer'
export { PageBody } from './PageBody'
export type { PageBodyProps } from './PageBody'
export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'
export { SectionHeading } from './SectionHeading'
export type { SectionHeadingProps } from './SectionHeading'
export { StatCard } from './StatCard'
export type { StatCardProps } from './StatCard'
export { ListCard } from './ListCard'
export type { ListCardProps } from './ListCard'
export { ActionCard } from './ActionCard'
export type { ActionCardProps } from './ActionCard'
export { HeroCard } from './HeroCard'
export type { HeroCardProps } from './HeroCard'
export { SettingsCard } from './SettingsCard'
export type { SettingsCardProps } from './SettingsCard'
export { StatusPill } from './StatusPill'
export type { StatusPillProps } from './StatusPill'
export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'
export { LoadingState } from './LoadingState'
export type { LoadingStateProps } from './LoadingState'
export { PageFormLayout } from './PageFormLayout'
export type { PageFormLayoutProps } from './PageFormLayout'
```

**Step 2: Verify the barrel type-checks.**
```bash
bun run tsc -b --noEmit
```

**Step 3: Commit.**
```bash
git add src/components/page/primitives/index.ts
git commit -m "feat(page-framework): complete primitive barrel exports"
```

---

### Task 22: Write the seam contract runtime warning helper

**Files:**
- Create: `src/components/page/primitives/useSeamContract.ts`
- Create: `src/__tests__/page-primitives/useSeamContract.test.tsx`
- Modify: `src/components/page/primitives/PageBody.tsx` (use the hook)

**Step 1: Write the failing test.** Cover both warning conditions: missing `PageContainer fit` ancestor; nested `PageBody`.

```tsx
// src/__tests__/page-primitives/useSeamContract.test.tsx
import { render } from '@testing-library/react'
import { PageContainer, PageBody } from '@/components/page/primitives'
import { vi } from 'vitest'

describe('seam contract runtime warning', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('warns when PageBody fit is used without PageContainer fit ancestor', () => {
    render(<PageBody variant="fit">x</PageBody>)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('variant="fit" requires <PageContainer fit>')
    )
  })

  it('warns when PageBody is nested inside another PageBody', () => {
    render(
      <PageContainer fit>
        <PageBody variant="fit">
          <PageBody variant="auto">x</PageBody>
        </PageBody>
      </PageContainer>
    )
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('PageBody cannot be nested')
    )
  })

  it('does not warn in valid composition', () => {
    render(<PageContainer fit><PageBody variant="fit">x</PageBody></PageContainer>)
    expect(console.error).not.toHaveBeenCalled()
  })
})
```

**Step 2: Implement the hook.**

```typescript
// src/components/page/primitives/useSeamContract.ts
import { useEffect, useRef } from 'react'

const PAGE_CONTAINER_FIT_MARKER = 'data-page-container-fit'
const PAGE_BODY_MARKER = 'data-page-body'

export function useSeamContract(variant: 'auto' | 'fit', ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const el = ref.current
    if (!el) return

    // Rule 1: variant="fit" requires a PageContainer fit ancestor.
    if (variant === 'fit') {
      const hasFitParent = !!el.closest(`[${PAGE_CONTAINER_FIT_MARKER}="true"]`)
      if (!hasFitParent) {
        console.error(
          '[PageBody] variant="fit" requires <PageContainer fit> ancestor. ' +
          'Wrap the surface in <PageContainer fit> to use fit mode.'
        )
      }
    }

    // Rule 2: no nested PageBody.
    const parent = el.parentElement?.closest(`[${PAGE_BODY_MARKER}="true"]`)
    if (parent) {
      console.error(
        '[PageBody] PageBody cannot be nested inside another PageBody. ' +
        'Compose variants side-by-side, not nested.'
      )
    }
  }, [variant, ref])
}
```

**Step 3: Wire into PageBody.tsx.**

Add `data-page-body="true"` attribute on root. Call `useSeamContract(variant, rootRef)` in the component body. Update `PageContainer.tsx` to add `data-page-container-fit="true"` when `fit` prop is set.

**Step 4: Run tests.**
```bash
bun run test -- useSeamContract
```
Expected: PASS (3 tests).

**Step 5: Commit.**
```bash
git add src/components/page/primitives/useSeamContract.ts \
        src/components/page/primitives/PageBody.tsx \
        src/components/page/primitives/PageContainer.tsx \
        src/__tests__/page-primitives/useSeamContract.test.tsx
git commit -m "feat(page-framework): seam contract runtime warning"
```

---

### Tasks 23–34: Cleanup + reserve

Tasks 23–34 are a reserve buffer for primitive-specific test iterations surfacing during Tasks 9–22 (e.g., Mantine `Loader` mocking for `LoadingState`, Mantine `Paper` wrapping in `PageFormLayout`). If Tasks 7–22 land cleanly, these are no-ops and we jump to Task 35. If issues surface, consume them linearly without renumbering downstream tasks.

---

## Group C — CI lint rule

### Task 35: Create the viewport-math scanner script

**Files:**
- Create: `scripts/check-viewport-math.sh`

**Step 1: Write the script.**

```bash
#!/usr/bin/env bash
# scripts/check-viewport-math.sh
# Enforces the page framework seam contract: viewport-height units live only
# in allowlisted files. See docs/plans/2026-04-24-page-framework-design.md §4.3.
set -euo pipefail

ALLOWLIST=(
  "src/components/page/primitives/PageContainer.module.css"
  "src/components/page/primitives/PageBody.module.css"
  "src/components/page/primitives/PageFormLayout.module.css"
  "src/components/MobileLayout.module.css"
  "src/components/Layout.module.css"
)

PATTERN='(min-height|height|max-height):[[:space:]]*100(dvh|vh|svh|lvh)'
SEARCH_PATHS=(
  "src/components/exercises"
  "src/components"
  "src/pages"
)

violations=0

for path in "${SEARCH_PATHS[@]}"; do
  while IFS= read -r -d '' file; do
    # Allowlist check
    for allowed in "${ALLOWLIST[@]}"; do
      if [[ "$file" == "$allowed" ]]; then
        continue 2
      fi
    done

    # Scan, excluding lines with # skip-check:
    if grep -E "$PATTERN" "$file" | grep -v "# skip-check:" > /dev/null; then
      echo "✗ viewport-math violation in $file:"
      grep -nE "$PATTERN" "$file" | grep -v "# skip-check:" | sed 's/^/    /'
      violations=$((violations + 1))
    fi
  done < <(find "$path" -type f \( -name "*.css" -o -name "*.module.css" \) -print0)
done

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "✗ $violations file(s) violate the seam contract."
  echo "  Viewport-height math belongs only in PageContainer/PageBody/PageFormLayout."
  echo "  Wrap the surface in <PageBody variant='fit'> or add # skip-check: <reason>."
  exit 1
fi

echo "✓ Viewport-math seam contract clean."
```

**Step 2: Make executable.**
```bash
chmod +x scripts/check-viewport-math.sh
```

**Step 3: Run against current state.**
```bash
bash scripts/check-viewport-math.sh
```
Expected: `✓ Viewport-math seam contract clean.` (all current violators are now on the allowlist after Tasks 3–5).

**Step 4: Commit.**
```bash
git add scripts/check-viewport-math.sh
git commit -m "feat(page-framework): viewport-math scanner for seam contract enforcement"
```

---

### Task 36: Add ESLint rule for inline viewport styles

**Files:**
- Modify: `eslint.config.js`

**Step 1: Locate the rules section.** Read the current config first — flat config shape is `export default [...]`.

**Step 2: Add the `no-restricted-syntax` rule entry.** Add to the main rules block (likely inside a react config object):

```javascript
'no-restricted-syntax': ['error',
  {
    selector: "Property[key.name=/^(min|max)?Height$/] > Literal[value=/100(dvh|vh|svh|lvh)/]",
    message: "Viewport-height math belongs in PageBody/PageContainer/PageFormLayout only. Wrap the surface in <PageBody variant='fit'>, or see docs/plans/2026-04-24-page-framework-design.md §4.3 for allowlist rules.",
  },
],
```

**Step 3: Run lint against current state.**
```bash
bun run lint
```
Expected: **failures on `Login.tsx:34` and `Register.tsx:40`** — these have inline `minHeight: '100vh'` that will migrate in Phase 6. Add eslint-disable comments scoped to those two lines:

```tsx
// Login.tsx:34 and Register.tsx:40
// eslint-disable-next-line no-restricted-syntax -- TODO(page-framework Phase 6): migrate to <PageFormLayout>
<Container size="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
```

**Step 4: Re-run lint.**
```bash
bun run lint
```
Expected: passes (warnings OK, no errors).

**Step 5: Commit.**
```bash
git add eslint.config.js src/pages/Login.tsx src/pages/Register.tsx
git commit -m "feat(page-framework): ESLint rule blocking inline viewport-height styles"
```

---

### Task 37: Wire scanner into pre-commit

**Files:**
- Modify: `.husky/pre-commit`

**Step 1: Add the scanner step after the existing lint step.**

```bash
#!/bin/sh
echo "Running pre-commit checks..."

echo "→ Type checking..."
bun run tsc -b --noEmit
if [ $? -ne 0 ]; then
  echo "✗ TypeScript errors found. Fix them before committing."
  exit 1
fi

echo "→ Linting..."
bun run lint
if [ $? -ne 0 ]; then
  echo "✗ Lint errors found. Fix them before committing."
  exit 1
fi

echo "→ Viewport-math seam contract..."
bash scripts/check-viewport-math.sh
if [ $? -ne 0 ]; then
  echo "✗ Seam contract violation. See output above."
  exit 1
fi

echo "✓ Pre-commit checks passed."

# homelab-platform: destructive operation guard
_evals_dir="$(git rev-parse --show-toplevel)/evals"
if [ -f "$_evals_dir/destructive-op-check.sh" ]; then
  bash "$_evals_dir/destructive-op-check.sh" || exit 1
fi
```

**Step 2: Test the hook manually.**
```bash
git commit --allow-empty -m "test: pre-commit hook"
```
Expected: all three checks pass. Drop the commit:
```bash
git reset HEAD~1
```

**Step 3: Commit for real.**
```bash
git add .husky/pre-commit
git commit -m "chore(page-framework): wire viewport-math scanner into pre-commit"
```

---

### Task 38: Wire scanner into CI

**Files:**
- Modify: the GitHub Actions CI workflow file (likely `.github/workflows/ci.yml` or similar — inspect first)

**Step 1: Find the CI workflow.**
```bash
ls .github/workflows/
```

**Step 2: Add a step before or inside the existing lint job.** Example:

```yaml
- name: Seam contract — viewport-math scan
  run: bash scripts/check-viewport-math.sh
```

**Step 3: Commit.**
```bash
git add .github/workflows/<file>
git commit -m "ci(page-framework): run viewport-math scanner in CI"
```

---

### Task 39: Document the allowlist in the spec

**Files:**
- Modify: `docs/plans/2026-04-24-page-framework-design.md` (§4.3)

**Step 1: Verify the allowlist in the spec matches the script.** Script allowlist must include `PageFormLayout.module.css`. Spec currently lists 4 entries; bump to 5 citing Task 20 decision.

**Step 2: Commit (only if the spec needed updating).**
```bash
git add docs/plans/2026-04-24-page-framework-design.md
git commit -m "docs(page-framework): record PageFormLayout in seam contract allowlist"
```

---

### Task 40: Verify the full lint green on main

**Files:** none.

**Step 1: Clean build.**
```bash
bun run tsc -b --noEmit && bun run lint && bash scripts/check-viewport-math.sh && bun run test
```
Expected: all green. **447 tests still passing** + any new primitive tests (should be ~13 × 3 = ~39 new tests minimum).

No commit — gate only. If this fails, fix before Group D.

---

## Group D — `/admin/page-lab` route

### Task 41: Scaffold the page-lab route

**Files:**
- Create: `src/pages/admin/PageLab.tsx`
- Create: `src/pages/admin/PageLab.module.css`
- Modify: `src/App.tsx` (add the route under the admin guard)

**Step 1: Mirror the DesignLab shape.** Read `src/pages/admin/DesignLab.tsx` to match the pattern: `AdminGuard` wrapping, section layout with anchor nav, lazy load.

**Step 2: Scaffold the PageLab component with an empty section list.** Each primitive gets a section; the section renders the primitive in isolation with 2–3 prop variations.

```tsx
// src/pages/admin/PageLab.tsx
import { PageContainer, PageHeader, SectionHeading /* ... */ } from '@/components/page/primitives'
import classes from './PageLab.module.css'

export function PageLab() {
  return (
    <PageContainer size="lg">
      <PageHeader title="Page Lab" subtitle="Every page primitive in isolation + composition" />

      <SectionHeading>PageContainer</SectionHeading>
      <div className={classes.demo}>
        {/* Render sizes side-by-side */}
      </div>

      {/* … one section per primitive, then composition demos */}
    </PageContainer>
  )
}
```

**Step 3: Add the route in `App.tsx`.** Import and wire under `<AdminGuard>`:

```tsx
<Route path="/admin/page-lab" element={<AdminGuard><PageLab /></AdminGuard>} />
```

**Step 4: Commit.**
```bash
git add src/pages/admin/PageLab.tsx src/pages/admin/PageLab.module.css src/App.tsx
git commit -m "feat(page-framework): scaffold /admin/page-lab route"
```

---

### Task 42: Render each primitive in isolation

**Files:**
- Modify: `src/pages/admin/PageLab.tsx`

For each of the 13 primitives, add a `<section>` showing 2–3 prop variations with sample content. Example for `ListCard`:

```tsx
<SectionHeading>ListCard</SectionHeading>
<div className={classes.demo}>
  <ListCard icon={<IconBook size={18} />} title="Les 1: Selamat pagi" subtitle="20 nieuwe woorden" to="/lessons/1" />
  <ListCard icon={<IconHeadphones size={18} />} title="Podcast #3" />
  <ListCard icon={<IconChartBar />} title="Voortgang" trailing={<StatusPill tone="success">100%</StatusPill>} />
</div>
```

Commit once after all 13 primitives are rendered.
```bash
git commit -m "feat(page-framework): render all 13 primitives in page-lab isolation"
```

---

### Task 43: Add composition demos

**Files:**
- Modify: `src/pages/admin/PageLab.tsx`

Add 3 composition blocks demonstrating realistic page shapes:

1. **List page (Lessons-shaped)** — `PageContainer` + `PageHeader` + `ListCard` stack.
2. **Dashboard-shaped** — `PageContainer` + `PageHeader` + `StatCard` grid + `SectionHeading` + `ActionCard` list + `HeroCard`.
3. **Settings-shaped** — `PageContainer size="sm"` + `PageHeader` + 3× `SettingsCard` with form controls.

Commit: `feat(page-framework): composition demos in page-lab`.

---

### Task 44: Seam contract smoke test

**Files:**
- Modify: `src/pages/admin/PageLab.tsx`

Add a dedicated section at the bottom wrapping mock Session content:

```tsx
<SectionHeading>Seam contract — mock Session (iPhone 390×844)</SectionHeading>
<div className={classes.phoneFrame}>
  <PageContainer fit>
    <PageHeader title="Oefening 1 van 16" />
    <PageBody variant="fit">
      {/* Placeholder MCQ-shaped element */}
      <div className={classes.mockPromptCard}>enam</div>
      <div className={classes.mockOptionGroup}>
        <button>zestig</button>
        <button>2.000</button>
        <button>vijftig</button>
        <button>6</button>
      </div>
    </PageBody>
    <button className={classes.mockStickyFooter}>Check</button>
  </PageContainer>
</div>
```

`.phoneFrame` sets `width: 390px; height: 844px; border: 1px solid var(--border); overflow: hidden`. Proves `PageContainer fit` + `PageBody variant="fit"` gives correct height behavior before Phase 5 touches Session.tsx.

Commit: `feat(page-framework): seam contract smoke test in page-lab`.

---

### Task 45: Update CLAUDE.md link reference

**Files:**
- Modify: `CLAUDE.md`

Add a line under "## Content Management" or near the existing DesignLab reference noting the new route exists for page primitive review.

Commit: `docs: reference /admin/page-lab in CLAUDE.md`.

---

## Group E — Verification

### Task 46: Full gate before Phase 1

**Files:** none modified.

**Step 1: Full green run.**
```bash
bun run tsc -b --noEmit
bun run lint
bun run test
bash scripts/check-viewport-math.sh
```
All four must pass.

**Step 2: Visual smoke test.**

Start dev server, log in as admin, navigate to `/admin/page-lab`.

- All 13 primitives render without layout crash.
- Composition demos look structurally reasonable (final visual polish comes in visual iteration, not Phase 0).
- Seam contract smoke test shows mock Session content fitting the 390×844 phone frame with sticky footer at the bottom — proves the contract works structurally.

**Step 3: Mobile viewport spot-check** via browser devtools or real device.

**Step 4: Baseline screenshots for migration phases.**

Capture the pre-migration 36-baseline screenshot set enumerated in spec §8. Store in `docs/plans/page-framework-screenshots/baseline/`. This is the "before" for visual regression in Phases 1–8.

**Step 5: Final commit + push.**
```bash
git commit --allow-empty -m "feat(page-framework): Phase 0 complete — infrastructure + page-lab + seam contract"
git push origin <branch>
```

**Phase 0 done.** Stop here. Do not proceed to Phase 1 from this plan.

---

## Phases 1–9 — Milestones only

Each phase below is re-planned in a fresh implementation plan at the time it's next. The milestones and acceptance criteria below are load-bearing contracts — any phase plan must honor them.

### Phase 1 — Lessons.tsx migration
- Replace `<Container size="lg" className={classes.lessons}>` + `.header + .displaySm` with `<PageContainer size="lg"><PageHeader title={T.nav.lessons} />`.
- Replace `lessonCard` stack with `<ListCard>`.
- Delete `src/pages/Lessons.module.css`.
- Visual parity screenshots at 4× matrix (mobile-light, mobile-dark, desktop-light, desktop-dark). Commit to `docs/plans/page-framework-screenshots/phase-1/`.
- Gate: CI green, visual parity accepted by user.

### Phase 2 — Leaderboard.tsx migration
- Same outer replacement as Phase 1.
- `<EmptyState>` replaces the "noEntries" block.
- `<LoadingState>` replaces `<Center h="50vh"><Loader /></Center>`.
- Delete `src/pages/Leaderboard.module.css`.
- 4-screenshot capture.

### Phase 3 — Podcasts.tsx migration
- Same outer replacement. Card pattern review — may need to surface `ListCard` variations.
- Delete `src/pages/Podcasts.module.css`.
- 4-screenshot capture.

### Phase 4 — Dashboard.tsx migration
- Highest card density. Uses `StatCard` (4× ring scorecards), `ActionCard` (×2 with tones), `HeroCard` (gradient CTA), `SectionHeading`, `StatusPill`.
- Delete `src/pages/Dashboard.module.css`.
- 4-screenshot capture. Extra scrutiny on the ring chart rendering.

### Phase 5 — Session.tsx migration (**seam contract in production**)
- `<PageContainer fit>` + `<PageBody variant="fit">` wrapping the exercise frame.
- `ExerciseFrame.module.css:.live` min-height rule becomes entirely unnecessary — delete the selector (NOT just `min-height: 0`; delete the class).
- Delete `src/pages/Session.module.css`.
- 4-screenshot capture. Verify no scroll on mobile viewport with 4-option MCQ.
- **This is the load-bearing phase for the seam contract.** If visual parity fails, do not proceed to Phase 6 until fixed.

### Phase 6 — Login.tsx + Register.tsx migration
- Replace outer shell with `<PageFormLayout>`.
- Delete the `eslint-disable` comments added in Task 36.
- No CSS files to delete (forms use inline + Mantine).
- 4-screenshot capture (×2 pages = 8 total).

### Phase 7 — Profile.tsx migration
- Replace 8× inline `Paper + Stack + Title` with `<SettingsCard>`.
- Delete the `paperProps` mobile/desktop branch (`Profile.tsx:197-205`).
- `<PageContainer size="sm">` outer.
- No CSS file (Profile has none today).
- 4-screenshot capture.

### Phase 8 — Lesson.tsx partial migration
- Outer chrome only: `<PageContainer size="lg">` + `<PageHeader>` for the lesson title row + `<SectionHeading>` for section subnav.
- Domain primitives (`dialogueLine`, `phraseRow`, `spellingChip`, `sentenceRow`, `exerciseItem`, etc.) stay in `Lesson.module.css` untouched.
- Delete only the outer chrome rules from `Lesson.module.css` — not the whole file.
- 4-screenshot capture.

### Phase 9 — Cleanup
- Delete `.section-label` global class from `src/index.css` (was wrapped by `<SectionHeading>`).
- Delete `.live` selector + any other dead selectors from `src/components/exercises/primitives/ExerciseFrame.module.css` (yesterday's workaround is no longer needed once Session uses `PageBody variant="fit"`).
- Verify `bun run test`, lint, scanner all green.
- Close the implementation by updating the spec's "Section 7 — Final primitive signatures" addendum with the final prop/CSS state captured through visual iteration.

---

## Testing strategy

- **Primitive unit tests** live in `src/__tests__/page-primitives/`. Match the pattern established in `src/__tests__/` (RTL + vitest, no colocation).
- **Seam contract runtime warning tests** cover three cases (missing fit parent, nested PageBody, valid composition). Tasked out in Task 22.
- **CI lint rule tests** — implicit. The scanner script runs against the repo on every pre-commit + CI run. The test is "did it catch the bug we intended."
- **Visual regression** — manual 4-screenshot capture per migrated page. Documented in spec §8.
- **Integration** — existing 447 tests keep passing. No regression permitted in Phase 0.

---

## Rollback strategy

Phase 0 is reversible commit-by-commit via `git revert`. Token additions to `main.tsx` are additive (no existing token renamed except `--sidebar-width: 220 → 230` in Task 2). If any Task 1–46 step fails CI and can't be fixed in <30 minutes, revert the commit and investigate before re-attempting.

Phases 1–9: each phase is its own PR. Reverting a migration PR returns the page to its pre-migration CSS module. The primitive library stays in place; the consumer just stops using it.

---

## Done definition (Phase 0)

- All 13 primitives scaffolded, tested, exported from barrel.
- `/admin/page-lab` renders every primitive in isolation + 3 composition demos + seam contract smoke test.
- `scripts/check-viewport-math.sh` runs green; wired into pre-commit and CI.
- ESLint `no-restricted-syntax` rule active; `Login.tsx` / `Register.tsx` carry scoped disable comments with Phase 6 TODO.
- `Layout.tsx` viewport-height math moved to `Layout.module.css`; sidebar padding tokenized.
- `MobileLayout.module.css` consumes chrome tokens.
- 447 baseline tests still pass; new primitive tests added (~39 minimum).
- 36 baseline screenshots captured for phase 1–8 diff reference.
- Spec allowlist (§4.3) updated to include `PageFormLayout.module.css`.

When this is all true: Phase 0 is done. Brainstorm Phase 1 as a fresh plan.
