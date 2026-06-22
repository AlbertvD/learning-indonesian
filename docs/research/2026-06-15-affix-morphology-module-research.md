# Designing an Affix / Morphology Learning Module for Indonesian — Research Report

> Research input (not a spec). Commissioned 2026-06-15 to inform the upcoming
> affix/morphology module — "the moat" (see `memory/project_grammar_table_vocab_harvest_gap.md`).
> 15+ sourced findings on Indonesian morphology pedagogy, atomic learnable unit,
> exercise formats, sequencing, and FSRS/capability modeling. Inline cites `[n]`
> map to the Sources section.
>
> **2026-06-22 — SLA evidence update appended** (see the dated section after
> "Morphology Pedagogy Findings"): a multi-agent deep-research pass put 25 claims
> through 3-vote adversarial verification (14 survived). It corroborates the
> recommendations below and sharpens the exercise design for transparent vs
> allomorphic affixes. Sources [26]–[33].

## Executive Summary (load-bearing recommendations)

- **Affixation is the highest-leverage, highest-difficulty surface in Indonesian.** ~57% of dictionary words and ~29 of every 100 running-text words are affixed [1]; the SLA/BIPA literature names morphology the single hardest part for foreign learners and a major fossilization site [2][3]. The "moat" intuition is correct and evidence-backed.
- **Teach affix MEANING + RULE explicitly, then make the learner GENERATE — do not just teach derived words as vocab.** Explicit morphological instruction reliably beats incidental exposure for adults and produces *generative* competence (apply a known affix to a new root) [4][5][6][7]. That is option (d)+(c), not (b).
- **But pair every rule capability with a small set of worked example derivations.** The rule gives generativity; high-frequency forms must still be cached "as if they were vocabulary" for automaticity [8][9]. Model BOTH a per-affix **rule capability** and per-word **application capabilities**.
- **The meN- / peN- nasalization rule is the make-or-break sub-skill.** Five nasal allomorphs (me-, mem-, men-, meny-, meng-, menge-) selected by root-initial phoneme, with p/t/k/s elision [10][1]. The #1 A2 BIPA error is omitting meN- and overgeneralizing -kan [2]. It deserves its own dedicated drill family.
- **Sequence by frequency × productivity × semantic transparency.** Order: **ber-** and **di-** first (clean, no nasalization), then the **meN- family with nasalization**, then suffixes **-an → -kan → -i**, then **ter-** and **se-**, then the **confixes ke-…-an / peN-…-an / per-…-an**, then **reduplication**; defer -kan/-i contrast and confixes to B1 [11][2].
- **Cards must test production/recognition in context, never the rule in the abstract.** "When do you use -kan?" is near-useless; "*Tolong ___ pintu* (buka)" with a real carrier sentence is effective [12]. Mirrors the app's existing cloze_mcq philosophy.
- **The `affixed_form_pair` table you already have IS the atomic unit's substrate** — a root↔derived pair carrying the affix, meaning-shift, and a nasalization tag. Build on it rather than inventing a new entity.

## Morphology Pedagogy Findings

**Affixation is the dominant difficulty.** BIPA research repeatedly identifies the affixation system as the most challenging element for foreign speakers, "an area where almost all students experience difficulties" [2][3][13]; grammar overall is the hardest aspect of Indonesian for foreign students [11]. Structural, not incidental: ~40 affixes in common use, and verbal-morpheme meanings are *multifunctional* and context-dependent [14].

**Explicit instruction beats incidental exposure for adults.** Explicit teaching of prefixes/suffixes/roots improves both receptive and productive morphological awareness [4][5][6]; adults need intentional learning and metalinguistic noticing first [4]. Instruction should "engage students in problem-solving… to produce novel complex words" — *generation*, not memorization [4][6]. Strongest single finding: design for generation, not recognition alone.

**Productive vs. unproductive affixes determine what to even include.** Partial/imitative reduplication (*laki→lelaki*) is "no longer productive" [15]; the infixes -el-/-em-/-er- survive in ~20 frozen words [1] — teach those as *vocab*, not rules. By contrast peN- is genuinely productive (498k tokens / 2,215 types / 588 hapax in corpus) and worth a generative drill [16][17].

**Semantic predictability is uneven — flag it.** ber- + noun ("having/doing X") is transparent; pe-/peN- realize agents but peN- is also productive for instruments [16][17]; -i carries four productive functions [18]. Teach transparent affixes as confident rules; teach low-predictability affixes (-i, -kan contrast, confixes) with worked examples and explicit "this one is contextual" framing — BIPA advanced teaching's job "shifts from introducing affixes to clarifying their semantic and syntactic constraints" [3].

**Frequency anchors the curriculum** (running-text, indodic [1]): meN- ~1/13 · -kan ~1/20 · -an ~1/34 · di- ~1/40 · se- ~1/42 · ber- ~1/44 · ter- ~1/54 · ke-…-an ~1/65 · -i ~1/70 · peN-…-an ~1/75 · per-…-an ~1/108 · pe- ~1/110.

## SLA Evidence Update — adversarially verified (2026-06-22)

> Follow-up deep-research pass (24 sources, 103 extracted claims; top 25 put through
> 3-vote adversarial verification, 14 upheld). Triggered by a live design question —
> the Affix Trainer's "which affix formed this word?" MCQ felt trivial for transparent
> prefixes (ber-). These findings **corroborate** the recommendations above and sharpen
> three of them. Confidence shown as the adversarial vote (3-0 = all verifiers upheld).

**Explicit instruction beats incidental — now replicated, with effect sizes.** Explicit > implicit > control on all post-tests, 170 Korean EFL learners [27, 3-0]; explicit instruction benefits L2 derivational learning [26, 3-0]; experimental > control on all three derivational-awareness tasks, n=129 [29, 3-0]. Incidental exposure helps but only small–medium effect [27, 3-0]. The payoff is real but **modest**: overall literacy d≈0.33 [30, 2-1]; spelling SMD≈0.38 [31, 2-1]. → Keep the explicit rule card; a couple of good item types per affix beats an elaborate engine.

**Recognition develops before production; production is a distinct, harder skill** [26, 3-0] — learners identify real derived words easily but fail to *produce/judge* novel derivations. Validates the receptive→productive ladder (recognise_word_form_link before produce_derived_form, ADR 0007). Caveat: input-processing (receptive) and pushed-output (productive) *practice* gave statistically **equivalent gains** [26, 3-0] — neither modality is superior; because production lags developmentally, it just needs its own deliberate practice, not a different method.

**Why affixes are hard — and what a drill is actually for.** Bound morphemes are inherently low-salience (frequent → phonologically reduced/fused, hard to perceive) [28, 3-0]; "learned attention / blocking" makes learners ignore morphology when a more salient cue already carries the meaning [28, 3-0]; form-focused instruction works by "drawing learners' attention to forms that might otherwise be ignored" [28, 3-0]. → **The purpose of an affix exercise is to force *noticing* of the form↔meaning link.** A "which affix formed *berjalan*?" item fails this for a transparent prefix: the "ber" on the front is the one high-salience cue, so it trains string-matching, not morphology.

**Morphological awareness is multidimensional — relational, syntactic, distributional** [29, 3-0] — and correlates with productive vocabulary breadth [7, 3-0]. → Exercises should test what the affix *does* (meaning, word-class change, which roots it attaches to), not form-identification alone.

**Transparent vs allomorphic affixes warrant different treatment.** ✅ **Verified 2026-06-22 against the primary source** [32] (the deep-research verifiers had abstained on a session limit; checked directly afterward via the text-accessible lextutor edition + the Victoria University open-access original). Bauer & Nation (1993) arrange affixes into **seven graded levels** by frequency, productivity, **regularity (degree of change imposed on the base)**, and predictability of meaning — verbatim: L3 = "frequent and regular affixes with minimal change to the base word in speech or writing," L4 = "frequent orthographically regular affixes which often impose pronunciation change," L5 = "less frequent but regular affixes," L6 = "frequent but irregular affixes (often with significant change to base word)." So regular/transparent affixes are staged **early**, irregular ones **late**, and regularity is an explicit ordering criterion. **Caveat (precision):** B&N describe *English* affixes, and their regularity axis is about change-to-the-base + predictability of *meaning*, not affix allomorphy as such — so mapping ber- (near-invariant) as early/easy vs meN-/peN- (nasal allomorphy) as later/harder is **our extrapolation by analogy**, not a claim B&N make about Indonesian. The analogy is sound and reinforced by the salience finding [28] and this report's frequency × regularity sequencing [11]. → ber- and meN-/peN- should not carry equal exercise weight.

**Genuinely refuted — do NOT rely on:** "morphology training transfers far better to trained than to untrained items" was rejected 0-3 [31]. So the evidence does *not* say SRS affix drills only strengthen the exact words practised — teaching the rule/pattern is expected to **generalize** to new roots, which is the justification for a rule-based trainer.

**Design implications (sharpen the Exercise-Type Catalog below; supersede nothing):**
- **Transparent affixes (ber-, di-, se-):** de-emphasize the pick-the-affix / formation MCQ (it tests the high-salience surface); prefer **meaning** ("what does *berjalan* mean?") + **usage-in-carrier** items — the relational/syntactic dimensions [29], powered by the now-shipped `derived_gloss` + `carrier_text`.
- **Allomorphic affixes (meN-, peN-):** keep form-focused drilling — there the form *is* the low-salience hard part [28], so "which allomorph?" genuinely trains noticing. This is exactly where the formation MCQ earns its keep.

## Atomic-Unit Recommendation

**A layered unit: an affix-rule capability + per-derivation application capabilities, built on `affixed_form_pair`.**

- **(b) derived words as vocab — rejected as the *primary* mechanism.** No generativity; forfeits the agglutination multiplier ("learn one root → many words") [19][20]. (Derived words still get vocab capabilities for meaning recall — that's the existing vocab module.)
- **(a) affix as rule — necessary but insufficient alone.** Gives the metalinguistic hook [4]; a rule with no instances is the "explain the conditional" anti-card [12][8].
- **(d) affix meaning applied to known roots — the productive core.** "Root Races" (root + combinable affixes → generate words) [19].
- **(c) root→derived transformation — how (d) becomes an FSRS-schedulable capability** [8][12].

**Three capability types, all hanging off `affixed_form_pair`:**

1. **Affix-rule capability** (1 per productive affix/sub-rule): meaning + formation rule. Introduced via lesson reader; scheduled lightly. Metalinguistic anchor.
2. **Nasalization-rule sub-capabilities** (special case for meN-/peN-): one per phonological context class (p→m drop, t→n drop, k→ng drop, s→ny drop, vowel→meng, single-syllable→menge) [10][1].
3. **Derivation-application capability** (1 per `affixed_form_pair`): "*tulis* + meN- → *menulis*" / "*menulis* → decompose + meaning." The FSRS workhorse, carries production + recognition.

`affixed_form_pair` should carry: root, derived form, affix(es), nasalization-context tag, meaning-shift gloss, productivity flag (productive→rule-drillable / frozen→vocab-only), semantic-transparency flag.

## Exercise-Type Catalog

| Format | Skill trained | Indonesian example |
|---|---|---|
| Produce-the-derived-form (root + affix → derived) | Production / rule application | *tulis* + meN- → **menulis** [19] |
| Nasalization MCQ (root → pick allomorph) | Phonological rule application | meN- + *pukul* → **memukul** (p drops) [10][1] |
| Decompose-the-word (derived → root + affix + meaning) | Recognition / analysis | *memperbaiki* → mem-per-baik-i "repair" [1] |
| Affix cloze in carrier sentence | Productive recall in context | *Dia ___ surat itu* (tulis) → **menulis** [12] |
| Pick-the-affix (root + meaning → which affix) | Affix-meaning mapping | *ajar*→"teacher": **peng-** (*pengajar*) [19][16] |
| Contrast pair (same root, two affixes) | Semantic discrimination | **memukul** (hit) vs **terpukul** (struck) [21] — reuse contrast_pair |
| -kan vs -i discrimination | Constraint mastery (B1) | *meletakkan* vs *meletaki* [18] |
| Reduplication production | Reduplication rule | *anak*→**anak-anak**; *jalan*→**jalan-jalan** [15][22] |
| Build-the-confix (root → confixed noun) | Confix application (B1) | *adil*→**keadilan**; *latih*→**pelatihan** [1] |
| Reverse-generate (Root Race) | Word-family fluency | *ajar* → mengajar, belajar, pengajar, pelajaran… [19] |

Production: rows 1,4,8,9,10. Recognition/analysis: 3,6. Rule-application/discrimination: 2,5,7. Weight the schedule toward production once recognition is stable [5]. Most rows reuse existing primitives (contrast_pair, cloze_mcq, constrained_translation) — the module is **mostly new content on existing exercise machinery, not a new framework**.

## How Other Apps / Languages Handle Morphology

- **Duolingo Turkish (agglutinative) — failure mode to avoid.** Translation-exercise format "struggles… individual sentence translations don't expose learners to enough variations of the same suffix patterns"; needs "massive contextual exposure" [23]; course is unusually short due to authoring difficulty [24]. → Don't bury affixation in generic translation drills; give it a dedicated, rule-aware drill family with deliberate cross-root variation.
- **Anki / Japanese conjugation — rule + memorize-frequent-forms hybrid.** Excels at discrete items, but high-frequency conjugations are better "memorize[d]… as if they are new vocabulary" despite clean rules [8][9]. → The hybrid (rule cap + per-word application cap) is the validated design.
- **SRS card orthodoxy.** Single unknown + real carrier; repeated failure is "almost always a design problem" [12]. → Every card needs one unknown and prerequisite-gated roots.
- **Generative-vocabulary (literacy).** Root-family "Root Races" is the canonical productive activity [19][20].

## Recommended Affix Sequencing

Ordered by frequency [1] × productivity [16][17] × transparency [16][18] × BIPA difficulty [2][11]. Each stage assumes its root vocab is owned.

1. **ber-** (verb, "do/have X") — A1. Transparent, no nasalization, intransitive. *berbicara, bermain* [25].
2. **di-** (passive) — A1/A2. Form-invariant; acquired early but harder to *produce* than recognize [2][10]. *dibaca, dimakan*.
3. **meN- + nasalization rule** — A2 keystone. Most frequent prefix [1]; teach 5 allomorphs + p/t/k/s-drop as separate sub-capabilities [10][1]. 45% of A2 learners omit meN- [2] — over-invest.
4. **-an** (nominalizer) — A2. Most accessible suffix. *makanan, lapangan* [1].
5. **-kan** (causative/benefactive) — A2/B1. Frequent but the overgeneralization site (30% of A2 errors) [2] — introduce after meN- is stable.
6. **-i** (locative/iterative applicative) — B1. Four functions [18]; teach via -kan-vs-i contrast pairs.
7. **ter-** (accidental/resultative/superlative) — A2/B1. Teach as contrast vs meN- [21].
8. **se-** (one/same/as-as) — B1. Multifunctional, high-frequency [1].
9. **pe-/peN-** (agent/instrument noun) — B1. Reuses meN- nasalization → cheap once meN- mastered [16][10].
10. **Confixes ke-…-an, peN-…-an, per-…-an** — B1/B2. Teach process-vs-result split explicitly [1].
11. **Reduplication** — A2→B2. Full reduplication (plurality/variety) first [15][22]; ber-…-an reciprocity + *jalan-jalan* later; partial/imitative as **frozen vocab** [15].

## SRS / Capability Modeling Recommendation

**Adopt the hybrid — a rule capability AND per-derivation application capabilities.** They schedule different things:

- **Per-affix rule capability** (~15–20 total): cheap review load, carries generative metalinguistic knowledge [4]. Scheduled as recognition/explanation. Mastery ≠ can apply to a specific word under time pressure — hence also:
- **Per-`affixed_form_pair` application capability** (many): gives fluency/automaticity, tests production-in-context [8][12]. **Gate by root-vocab prerequisite** (don't schedule *menulis* until *tulis* known) and **cap new pairs/affix/day** (reuse existing sibling-burying machinery).

Why both: rules give generativity, frequent forms need caching as quasi-vocab [8][9]; the two target metalinguistic knowledge vs. retrieval fluency and will settle on very different FSRS intervals.

Specifics:
- Rule capability is a **prerequisite/unlock** for its application capabilities (rule before instances) — matches ADR 0006 ("every capability has an introducing lesson").
- **Nasalization sub-rules are first-class capabilities** (the failure point [2]); FSRS keeps p-drop scheduled long after vowel-meng retires.
- Application caps: prefer cloze-in-carrier + produce-the-form as the scheduled review (production), with decompose/recognition as the easier intro step → graduate recognition → production as stability grows.

## Open Questions for the App Author

1. **Root-vocab prerequisite:** hard-*block* application caps until root mastered, or merely *deprioritize*? (Single-unknown-card rule [12] argues block; leverage argues deprioritize.)
2. **How many derivations per affix to author?** Target ~8–15 high-frequency, high-transparency pairs per productive affix, rule cap carries the generative claim?
3. **Productive-vs-frozen tagging policy:** who classifies rule-generated (drillable) vs. lexicalized (*jalan-jalan*, *kepala*) (vocab-only)? Misclassification teaches false generalizations.
4. **Nasalization: production drills or only recognition/MCQ?** Error data [2] argues production; grading noise argues MCQ.
5. **Reduplication scope in v1:** full reduplication only, or also ber-…-an reciprocity / imitative forms (low-frequency, irregular [15])?
6. **-kan/-i contrast — own mini-curriculum or scattered B1 caps?** Hardest single discrimination [18][2].

## Sources

1. indodic.com — *Forming Indonesian Words & Using Indonesian Affixes* — https://indodic.com/affixeng.html
2. *The Use of Affixation and Its Errors on BIPA Level 5 Learners' Assignments* (Tabasa, UIN) — https://ejournal.uinsaid.ac.id/index.php/tabasa/article/view/10119
3. *Teaching Implication of Meaning Construction* (ERIC EJ1434760) — https://files.eric.ed.gov/fulltext/EJ1434760.pdf
4. *The Role of Morphological Awareness and Explicit Morphological Instructions in ELT* — https://www.academia.edu/63158712/
5. *The Effects of Morphological Awareness on L2 Vocabulary Acquisition* (Sciedu WJEL) — https://www.sciedupress.com/journal/index.php/wjel/article/download/22960/14395
6. *Transformative impacts of explicit morphological instruction…* (HSSC / Nature) — https://www.nature.com/articles/s41599-024-03610-4
7. *The Impact of Morphological Awareness Intervention…* (Education Research International, Wiley) — https://onlinelibrary.wiley.com/doi/10.1155/2022/5930822
8. *Anki Language Learning Guide* (Migaku) — https://migaku.com/blog/japanese/anki-language-learning-guide
9. Wikipedia, *Japanese conjugation* — https://en.wikipedia.org/wiki/Japanese_conjugation
10. *Acquisition of Indonesian Affixes* (UNAIR) + Unbabel Indonesian guidelines — https://repository.unair.ac.id/118090/6/4.%20BAB%20II%20LITERATURE%20REVIEW.pdf
11. *CEFR-based Model of Indonesian Grammar Teaching* (KnE Social Sciences; Permendikbud 27/2017) — https://knepublishing.com/index.php/KnE-Social/article/download/15676/24700/77173
12. *Spaced Repetition for Language Learners: A 2026 Guide* (Migaku) — https://migaku.com/blog/language-fun/spaced-repetition-for-language-learners-a-2026-guide
13. *The Mapping of Language Teaching Materials of BIPA* (ERIC ED626438) — https://files.eric.ed.gov/fulltext/ED626438.pdf
14. *Reduce Indonesian Vocabularies with an Indonesian Sub-word Separator* (arXiv 2207.00552) — https://arxiv.org/pdf/2207.00552
15. *Double Double, Morphology and Trouble: Reduplication in Indonesian* (ACL U09-1007) + JLLS EJ1325413 — https://aclanthology.org/U09-1007.pdf
16. *The Indonesian prefixes PE- and PEN-: productivity and allomorphy* (Denistia & Baayen, *Morphology*, Springer) — https://link.springer.com/article/10.1007/s11525-019-09340-7
17. *The morphology of Indonesian: Data and quantitative modeling* (Denistia & Baayen 2021) — https://quantling.org/~hbaayen/publications/DenistiaBaayen2021.pdf
18. *Minangkabau -i: locative/transitivizing/iterative/adversative suffix* (PLSA/LSA) — https://journals.linguisticsociety.org/proceedings/index.php/PLSA/article/view/4098
19. *Teaching and Learning Morphology: Generative Vocabulary Instruction* (Hiebert & Pearson, TextProject) + Keys to Literacy — https://textproject.org/wp-content/uploads/resources/Hiebert-Pearson-Generative-vocabulary-instruction.pdf
20. *Morphology/Affixes* (Speechy Musings) + AdLit *Key Literacy Component: Morphology* — https://www.adlit.org/topics/phonics-word-study-decoding/key-literacy-component-morphology
21. *The Indonesian Prefix /Me-/: Productivity, Allomorphy, and Usage* (IJSCL) — https://www.ijscl.com/article_704769_26b81cd2766a1d373f0fa26b37c72cdc.pdf
22. *Types and Functions of Reduplication in Indonesian* (eVols, U. Hawai'i) — https://evols.library.manoa.hawaii.edu/server/api/core/bitstreams/8266d7f4-41c3-4d74-b12d-60f6694c41db/content
23. *Duolingo Intermediate Turkish* (Clozemaster) — https://www.clozemaster.com/blog/duolingo-intermediate-turkish/
24. *Turkish for English* (Duolingo Wiki) — https://duolingo.fandom.com/wiki/Turkish_for_English
25. Talkpal — *What are the most common prefixes in Indonesian?* — https://talkpal.ai/culture/what-are-the-most-common-prefixes-in-indonesian/

### Added 2026-06-22 (deep-research verification pass)

26. Friedline, B. E. (2011) — *Challenges in the Second Language Acquisition of Derivational Morphology* (PhD diss., Univ. of Pittsburgh) — https://d-scholarship.pitt.edu/8351/1/Friedline_ETD_8-15-2011_FINAL.pdf — *[explicit instruction benefits L2 derivation; recognition > production; receptive ≈ productive practice gains]*
27. *Effects of Implicit and Explicit Instruction on Morphological Awareness and Knowledge* (170 Korean EFL learners) — https://www.researchgate.net/publication/340316125 — *[explicit > implicit > control on all post-tests]*
28. Ellis, N. C. — *salience, learned attention/blocking, and form-focused instruction* (PMC) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5002427/ — *[why bound morphology is under-learned; what FFI is for]*
29. *Effect of explicit morphological instruction on derivational morphological awareness* (n=129, randomized quasi-experiment) — https://www.tandfonline.com/doi/full/10.1080/2331186X.2018.1523975 — *[gains on relational/syntactic/distributional awareness]*
30. Bowers, Kirby & Deacon (2010) — *The Effects of Morphological Instruction on Literacy Skills: A Systematic Review* (meta-analysis, d=0.33) — https://pubmed.ncbi.nlm.nih.gov/20799003/
31. *Meta-analysis of morphological instruction effects on reading and spelling* (2024) — https://link.springer.com/article/10.1007/s10648-024-09953-3 — *[small–moderate effects; spelling SMD≈0.38; refuted the trained-only-transfer claim]*
32. Bauer, L. & Nation, P. (1993) — *Word Families* (affix-levels framework) — PDF https://www.lextutor.ca/morpho/fam_affix/bauer_nation_1993.pdf (image-encoded, not text-extractable) · text edition https://lextutor.ca/morpho/fam_affix/bauer_nation_93.html · open-access original https://openaccess.wgtn.ac.nz/articles/journal_contribution/Word_families/12560408 — *[VERIFIED 2026-06-22: seven graded levels by frequency/productivity/regularity/predictability → transparent early, irregular late]*
33. *Affixal neutrality and L2 derivational knowledge* (MDPI Languages, 2026) — https://doi.org/10.3390/languages11030046 — *[neutral/transparent affixes aid relational tasks; sequence them earlier]*

**Method note:** Several academic PDFs returned encoded content on direct fetch; those claims are grounded in indexed abstracts plus corroborating accessible sources. The two most load-bearing data sources — indodic's affix-frequency table [1] and the Talkpal beginner ordering [25] — fetched cleanly in full.
