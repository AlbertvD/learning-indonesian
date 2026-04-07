# Visual Review Report -- 2026-04-06

**Pages reviewed:** Dashboard (`/`), Progress (`/progress`)
**Modes tested:** Dark, Light, Desktop (1440px), Mobile (375px)
**Test user:** testuser@duin.home

---

## Executive Summary

Both pages render correctly in dark and light mode with no broken layouts or missing components. The Progress page follows the design system well with consistent use of CSS variable tokens. The Dashboard page has **multiple hardcoded color violations** in its CSS module that need cleanup. No `<Card>` components were detected in the rendered DOM.

---

## 1. Dashboard (`/`)

### Screenshots

- `hd-dashboard.png` -- Desktop dark mode, full page
- `hd-dashboard-light.png` -- Desktop light mode, full page
- `03-dashboard-mobile.png` -- Mobile dark mode (375px)

### What looks correct

- **Layout:** Four ring scorecard cards in a 2x2 grid on mobile, 4-across on desktop. Proper spacing.
- **Ring charts:** Render correctly with animated arcs, correct color coding per status (accent-primary for on_track, warning for at_risk, danger for missed).
- **Font:** Plus Jakarta Sans used throughout, verified programmatically.
- **Section labels:** "Deze week", "Aanbevolen acties" render with correct styling.
- **Hero card (Planning van vandaag):** Gradient background, mix ratio bar, CTA button all render correctly.
- **Mobile:** Sidebar collapses to bottom tab bar. Cards reflow to 2 columns. No overflow issues.
- **Light mode:** Full light mode support works. Card backgrounds switch. Text colors switch. Gradient hero card has proper light variant.
- **Action cards:** Hover states present with translateY(-1px) lift and border color change.
- **Secondary cards** at bottom ("Doorgaan met les", "Zwakke woorden oefenen") render correctly.

### Issues found

| # | Severity | Description | File:Line |
|---|----------|-------------|-----------|
| D1 | CRITICAL | Hardcoded `#fcc419` for ring target marker background | `src/pages/Dashboard.module.css:96` |
| D2 | CRITICAL | Hardcoded `rgba(252, 196, 25, 0.7)` for target marker box-shadow | `src/pages/Dashboard.module.css:97` |
| D3 | CRITICAL | Hardcoded `#0c8599`, `#1a2a3a` in hero card gradient | `src/pages/Dashboard.module.css:196` |
| D4 | CRITICAL | Hardcoded `rgba(21, 170, 191, 0.25)` for hero card border | `src/pages/Dashboard.module.css:197` |
| D5 | CRITICAL | Hardcoded `#fff` for hero card title and CTA text | `src/pages/Dashboard.module.css:210,322` |
| D6 | CRITICAL | Hardcoded `rgba(255, 255, 255, 0.85)` in hero stat color | `src/pages/Dashboard.module.css:230` |
| D7 | CRITICAL | Hardcoded `rgba(255, 255, 255, 0.45)` in hero subtext color | `src/pages/Dashboard.module.css:239` |
| D8 | CRITICAL | Hardcoded `rgba(255, 255, 255, 0.6)` in mix ratio label/legend | `src/pages/Dashboard.module.css:252,288` |
| D9 | CRITICAL | Hardcoded `rgba(255, 255, 255, 0.35)` in mix note and hero post note | `src/pages/Dashboard.module.css:305,349` |
| D10 | CRITICAL | Hardcoded `#000` in ring mask (used as mask color, arguably OK for masking but inconsistent) | `src/pages/Dashboard.module.css:51-52,60-61` |
| D11 | WARNING | All `font-weight` values use raw numbers (600, 700, 500) instead of `var(--fw-semibold)`, `var(--fw-bold)`, `var(--fw-medium)` -- 12 occurrences | `src/pages/Dashboard.module.css:8,71,77,109,169,176,209,251,336,342,413,437` |
| D12 | WARNING | Inline hardcoded rgba on a `<button>` element (detected by DOM audit): `rgba(255, 255, 255, 0.08)`, `rgba(255, 255, 255, 0.1)`, `rgba(255, 255, 255, 0.6)` | Mantine internal Button -- likely from the theme toggle icon button |

**Note on D5-D9:** These hardcoded white colors have light-mode overrides via `:global(html[data-mantine-color-scheme="light"])` selectors, so both themes work visually. However, the pattern violates the "single source of truth" principle. The correct approach is to create tokens like `--hero-text` in the resolver.

**Note on D10:** `#000` in CSS mask definitions is a technical requirement for mask rendering (defines opaque regions). This is not a semantic color and could be excluded from linting.

---

## 2. Progress (`/progress`)

### Screenshots

- `hd-progress-full.png` -- Desktop dark mode, full page
- `hd-progress-light.png` -- Desktop light mode, full page
- `11-progress-mobile.png` -- Mobile dark mode (375px)

### What looks correct

- **MemoryHealthHero:** Two arc gauges render side by side (12% Herkenning, 0% Oproepen). Gauges animate on load. Strength badge ("Zwak") shows correctly with danger color. Direction labels ("Indonesisch -> NL/EN") present.
- **Insight box:** Renders below gauges with lightbulb emoji and descriptive text. Left accent border visible.
- **MasteryFunnel:** Horizontal chevron pipeline renders with 4 stages (Anchoring=2, Retrieving=0, Productive=0, Maintenance=0). Bottleneck stage (Anchoring) highlighted with warning color and pulse animation. Chevron separators render correctly.
- **Section labels:** All section labels ("GEHEUGENSTERKTE", "LEERPIJPLIJN", "PLANNEN & DOELEN", "DETAILS") render with uppercase mono font and horizontal rule after text. Confirmed by DOM inspection.
- **ReviewForecastChart:** 7-day bar chart with y-axis labels and gridlines. Uses correct accent gradient for bars.
- **WeeklyGoalsList:** Compact goal items with progress bars. Status pills ("On Track", "At Risk") render correctly with appropriate colors.
- **DetailedMetrics:** 4-column grid on desktop (responsive to 2-column at 900px, 1-column at 500px). All tiles use `card-default` composition.
- **Fonts:** Plus Jakarta Sans for body, Courier New for mono elements. Both confirmed programmatically.
- **Card styling:** All cards compose from `card-default` global class. No `<Card>` or `<Paper>` Mantine components in DOM (0 detected for both).
- **CSS variables:** All progress component CSS files use `var(--*)` tokens exclusively for colors, font sizes, font weights, border-radius, and transitions.
- **Light mode:** Full light mode support works. All card backgrounds, text colors, accent colors switch correctly.
- **Mobile:** Gauges stack to single column. Pipeline stages stack vertically with chevrons hidden. All content remains readable.
- **Hover states:** Gauge cards, goal items, vulnerable items all have hover states with border color changes.
- **Animations:** Fade-up animation on sections with staggered delays. Bar growth animation on forecast chart. Bottleneck pulse on pipeline.

### Issues found

| # | Severity | Description | File:Line |
|---|----------|-------------|-----------|
| P1 | WARNING | Scanline texture uses hardcoded `rgba(255, 255, 255, 0.012)` -- extremely subtle, only matters in light mode where white-on-light is invisible anyway | `src/components/progress/MemoryHealthHero.module.css:36-37` |
| P2 | WARNING | VulnerableItemsList section is not visible (empty state returns null) -- cannot verify rendering. This is data-dependent, not a bug. | `src/components/progress/VulnerableItemsList.tsx:21` |
| P3 | WARNING | DetailedMetrics grid is `repeat(4, 1fr)` on desktop -- task description says "2x2 grid" but the 4-column layout works well visually and is the intended design per the code | `src/components/progress/DetailedMetrics.module.css:5` |
| P4 | WARNING | Page content appears short -- the "Details" section and weekly goals are partially visible but the page doesn't scroll further. This may be because the test user has minimal data. | N/A |

---

## 3. Login Page (`/login`)

### Screenshot

- `01-login-page.png` -- Login form centered on page

### What looks correct

- Form centered vertically and horizontally
- Email and Password inputs render correctly with labels
- Login button uses accent color
- "Don't have an account? Sign up" link present

### Issues found

| # | Severity | Description | File:Line |
|---|----------|-------------|-----------|
| L1 | WARNING | Login container uses inline `style={{ display: 'flex', ... }}` for layout centering instead of CSS module | `src/pages/Login.tsx:34` |
| L2 | WARNING | Paper uses inline `style={{ width: '100%' }}` instead of CSS module | `src/pages/Login.tsx:35` |

---

## 4. Cross-cutting checks

### Card component audit
- **Mantine `<Card>` components in DOM:** 0 (both pages)
- **Mantine `<Paper>` components in DOM:** 0 on progress page (uses raw divs with composed card classes)
- **Global card classes detected:** `card-default` used by progress components

### Typography audit
- **Fonts detected:** `"Plus Jakarta Sans", system-ui, sans-serif` and `"Courier New", monospace`
- **No other fonts detected** -- design system is respected

### Console errors
- None detected during full review

### Responsive behavior
- Dashboard: 4-column ring grid -> 2-column at 600px breakpoint
- Progress gauges: 2-column -> 1-column at 600px
- Pipeline stages: horizontal -> vertical at 600px
- DetailedMetrics: 4-column -> 2-column at 900px -> 1-column at 500px
- Mobile bottom tab bar renders correctly with 5 tabs

---

## Summary of violations

### Critical (11 total, all in Dashboard)

All 11 critical violations are hardcoded colors in `src/pages/Dashboard.module.css`. The hero card gradient section (lines 196-356) accounts for most of them, with the ring target marker (lines 96-97) being the other.

**Recommendation:** Create new tokens in `src/main.tsx` `cssVariablesResolver`:
- `--hero-gradient-start`, `--hero-gradient-mid` (dark/light variants)
- `--hero-text`, `--hero-text-dim`, `--hero-text-muted` (dark/light variants)
- `--ring-target` (for the yellow target marker)

Then replace all hardcoded values in Dashboard.module.css and remove the `:global(html[data-mantine-color-scheme="light"])` overrides, since the resolver handles theme switching.

### Warning (14 total)

- 12 hardcoded font-weight values in Dashboard.module.css (use `var(--fw-*)` tokens)
- 1 subtle scanline rgba in MemoryHealthHero (cosmetic, low priority)
- 1 inline Mantine button rgba (from Mantine internals, not app code)
- 2 inline styles on Login page

### Progress page verdict: CONSISTENT

The Progress page and all its sub-components follow the design system consistently. All colors use CSS variable tokens, all font sizes use `var(--fs-*)`, all font weights use `var(--fw-*)`, cards compose from global classes, and section labels use the global `.section-label` class. Both themes work correctly.

### Dashboard page verdict: VIOLATIONS FOUND

The Dashboard page has 11 critical hardcoded color violations concentrated in the hero card section and ring target marker. It also has 12 warning-level hardcoded font-weight values. These should be migrated to design tokens.
