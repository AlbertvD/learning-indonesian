# Design System - Learning Indonesian

## Card Color System

All card styling is centralized via CSS variables for consistency across pages and themes.

### Quick Reference

To change card colors **globally**, edit `src/index.css`:

```css
/* Dark theme */
:root {
  --card-bg: rgba(255,255,255,0.10);              /* ← Change here */
  --card-border: rgba(255,255,255,0.07);
  --card-hover-bg: var(--bg-hover);
  --card-hover-border: rgba(142, 85, 255, 0.3);
}

/* Light theme */
html[data-mantine-color-scheme="light"] {
  --card-bg: rgba(0,153,184,0.07);                /* ← Or here */
  --card-border: var(--border);
  --card-hover-bg: var(--bg-hover);
  --card-hover-border: var(--accent-primary);
}
```

### Pre-Commit Hook

A git pre-commit hook automatically enforces the `<Paper>` standard:

```bash
.git/worktrees/retention-v2/hooks/pre-commit
```

The hook will reject commits containing:
- ❌ `<Card>` components (use `<Paper>` instead)
- ❌ `<Box withBorder>` or `<Box className="card">` (use `<Paper>`)
- ❌ `<Container>` used as cards (use `<Paper>`)

**Example:** If you try to commit a page with `<Card>`:
```
❌ Pre-commit hook failed: Card component violations
  - src/pages/YourPage.tsx: Found <Card> - use <Paper> instead
```

To fix: Replace `<Card>` with `<Paper>` and try committing again.

## Template for New Pages

When creating a page with cards, use this pattern in `YourPage.module.css`:

```css
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--r-md);
  padding: var(--mantine-spacing-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.card:hover {
  border-color: var(--card-hover-border);
  background: var(--card-hover-bg);
  transform: translateY(-2px);
}
```

This automatically:
- ✅ Respects light/dark theme switching
- ✅ Uses centralized colors
- ✅ Provides consistent hover effects

### Pages Using This System

- Dashboard (metric cards, hero card, action cards)
- Progress (stat cards)
- Podcasts (list cards)
- Sets/Decks (list cards)

### CSS Variables Available

**Spacing:**
- `--mantine-spacing-md` — standard padding
- `--r-md` — border radius (medium)

**Colors:**
- `--card-bg` — card background
- `--card-border` — card border
- `--card-hover-bg` — background on hover
- `--card-hover-border` — border on hover
- `--bg-hover` — dark mode hover surface
- `--accent-primary` — brand color

**Text:**
- `--text-primary` — headlines
- `--text-secondary` — metadata, labels
