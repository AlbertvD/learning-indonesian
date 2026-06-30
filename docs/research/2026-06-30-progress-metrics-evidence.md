# Learner-Facing Progress Metrics — Evidence Base & Design Principles

**Date:** 2026-06-30
**For:** The proposed **Voortgang "Groei" (Growth) dimension** — two *trajectory* statistics derived read-only from the existing `capability_review_events` log: (1) a **growth/velocity curve** (units mastered per week, same `funnelBucket` split as the mastery funnel) and (2) a **durability/memory-strength trend** (weekly average FSRS stability, the over-time twin of the unsurfaced `get_memory_health` snapshot). Brainstorm context: the Voortgang page measures the SRS *engine* (funnel, skill counts, time) but only as a **snapshot** — it shows where the learner *is*, never where they're *heading*. These two metrics add *motion*.
**Method:** Standard web-research pass (research skill). Every web claim source-verified by `WebFetch`; the one paywalled source is flagged and cited from its abstract only. This doc layers onto the SLA spine the project already settled (ADRs 0007/0014, the 2026-04-25 sequencing research, the 2026-06-28 reader evidence) — it does **not** re-litigate receptive-before-productive, desirable difficulty, or coverage thresholds.

> **Framing for the design phase:** the literature's central *warning* targets the metrics we are **not** proposing (streaks / minutes / XP — activity-vanity metrics). Our two are **outcome** metrics, which sidesteps that critique by construction. The genuinely-new design surface is *how to present trajectory without re-introducing the vanity-metric failure mode.* Spend the design budget there.

---

## Part 1 — The core verdict

| Claim | Source | Confidence | Verdict for our two metrics |
|---|---|---|---|
| The documented failure mode of language apps is **activity-vanity metrics**: streaks/minutes/XP measure showing-up, not learning. They "naturally favour exercises that are short, predictable, recognition-heavy," producing learners who feel fluent in-app but "collapse outside" — an illusion of competence. | [taalhammer 2026](https://www.taalhammer.com/why-daily-streak-apps-often-fail-serious-learners-and-which-language-learning-app-works-better-instead-in-2026/) (verified) | MEDIUM (practitioner synthesis, aligns with SLA recognition≠recall) | **Our metrics are the antidote, not the disease** — they track *mastered units* and *memory strength* (recall/retention), not time-in-app. ⚠️ The metric most exposed to this critique is our **existing Tijd tab** (minutes + streak). |
| **Progress feedback tied to goals fosters perceived competence & self-efficacy** (the competence need in self-determination theory); monitoring tools reliably improve self-regulation across achievement/SRL/motivation. | [Springer monitoring meta-analysis 2023](https://link.springer.com/article/10.1007/s10648-023-09718-4) (⚠️ paywalled — cited from abstract) | MEDIUM | Supports the **growth curve**: a personal trajectory toward a concrete target is competence-supportive. |
| **Reality check (RCT, n=194):** daily *process* feedback raised goal-setting, self-efficacy, satisfaction and time-management — but showed **no effect on intrinsic motivation or effort**, and **no trait-level SRL change** (benefit is *situative*, in-the-moment). Feedback that included a **strategy suggestion** (confirmative/transformative) beat bare informative feedback. | [Frontiers RCT 2023](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1125873/full) (verified) | HIGH (randomized field experiment) | **Caveat on the growth curve:** a naked number lifts confidence but not motivation/effort. **Pair the curve with a next-step nudge.** Watch the **plateau risk** — progress feedback can demotivate when the curve flattens. |
| **Feedback on the accuracy of one's own confidence/memory judgments improves metacognitive calibration (reduces overconfidence), and the gain generalizes to untrained tasks** (incl. recognition memory). | [PMC6390881 — adaptive metacognition training](https://pmc.ncbi.nlm.nih.gov/articles/PMC6390881/) (verified) | HIGH (controlled, Brier-score calibration, transfer demonstrated) | **Strongest case — for the durability trend.** Showing real memory strength *is* calibration feedback; it directly counters the overconfidence / illusion-of-competence dysfunction the critical literature names. |

---

## Part 2 — Design reads (fold into the spec)

1. **Both metrics are worth building; durability is the more defensible.** Growth = competence-support (motivation, with caveats). Durability = metacognitive calibration, aimed squarely at the *specific* documented failure of apps in this category. If forced to ship one first, ship durability.

2. **Don't ship a naked number — attach a next step.** The RCT's clearest signal: feedback with a *strategy suggestion* outperformed bare progress feedback on subsequent-day behaviour. The growth curve should answer "and now what?" (e.g. "+12 words this week — keep the daily session to hold the pace"), not just plot a line.

3. **Frame durability in plain, calibrating language.** "Your memory now holds ~32 days on average (up from 18 a month ago)" teaches the learner what their FSRS stability *means* — that is the calibration mechanism. Avoid raw "stability: 32.4."

4. **Keep it personal-trajectory, not social comparison.** SDT competence-support comes from *self-referenced* progress; the leaderboard was already retired (consistent with this). Do not re-introduce ranking.

5. **Mind the plateau.** A flat or dipping curve is demotivating if framed as failure. Frame dips honestly (the funnel already models `at_risk`/`slipped`) and pair with the recovery action, so a downturn reads as "here's what to review," not "you're losing."

6. **Coherence with the existing page:** durability pairs naturally with the recognise/produce/listen skill card (recall over recognition); growth reuses the funnel's `funnelBucket` split. Neither needs new write-side plumbing — both are reads over the append-only `capability_review_events` log.

---

## Sources (verified 2026-06-30)

- [Frontiers — *Daily automated feedback enhances self-regulated learning: a longitudinal randomized field experiment*](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1125873/full) — RCT, n=194. Situative SRL/self-efficacy gains; no intrinsic-motivation/trait effect; strategy-bearing feedback > informative.
- [PMC6390881 — *Domain-General Enhancements of Metacognitive Ability Through Adaptive Training*](https://pmc.ncbi.nlm.nih.gov/articles/PMC6390881/) — calibration feedback reduces overconfidence and transfers to untrained tasks.
- [taalhammer — *Why Daily-Streak Apps Often Fail Serious Learners*](https://www.taalhammer.com/why-daily-streak-apps-often-fail-serious-learners-and-which-language-learning-app-works-better-instead-in-2026/) — activity-vanity vs. learning metrics; recognition≠recall.
- [Springer — *Let Learners Monitor the Learning Content and Their Learning Behavior!* (meta-analysis, Educational Psychology Review 2023)](https://link.springer.com/article/10.1007/s10648-023-09718-4) — ⚠️ paywalled; cited from abstract only (monitoring tools improve SRL/achievement/motivation).
