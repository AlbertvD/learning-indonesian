/**
 * register-pairs.ts
 *
 * Committed, hand-reviewed authoring artifact for the "lesson-woven register
 * core" (docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §3.1, build
 * order step 2). One row per formal/informal register pair.
 *
 * Baseline inventory: James Sneddon, "Colloquial Jakartan Indonesian" (2006) —
 * the systematic classes (h-drop, monophthongization, final-syllable a→e,
 * frozen colloquial verbs) plus a curated set of dominant lexical
 * replacements. Every row carries a `source` attestation note. IMPORTANT
 * CAVEAT (owner should read this before treating notes as page-cite-grade):
 * this pass had NO live web-search/book-fetch tool available, so `source`
 * notes cite the *systematic class* (which is well-established general
 * Indonesian-linguistics knowledge, not Sneddon-book-specific) rather than a
 * verified page/section number. Owner review at plausibility level per the
 * spec's own framing ("attestation notes are the correctness oracle" —
 * treat these as a starting point, not a citation). Rows this pass was NOT
 * confident about were left out entirely — see the trailing "EXCLUDED
 * CANDIDATES" comment block for the specific words and reasons, so a future
 * pass with real web access can revisit them.
 *
 * ⚠️ SCOPE NOTE (found during live-DB cross-check, step 2): a number of the
 * informal words below (`nggak`, `banget`, `bentar`, `bilang`, `cuma`,
 * `kalo`, `kasih`, `ngobrol`, `ngomong`, `bakal`, `biar`, `capek`, `gampang`,
 * `susah`, `ketawa`) ALREADY EXIST as live `learning_items` rows today —
 * most unmarked (no `register` column existed before this spec), a few with
 * an ad-hoc "(informeel)" PROSE marker in `translation_nl`. This artifact
 * still lists them normally (they are still correct pairs); the
 * INTERSECTION REPORT (`scripts/register-pairs-report.ts` →
 * `scripts/data/register-pairs-intersection.json`) flags each one under
 * `informalAlreadyTaught` — step 3/4 (staging weave) must RETROFIT those
 * existing rows (edit the anchor lesson's staging + re-publish), not insert
 * a fresh item, or the `learning_items_normalized_text_key` UNIQUE
 * constraint will reject the write. This is exactly the kind of drift the
 * intersection report step exists to catch before the pipeline carrier (step
 * 3) is built on top of a wrong assumption. See the PR body for the full
 * list with lesson numbers.
 *
 * ⚠️ SENSE-COLLISION NOTE: two rows below are `deferred: true` rather than
 * force-fit with an `anchor_lesson` — see each row's `deferredReason`. Both
 * are cases where the natural informal spelling already exists in the DB
 * under an UNRELATED sense (a genuine homograph, not a register variant of
 * the same word), so this mechanism (one new learning_item per informal
 * form) cannot safely represent them without further content curation.
 *
 * EXCLUDED per spec §0/§10 (never candidates here): Jakarta gaul pronouns
 * (gue/lu), the standard informal pronoun set (aku/kamu/kau/engkau — already
 * DB-present with an ad-hoc "(informeel)" prose marker, but pronoun register
 * is a grammatical system of its own and out of scope for this word-pair
 * mechanism — flagged as a judgment call, revisit if wrong), particles
 * (dong/sih/kok/deh/kan/nih/tuh/lho), post-2006 lexical slang (kepo, baper,
 * galau, mager, gabut, santuy, receh, gokil, ...), and the productive
 * meN-prefix-drop verb pattern (nulis/menulis, nyuci/mencuci, nanya/bertanya,
 * ngerasa/merasa, ...) — that is a regular morphological alternation, not a
 * frozen/suppletive lexical replacement, and belongs with the Affix Trainer
 * module (ADR 0020/0021) if it's ever built, not here.
 *
 * DO NOT hand-edit `anchor_lesson` numbers without re-running
 * `scripts/register-pairs-report.ts` — the committed intersection report is
 * the source of truth for which lesson actually teaches a formal twin, and
 * it MUST be regenerated (not hand-patched) whenever this file changes.
 */

export type RegisterPairKlasse =
  | 'h-drop'
  | 'monophthong'
  | 'a-e-reductie'
  | 'frozen-verb'
  | 'lexical'

export interface RegisterPair {
  /** The standard/written-register Indonesian form. */
  formal: string
  /** The dominant spoken-register colloquial form. */
  informal: string
  /** Dutch gloss shared by both forms (translation_nl style — clean, no
   *  register prose per the 2026-07-05 gloss-pass rule). */
  gloss_nl: string
  klasse: RegisterPairKlasse
  /** Attestation note — see file header caveat on citation grade. */
  source: string
  /** Override for the ~6 "phrase-anchored" rows (spec §3.1) whose formal
   *  twin is only inside a taught PHRASE, not taught as its own item. Value
   *  is the lesson's `order_index` (the "Les N" number; 999 = the "Common
   *  Words" catch-all pseudo-lesson). */
  anchor_lesson?: number
  /** Set when review found no defensible anchor (or a blocking DB
   *  collision) — see `deferredReason`. Excluded from the scheduled core
   *  until resolved; kept in the artifact for a future pass. */
  deferred?: boolean
  deferredReason?: string
}

export const registerPairs: RegisterPair[] = [
  // ── h-drop (intervocalic / word-initial h-elision) ────────────────────
  { formal: 'habis', informal: 'abis', gloss_nl: 'op, klaar, voorbij', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class (canonical example)' },
  { formal: 'hilang', informal: 'ilang', gloss_nl: 'kwijt, verloren', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class' },
  { formal: 'hujan', informal: 'ujan', gloss_nl: 'regen', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class' },
  { formal: 'hitung', informal: 'itung', gloss_nl: 'tellen', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class' },
  { formal: 'sudah', informal: 'udah', gloss_nl: 'al, reeds', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class (canonical example)' },
  { formal: 'saja', informal: 'aja', gloss_nl: 'maar, alleen', klasse: 'h-drop',
    source: 'Sneddon 2006 — grouped with h-drop per convention; phonologically an s-truncation (sahaja→saja→aja), not h-elision, but folded into this bucket per the task brief' },
  { formal: 'hangat', informal: 'anget', gloss_nl: 'warm', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class' },
  { formal: 'hafal', informal: 'apal', gloss_nl: 'uit het hoofd kennen', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class + f→p; well-attested colloquial pair' },
  { formal: 'hidup', informal: 'idup', gloss_nl: 'leven', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class; medium-high confidence' },
  { formal: 'kelihatan', informal: 'keliatan', gloss_nl: 'zichtbaar, blijkbaar', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop class, derived from lihat/liat root' },
  { formal: 'hitam', informal: 'item', gloss_nl: 'zwart', klasse: 'h-drop',
    source: 'Sneddon 2006 — h-drop + vowel shift (hi-tam→i-tem); well documented' },
  { formal: 'bohong', informal: 'boong', gloss_nl: 'liegen, leugen', klasse: 'h-drop',
    source: 'Sneddon 2006 — intervocalic h-elision, same mechanism as lihat/liat' },

  // ── monophthong (final -ai → -e, -au → -o) ─────────────────────────────
  { formal: 'pakai', informal: 'pake', gloss_nl: 'gebruiken', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class (canonical example)' },
  { formal: 'sampai', informal: 'sampe', gloss_nl: 'tot; aankomen', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class (canonical example)' },
  { formal: 'ramai', informal: 'rame', gloss_nl: 'druk, levendig', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class (canonical example)' },
  { formal: 'kalau', informal: 'kalo', gloss_nl: 'als, wanneer', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class (canonical example)' },
  { formal: 'atau', informal: 'ato', gloss_nl: 'of', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class' },
  { formal: 'mau', informal: 'mo', gloss_nl: 'willen', klasse: 'monophthong',
    source: 'Sneddon 2006 — monophthongization class; very high frequency modal' },
  { formal: 'hijau', informal: 'ijo', gloss_nl: 'groen', klasse: 'monophthong',
    source: 'Sneddon 2006 — au→o + h-drop; dominant colloquial form' },

  // ── a-e-reductie (lexicalized final-syllable a→e, per-word not a blanket rule) ──
  { formal: 'benar', informal: 'bener', gloss_nl: 'echt, juist', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class (canonical example)' },
  { formal: 'dekat', informal: 'deket', gloss_nl: 'dichtbij', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'cepat', informal: 'cepet', gloss_nl: 'snel', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'malas', informal: 'males', gloss_nl: 'lui', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'pintar', informal: 'pinter', gloss_nl: 'slim', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'dapat', informal: 'dapet', gloss_nl: 'krijgen; kunnen', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'ingat', informal: 'inget', gloss_nl: 'onthouden', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'dengar', informal: 'denger', gloss_nl: 'horen', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'senang', informal: 'seneng', gloss_nl: 'blij', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'sebentar', informal: 'bentar', gloss_nl: 'zo, even', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction + se- truncation; folded into this bucket per the task brief' },
  { formal: 'lapar', informal: 'laper', gloss_nl: 'hongerig', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'pedas', informal: 'pedes', gloss_nl: 'pittig, scherp', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'kencang', informal: 'kenceng', gloss_nl: 'snel, strak', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'lemas', informal: 'lemes', gloss_nl: 'slap, futloos', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'malam', informal: 'malem', gloss_nl: 'nacht, avond', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'dalam', informal: 'dalem', gloss_nl: 'diep; in, binnen', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'diam', informal: 'diem', gloss_nl: 'stil (zijn)', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class; very high frequency' },
  { formal: 'tepat', informal: 'tepet', gloss_nl: 'precies, juist, op tijd', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'tukar', informal: 'tuker', gloss_nl: 'wisselen', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'datang', informal: 'dateng', gloss_nl: 'komen', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class; very high frequency' },
  { formal: 'macam', informal: 'macem', gloss_nl: 'soort, type', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class' },
  { formal: 'kejar', informal: 'kejer', gloss_nl: 'najagen, achterna zitten', klasse: 'a-e-reductie',
    source: 'Sneddon 2006 — a→e reduction class; medium-high confidence' },

  // ── frozen-verb (wholesale-different colloquial verb forms, not phonological reduction) ──
  { formal: 'berkata', informal: 'bilang', gloss_nl: 'zeggen', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)' },
  { formal: 'beri', informal: 'kasih', gloss_nl: 'geven', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)',
    deferred: true,
    deferredReason: "SENSE COLLISION: 'kasih' already exists live as its own learning_item (L1, 'gunst / genegenheid' — favor/affection, a noun sense), not the verb sense (give) this pair needs. Cannot insert a second 'kasih' item under normalized_text uniqueness. Needs content curation (disambiguate senses, or fold the verb sense into the existing item) before this can be scheduled." },
  { formal: 'bertemu', informal: 'ketemu', gloss_nl: 'ontmoeten', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)' },
  { formal: 'bicara', informal: 'ngomong', gloss_nl: 'praten, spreken', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)' },
  { formal: 'mengerti', informal: 'ngerti', gloss_nl: 'begrijpen', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb; formal twin only inside a taught phrase',
    anchor_lesson: 30 },
  { formal: 'bercakap-cakap', informal: 'ngobrol', gloss_nl: 'kletsen, babbelen', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb' },
  { formal: 'lihat', informal: 'liat', gloss_nl: 'zien', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — intervocalic h-elision on the bare (prefix-dropped) root; grouped with frozen-verb per the task brief' },
  { formal: 'membuat', informal: 'bikin', gloss_nl: 'maken', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)',
    deferred: true,
    deferredReason: "NO DEFENSIBLE ANCHOR: 'membuat' does not appear anywhere in taught lesson content (dialogue lines or learning_items) across L1-L30 as of this pass. The only live 'buat' item (L12) is the PREPOSITION sense ('voor / t.b.v.' — for), not the verb sense this pair needs. Revisit once 'membuat'/'buat'(verb) is taught, or when 'buat' is disambiguated." },
  { formal: 'tertawa', informal: 'ketawa', gloss_nl: 'lachen', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (ter- → ke- irregular alternation)' },

  // ── lexical (dominant lexical replacements — different root entirely) ──
  { formal: 'seperti', informal: 'kayak', gloss_nl: 'zoals, zoiets als', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'sekali', informal: 'banget', gloss_nl: 'heel, erg', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example, matching postposed-intensifier syntax)' },
  { formal: 'uang', informal: 'duit', gloss_nl: 'geld', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'bagaimana', informal: 'gimana', gloss_nl: 'hoe', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example, initial-syllable elision)' },
  { formal: 'begitu', informal: 'gitu', gloss_nl: 'zo, zodanig', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'begini', informal: 'gini', gloss_nl: 'zo (als dit)', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'memang', informal: 'emang', gloss_nl: 'inderdaad, toegegeven', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'hanya', informal: 'cuma', gloss_nl: 'slechts, alleen maar', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example)' },
  { formal: 'nanti', informal: 'ntar', gloss_nl: 'straks, later', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement + truncation (nanti→(e)ntar)' },
  { formal: 'tahu', informal: 'tau', gloss_nl: 'weten', klasse: 'lexical',
    source: 'Sneddon 2006 — grouped with lexical per the task brief; phonologically intervocalic h-elision' },
  { formal: 'terima kasih', informal: 'makasih', gloss_nl: 'dank je / dank u', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement + truncation (canonical example)' },
  { formal: 'mengapa', informal: 'kenapa', gloss_nl: 'waarom', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement; already attested live (both taught, L999, kenapa already prose-marked "(informeel)")' },
  { formal: 'tidak', informal: 'nggak', gloss_nl: 'niet, nee', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (spec §3.1 worked example); already attested live (both taught — tidak L1, nggak L12, unmarked)' },
  { formal: 'maaf', informal: 'maap', gloss_nl: 'sorry, pardon', klasse: 'lexical',
    source: 'Sneddon 2006 — f→p consonant shift, dominant in casual writing/speech' },
  { formal: 'selesai', informal: 'kelar', gloss_nl: 'klaar, af', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (different root)' },
  { formal: 'dengan', informal: 'sama', gloss_nl: 'met', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example); already attested live (both taught, same lesson L2, unmarked)' },
  { formal: 'untuk', informal: 'buat', gloss_nl: 'voor, om te', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example); already attested live (untuk L1, buat L12, unmarked)' },
  { formal: 'akan', informal: 'bakal', gloss_nl: 'zullen', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement; already attested live (akan L7, bakal L9, unmarked)' },
  { formal: 'supaya', informal: 'biar', gloss_nl: 'opdat, zodat', klasse: 'lexical',
    source: "Sneddon 2006 — dominant lexical replacement; already attested live (supaya/agar L10, biar L9, unmarked) — NOTE: informal already taught ONE LESSON BEFORE its formal twin in the live curriculum, which inverts the spec's §4 formal-first prerequisite assumption for this specific pair; flag for step 3/4." },
  { formal: 'ingin', informal: 'pengen', gloss_nl: 'verlangen, willen', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement' },
  { formal: 'ketika', informal: 'pas', gloss_nl: 'toen, wanneer, precies op het moment dat', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement' },
  { formal: 'lelah', informal: 'capek', gloss_nl: 'moe, uitgeput', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example); already attested live (both taught, same lesson L999, unmarked)' },
  { formal: 'mudah', informal: 'gampang', gloss_nl: 'makkelijk', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (canonical example); already attested live (mudah L999, gampang L6, unmarked)' },
  { formal: 'sulit', informal: 'susah', gloss_nl: 'moeilijk, lastig', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement; already attested live (sulit L999, susah L11, unmarked)' },
  { formal: 'sungguh', informal: 'beneran', gloss_nl: 'echt, werkelijk', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement (sungguh + -an derivational form of benar)' },
  { formal: 'tetapi', informal: 'tapi', gloss_nl: 'maar, echter', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement + truncation (tetapi→tapi); extremely high frequency' },
  { formal: 'sedikit', informal: 'dikit', gloss_nl: 'een beetje, weinig', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement + se- truncation' },
  { formal: 'besar', informal: 'gede', gloss_nl: 'groot', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement' },
  { formal: 'cantik', informal: 'cakep', gloss_nl: 'mooi, knap', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement' },
  { formal: 'buruk', informal: 'jelek', gloss_nl: 'slecht, lelijk', klasse: 'lexical',
    source: 'Sneddon 2006 — dominant lexical replacement; already attested live (buruk L2, jelek L15, unmarked)' },
]

/*
 * EXCLUDED CANDIDATES (reviewed and left out this pass — no live web-search
 * tool available to raise confidence; flag for a future pass):
 *
 * - lagi (as progressive-aspect "bezig te", informal for 'sedang') —
 *   'lagi' ALREADY exists live (L2) with an unrelated, more basic sense
 *   ("weer / wederom / nog" — again/still). Marking that item register=
 *   informal would misrepresent its primary taught sense. A true register
 *   pair here needs sense-disambiguation infrastructure this artifact
 *   doesn't have.
 * - terus (as discourse "then/next", informal for 'kemudian'/'lalu') —
 *   'terus' already exists live (L5) with its own clean, broader gloss
 *   ("voorts / steeds / maar door") that isn't clearly informal-only; weak
 *   1:1 semantic fit, low confidence.
 * - dapat → bisa (modal "can") — 'dapat' already has an a-e-reduction row
 *   (dapat→dapet) in this artifact; 'bisa' is arguably already register-
 *   neutral (used pervasively in BOTH formal and informal Indonesian), and
 *   double-mapping the same formal word to two different informal reflexes
 *   for different senses (get/receive vs. modal can) adds ambiguity this
 *   one-row-per-pair mechanism doesn't cleanly support.
 * - barangkali/mungkin → kali ("maybe") — homograph risk: 'kali' also
 *   means "river" and "times" (multiplication), both plausibly taught
 *   vocabulary; too high a collision/confusion risk without verification.
 * - lambat → lelet ("slow") — plausible but decades-stability not
 *   confidently verified without book/web access; leaving out rather than
 *   guessing.
 * - rapat → rapet ("tight/close") — the live 'rapat' item (L28) is the
 *   unrelated "meeting" sense (vergadering), not "tight" — sense mismatch,
 *   same class of problem as the deferred kasih/beri row but for a
 *   candidate that was never added rather than deferred.
 * - kagak (further-reduced variant of nggak) — more Betawi-marked/regional
 *   than 'nggak', arguably not "safe everywhere" per spec §3.1's bar.
 * - ogah ("refuse to") — moderate confidence only; leaning more casual-
 *   emphatic than neutral-informal-standard.
 * - abisnya, kayaknya, kelihatannya, sepertinya — derived/compositional
 *   forms of pairs already in this artifact (abis, kayak, kelihatan/liat,
 *   seperti) with an added discourse-marker suffix; not new base pairs.
 * - beras → beres — REJECTED, not just excluded: 'beres' is a real,
 *   common, unrelated word ("in order / settled / done"), not a
 *   phonological reduction of 'beras' ("uncooked rice"). Including it would
 *   have been a false pair.
 * - The productive meN-prefix-drop verb pattern (nulis/menulis,
 *   nyuci/mencuci, nanya/bertanya, ngerasa/merasa, ngambil/mengambil, ...)
 *   — regular morphological alternation, not frozen/suppletive lexical
 *   replacement; see file header, out of scope for this artifact.
 * - Standard informal pronouns (aku/kamu/kau/engkau vs. saya/Anda) — already
 *   DB-present with an ad-hoc "(informeel)" prose marker predating this
 *   spec, but pronoun register is a grammatical system (subject/object
 *   position, possessive suffixes -ku/-mu) rather than a simple word swap;
 *   judgment call to leave out of THIS word-pair mechanism, flagged for the
 *   owner to override if this reads too narrow.
 */
