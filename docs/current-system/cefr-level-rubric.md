---
doc: cefr-level-rubric
surface: lessons.level (per-lesson CEFR band)
last_verified_against_code: 2026-06-09
status: stable
---

# CEFR Level Rubric — Indonesian (BIPA-aligned)

The working definition of what each `level` label on a lesson means. It is the
contract the per-lesson level assessment is graded against. `level` reflects
**Indonesian-language demand only** — the Dutch-language culture essays that open
some lessons are background reading and never raise a lesson's level.

## 1. Official anchor — we adopt CEFR, we do not invent a scale

Indonesia teaches Indonesian to foreign speakers under **BIPA** (*Bahasa
Indonesia bagi Penutur Asing*), and the national BIPA curriculum is **CEFR-based**,
ratified in **Permendikbud No. 27/2017**. The six CEFR bands carry official
Indonesian names, and the national proficiency test is **UKBI** (*Uji Kemahiran
Berbahasa Indonesia*).

| CEFR | BIPA name | CEFR descriptor name | Tier |
|------|-----------|----------------------|------|
| A1 | Pemula 1 | Breakthrough | Basic user (*Penutur Tingkat Dasar*) |
| A2 | Pemula 2 | Waystage | Basic user |
| B1 | Madya 1 | Threshold | Independent user (*Penutur Tingkat Mandiri*) |
| B2 | Madya 2 | Vantage | Independent user |
| C1 | Mahir 1 | Effective Operational Proficiency | Proficient user (*Penutur Tingkat Mahir*) |
| C2 | Mahir 2 | Mastery | Proficient user |

So the only real work is the **Indonesian-specific grounding** below: what each
band means *structurally* for our content. The generic CEFR can-do statements are
the global standard; the affixation grounding is what makes the labels diagnosable.

## 2. The load-bearing finding — affix sequencing is the level signal

The BIPA curriculum sequences Indonesian's affix system across the bands, and that
sequence — not topic difficulty — is what cleanly separates the levels for our
content:

- **A1** teaches only **`ber-`** as a productive verb-former (*berjalan*, *bertemu*).
  Words built with `meN-`, `di-`, `ter-`, `ke-an`, `peN-`, `-an` appear **only as
  fixed, unanalyzed vocabulary** — a learner memorises *membeli* as a whole word,
  not as `meN-` + *beli*.
- **A2** teaches **no new productive affix**. A2 is **topical and discourse
  broadening at the same structural ceiling** as A1.
- **B1** is the **morphology threshold**: `ber-` is re-taught *in contrast with*
  productive **`meN-`** (active transitive verb formation), plus passive `ter-` and
  `ke-an`. The learner must now **generate and choose** affixes rather than recall
  whole words.

This is why productive `meN-`/`ber-` verb formation is the **A2→B1 line** for this
app, on documented grounds rather than a feel for "harder."

## 3. The bands (full ladder)

### A1 — Pemula 1 / Breakthrough
Memorised chunks and situational vocabulary in simple SVO order. **Affixation:
only `ber-` productive**; every other affixed word is whole-word vocabulary.
Topics are here-and-now and transactional — greetings, self-introduction, numbers,
family, market/shopping, directions, hotel/airport. Can introduce self and others,
ask and answer simple personal questions.

### A2 — Pemula 2 / Waystage
**Same structural ceiling as A1 — no new productive affixation** — but wider
topical range and longer connected utterances: routines, places, health,
holidays, simple past with time markers. Handles routine exchanges and short
descriptive paragraphs across more domains. Still no requirement to *generate*
`meN-` verbs productively.

### B1 — Madya 1 / Threshold
**The morphology threshold.** The learner must *productively form and choose*
verb affixes — active `meN-`/`meN-kan`/`meN-i`, the `ber-`↔`meN-` state-vs-action
contrast (*berisi* "to contain" / *mengisi* "to fill"), passive `di-`/`ter-`, and
`ke-an` — rather than recalling whole words. Produces connected text on familiar
topics; understands the main points of clear standard input.

### B2 — Madya 2 / Vantage *(forward-looking — see §5)*
Understands the main ideas of complex text on concrete and abstract topics;
interacts with fluency and spontaneity. Structurally: **breadth of productive
derivation** — nominalising confixes `peN-an` / `per-an` / `ke-an`, the
`-kan`/`-i` causative–applicative contrast under control, register awareness
(formal vs. colloquial). Not yet exercised by our content.

### C1 — Mahir 1 / Effective Operational Proficiency *(forward-looking)*
Understands a wide range of demanding, longer texts; expresses ideas fluently and
spontaneously with little obvious searching; flexible register across social,
academic, and professional contexts.

### C2 — Mahir 2 / Mastery *(forward-looking)*
Understands virtually everything read or heard; summarises and reconstructs
arguments coherently; precise, nuanced expression in complex situations.

## 4. The diagnostic line for the `level` field

Assigning a lesson its CEFR band, for *this* app:

- **B1** the moment the lesson requires the learner to **productively form**
  `meN-`/`ber-` verbs (the morphology threshold).
- **A2** if it **broadens topic or discourse** with **no new productive
  morphology**.
- **A1** if it is **foundational situational vocabulary** in simple word order.

Ties break **downward** unless the lesson genuinely demands the next band's
defining skill — a lesson is not B1 for *containing* `meN-` words (A1 carries those
as vocabulary); it is B1 only when it asks the learner to *build* them.

## 5. Scope today, and the second textbook

The current 14 lessons (textbook 1) occupy **A1–B1**. **B2/C1/C2 are documented
here as the official standard but are not yet populated** — they are reserved for
the **second textbook**, whose content will be assessed against the §3 descriptors
when it is ingested. The forward-looking band descriptors above are deliberately
kept at the official-standard grain (no per-lesson structural claims) until real
B2+ content exists to ground them.

## 6. Where `level` lives and how to change it

- **Source of truth:** the staging file `scripts/data/staging/lesson-N/lesson.ts`,
  top-level `"level"` field.
- It is **projected** to `lessons.level` by the Lesson Stage adapter
  (`scripts/lib/pipeline/lesson-stage/adapter.ts`).
- The default `"A1"` originates in the `--level` flag default in
  `scripts/catalog-lesson-sections.ts`.
- ⇒ To change a lesson's level permanently: edit the **staging `lesson.ts`
  `"level"`**, then **re-publish Stage A**. A direct `lessons.level` DB `UPDATE`
  is overwritten on the next publish (lesson content is a projection of staging —
  see `feedback_pipeline_is_writer_not_db`).

## Sources

- [CEFR-BIPA competency mapping (ResearchGate)](https://www.researchgate.net/publication/376229033_Common_European_Framework_of_Reference_for_Languages_CEFR_Standard_in_Bahasa_Indonesia_bagi_Penutur_Asing_BIPA_Textbook_A_Competency_Mapping_Analysis)
- [Permendikbud 27/2017 CEFR-BIPA ratification (Jurnal Idiomatik)](https://ejournals.umma.ac.id/index.php/idiomatik/article/view/777)
- [BIPA affix-sequencing per level (UCU BIPA)](https://ucubipa.wordpress.com/model-pembelajaran-bipa/)
- [Jembatan Bahasa level descriptors](https://jembatanbahasa.com/indonesian-proficiency-levels/)
- [UKBI official proficiency test (LIA)](https://www.lia.com.sg/ukbi/what-is-ukbi/)
