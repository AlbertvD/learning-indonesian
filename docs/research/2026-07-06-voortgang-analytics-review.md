# Voortgang analytics review — more beautiful, more insightful

> Review date 2026-07-06. Companion to `docs/research/2026-07-06-grammar-teaching-review.md` (same session). Behavioural claims cite code; ideas are ideas and say so. Module context: `docs/current-system/modules/analytics.md` (+ mastery/engagement sub-specs).

## 1. What Voortgang shows today (verified)

`src/pages/Progress.tsx:23-107` — five URL-addressable tabs:

| Tab | Content |
|---|---|
| **Woorden** | `MasteryFunnelPanel` (ladder funnel, per-lesson scoping) + `StubbornWordsCard` footer + `GrowthCurveCard` (funnel-over-time) |
| **Grammatica** | funnel + per-lesson `GrammarPatternList` (3 chips/pattern: Herkennen·Onderscheiden·Produceren) + growth curve |
| **Morfologie** | funnel + growth curve |
| **Vaardigheden** | `SkillModeGapsCard` (recognise/produce/listen gaps, per-word sizes) |
| **Tijd** | `TimeComparisonCard` (week/month) + `DurabilityCard` (avg FSRS stability over time, `get_stability_series`) |

Design language: consistent card primitives, pill-segmented tabs, animated view switches, per-tab funnel+growth pairing (the former Groei tab was folded into each bucket — good decision, `Progress.tsx:62-64`). Underneath: a clean two-axis read-model (engagement + mastery), event-driven series RPCs, canonical mastered/at-risk predicates.

**Honest overall grade: structurally excellent, emotionally flat.** Everything on the page is a *distribution* (funnel buckets, gaps, time totals). Distributions inform; they don't move anyone. The page answers "where is my knowledge?" but never the two questions learners actually feel: **"how far have I come?"** and **"what can I *do* with it now?"**

## 2. The core insight opportunity — data the app has but never shows

The single biggest unexploited asset: **the coverage machinery** (`lib/reading/coverage.ts` — `computeCoverage`, per-learner coverage RPC, built for reader ordering) plus `frequency_rank` on items. Together they can compute the one number no learner can resist:

> **"Je begrijpt nu ~68% van alledaags Indonesisch."**

Known-word set ∩ frequency distribution → estimated text coverage. It's the same math the reader already runs per-story, aggregated once against the frequency corpus. This is *the* headline stat — it converts abstract FSRS counts into felt ability, it moves visibly week over week (coverage grows fast in the early frequency bands), and it doubles as marketing copy learners quote to friends.

## 3. Ideas, ranked

### I1 ⭐ — "Jouw Indonesisch" hero strip (before the tabs)
One always-visible identity band above the tab strip: **words known** (mastered+strengthening count) · **~% coverage of everyday Indonesian** (§2) · **streak** · **pace projection** ("top-1000 in ~9 weken op dit tempo" — FSRS intake rate × collection targets, the roadmap §E.8 study-plan item finally landing where it belongs). Four numbers, one glance, all deriving from existing reads. The tabs then become the deep-dive they already are. *This is the "more beautiful AND more insightful" move in one stroke.*

### I2 — The jaar-heatmap (GitHub-style practice calendar)
A year of practice days as a color-intensity grid, from `learning_sessions` (data trivially available; `engagement.dailyActivity` already reads days). Universally loved, beautiful by default, and it reframes the streak from "don't break it" (anxiety) to "look what you've built" (pride). Cheap; fits the Tijd tab or the hero.

### I3 — Review-load forecast ("komende week")
A 7-day bar forecast of due reviews from `next_due_at` (one indexed read — the due index exists), with the at-risk overlay: "12 woorden zakken weg als je deze week niet oefent." Turns FSRS's internal schedule into learner-visible foresight — *insight that changes behavior*, not just reports it. Natural neighbor of `DurabilityCard`.

### I4 — Mijlpalen feed (the journey, remembered)
"500e woord geleerd — 12 juni · eerste verhaal uitgelezen · langste streak: 21 dagen · eerste les boek 2." Derivable retroactively from `capability_review_events` + sessions (no new writes; compute on read, maybe cache). Gives the page a narrative spine — progress as a *story*, matching the travel-journal aesthetic of the Lessons redesign. Also the natural source for share cards (growth crossover: a "500 woorden 🇮🇩" share image).

### I5 — Niveau-schatting (CEFR estimate)
"Jouw niveau: A2, op weg naar B1" — mapping vocabulary size + band coverage + grammar-pattern mastery onto the CEFR rubric the content already carries (lesson CEFR levels shipped #198/#199). Needs honest framing (an *estimate*, with the rubric behind an info tap). High motivational value; medium design care (don't over-promise).

### I6 — Sparklines in the funnel rows (the standing wish-list item)
Each funnel bucket row gets a 8-week micro-trend beside the count (the `deriveFunnelSeries` data already exists per bucket — it powers `GrowthCurveCard`). Kills the "static bars" flatness at near-zero data cost. (Already noted as open in the vaardigheden memory; this review seconds it.)

### I7 — Best-moment insight (small, delightful)
From review events' local timestamps: "je haalt 's ochtends 12% meer goed dan 's avonds." One derived stat, rotated into `InsightTips` (surface exists). Cheap delight; keep it honest (only show when statistically meaningful — n≥100 reviews per period).

## 4. Beauty direction (how, not just what)

- **Keep the primitives, raise the hierarchy.** The page framework + card system is right (per `feedback_ui_default_to_existing_framework`); what's missing is a *hero moment* (I1) and *motion of meaning* (sparklines/heatmap intensity), not a visual rebuild.
- **Numbers → sentences.** Every headline stat should read as a claim about the learner, not a metric label: "Je kent 612 woorden" beats "Mastered: 612". The i18n layer makes this a copy pass, not a code pass.
- **One celebration channel.** Milestones (I4) should fire once, in-session, at the moment they happen (a toast/confetti moment), THEN live in the feed. Voortgang celebrates; it shouldn't only audit.
- Run the eventual redesign through the established loop: `ui-designer` audit → page-lab primitives → per-card iteration. New primitives only if a recurring shape emerges (the `MediaShowcaseCard` precedent).

## 5. Sequencing & cost

All seven ideas are **read-model + UI work over existing data** — no schema, no learner-data writes, no pipeline changes (I4 may want a small derived cache; decide in its spec). Suggested order: **I1 hero (with §2 coverage math) → I6 sparklines → I2 heatmap → I3 forecast → I4 milestones → I5 CEFR → I7**. I1 alone changes how the page feels; everything after compounds it.
