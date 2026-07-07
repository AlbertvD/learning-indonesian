# Uitspraak trainer — feature review (2026-07-07)

**Scope.** Full review of the pronunciation surface (`/pronunciation`): the pitfall primer, minimal-pair perception drills, shadowing, and the L1 podcasts — against ADR 0025's own design intent and the L2-perception-training literature, plus live-DB ground truth (queried 2026-07-07).

**Method.** Every behavioural claim verified against code at the cited `file:line` on main (rev `26e1fa3b`) or the live DB. Note: the deep-research doc ADR 0025 cites (`docs/research/2026-06-29-speaking-intelligibility-pedagogy.md`) **was never committed** (the producing session hit a limit — ADR 0025 §Note); the external evidence below was re-verified independently for this review.

---

## 1. What exists today (verified inventory)

- **The primer page** (`src/pages/Pronunciation.tsx`): L1-filtered pitfall cards (Dutch UI → 7 pitfalls, English → 8, from the 11-entry catalog), each with the sound badge, the rule, the L1-specific mistake, 4 tappable example words (native audio + shadow control), and minimal pairs where defined (`PitfallCard.tsx:20-73`).
- **The pitfall catalog** (`src/lib/pronunciation/pitfallCatalog.ts:46-203`): a frozen code constant — 4 shared pitfalls (e two-sounds, c=tj, ng digraph, final consonants), 3 Dutch-specific (hard g, w, j), 4 English-specific (tapped r, pure vowels, unaspirated p/t/k, initial ng-). **5 minimal pairs total**: cari/kari, makan/makam, gali/kali (NL-visible), rusa/lusa (EN-only) — plus none for 7 of the 11 pitfalls.
- **Perception** (`MinimalPairPlayer.tsx:21-62`): play A, play B, "Vergelijk" plays A-then-B. Playback only — no task, no learner response, no feedback.
- **Shadowing** (`ShadowControl.tsx:18-68`): per example word — record (MediaRecorder), then A/B compare (model → your take). Client-only, in-memory, discarded on unmount. Word-level only.
- **The podcast**: one `texts` row ("Uitspraak · Pronunciation") with twin audio, L1-routed (`Pronunciation.tsx:63-68`); verified present live with both NL and EN files.
- **Constraints honoured** (ADR 0025): no ASR, no FSRS, no schema, no per-use COGS. All verified — the feature is exactly as scoped.

## 2. What works well (keep)

1. **The scope call was right.** Indonesian is phonetic and tone-free; the pitfall set IS a closed list, and "taught once, not drilled per-word forever" holds. Declining ASR remains correct (false-reject demotivation for near-zero gain — ADR 0025 §Why).
2. **L1-awareness is a real differentiator.** Dutch-specific pitfalls (hard g, w, j) with Dutch contrast framing exist in no mainstream competitor. The catalog structure (per-L1 rules + mistakes) is exactly the right shape.
3. **Shadowing is tastefully minimal** — record/compare with zero infrastructure, honouring both the pedagogy (a model to imitate + the act of speaking) and the privacy posture (nothing uploaded).
4. **Catalog-as-code** makes every content improvement below a data edit, not a build.

## 3. Findings (severity-ordered)

### U1 — HIGH (live content defect): 5 words have no audio, silently breaking the flagship drills

Live DB: **`kari`, `makam`, `ngeri`, `ngantuk`, `nganga` have no audio clip** (44/49 catalog words covered). Consequences, all verified in code:

- **cari/kari** and **makan/makam** — 2 of the 3 minimal pairs a Dutch learner sees — have a dead B-side: `PlayButton` with an undefined URL renders but no-ops (`PlayButton.tsx:15-16,36-38`), and the Vergelijk button is disabled (`MinimalPairPlayer.tsx:53`).
- The **entire initial-ng pitfall** (English learners' hardest item — English never starts a word with ŋ) is fully silent: all three examples are missing clips, so an EN learner gets a pronunciation card whose every audio control does nothing.

These are precisely the non-vocabulary words (the pair B-sides and ng- examples aren't lesson items), so the one-off seeding that covered the rest missed them. Fix = a one-off TTS seed for 5 words + hand-check (the ADR's own Chirp3-HD short-word caveat).

### U2 — HIGH (pedagogy gap): perception is passive — the evidence-backed mechanism is identification with feedback

The current minimal-pair player lets the learner *hear* the contrast but never *tests* it. The perception-training literature is specific about what works: **identification tasks with immediate feedback** over natural variability (HVPT). Two meta-analyses confirm the effect and — critically — its **transfer to production without any production training**: perception-only training improves L2 production with d≈0.54 ([Sakai & Moorman 2018](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/does-perceptual-high-variability-phonetic-training-improve-l2-speech-production-a-metaanalysis-of-perceptionproduction-connection/E38D8F5CE65DC708137B0E95F97C6BC7)-adjacent lineage; their 2018 Applied Psycholinguistics meta-analysis), and HVPT specifically yields g≈.49–.66 production gains ([Uchihara et al. 2024, Applied Psycholinguistics](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/does-perceptual-high-variability-phonetic-training-improve-l2-speech-production-a-metaanalysis-of-perceptionproduction-connection/E38D8F5CE65DC708137B0E95F97C6BC7); overview: [Uchihara et al. 2025, SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6)).

The gap between what's built (play + compare) and what the evidence supports (hear one → identify which → feedback) is small in code and large in value. This is the single highest-value upgrade to the feature, and it needs **no ASR, no FSRS, no schema** — it stays inside ADR 0025's constraints.

### U3 — MEDIUM (coverage): the catalog is missing pitfalls, including one named in its own ADR

- **Penultimate stress** is explicitly on ADR 0025's closed list ("penultimate stress" — §Why) and on the original ~5-pitfall memo, but is **absent from the shipped catalog** — no stress card exists.
- **ny** (nyonya, banyak): the memo's "ng/ny" pair shipped only its ng half. Dutch and English both lack /ɲ/; learners read it as n+j.
- **The Dutch u-misreading**: Indonesian ⟨u⟩ = /u/ ("oe"), but Dutch ⟨u⟩ = /y~ʏ/ — a naive Dutch reader says *susu* as "süsü". Arguably the **#1 Dutch letter-to-sound trap** (Dutch speakers of a certain age may even auto-correct via the old ⟨oe⟩ spelling — worth one line in the card). Missing entirely.
- **au / ai diphthongs** (pulau, pantai): mainly an English-speaker item (smoothing/gliding). Minor, but cheap.

All four are pure catalog-data additions + a handful of TTS clips.

### U4 — MEDIUM (drill depth): 5 pairs, 1 voice — thin for perception training

HVPT's defining ingredient is **variability**: multiple talkers, varied contexts. The app already owns **6 Chirp3-HD voices** (3M/3F — `memory/reference_tts_voices`), but every clip is fetched with `voiceId: null` (`Pronunciation.tsx:42`) — one voice per word. And 7 of 11 pitfalls have no pairs at all where contrasts exist (g/k has one pair; r/l one; n/m one; c/k one). Expanding to 2–4 pairs per contrastable pitfall × 2–3 voices is pure data seeding and directly implements the "high-variability" in HVPT. (Honest limit: the e-schwa/é pitfall can't have spelling-differentiated pairs — the spelling is identical by design; that card stays example-based.)

### U5 — LOW (UX): dead-looking controls when audio is absent

`PlayButton` renders an enabled-looking button that does nothing when its URL is missing (U1 words today; any future gap tomorrow). It should hide or disable itself. Same for `ShadowControl`'s compare with a missing model URL (`ShadowControl.tsx:39-41` guards the recording but not the model side — `playSequence([undefined, url])` skips the model silently, so "compare" plays only your own voice with no model).

### U6 — LOW (scope extension): shadowing is word-level only; the evidence is strongest at sentence level

Shadowing research shows the reliable gains are in **comprehensibility, fluency, and prosody** — sentence-level phenomena; segmental effects are inconclusive ([Foote & McDonough 2017](https://www.researchgate.net/publication/316002411_Using_shadowing_with_mobile_technology_to_improve_L2_pronunciation); [2025 systematic review](https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827)). The app already has dialogue-line audio in every lesson; the shadowing affordance never meets it. A "shadow this line" control on dialogue lines (or a small "schaduw de dialoog" set in the primer) would put the mechanism where its evidence is.

### U7 — LOW (funnel): the primer has no day-one hook

ADR 0025's core argument is that pronunciation is a **small, front-loaded** problem. Front-loaded means day-one: but nothing in onboarding (Welkom, instaptoets follow-up, first lesson) points at the primer; it's only the 4th tab of LerenNav. For a feature whose whole value is "read this once, early," the absence of an onboarding hook contradicts its own premise.

## 4. Improvement proposals (prioritized; minimum mechanism)

### UP1 — Seed the 5 missing clips + guard the controls (fixes U1, U5) — SMALL

One-off TTS batch (kari, makam, ngeri, ngantuk, nganga) with a hand-check of each clip; `PlayButton` hides (or disables with tooltip) on missing URL; `ShadowControl` requires the model URL for compare. This repairs the Dutch learner's minimal pairs and the EN ng- card immediately.

### UP2 — "Test je oor": identification quiz per contrastable pitfall (fixes U2) — SMALL/MEDIUM

Per pitfall with pairs, add a quiz mode to the existing card: play ONE word (random member, random voice) → learner taps *makan* or *makam* → instant feedback → next round; show a session streak. Client-only state (optionally best-streak in localStorage), **no FSRS commit** (consistent with ADR 0025 — this is perception, not a scheduled capability; revisit FSRS only if usage proves demand). Implementation: one new component beside `MinimalPairPlayer` reusing the prefetched audio map; the randomized-voice requirement rides UP3's seeding.

### UP3 — Multi-voice + more pairs (fixes U4) — SMALL (data only)

Extend the pair inventory (2–4 pairs per contrastable pitfall; candidates: parang/barang for aspiration, muda/mudah for final-h if added, tari/tali r/l, bagi/baki g/k …) and seed each pair word in 2–3 of the existing Chirp3-HD voices. Extend `fetchSessionAudioMap` usage to request specific voiceIds (the plumbing exists — the call site just passes null today).

### UP4 — Catalog completion (fixes U3) — SMALL (data + a few clips)

Add: **u = "oe"** (NL, high priority), **ny** (both L1s), **penultimate stress** (rule card + multi-syllable examples; no pairs — honour the ADR's own list), **au/ai** (EN). Pure `pitfallCatalog.ts` edits + clip seeding.

### UP5 — Sentence shadowing on dialogue lines (fixes U6) — MEDIUM

Reuse `ShadowControl` beside the existing per-line play buttons in lesson dialogue scenes (the bespoke pages all render dialogue lines with audio). Zero backend; the only cost is UI restraint (one small mic icon per line, hidden until the line's audio has been played once, perhaps).

### UP6 — Day-one hook (fixes U7) — SMALL

One card on Welkom (and/or the instaptoets result page): "2 minuten: de klanken die Nederlandstaligen fout doen → Uitspraak". Optionally a localStorage "primer seen" tick feeding the existing first-run checklist machinery.

### What NOT to build

- **No ASR grading / per-phoneme scoring** — ADR 0025's reasoning is untouched by anything above.
- **No FSRS pronunciation capabilities** — the identification quiz stays unscheduled until real usage argues otherwise.
- **No waveform/pitch visualizations** — cute, evidence-free for this population, real build cost.
- **No podcast pipeline productization** — the two episodes remain one-offs (staff-engineer call stands).

## 5. Suggested sequencing

| Order | Item | Size | Gate |
|---|---|---|---|
| 1 | UP1 missing clips + control guards | S | none |
| 2 | UP4 catalog completion (u, ny, stress, au/ai) | S | none (content) |
| 3 | UP3 pairs + multi-voice seeding | S | none (content) |
| 4 | UP2 identification quiz | M | staff-engineer (UI/scope sanity) |
| 5 | UP6 day-one hook | S | none |
| 6 | UP5 sentence shadowing | M | architect (touches lesson pages) |

The theme: **the feature made the right strategic call (primer, not ASR) but stopped one step short of the evidence** — perception needs a task, not just playback; and its two flagship Dutch drills are currently broken by five missing audio files.

## Sources

- In-repo: ADR 0025; `src/lib/pronunciation/pitfallCatalog.ts`; `memory/research_audio_sla` (dual-coding/listening evidence); `memory/reference_tts_voices`.
- Live DB queries 2026-07-07 (audio coverage of all 49 catalog words; podcast row).
- External (verified this review): [Uchihara, Karas & Thomson 2024/2025 — HVPT meta-analyses (Applied Psycholinguistics / SSLA)](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6); [perception→production meta-analysis (Applied Psycholinguistics)](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/does-perceptual-high-variability-phonetic-training-improve-l2-speech-production-a-metaanalysis-of-perceptionproduction-connection/E38D8F5CE65DC708137B0E95F97C6BC7); [Foote & McDonough 2017 — shadowing with mobile technology](https://www.researchgate.net/publication/316002411_Using_shadowing_with_mobile_technology_to_improve_L2_pronunciation); [2025 systematic review of shadowing for L2 pronunciation](https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827).
