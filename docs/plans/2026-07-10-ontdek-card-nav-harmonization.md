---
status: shipped
implementation: PR #427
merged_at: 2026-07-10
implementation_paths:
  - src/components/page/primitives/ListCard.tsx
  - src/components/page/primitives/ListCard.module.css
  - src/pages/Podcasts.tsx
  - src/pages/Lezen.tsx
  - src/pages/GrammarPodcasts.tsx
  - src/pages/GrammarPodcasts.module.css
  - src/pages/Podcast.tsx
  - src/pages/LezenReader.tsx
supersedes: []
---

# Harmonize the Ontdek sub-menu cards + navigation

## Problem

The Ontdek hub landing (`src/pages/Ontdek.tsx`) reads well: three `ListCard feature`
launchers, per-surface tone, a `>` chevron, `SimpleGrid spacing="sm"` gaps. But the
three destinations it leads to are visually inconsistent with the hub and with each
other:

| Surface | Card today | Tone | Chevron | Card gaps | Goes deeper? |
|---|---|---|---|---|---|
| Podcasts (`Podcasts.tsx`) | `ListCard` | gold | ❌ | none (flush) | ✅ `/podcast/:id` |
| Verhalen lezen (`Lezen.tsx`) | `ListCard` | rail | ❌ | none (flush) | ✅ `/lezen/:id` |
| Grammatica podcasts (`GrammarPodcasts.tsx`) | raw `Paper` + inline `<audio>` | dim grey | ❌ | `Stack gap="sm"` | ❌ plays in place |

Two causes for the missing chevron: Podcasts/Verhalen pass a `trailing` (level badge +
duration) to `ListCard`, and `trailing` **replaces** the default chevron
(`ListCard.tsx:81`). Grammatica podcasts don't use `ListCard` at all.

Back-navigation is three different patterns:
- `Podcast.tsx:170` — grey Mantine `<Button>` in the `PageHeader` top-right `action` slot ("out of place").
- `LezenReader.tsx:80` — hand-rolled `<Anchor component={Link}>` + `IconArrowLeft`, top-left.
- The canonical shared primitive `BackLink` (`src/components/nav/BackLink.tsx`) — used by the trainers and `SurfaceNav`'s mobile back, but **not** by these two detail pages.

## Design decisions (locked with owner)

- The `>` chevron is an **honest** affordance: it means "opens a detail page." Podcasts
  and Verhalen keep it; **Grammatica podcasts do NOT get one** — they play inline (one tap),
  and adding a navigation step "for the sake of it" was explicitly rejected. Grammatica
  gets harmonized card *chrome* only.
- Per-surface tone is preserved and matches the hub card that leads there: Podcasts = `gold`,
  Verhalen = `rail`, Grammatica = `teal`.
- Cards stay **compact** (`ListCard` non-`feature`); these lists can be long. Harmony comes
  from tone + spacing + chevron + consistent chrome, not from the roomy `feature` variant.
- Work entirely within the page-framework primitives + design tokens. Exactly one additive,
  non-breaking primitive extension; no new shared primitive.

## Change 1 — `ListCard` gains an additive `meta` slot

`meta` renders in the trailing zone **before** the chevron, so a navigational row can carry
a badge/duration *and* keep its go-deeper chevron. `trailing` keeps its exact current
"full override" semantics (used by `Dashboard.tsx` `<></>` suppressor, admin `PageLab`
`StatusPill`s, and tests — all unchanged). Verified: no existing caller passes `meta`.

`src/components/page/primitives/ListCard.tsx`:
- Add to `ListCardProps`:
  ```ts
  /**
   * Metadata (level badge, duration, count) rendered in the trailing zone
   * BEFORE the go-deeper chevron. Unlike `trailing` (which replaces the
   * chevron), `meta` coexists with it — use on navigational rows that also
   * carry a badge.
   */
  meta?: ReactNode
  ```
- Add `meta` to the destructured params.
- Replace the trailing block:
  ```tsx
  <div className={cx(classes.trailing)}>
    {trailing ?? (
      <>
        {meta && <span className={cx(classes.meta)}>{meta}</span>}
        <IconChevronRight size={16} />
      </>
    )}
  </div>
  ```
  (When `trailing` is undefined and `meta` is undefined, behaviour is unchanged: chevron only.)

`src/components/page/primitives/ListCard.module.css`:
- Add `gap: 10px;` to `.trailing` (harmless when it has one child).
- Add `.meta { display: flex; align-items: center; gap: 8px; }`.

## Change 2 — the three list surfaces

Shared shape for all three: `<OntdekNav/>` → `<PageHeader title subtitle/>` →
`<SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">` wrapping the cards (matching the hub's
exact wrapper). Keep the `EmptyState` branch outside the grid.

**`src/pages/Podcasts.tsx`**
- Wrap the `.map()` output in `<SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">`.
- Rename `trailing={( <Group>…badge…duration… </Group> )}` → `meta={( … same … )}` so the chevron returns.
- Add subtitle to `PageHeader`: `subtitle={T.ontdek.podcastsDesc}` (keep `title={T.nav.podcasts}`).

**`src/pages/Lezen.tsx`**
- Wrap the `.map()` output in `<SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">`.
- Rename `trailing={story.level ? <Badge…/> : undefined}` → `meta={…}` so the chevron returns.
- Add subtitle to `PageHeader`: `subtitle={T.ontdek.readerDesc}` (keep `title={T.reading.title}`).

**`src/pages/GrammarPodcasts.tsx`** (keep the inline player; re-chrome to the card family)
- Replace `<Stack gap="sm">` with `<SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">`.
- Replace `<Paper withBorder radius="md" p="sm">` with a token-matched card container from a
  new local module `GrammarPodcasts.module.css` (see below). No `to`, no chevron.
- Give the leading `"07"` number a **teal medallion** matching `ListCard`'s `teal` tone
  (`ListCard.module.css:72`): a 36×36 rounded square, `background: var(--teal-subtle); color: var(--teal);`.
- Keep `<audio … data-testid="grammar-podcast-player">` full-width below the header row.

New `src/pages/GrammarPodcasts.module.css` (~15 lines, tokens only — mirrors `ListCard` chrome):
```css
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--r-md);
  padding: 14px 16px;
}
.head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 10px; }
.medallion {
  width: 36px; height: 36px; border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background-color: var(--teal-subtle); color: var(--teal);
  font-weight: var(--fw-semibold);
}
.player { width: 100%; display: block; }
```
(If any token name differs in `main.tsx`, use the value `ListCard.module.css` already uses for
`teal` / card chrome — those are the source of truth.)

## Change 3 — unify back-navigation on `BackLink`

**`src/pages/Podcast.tsx`**
- Remove the `<Button …>{T.podcast.backToList}</Button>` from `PageHeader`'s `action` prop
  (drop the `action` prop entirely; drop the now-unused `Button` / `IconChevronLeft` /
  `useNavigate` imports if nothing else uses them — verify first).
- Render `<BackLink to="/podcasts" label={T.podcast.backToList} />` immediately inside
  `<PageBody>`, above `<PageHeader>`.

**`src/pages/LezenReader.tsx`**
- Replace the `<Group mb="sm"><Anchor component={Link} to="/lezen">…</Anchor></Group>` block
  with `<BackLink to="/lezen" label={T.reading.backToList} />` (drop the now-unused
  `Anchor` / `Group` / `Link` / `IconArrowLeft` imports if unused elsewhere — verify).

Grammatica has no detail page; `OntdekNav` already provides its back/switch. No change.

## Tests

- `src/__tests__/page-primitives/ListCard.test.tsx`: add a case — when `meta` and `to` are
  passed, both the meta node **and** the chevron render; existing `trailing`-override case unchanged.
- Keep `data-testid="grammar-podcast-player"` so `src/__tests__/GrammarPodcasts.test.tsx` still passes;
  update any markup assertions in that test to the new container if needed.
- `bun run lint` + `bun run test` green.

## Supabase Requirements

N/A — pure front-end presentation change. No schema, RLS, grants, homelab-config, or health-check changes.

## Files

1. `src/components/page/primitives/ListCard.tsx` — add `meta` prop + render.
2. `src/components/page/primitives/ListCard.module.css` — `.trailing` gap + `.meta`.
3. `src/pages/Podcasts.tsx` — SimpleGrid + `trailing`→`meta` + subtitle.
4. `src/pages/Lezen.tsx` — SimpleGrid + `trailing`→`meta` + subtitle.
5. `src/pages/GrammarPodcasts.tsx` (+ new `GrammarPodcasts.module.css`) — card-family chrome, keep inline player.
6. `src/pages/Podcast.tsx` — `BackLink` above header, drop header-action button.
7. `src/pages/LezenReader.tsx` — `BackLink` primitive.
8. `src/__tests__/page-primitives/ListCard.test.tsx` — `meta` + chevron coexistence test.
