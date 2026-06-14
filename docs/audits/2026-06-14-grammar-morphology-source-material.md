# Grammar & Morphology — source-material catalog (for roadmap §C / §D)

Companion to `2026-06-14-grammar-table-vocab-inventory.md` (which covers the **vocab** track / Track A). This pins the **source material per lesson** so the post-vocab **grammar-depth (§C)** and **morphology / affix-trainer (§D)** tracks resume with a catalog, not a re-discovery. Grounded in the full-course `lesson_sections` scan (2026-06-14).

> Sequence reminder (`docs/roadmap.md`): finish ALL vocab first; these tracks come **after**. Do not interleave.

---

## §D — Morphology source material (author `morphology-patterns.ts` per lesson → existing projector mints `affixed_form_pair` caps)

The affix content already exists in the lessons; it just needs lifting into the `morphology-patterns.ts` format (LLM-assisted from the tables + review).

| Lesson | Affix system | Source section | Notes |
|---|---|---|---|
| **L9** | meN- (intro) | already has `morphology-patterns.ts` | **the pilot** — baca, tulis (2 verbs, 4 caps). Pattern to copy. |
| **L11** | ber- | "Grammatica - Het werkwoord - algemeen" | berangkat, bertingkat, berkumpul, bermalam, berdua… |
| **L13** | meN- | "De Werkwoordsvorm met ME-" | ~30 root→meform pairs: lihat→melihat, baca→membaca, cari→mencari, dengar→mendengar, kirim→mengirim, ambil→mengambil, jual→menjual, hitung→menghitung, potong→memotong, simpan→menyimpan, tukar→menukar, urus→mengurus… |
| **L14** | meN- (vervolg) | "WERKWOORDSVORM MET ME-: Vervolg" | meN- on noun/pronoun/adj + the ber-/me- relation: bantu→membantu, sapu→menyapu, telepon→menelepon, langkah→melangkah, darat→mendarat… |
| **L15** | meN- allomorphy + root-finding | "Het terugvinden van het basiswoord bij ME-vorm" + **IMG_1558 schema** | ⭐ the **allomorphy table** (meN- → ME/MEM/MEN/MENG/MENY by initial sound: k/s/t/p elision) — the data for affix-rule drills / a possible `allomorph_selection` type. |
| **L16** | di- (passive) | "De werkwoordsvorm met DI-" | dikirim, dimakan, dipukul, dibeli, dibayar, ditimbang… |

**Build note:** types `root_derived_recognition`/`root_derived_recall` + the projector already work (L9 proves it). No new capability types to start; richer drills (build-the-word, find-the-root) are exercise *variants*. New `allomorph_selection` type only if the L15 schema warrants it. Then the **"Morfologie" Voortgang axis** (3-way `funnelBucket` split).

---

## §C — Grammar-pattern material (deepen: 3–5 variants per type; trace null `grammar_pattern_id`)

262 `pattern` caps already exist per lesson (4 exercise types, ~1 variant each → need more). Key patterns by lesson:

| Lesson | Grammar patterns (sections) |
|---|---|
| L2 | ini/itu (demonstratives), zinsbouw/woordgroepen, ontkenning `tidak`, adjective placement, se- prefix/classifiers |
| L3 | `ada`, vraagwoorden, woorden van plaats, `sekali` |
| L4 | **`yang`** construction (relative / nominaliser / emphasis) |
| L5 | persoonlijk + bezittelijk voornaamwoord |
| L6 | negation+particle set: `jangan` / `tidak` / `bukan` / `belum` / `-kah`; gebiedende wijs |
| L7 | `-nya` construction; zinsbouw (tijd + plaats word order) |
| L8 | trappen van vergelijking (`lebih`/`paling`/`ter-`); interjecties |
| L9 | intensifiers (amat/sangat/benar/betul/sekali); **verb-order A-B-C** |
| L10 | `-an` suffix; conjunctions; rekenen; rangtelwoord KE- |
| L12 | acroniemen; ber-verdubbeling (-an) |
| **L15** | **gebod/verbod** (imperative = bare root: Buka!/Jangan buka!) + **persoonlijk lidwoord** (sang/ki/si/para usage) — *recovered in IMG_1559; arrive with the ch15 re-ingest* |

---

## Exercise ideas (Phase 2 — from the marked content)
- **Antonym "opposite of X"** (L2's 16 pos/neg pairs) — exercise + **antonym MCQ distractors** (fixes the known distractor-quality weakness).
- **Clock-telling drill** (L6) — read/produce `jam X` constructions; the tricky `setengah tujuh` = 6:30 ("half to seven") logic.
- **`malam Minggu` vs `Minggu malam`** (L7) — Saturday-night vs Sunday-night quirk.

## Thematic pack (existing items — just group)
- **Lichaam & Gezondheid** (L9): ~50 body/ailment/medicine items, all already learnable → `kind='theme'` collection, zero new content.

## Exercise source corpus (no enumeration needed)
Author (2026-06-14): *"no specifics — all of them are sound source material."* So the **example sentences across every lesson's grammar sections are the source pool** for the §C variant-deepening — the grammar-exercise-creator draws from the existing per-lesson grammar examples (the model sentences under each pattern: "Saya rasa buah ini kurang manis", "Jangan buka!", "Kamar pertama adalah kamar saya", etc.) to generate the 3–5 varied variants per type. Nothing to hand-collect; the corpus is already in the lessons' grammar `examples`.
