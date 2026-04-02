# Card Styling Harmonization - Issue & Fix

## Problem Analysis

The task was to harmonize card colors across all pages using CSS variables `--card-bg` and `--card-border`. However, the implementation is **incomplete**:

### ❌ What's Missing

1. **CSS Variables not defined**: `--card-bg` and `--card-border` are **NOT** defined in `src/index.css`
2. **CSS modules not updated**: Card components still use hardcoded values:
   - `background: var(--bg-surface)` ✅ (correct reference, but should use `--card-bg`)
   - `border: 1px solid rgba(255,255,255,0.06)` ❌ (hardcoded, should use `--card-border`)

### Files that Need Updates

All `.module.css` files with card styles:
- ✅ `src/pages/Dashboard.module.css` - `.statCard`, `.continueCard`
- ✅ `src/pages/Lessons.module.css` - `.lessonCard`
- ✅ `src/pages/Podcasts.module.css` - Podcast cards
- ✅ `src/pages/Sets.module.css` - Card set items
- ✅ `src/pages/Lesson.module.css` - Lesson content cards (if any)

## Why It Doesn't Work

**Current CSS:**
```css
.statCard {
  background: var(--bg-surface);        /* ✅ Uses variable */
  border: 1px solid rgba(255,255,255,0.07);  /* ❌ Hardcoded! */
}
```

The **hardcoded border color** doesn't change when switching themes because:
- In dark mode: `rgba(255,255,255,0.07)` (light text at low opacity) is correct
- In light mode: `rgba(255,255,255,0.07)` is **invisible** on light backgrounds

## Solution

### Step 1: Add CSS Variables to `src/index.css`

In the `:root` section, add after the existing color tokens:

```css
/* Card styling (used by dashboard, lessons, podcasts, etc.) */
--card-bg:     var(--bg-surface);
--card-border: rgba(255,255,255,0.07);
```

In the `html[data-mantine-color-scheme="light"]` section, add:

```css
/* Card styling - light theme */
--card-bg:     var(--bg-surface);
--card-border: var(--border);
```

### Step 2: Update All Card CSS Modules

Replace hardcoded values with CSS variables in every `.module.css` file:

**Pattern to replace:**
```css
/* OLD */
.someCard {
  background: var(--bg-surface);
  border: 1px solid rgba(255,255,255,0.07);
}

/* NEW */
.someCard {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}
```

### Step 3: Test Theme Switching

1. Open http://localhost:5174 in browser
2. Toggle dark/light mode (usually a button in the UI)
3. Verify card background and borders update correctly
4. Specifically check:
   - Dashboard metric cards (purple and orange)
   - "Continue where you left off" card
   - Lesson list cards
   - Podcast list cards
   - Card set items

## Expected Results After Fix

✅ **Dark mode**: Cards have subtle light borders
✅ **Light mode**: Cards have visible dark borders
✅ **Both themes**: Consistent, readable card styling

## Implementation Checklist

- [ ] Add `--card-bg` and `--card-border` to `:root` in `src/index.css`
- [ ] Add light theme versions to `html[data-mantine-color-scheme="light"]` in `src/index.css`
- [ ] Update `.statCard`, `.statCardPurple`, `.statCardOrange` in `Dashboard.module.css`
- [ ] Update `.continueCard` in `Dashboard.module.css`
- [ ] Update `.lessonCard` in `Lessons.module.css`
- [ ] Update podcast cards in `Podcasts.module.css`
- [ ] Update set items in `Sets.module.css`
- [ ] Update any cards in `Lesson.module.css`
- [ ] Test in dark mode at localhost:5174
- [ ] Test in light mode
- [ ] Verify all card colors harmonize correctly

## Root Cause

The initial refactor extracted background colors into variables but **missed** the borders, leaving them as hardcoded rgba values. This works in dark mode by accident but completely breaks in light mode.
