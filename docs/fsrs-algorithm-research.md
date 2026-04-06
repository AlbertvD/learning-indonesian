# FSRS Algorithm Research

**Date:** 2026-04-06  
**Context:** Written to evaluate whether the app's custom session management rules (new learner protection, slot allocation, anchoring phase) are consistent with how FSRS is designed to be used.

---

## What FSRS actually is

FSRS (Free Spaced Repetition Scheduler) is a **scheduling algorithm** — it calculates when to next review a card and how stability/difficulty evolve after each review. It is based on the DSR memory model:

- **D (Difficulty)** — how hard the card is for this learner
- **S (Stability)** — how long until the memory decays to a target retrievability
- **R (Retrievability)** — current probability of recall, computed from S and time elapsed

The core loop:
1. User reviews a card and gives a grade (Again/Hard/Good/Easy)
2. FSRS updates S and D for that card
3. Next review is scheduled when R would drop to the target retention level (default 90%)

Everything else — session composition, new card pacing, mixing rules, learner-type handling — is **outside the algorithm** and left to the application.

---

## What FSRS prescribes

| Concept | Prescribed by FSRS? |
|---|---|
| Interval calculation (when to next review) | Yes |
| Stability/difficulty update after each review | Yes |
| Learning steps before SRS takes over | Partially — FSRS recommends short same-day steps; specific durations are app policy |
| Daily new card limit | No — left to user/app |
| Session slot allocation (% due vs. new vs. weak) | No |
| New learner protection rules | No |
| Session size | No |
| Mixing exercise types within a session | No |

---

## Learning steps (the "anchoring" question)

FSRS does recognize a **learning phase** before cards enter true spaced repetition. Cards go through short-interval learning steps (e.g., 10 min, 30 min) before graduating to the review queue. Key findings:

- Learning steps should be **under 1 day** and completable in a single session
- Steps of ≥1 day interfere with FSRS's ability to schedule optimally
- In FSRS-5+, if learning steps are left blank the algorithm controls them when the next computed interval is <12 hours
- The purpose is to give FSRS enough signal (early stability estimate) before scheduling longer intervals

**Conclusion:** The app's "anchoring" phase is analogous to FSRS learning steps and is consistent with the algorithm's design. The main difference is that the app's anchoring uses a stage-based lifecycle rather than time-based steps.

---

## What FSRS does NOT prescribe

### New card introduction rate
FSRS does not specify how many new cards to introduce per day. This is entirely a user/app-layer setting. Common guideline: 10–20 new cards/day as a starting point, with ~1 minute of study time per new card. The algorithm adapts regardless of introduction rate.

### Session slot allocation
FSRS says nothing about how to mix new, due, and weak items within a session. The standard Anki/FSRS approach is: review all FSRS-due items + introduce N new cards. Percentage-based mixing (e.g., 55% due / 20% anchoring / 10% weak) is a hand-crafted heuristic layered on top of FSRS, not something the algorithm requires.

### New learner protection
FSRS treats all learners identically at the algorithm level. Personalization comes from parameter optimization based on the learner's own review history (requires ~400–1000 reviews before optimization is meaningful). There is no built-in concept of "new learner mode" or protective session capping.

### Stage lifecycle
The app's `new → anchoring → retrieving → productive → maintenance` stage system is entirely app-specific. FSRS only distinguishes: **learning** (short-interval steps) vs. **review** (FSRS-scheduled intervals).

---

## Evaluation of the app's custom policies

| App policy | FSRS alignment |
|---|---|
| Anchoring phase (always-reinforced new items) | Consistent — analogous to FSRS learning steps |
| Per-skill FSRS state (recognition, form_recall, etc.) | Valid extension — each skill is independently scheduled |
| Exercise type rotation | Orthogonal — doesn't interfere with FSRS |
| Slot allocation (55/20/10 percentages) | Not from FSRS — hand-crafted heuristic |
| `calculateNewSlots` backlog thresholds | Not from FSRS — approximates what a simple daily limit would achieve |
| New learner protection (trickle at 15%) | Not from FSRS — conflicts with FSRS philosophy of algorithm-driven personalization |
| Weak item slots (lapse-based) | Not from FSRS — FSRS handles weak items via shorter intervals automatically |

---

## What a more FSRS-aligned approach would look like

1. **Daily new items limit** — a single user-controlled setting (e.g., 10/day), replacing `calculateNewSlots` and the new learner cap
2. **Show all FSRS-due items** — trust the algorithm's scheduling; don't manually manage backlog with percentage slots
3. **Learning steps for anchoring** — keep the anchoring phase but let it be driven by FSRS's short-interval recommendations, not stage counts
4. **Remove new learner protection** — let FSRS adapt naturally; if the user wants fewer items they lower the daily new limit

The anchoring phase, per-skill tracking, and exercise type rotation are worth keeping — they serve real pedagogical purposes that go beyond what FSRS addresses.

---

## Sources

| Source | URL | Key finding |
|---|---|---|
| FSRS4Anki GitHub | https://github.com/open-spaced-repetition/fsrs4anki | Core algorithm and Anki integration; confirms session management is app-layer |
| ABC of FSRS (wiki) | https://github.com/open-spaced-repetition/fsrs4anki/wiki/ABC-of-FSRS | New cards/day is a user setting, not part of FSRS |
| ACM KDD 2022 paper | https://dl.acm.org/doi/10.1145/3534678.3539081 | "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling" — original FSRS academic paper |
| FSRS Helper | https://github.com/open-spaced-repetition/fsrs4anki-helper | Load balancing and postpone features are optional enhancements, not core to FSRS |
| Jarrett Ye — How to use FSRS on Anki | https://medium.com/@JarrettYe/how-to-use-the-next-generation-spaced-repetition-algorithm-fsrs-on-anki-5a591ca562e2 | Practical guidance on learning steps and daily new card limits |
| RemNote FSRS explanation | https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm | DSR model explanation, parameter initialization |
| FSRS learning steps forum | https://forums.ankiweb.net/t/fsrs-learning-steps/57339 | Recommendation to keep all learning steps under 1 day |
| Domenic Denicola — FSRS overview | https://domenic.me/fsrs/ | Accessible overview comparing FSRS to SM-2 |
| Implementing FSRS in 100 lines | https://borretti.me/article/implementing-fsrs-in-100-lines | Implementation walkthrough showing what the core algorithm actually contains |
