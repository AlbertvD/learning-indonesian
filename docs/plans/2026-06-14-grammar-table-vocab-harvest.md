---
status: draft
reviewed_by: []   # pending: staff-engineer (soundness of the discrimination rule) + architect (ADR 0014 fit / placement) + data-architect (item-row contract)
supersedes: []
---

# Harvest vocabulary from grammar / reference tables

> **APPROACH PIVOT (2026-06-14):** the automated *harvester* design in §2–§4 below was the original idea. We **pivoted** to a simpler approach after a full-course pass: the grammar/reference tables are too heterogeneous to auto-parse reliably, and the author can identify the real gaps by hand. **Chosen approach: add the manually-identified words to each lesson's existing `vocabulary` section + republish** (reuses the proven harvest path; no new parser). The authoritative per-lesson add-list (98 words + glosses) is in **`docs/audits/2026-06-14-grammar-table-vocab-inventory.md`**. This doc is retained for the **root-cause analysis + evidence** (§1, §1a, §1b) which remain valid; treat §2–§4 (the harvester) as superseded.

## 1. Problem (a real, systematic content-pipeline gap)

Vocabulary introduced in **grammar / reference-table sections** is rendered for the learner but **never harvested into `learning_items`** — so it is never schedulable and never appears in a single exercise. The learner reads the word in a grammar table, then never practises it.

**Root cause (scope, not a bug):** the item harvest reads item rows only from `vocabulary` / `expressions` / `numbers` sections — `scripts/lib/pipeline/lesson-stage/projectSections.ts:87` (`ITEM_SECTION_TYPES`), mirrored in `adapter.ts:6`, `runner.ts:454`, `validators/perItem.ts`, `enrichEnTranslations.ts`. `grammar` and `reference_table` sections are excluded. The harvester is correct on what it reads; its **scope is too narrow**.

**Surfaced by:** the collections Top-100 frequency diff (`scripts/collections/analyze-top100.ts`). Of the 33 "gap" words, most turned out to be **already-authored grammar-table vocab**, not missing content.

**Evidence (grounded in `scripts/data/lessons.ts`):**
- **Ch5** "Grammatica: Persoonlijk voornaamwoord" teaches the full pronoun paradigm with Dutch glosses — `{ word: 'dia / ia', dutch: 'hij / zij' }`, `{ word: 'Anda', dutch: 'u / jij' }`, `{ word: 'kalian', dutch: 'jullie' }`, `beliau`, `engkau`. None are `learning_items`. (The Woordenlijst at line 1598 has `aku/kamu/kami/kita/mereka` but not the 3rd person / formal-you / 2nd-plural — the paradigm is half-taught in vocab, fully taught in grammar.)
- **Ch3** "Vraagwoorden" — `Apa?` `Berapa?` `Bagaimana?` `Di mana?` `Ke mana?` `Kapan?` `Mengapa?` `Kenapa?` `Siapa?` `Yang mana?` (`{ word, asks, example }`); and "Woorden van plaats" — `atas` `bawah` `belakang` `depan / muka` `dalam` `luar` `tengah` `kiri` `kanan` `sini` `situ` `sana` (`{ word, dutch, combinations }`). All glossed, none harvested.
- **Ch2** "Tegengestelde bijvoeglijke naamwoorden" — antonym *pairs*: `{ pos: 'besar', pos_dutch: 'groot', neg: 'kecil', neg_dutch: 'klein' }` (~16 pairs: baru/lama, baik/buruk, bersih/kotor, jauh/dekat, kaya/miskin, mahal/murah, manis/pahit, muda/tua, penuh/kosong, panjang/pendek …). ~30 adjectives, none harvested.
- **Ch5** has **two** tables: the personal-pronoun list **and** a `reference_table` "Bezittelijk voornaamwoord" (possessive) — a grid with `-ku`/`-mu`/`-nya` clitics + `kalian`/`Anda`/`Beliau`.
- Course-wide: **46** grammar-table `{ word: … }` entries vs **433** harvested `{ indonesian: … }` vocab entries — plus the pair/grid shapes that don't even use a `word` key. Confirmed ch2, ch3, ch5; author reports ch4 too.

This is the productive ceiling's blind spot: ADR 0014 correctly restricts harvest to `word`/`phrase` items, but the *section-type* gate then drops grammar-table vocab wholesale rather than discriminating within it.

### 1a. The table shapes are heterogeneous (the extractor is not one rule)

Grammar/reference tables use **at least five** shapes, so a single `{word,gloss}` reader is insufficient:

| Shape | Where | Vocab to extract | Skip |
|---|---|---|---|
| `{ word, dutch }` | ch5 pronouns | `word` (split ` / `) | — |
| `{ word, asks, example }` | ch3 question words | `word` (strip `?`), gloss from `asks` lead clause | `example` |
| `{ word, dutch, combinations }` | ch3 place words | `word` | `combinations` |
| `{ pos, pos_dutch, neg, neg_dutch }` | ch2 antonyms | **both** `pos` + `neg` (two items) | — |
| `reference_table` grid (`rows[].cells[]`) | ch5 possessive | cell tokens that are real words (`kalian`,`Anda`,`Beliau`,`-ku`…) | `-`, `eigennaam`, sentence `examples` |

The grid is the messy one: cells mix vocab, placeholders, and the clitics `-ku/-mu/-nya` (morphology, not standalone vocab). Its non-clitic vocab is mostly the **same pronouns** the personal-pronoun table already yields, so the grid adds little beyond the clitics.

### 1b. Full-course scan (all 16 chapters) — three buckets

A scan of every non-harvested section carrying vocab-like tokens (`scripts/collections/analyze-top100.ts` sibling) sorts cleanly into three buckets — only the first is this fix's job:

**A. Harvestable vocab tables (the target) — concentrated, ~6 tables:**
- L2 — antonym adjectives (~29: lama/baru, buruk/baik, kotor/bersih, kecil/besar, jauh/dekat, kaya/miskin, mahal/murah, manis/pahit, muda/tua, penuh/kosong, panjang/pendek…)
- L3 — place words (atas, bawah, belakang, depan/muka, dalam, luar, tengah, kiri, kanan, sini, situ, sana) + question words (Apa, Berapa, Bagaimana, Di mana, Ke mana, Kapan, Mengapa, Kenapa, Siapa, Yang mana)
- L5 — personal pronouns (dia, ia, Anda, kalian, beliau, engkau) + possessive clitics (-ku, -mu, -nya)
- **L6 — time units** ("Tijdsindeling": detik, menit, jam … the **day→century granularity** the author flagged: hari, minggu, bulan, tahun, abad)
- **L7 — time expressions** (*tijdsbepalingen*: kemarin, besok, lusa, sekarang, dulu, nanti …) + **months & days**

**B. Example-sentence grammar tables (correctly EXCLUDED — syntax illustrations, not vocab):** L1 "Eenvoudige zinnen", L2 ini&itu / zinsbouw, L3/L4 exercises, L4 YANG, L6 jangan/tidak/bukan/belum/-kah, L7 -nya, L8 comparison/interjecties, L9, L10 ordinals, L11 ber-, L12 acronyms. The §2 discrimination rule (≤3 words, no sentence punctuation) rejects these by construction.

**C. Morphology derivation tables (SEPARATE pipeline — NOT this fix):** L11 ber-, L13/L14 ME- (lihat→melihat, baca→membaca…), L16 DI-. These root→derived pairs belong to the existing `affixed_form_pair` / grammar-pattern path (ADR 0010), not vocab harvest. **Out of scope here** (flag: verify that path actually captures them — a separate audit).

So the blast radius *looks* huge but the genuine harvestable vocab is **bucket A only** — ~6 word-list tables, on the order of ~100–130 items, dominated by antonyms, place words, question words, pronouns, and the full **time/calendar** vocab. That is the real, bounded coverage gap.

## 2. The crux — the discrimination rule (vocab vs. not)

Grammar-table entries are `{ word, <gloss>, <illustration> }`:
- gloss field ∈ `{ dutch, asks }` (`asks` = question-word usage description, e.g. *"Wat? ding, zaak"*).
- illustration field ∈ `{ example, combinations }` — **always skipped** (illustrative sentences/derivations, exactly the over-harvest ADR 0014 guards against).

**Harvest an entry as a vocab item IFF** it has a non-empty gloss **and** `word` is lexical, not a sentence:
1. **Split synonym forms** on ` / ` → `dia / ia` → [`dia`, `ia`]; `depan / muka` → [`depan`, `muka`]; `Bapak / Ibu` → [`Bapak`, `Ibu`]. Each becomes its own item.
2. **Per form**, after stripping a single trailing `?`/`!`: accept iff it is **≤ 3 words** and contains no sentence-internal punctuation. This admits `Anda`, `Apa`, `Di mana`, `adik laki-laki`; rejects example sentences like `Awan mau beli apa di kota?`, `Kita harus belajar di rumah` (the `{ word: '<sentence>' }` entries seen in ch5's pronoun examples).
3. **`item_type`** = `word` (single token) or `phrase` (2–3 tokens), per ADR 0014. Never `sentence`/`dialogue_chunk`.

## 3. Decisions to confirm (the genuine forks)

1. **Trailing `?`/`!` normalization.** `Apa?`, `Di mana?`, and the existing `ayo!`/`mari!` items keep punctuation today (`itemSlug` = lowercase+trim only). To (a) match frequency lists and (b) avoid `apa?`-vs-`apa` near-duplicates, the harvest should **strip a trailing `?`/`!`** before `itemSlug`. ⚠️ This collides with the existing `ayo!`/`mari!` items (§7 normalization risk) — resolve-or-create must reconcile, or those two get re-keyed. **Recommend: strip trailing `?`/`!` in the grammar-table extractor; one-time reconcile `ayo!`→`ayo`, `mari!`→`mari`.**
2. **The `asks` gloss.** Question words carry `asks` (a usage description), not a clean translation. **Recommend: derive the NL gloss from the leading clause** (`"Wat? ding, zaak"` → `"Wat?"`), EN via the existing enricher. (Author-review the dozen question words — small, high-value.)
3. **Scope of the first pass.** **Recommend: harvest the clean single-/short-form glossed entries now** (pronouns, question words, place words — the high-frequency core); leave genuinely ambiguous multi-form title entries (`Bapak-Bapak dan Ibu-Ibu`) for a follow-up. The discrimination rule above already excludes example sentences, so "clean subset" falls out of the rule, not a manual list.

## 4. Where it lands (module placement)

Extend `lesson-stage/projectSections.ts`: add a **grammar-table extractor** that walks `grammar` + `reference_table` sections' `categories[].items[]`, applies §2, and emits `lesson_section_item_rows` through the **same** path the vocab sections use (`section_kind` = the section's `content.type`, already among the canonical 10, so no new enum value). Stage Vocabulary (`publishVocabulary`) then harvests them into `learning_items` unchanged. ADR 0014's `word`/`phrase` gate + the ≤6-word guard remain the backstop.

No new module; this is a scope extension of an existing pipeline stage. Per `docs/target-architecture.md` the lesson-stage owns ingestion → typed section rows.

## 5. Relationship to collections

This fix **harvests most of the Top-100 "gaps" automatically** (dalam, the question words, the pronouns). **Sequence:** ship this harvest fix → re-run the frequency diff → the **true residual** content gap (likely a handful of genuinely-absent words) is the only manual authoring left. So this **precedes and shrinks** the collections content step; collections remains the detector + consumer.

## 6. Supabase Requirements

### Schema changes
- **None expected.** Reuses `lesson_section_item_rows` + `learning_items`. `section_kind` already accepts `grammar`/`reference_table` (= `content.type`, canonical 10). **Verify** the `lesson_section_item_rows.section_kind` CHECK (if any) permits them before implementing; if it pins the three item-types, widen it.
- RLS/grants: N/A (existing tables).

### homelab-configs / health checks
- PostgREST/Kong/GoTrue/Storage: **N/A.**
- Health check: extend the count-parity gate (`lesson-stage/verify/countParity.ts`) to include grammar-table item rows; a coverage check that every glossed single-word grammar-table entry resolves to a `learning_item` after publish.

## 7. Out of scope
- Re-deriving glosses for words that already have them (reuse the authored Dutch).
- Harvesting illustrative `example`/`combinations` sub-fields (never vocab).
- The collections content authoring for the true residual gap (separate, post-fix).
- Multi-form honorific title entries (`Bapak-Bapak dan Ibu-Ibu`) — follow-up.

## 8. Verification
- Re-publish ch3 + ch5 → assert `dia`, `ia`, `anda`, `kalian`, the question words, and the place words (`dalam`, `kiri`, `kanan`, …) now exist as `word` `learning_items` with NL+EN.
- Re-run `analyze-top100.ts` → the gap count drops from 33 to the true residual; report it.
- Full pipeline gates green (lesson gate, capability gate, count-parity) on the re-published lessons.
