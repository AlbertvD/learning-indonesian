# Reading Content Licensing — Sources for Read-Only Indonesian Stories (Reader Phase 2, Slice 4)

**Date:** 2026-06-29
**For:** Reader Phase 2, **Slice 4** (#304) — new read-only authored content seeded as audio-less `texts` rows. Parent PRD #300; design plan `docs/plans/2026-06-28-reader-phase-2-design.md` §7.
**Method:** Web deep-research, four parallel source-specific passes (StoryWeaver, Global Digital Library, Let's Read Asia, public-domain dongeng + misc), every claim source-verified against live pages/APIs on 2026-06-29. Findings also stored in OpenBrain (thought `81295fe3`).

> **The one rule that decides everything:** the app is **paid / commercial**. Therefore — **CC-BY (attribution-only) = USABLE; CC-BY-SA (share-alike) = REJECT** (copyleft contaminates a closed paid app, ADR 0022); **any -NC (non-commercial) = REJECT.** License must be checked **per title** — every mixed-license platform below carries titles you can't use sitting next to titles you can.

---

## Verdict by source

| Source | Indonesian beginner titles | License reality | Usable in a paid app? |
|---|---|---|---|
| **StoryWeaver** (Pratham Books) | ~64 confirmed (2020 floor; likely several hundred now) | **Default CC-BY 4.0** (commercial + adapt/translate OK), but a genuine **MIX** — some CC-BY-SA, some CC0/PD | ✅ **Yes — per title.** Best reusable-text source. Reject CC-BY-SA per title. |
| **Global Digital Library** (digitallibrary.io) | 502 total; Level-1 thin, skews L2/L3 | **Mix**: many **CC-BY-4.0** (usable) + **CC-BY-NC** + **CC-BY-NC-SA** | ✅ **Yes — per title.** Filter to CC-BY-4.0 via the content API `license` field; discard every `-NC`/`-SA`. |
| **Let's Read Asia** (Asia Foundation) | 229 sampled / ~538 total | **100% NonCommercial** — CC-BY-NC / CC-BY-NC-ND. **Zero CC-BY** in the Indonesian set | ❌ **No.** Off-limits as-is. (CC-BY exists for *other* languages, not Indonesian.) |
| **Public-domain dongeng** (your own retellings) | Unlimited | Plot = free folklore (idea-expression dichotomy); your words = your copyright | ✅ **Yes — safest of all.** No attribution, no per-title audit. |
| Wikisource ID (id.wikisource.org) | — | **CC-BY-SA** (share-alike) | ❌ Contaminates a paid app. Avoid as a copy source. |
| Project Gutenberg | ~none in Indonesian | Public domain | ⚠️ No usable Indonesian content. |
| Badan Bahasa direct PDFs | 1,000+ | Likely all-rights-reserved / NC colophon | ❌ Avoid direct — but their content **re-routed through StoryWeaver** is CC-BY. |

---

## Recommended path (3 tiers)

1. **Write own A1–A2 retellings of public-domain dongeng** — *Malin Kundang, Timun Mas, Kancil/mousedeer, Bawang Merah Bawang Putih.* The plots are free folklore (idea-expression dichotomy: copyright protects *expression*, never the underlying *idea/plot*); your own wording is original → **zero attribution, no per-title license audit, fully commercial.** Matches issue #304's "LLM-authored originals, `attribution = NULL`." **This is both the safest and the least work.**
2. **StoryWeaver CC-BY 4.0 titles** — when you want real authored text + a calibrated level. Commercial use + translation allowed, attribution required. *Caveat:* the site is Cloudflare-gated, so per-title licenses need checking in a real browser; reject any CC-BY-SA. Example surfaced: *Gappu Tidak Bisa Menari* (Level 1) — license inferred from platform default, verify on the page.
3. **GDL CC-BY-4.0 titles** — verifiable per-title via API. Confirmed **CC-BY-4.0** (safe): *Bolehkah Aku Makan Mangga?* (L1); *Gara-Gara Kucing!*, *Lomba Lari*, *Keinginan Dina*, *Lara, si Kepik Kuning* (L2). ⚠️ DO NOT use *Ayo Terbang Elang Muda!* / *Di Mana Gendongan Adikku?* (CC-BY-NC).

**Levels → CEFR** (self-derived; no platform publishes a CEFR map): Level-1 readers ≈ **A1**, Level-2 ≈ **A1/A2**. All are calibrated to *child first-language* readers — sentence complexity maps cleanly to adult A1/A2, but *themes* are children's-story themes, so re-grade yourself.

---

## Legal nuance — public-domain folklore (the Indonesia-specific pitfall)

- **Idea-expression dichotomy** (TRIPS Art. 9(2)): copyright protects the *expression* (exact words, invented characters/dialogue of a specific modern version), never the *idea/plot*. A traditional dongeng's plot is communal folklore of unknown authorship → free to retell in your own words for commercial use. Do **not** lift any named 20th-century author's retelling (Indonesia's term is life + 70 years).
- **Art. 38, UU No. 28/2014** (Indonesia-specific): the State holds copyright over "traditional cultural expressions" (*ekspresi budaya tradisional*) and works of unknown creators. Aimed at preventing misappropriation, not at stopping ordinary retelling (dongeng are retold commercially in Indonesia constantly). **Low / theoretical risk** for a foreign graded-reader app; manage by (a) retelling in your own neutral words, (b) not claiming to *own* the folk tale, (c) a respectful framing. No reported enforcement against a foreign-language graded reader was found (flagged unverified).

---

## Practical notes for ingestion (when Slice 4 resumes)

- **Extraction paths:** StoryWeaver — ePub (cleanest, real text) > PDF (text-based, not scanned). GDL — pull the **ePub** (the content API stores pages as images; PDF is image-based and would need OCR). Let's Read — moot (NC), but its API exposes clean per-page text.
- **Build an ingestion gate** that reads each title's license string and accepts **only CC-BY (any version) / CC0 / Public Domain**, rejecting CC-BY-SA and any -NC. Do not trust "it's all CC-BY" — the mix is real on every platform.
- **`attribution = NULL`** for your own original retellings (no false CC credit, per #304 acceptance criteria). For any adapted CC-BY title, set the full attribution line (title, author, illustrator, translator, publisher, platform).

---

## Flagged / unverified

- StoryWeaver: live listing is Cloudflare-blocked → exact current Indonesian count (64 is a 2020 floor) and per-title licenses (incl. the *Gappu* example) need a real browser session; no in-UI "filter by license" control found.
- GDL: the "90% allow commercial reuse" figure + CC-BY-NC-SA wording come from search snippets of the 2017 blog (body not fetchable); no CC-BY-**SA** Indonesian title directly observed (but GDL docs list SA as primary); Indonesian Level-1 appears scarce — confirm count before relying on it.
- All CEFR mappings are self-derived — none of the platforms publish one.

---

## Sources (verified 2026-06-29)

- Pratham Books CC policy: https://prathambooks.org/cc/ · https://prathambooks.org/on-usage-of-creative-commons-licenses/
- CC Indonesia on StoryWeaver (CC-BY 4.0, commercial OK): https://id.creativecommons.net/2020/02/01/jaringan-buku-cerita-anak-berlisensi-terbuka-di-storyweaver-oleh-pratham-books/
- Free Kids Books (per-title license mix evidence): https://freekidsbooks.org/publisher/storyweaver-pratham/?date=desc
- GDL license policy: https://digitallibrary.io/about/license/ · per-title licenses via `https://content.digitallibrary.io/wp-json/content-api/v1/books/id`
- Let's Read content API (Indonesian = 100% NC): `https://letsreadasia.appspot.com/api/v2/book/search` · scraper field reference: https://github.com/learningequality/sushi-chef-lets-read-asia
- CC license definitions: https://creativecommons.org/share-your-work/cclicenses/ · CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/
- Idea-expression dichotomy: https://legalmoveslawfirm.com/idea-expression/ · folklore: https://en.wikipedia.org/wiki/Folklore_of_Indonesia
- Indonesian copyright / Art. 38 UU 28/2014: https://www.wipo.int/wipolex/en/legislation/details/15600 · https://en.wikipedia.org/wiki/Copyright_law_of_Indonesia
- Wikisource copyright (CC-BY-SA): https://en.wikisource.org/wiki/Wikisource:Copyright_policy
- Project Gutenberg (no usable Indonesian): https://www.gutenberg.org/ebooks/search/?query=malay
