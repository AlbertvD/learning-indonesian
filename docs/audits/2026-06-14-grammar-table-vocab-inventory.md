# Grammar-table vocabulary — per-lesson add inventory (author manual pass, 2026-06-14)

Curated by the author walking all 16 chapters by hand (the reliable method — the
tables are too heterogeneous to auto-extract). These are teachable words the
coursebook presents in **grammar/reference tables** that were never harvested
into `learning_items` (see `docs/plans/2026-06-14-grammar-table-vocab-harvest.md`).

**Mechanism:** add each to its lesson's **vocabulary section** (Woordenlijst) in
the source (`scripts/data/lessons.ts` for L1–5; `scripts/data/staging/lesson-N/`
for L6–16), then republish the affected lessons (batch). Each becomes a learnable
item homed on its lesson; the frequency bands pick them up automatically.

**Excluded by design:** example sentences; morphology (ME-/DI-/ber-/ke-ordinal/
reduplication — the affix pipeline, bucket C); acronyms (reference); compositional
phrases (di atas, tidak enak, kakak laki-laki) unless noted.

**Total: 98 confirmed** (+ L15 pending).

| Lesson | n | Adds (indonesian — dutch) |
|---|---|---|
| L1 | 0 | — (expressions + numbers already harvested) |
| **L2** antonyms | 15 | lama—oud(van vroeger); buruk—slecht/lelijk; kotor—vuil; ringan—licht; enak—lekker; miskin—arm; manis—zoet; pahit—bitter; asam—zuur; matang—rijp; mentah—onrijp; tua—oud; penuh—vol; panjang—lang; pendek—kort |
| **L3** plaats + vraagwoorden | 16 | bagaimana—hoe?; kapan—wanneer?; mengapa—waarom?; kenapa—waarom?(oorzaak); yang mana—welke?; atas—op/bovenkant; bawah—onder/onderkant; belakang—achter; depan—voor/voorkant; muka—voor/voorkant; dalam—in; luar—buiten; tengah—midden; kiri—links; sini—hier; situ—daar |
| L4 | 0 | — |
| **L5** voornaamwoorden | 16 | dia—hij/zij; ia—hij/zij; beliau—hij/zij(respect); anda—u/jij; kalian—jullie; engkau—jij(informeel); tuan—meneer(formeel); saudara—kameraad(m); saudari—kameraad(v); nona—juffrouw; tuan-tuan—heren; bapak-bapak—heren(neutraal); nyonya-nyonya—dames(formeel); ibu-ibu—dames(neutraal); saudara-saudara—dames en heren; saudari-saudari—dames |
| **L6** tijd | 6 | pagi—ochtend; malam—avond/nacht; detik—seconde; bulan—maand; tahun—jaar; abad—eeuw |
| **L7** kalender | 23 | januari…desember (12, modern spelling); hari Senin—maandag; hari Selasa—dinsdag; hari Jumat—vrijdag; hari Sabtu—zaterdag; kemarin—gisteren; lusa—overmorgen; tadi—zojuist; pekan—week; akhir minggu—weekend; malam Minggu—zaterdagavond; Minggu malam—zondagavond |
| L8 | 0 | — |
| **L9** | 2 | usah—nodig(tidak usah); sangat—zeer/erg |
| **L10** voegw. + rekenen | 12 | misalnya—bijvoorbeeld; jikalau—indien; meskipun—ofschoon; walaupun—ofschoon; supaya—opdat; agar—opdat; sementara—terwijl; sebelumnya—tevoren; sebelum—voordat; kali—keer/maal(×); bagi—delen/voor(÷); terakhir—laatste |
| L11 | 0 | — (ber- morphology) |
| **L12** windrichtingen | 4 | utara—noord; selatan—zuid; timur—oost; barat—west |
| **L13** | 2 | baca—lezen; obrol—kletsen (ME-forms = morphology) |
| **L14** | 2 | darat—land/wal; langkah—stap (ME-forms = morphology; atas→L3, panjang→L2 deduped) |
| L15 | 2† | **CAPTURE GAP — RESOLVED AT SOURCE (2026-06-14).** The 2 missing pages are now photographed (IMG_1558 + IMG_1559, in `content/raw/lesson-15/`, 7 pages total). Contents confirmed: IMG_1558 = ME- allomorphy *schema* (morphology); IMG_1559 = **Gebod en verbod** (imperative = bare root — grammar rule; example verbs taught) + **Persoonlijk lidwoord: sang, ki, si, para**. †New vocab to add: **`sang`, `si`** (articles; `ki`/`para` already taught). Optional from examples: `dewa`, `raja`, `kraton`. **Needs the 2 pages RE-INGESTED into L15 (content pipeline → republish)** to land the sections + vocab — distinct from the simple vocab-section adds. |
| L16 | 0 | — (DI- morphology; base roots taught) |

## Flagged exercise opportunities (Phase 2, not vocab)
- **Antonym pairs** (L2) → "opposite of X" exercise + antonym MCQ distractors.
- **Clock-telling** (L6) → read/produce clock-time drill (the `setengah tujuh`=6:30 logic).
- **malam Minggu vs Minggu malam** (L7) → the Sat-night/Sun-night quirk.

## Thematic-pack candidates (kind='theme' collections, existing items)
- **Lichaam & Gezondheid** (L9): ~50 body/ailment/medicine items, already learnable — group only.

## Open
1. L15 location (misremember vs ingestion gap) — author to confirm book ch15.
2. Morphology audit (bucket C): do ME-/DI-/ber- pairs (L11/13/14/16) reach the `affixed_form_pair` pipeline?
3. Spelling fix on republish: L7 source has archaic `Pebruari`/`Nopember` → modern `Februari`/`November`.
