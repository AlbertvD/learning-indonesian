---
status: living
last_run: 2026-08-18
---

# Product facts — the numbers, their queries, and who quotes them

**Every number on a customer-facing surface comes from here.** No other doc and
no copy file should be the origin of a figure; they quote this one.

This file exists because of two failures, both real:

1. **"Verified" goes stale silently.** A doc saying *"verified 2026-08-16"* is a
   claim about someone's process. Nobody can re-check it without redoing the work
   from scratch, and an agent has no memory of having done it. **So this file
   records the QUERY, not the verdict** — paste it, get the current answer, see
   for yourself.
2. **Numbers scatter, and then only some of them get updated.** The free tier
   lived in four documents and three were wrong for weeks; "nobody serves this
   pair" lived in three places and was false in all of them. **So every row
   carries a "quoted by" column** — change a number, and that column is the list
   of files to fix.

## How to refresh

Run the block in § "The query" against the live cloud project (Supabase SQL
editor, or the `supabase` MCP `execute_sql`). Update the values, update
`last_run`, and then walk the **quoted by** column for anything that moved.

⚠️ These are CLOUD values. The homelab may differ; the cloud is what customers
see, so the cloud is what the copy must match.

## The numbers — run 2026-08-18

| Fact | Value | Quoted by |
|---|---|---|
| Loanwords (`loan_source_nl`) | **173** | landing `bridgeKicker`/`bridgeEdge`/`bridgeLink`, `door1Body`, `Landing.test.tsx`, `/leenwoorden`, positioning.md §2, index.html meta |
| Register pairs (informal + counterpart) | **66** | landing `pairNote`, `method7Body`, `Landing.test.tsx`, positioning.md §2 |
| `learning_items` total | **2,573** | positioning.md §1 |
| Single-word items | **1,926** | competitive-messaging.md §6 (the 95%-route rejection) |
| Lessons | **31** | — |
| Lessons with grammar audio | **30** | landing `method3Body`, `stackClose`, index.html meta ("30 lessen") |
| Texts total | **13** | landing `stackClose`, roadmap.md § NOW 2 |
| Texts with audio | **9** | landing `stackClose` |
| Texts by level | **A1=4, A2=5, B1=2, B2=1, unlevelled=1** | landing `stackClose` hedge, `method5Body` ("A1 tot B2"), roadmap.md § NOW 2, positioning.md §7 pending register |
| Culture sections | **18** | landing `method4Body` |
| Lessons containing culture | **17** | landing `method4Body` |
| `grammar_patterns` | **191** | positioning.md §1 |
| Free tier | **lesson 1** | landing `pricingBody`, CLAUDE.md, entitlementService.ts:41, migration.sql `is_free_tier_lesson`, index.html meta |
| Price | **€9 / €79** | landing `pricingBody`, pricing.md, `check-cloud-config.ts` `PRICING` |

⚠️ **The last two rows are enforced elsewhere and must not be edited here first.**
Free tier is asserted by HC55 (SQL function vs `FREE_TIER_MAX_LESSON`); price by
`make check-cloud-config`. Change the constant, not the prose.

## The query

```sql
select 'loanwords (loan_source_nl)' as fact, count(*)::text as value
  from indonesian.learning_items where loan_source_nl is not null
union all select 'register pairs (informal + counterpart)', count(*)::text
  from indonesian.learning_items where register='informal' and register_counterpart is not null
union all select 'learning_items total', count(*)::text from indonesian.learning_items
union all select 'single-word items', count(*)::text
  from indonesian.learning_items where normalized_text not like '% %'
union all select 'lessons', count(*)::text from indonesian.lessons
union all select 'lessons with grammar audio', count(*)::text
  from indonesian.lessons where audio_path is not null
union all select 'texts total', count(*)::text from indonesian.texts
union all select 'texts with audio', count(*)::text from indonesian.texts where audio_path is not null
union all select 'texts by level', string_agg(lv||'='||n, ', ' order by lv) from (
  select coalesce(level,'(none)') lv, count(*)::text n from indonesian.texts group by 1) t
union all select 'culture sections', count(*)::text
  from indonesian.lesson_sections where title ilike '%cultuur%'
union all select 'lessons containing culture', count(distinct lesson_id)::text
  from indonesian.lesson_sections where title ilike '%cultuur%'
union all select 'grammar_patterns', count(*)::text from indonesian.grammar_patterns;
```

## Facts that are NOT numbers, and how to check them

Counts are the easy case. These bit harder, and each is written as a check rather
than an assertion:

| Claim | How to check it |
|---|---|
| Culture lessons exist | `select title from indonesian.lesson_sections where title ilike '%cultuur%'` — ⚠️ they are `section_kind = 'text'`, NOT a `culture` kind. Querying `section_kind` finds nothing and produces a confidently wrong "we have no culture lessons", which is exactly what happened 2026-08-18 |
| Tapping a word while reading adds it to review | `src/pages/LezenReader.tsx` → `handleHarvest` → `harvestWord()`. If that call goes, the landing's `method5Body` and `how3Body` both become false |
| Production is capped at word/phrase | ADR 0014. Whole-sentence production was removed after an audit; copy may not say "sentence level" |
| Duolingo does not offer NL→ID | Read both catalogues on duolingo.com. Last checked 2026-08-05, positioning.md §1. ⚠️ Re-check before any campaign — they added ~148 AI-generated courses in 2025 |
| Others DO serve NL→ID | NHA, Teman Indonesia, Talendomein, 50languages — competitive-messaging.md §7, read 2026-08-18. The claim "nobody serves this pair" is FALSE and must stay retired |
| All audio is TTS | Standing product fact. No check needed; it will not change without a deliberate decision, and if it ever does, this row is where to record it |

## What this file must never become

A place to *decide* anything. It records what is true and how to re-check it.
Positioning lives in `positioning.md`, the copy rules in the `marketing` skill,
and what may not yet be claimed in `positioning.md` §7. If a number here makes a
claim tempting, that decision belongs in those files, not this one.
