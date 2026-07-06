---
status: draft
---

# Product ideas — master index (2026-07-06 session)

> The single entry point to everything ideated on 2026-07-06. A fresh context starts HERE.
> Strategic frame: two unfair advantages — (1) per-learner capability model at word/pattern
> granularity; (2) the NL→ID language pair. Every idea below rides one or both.

## The five bold bets — `2026-07-06-bold-bets-high-level-specs.md` (parent vision)

| # | Bet | Program spec | State |
|---|---|---|---|
| 1 | **Loanword bridge + placement onboarding** — "je kent al 3.000 woorden" day-one experience | `2026-07-06-loanword-bridge-placement-onboarding.md` | ✅ **APPROVED** (full gauntlet: staff-engineer + architect + data-architect). **Slice 1 clear to build.** Slice 2 gated on user ratifying the ADR-0004 carve-out (§7.4) + frozen-constants golden test (§7.5) |
| 2 | **Jouw Weekverhaal** — i+1 stories generated from the learner's own FSRS state | `2026-07-06-weekverhaal-program.md` | draft, staff-engineer-checked. Core question: per-learner content regime |
| 3 | **Percakapan** — AI chat constrained to the learner's known words (Phase-2 premium SKU) | `2026-07-06-percakapan-program.md` | draft, staff-engineer-checked. Core question: learner-model compression (against the DB lexicon) |
| 4 | **Growth layer** — SEO-from-data, free funnel, heritage positioning | `2026-07-06-growth-layer-program.md` | draft, staff-engineer-checked. Core question: separate static site (decided direction) |
| 5 | **EN audience** — "the serious Indonesian app"; one app, two front doors | `2026-07-06-en-audience-program.md` | draft, staff-engineer-checked. Bilingual brand DIRECTION SET (brand-as-i18n-token + per-domain entry; EN name still to choose) |

## Round-2 ideas — `2026-07-06-experience-and-growth-ideas.md`

**Learning:** A1 Onderweg-modus ⭐ (hands-free audio sessions) · A2 Dagboek (1 LLM-graded sentence/day) · A3 De stem van je familie ⭐ (family voice recordings replace TTS — promotion candidate to the bets) · A4 getallen & prijzen trainer (deterministic) · A5 "wist je dat" micro-cards · **A7 Spreektaal ⭐⭐ (bahasa gaul register track — the market's loudest documented gap; promotion candidate)**.
**Growth:** B1 public loanword quiz ⭐ (no-account viral quiz = growth-layer leg 0) · B2 Tong Tong Fair / Moesson channel · B3 Kata-van-de-week newsletter · B4 public reader demo · B5 cadeau-abonnement · B6 Leiden connection · **B7 "na Duolingo" exit-ramp SEO + public "route to B1" map (market-research addition; now in the growth-layer spec)**.
**Top three if forced:** B1, A1, A3 — A7 Spreektaal is the strongest *content* differentiator once Bet 1 ships.

## Market research — `docs/research/2026-07-06-market-research-competitive-landscape.md`

Verified 2026-07-06: **every mass-market app caps Indonesian at A2** (Duolingo ¼-length/formal-only; Babbel HAS Indonesian but A2 ceiling — correction; Busuu none); **bahasa gaul register gap** = biggest new product insight (→ A7); Kaiwa exists (AI speaking) → Percakapan differentiates on learner-model + FSRS (folded into its spec); NL heritage ~1.7M is the primary segment, vacation stream modest (growth spec corrected); Bali 5-yr nomad visa (2025) strengthens the EN wedge; Australia = supply-vacuum narrative, not a schools channel (EN spec corrected); pricing anchor ~€9.99/mo / €79/yr vs local courses at hundreds of euros. Corrections from its §5 are APPLIED (2026-07-06) to the percakapan / growth-layer / en-audience specs.

## Reviews with ranked improvement ideas — `docs/research/`

- **Grammar teaching** — `2026-07-06-grammar-teaching-review.md`. Live-verified: 191 patterns × 3 caps, 2,885 exercises, **~1 review/pattern/month → exposure, not variety, is the constraint**. Ranked: G1 practice mode · G2 first-encounter rule card · G3 Grammatica reference library · G4 produce-grader fix (same class as shipped vocab fix — do first, trust) · G5 interpretation variants · G6 LLM free production (Phase 2) · G7 weekverhaal input-flooding (free rider on Bet 2).
- **Voortgang analytics** — `2026-07-06-voortgang-analytics-review.md`. Verdict: structurally excellent, emotionally flat. Ranked: **I1 "Jouw Indonesisch" hero ⭐ (words · ~% coverage of everyday Indonesian via the reader's coverage machinery · streak · pace)** · I2 jaar-heatmap · I3 review-load forecast · I4 mijlpalen feed (+share cards) · I5 CEFR estimate · I6 funnel sparklines · I7 best-moment insight. All read-model-only.

## Recommended global order (build-readiness × impact)

1. **Bet 1 slice 1** (loanword collection + `/welkom`) — approved, pure acquisition.
2. **G4 produce-grader fix** — trust; reuses the just-shipped answer-variants machinery.
3. **I1 Voortgang hero** (+ I6 sparklines) — the felt-progress unlock, read-model only.
4. **G1 grammar practice mode** — spends 2,885 existing exercises.
5. **Bet 2 weekverhaal** execution spec (settle per-learner content regime).
6. **B1 public quiz + Bet 4 leg 1** when a funnel endpoint exists.
7. **Bet 3 Percakapan** design → Phase-2 premium launch. (A-ideas slot in opportunistically; A1 after Bet 2's audio work.)

## Standing decisions & gates (do not re-litigate)

- Placement seeds FSRS state via ADR-0004 carve-out — **user must ratify the new ADR before slice-2 implementation** (Bet 1 §7.4); the ADR text requirements are in Bet 1 §4.4.
- Cognate field: Bet 1 builds `loan_source_nl` as approved; per-L1 generalization = later additive migration (EN program spec).
- Bilingual brand: one app, two names; NL = Kamoe Bisa; EN name open (candidates floated: Bisa!, Ayo Bisa, Pasti Bisa).
- Everything here is HIGH-LEVEL by user instruction (2026-07-06): each item needs its own execution spec + review gauntlet (staff-engineer first, then architect + data-architect when data is touched) before building.
