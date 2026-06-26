# Grammar audit — TBBBI/KBBI cross-check of all 30 lessons (2026-06-26)

Full Phase-0 grammar verification (the input gate of the grammar-podcast pipeline):
every grammar claim in all 30 lessons extracted and cross-checked against the
official Indonesian authorities — **TBBBI** (Tata Bahasa Baku Bahasa Indonesia,
acuanbahasa/repositori.kemdikbud) and **KBBI** (kbbi.kemdikbud.go.id). Sneddon was
**not** used (copyright). Tooling: `scripts/grammar-podcast/` (extract → web-enabled
agent verify → report). Verdict artifacts (gitignored): `content/grammar-review/lesson-N.{claims,verdicts,tbbbi}.json`.

## Result

**766 claims · 677 confirmed (88%) · 77 incomplete (10%) · 12 wrong (1.6%)**

## The 12 wrong — all fixed at source (staging `lesson.ts`, under `content.categories`)

The lexical errors were **independently re-verified** against KBBI *and* Wiktionary
(definitions largely from Echols & Shadily) before fixing — they reproduce across
separate corpora.

| Lesson | Error | Correction |
|---|---|---|
| L4 | "*yang* obligatory after compound nouns" | optional (*kamar mandi bersih* ✓) |
| L8 | "*nih* = mild surprise" | colloquial variant of *ini* (this/here); *wah* keeps "mild surprise" |
| L12 | acronym example *NUSTENGTIM* (fabricated) | replaced with attested *JABODETABEK* |
| L15 | *menyanyi → nyanyi* taught as /s/-elision | it's *me-+nyanyi* (no /s/ drops) → *menyapu → sapu*; +`menge-` row |
| L21 | *menduakan* = "to double" | "treat as second / regard as two" (KBBI + Wiktionary) |
| L24 | *meninggali* = "leave" | "inhabit / bequeath" (KBBI + Wiktionary); fixed *rumah* example; dropped non-standard *mengakukan* |
| L25 | *perkembangan* taught as *peN-an* | it's *per-an* (on *berkembang*); fixed *memulai*→*dimulai* (transitive needs object) |
| L26 | *tergantung dari* / *terdiri dari* as fixed terms | baku *tergantung pada* / *terdiri atas* (informal variant noted) |
| L29 | *mengingati* = "admonish" | "remember / keep in mind" (KBBI + Wiktionary; admonish = *memperingati*) |
| L13 | *meng-* rule omits *menge-* allomorph | added (*mengeong* relied on it) |
| L14 | example *mengatas* (not a KBBI lemma) | replaced with attested *mendarat* |

## Deferred (77 incomplete)

Mostly "acceptable at this level" framing/register nuances (e.g. listing colloquial
prepositions without flagging, over-stated absolute rules, missing rare allomorphs).
Not errors; a later polish pass. Per-lesson detail in the gitignored verdict files.

## Propagation

Fixes are at **source** (staging). They reach the live DB, reader, SD script, and
podcast briefings on **re-publish** of the corrected lessons — which must happen
before those lessons' podcast episodes generate (the orchestrator reads grammar
from the DB). Corrected lessons: 4, 8, 12, 13, 14, 15, 21, 24, 25, 26, 29.
