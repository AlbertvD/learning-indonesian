---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC (promoted from ideas catalog A7 after market research;
     evidence: docs/research/2026-07-06-market-research-competitive-landscape.md §3).
     Deliberately not implementation-ready: each slice needs its own execution spec +
     full gauntlet before building. -->

# "Spreektaal" — the bahasa gaul register track

## Goal

Teach the Indonesian people actually *speak*. Every mass-market tool (and our Leiden-derived coursebook content) teaches formal *bahasa baku*; real conversation runs on colloquial forms (*nggak, udah, gue, banget*), particles (*dong, sih, kok, deh*), and reduced verb forms. A learner who finishes our lessons today "sounds like a news broadcast and can't understand the reply" — the market's loudest documented complaint, and currently ours too.

## Why us / why bold

The register gap is validated (an entire niche app, KataKita, monetizes it alone) — but nobody teaches it *on top of a learner model*. Our version rides the loanword-bridge trick a second time: the learner already knows *tidak*, so *nggak* is a **cheap win linked to existing knowledge**, schedulable by FSRS like everything else. And register-aware Percakapan personas (the friend speaks gaul, the immigration officer speaks baku) teach register *choice* — which no competitor even attempts.

## The decomposition (the key design move — three content kinds, three EXISTING grooves)

| Bahasa-gaul phenomenon | Examples | Existing machinery it flows through |
|---|---|---|
| **Register pairs** — same word, colloquial form | *tidak→nggak, sudah→udah, saja→aja, memang→emang, kalau→kalo, habis→abis*; *-kan→-in (beliin)*; *nge-* verbs (*ngomong, ngerti*) | The morphology **surface + capability shape** — the form-pair capability model and trainer UX (Affix Trainer precedent, ADRs 0018–0021) — but explicitly **NOT the deterministic affix engine** (staff-engineer): register pairs are lexical and hand-authored (~100–150 stable pairs); slice 4 must not try to bolt a derivation engine onto them. `source_kind` is an established extensible axis, so new-kind-vs-reuse stays a real, correctly-deferred fork |
| **Particles** — usage-rule function words | *dong, sih, kok, deh, kan, nih, tuh, lho, ya, mah* | The **grammar-pattern machinery**: pattern brief → recognise/contrast/produce caps → cloze_mcq/contrast_pair/transform/translate exercises. ~12–15 particles; contrast pairs are PERFECT for particle nuance ("dong vs sih here?") |
| **Colloquial vocabulary** — new words | *banget, keren, gitu/gini, ngobrol, capek, gimana* | The **vocab pipeline + a collection** (`spreektaal` theme collection; Ontdek; gap words → lesson-999 or an own synthetic home unit) |

**Durability rule:** author the **stable colloquial layer** (decades-stable: *nggak, udah, banget, aja, gimana*) as the core; true churning slang (*santuy, mager, baper*) only as a small, explicitly-marked "levende straattaal" appendix — content that dates is content debt.

**Register spectrum honesty:** three registers, not two — baku (*saya, tidak*) → informal standard (*aku, kamu, nggak* — safe everywhere) → Jakarta gaul (*gue, lu* — regional, can be rude in the wrong mouth/context). The informal-standard layer is the core deliverable; Jakarta gaul is taught *with its appropriateness rules*, never as the default.

## What's genuinely new (only two things)

1. **The Spreektaal primer** — a one-page register explainer (when baku, when informal, what *gue/lu* signals), following the **pronunciation-primer precedent** (ADR 0025: primer + catalog, no new mechanism). Register appropriateness is taught explicitly before it's drilled.
2. **Grader acceptance** — colloquial answers must never be marked wrong: *nggak* accepted where *tidak* is expected (productive exercises). Rides the **just-shipped answer-variants machinery** — colloquial variants are literally rows in `item_answer_variants`. (Deliberate asymmetry: we *accept* colloquial everywhere but *prompt* in the register being taught.)

Display enrichment (cheap, high-delight): formal words that have a colloquial sibling show it as a chip — "spreektaal: *nggak*" — in exercise feedback and the reader gloss, the same way morphology shows derived forms.

## Slices

1. **Grader acceptance NOW** — seed colloquial variants (*nggak, udah, aja…*) into `item_answer_variants` for existing formal items. **Author the rows directly and use the shipped `apply` path only — NO LLM `generate` pass** (staff-engineer: the pairs are a known closed list; deterministic > LLM; the `informal` variant_type already exists in the table's CHECK constraint). No UI, no new content surface; immediately stops false negatives for learners who already know some gaul. Ships independent of everything else.
2. **Primer + Spreektaal collection** — the ~120-item stable colloquial vocab + register-pair glosses ("informeel voor *tidak*"), authored via the vocab pipeline, one theme collection, the primer page. The learnable core.
3. **Particles as grammar patterns** — ~12 particles through the linguist pipeline into the typed grammar exercise tables (contrast-pair-heavy).
4. **Register-pair trainer** — the morphology-template surface ("zeg het informeel": *tidak bisa → nggak bisa*), incl. the pair capability shape (new `register_pair` source kind vs reuse — data-architect fork for its execution spec).
5. **Register personas** — lands inside Percakapan (Bet 3): persona register set per scenario; the end-of-chat summary flags register mismatches ("je zei *Anda* tegen je vriend"). Plus colloquial-register story/dialogue content for the reader over time.

## Supabase Requirements (high level — execution specs refine)

- **Schema:** slice 1: none (answer-variants rows are data). Slice 2: likely one `register` marker on `learning_items` (or membership-implied via the collection — data-architect fork) + possibly a `colloquial_counterpart` link for the display chip. Slice 4: the pair-capability shape decision. All content-regime tables; no learner-data writes anywhere.
- **RLS/grants/homelab/health checks:** content-standard; slice-level specs enumerate.

## Cost & monetization

Authoring-only (linguist agents + review; no per-use AI). Positioning value is outsized: "leer Indonesisch zoals het echt gesproken wordt" answers the market's loudest complaint, and the primer + a taste of the collection can be free-tier funnel content with the full track as a premium collection SKU (collections are already the SKU model).

## Out of scope

- Teaching *regional languages* (Javanese, Sundanese, Balinese) — different languages, not registers. Named because users will ask.
- Auto-deriving colloquial forms (no deterministic engine exists for register the way affixes have one; pairs are hand-authored).
- Rewriting existing lesson content into gaul (lessons stay baku — the register CONTRAST is the pedagogy).

## Open questions (for slice execution specs)

1. Register metadata shape: item column vs collection-implied vs pair-link table (data-architect; slice 2/4).
2. Unlock policy: available immediately vs recommended-after-lesson-N (pedagogy lean: primer visible early, collection recommended once ~lesson 4–5 vocabulary exists to pair against).
3. TTS: do Chirp3-HD voices render colloquial forms naturally (*nggak* pronunciation)? Verify before audio-dependent slices.
4. **⚠️ CROSS-SLICE CONTRACT (staff-engineer — not a slice-5-local choice):** the slice-1 promise ("accept colloquial everywhere") and the slice-5 promise ("flag register mismatch to the officer persona") collide — the same answer cannot be both correct and flagged in one exercise. Resolve as a single rule before slice 5: e.g. *vocabulary graders always accept both registers; register-appropriateness is judged ONLY in Percakapan scenarios and register-transform exercises, where the register IS the thing being tested.* Whatever the rule, it is one contract spanning slices 1/4/5, decided once.
5. Whether the register-pair trainer earns its own Voortgang facet or lives as collection coverage initially (lean: coverage first — the morphology-axis precedent came AFTER the module proved out).
