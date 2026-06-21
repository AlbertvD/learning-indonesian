// The controlled vocabulary of Indonesian affixes the morphology application tier
// drills (capstone item A). Lives in lib/capabilities — NOT lib/morphology —
// because the pipeline (Layer-2 validator + Layer-3 HC) and the runtime
// (buildCuedRecall distractor packager + the future Affix Trainer) all read it,
// and the pipeline may import ONLY from lib/capabilities (target-architecture.md:1159,
// the sole pipeline↔runtime shared seam). Architect-CRITICAL, 2026-06-16.
//
// This is a code constant, not a DB table (omission test: no per-row authoring, no
// runtime writes — a frozen reference list the validator checks membership against).

export type AffixType = 'prefix' | 'suffix' | 'confix' | 'reduplication'

/** CEFR band an affix is first taught at — curated catalog metadata for the
 *  Affix Trainer's per-affix level badge (capstone item A). Bare `string`
 *  elsewhere (lessons.level); typed here because the set is fixed + curated. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

/**
 * The deterministic composition recipe the derivation engine reads to build the
 * surface form (ADR 0019). One recipe per catalog entry replaces the engine's
 * former per-affix branching:
 *  - a left piece (`prefix`) — nasalising (`meN-`/`peN-` slot logic, base 'me'/'pe')
 *    or a fixed string ('di','ke','ber','per','ter','se','memper'), or absent;
 *  - a right piece (`suffix`) — a fixed string ('kan','i','an'), or absent;
 *  - `reduplicate` — the one non-concatenative path (copies the root, `root-root`).
 *
 * A `confix` is just "both prefix AND suffix present" (shape, not atomicity): the
 * engine fills `circumfix_left`/`circumfix_right` from the two pieces. Atomic
 * circumfixes (`ke-…-an`) and stacked affixes (`meN-…-kan`) spell identically and
 * share this composer; the difference is teaching metadata, not derivation.
 */
export interface AffixComposition {
  prefix?: { nasal: 'me' | 'pe' } | { fixed: string }
  suffix?: string
  reduplicate?: boolean
}

export interface AffixCatalogEntry {
  /** Canonical affix label, e.g. 'meN-', '-kan', 'ke-…-an'. Matches
   *  affixed_form_pairs.affix and lesson_section_affixed_pairs.affix. */
  affix: string
  affixType: AffixType
  /** Short English gloss — dev reference + the feed for the derivation engine's
   *  `affix_gloss` projection column (`affixDerivation.ts`). NOT the learner-facing
   *  rule text; the Affix Trainer renders `glossNl`/`glossEn` instead. */
  gloss: string
  /** Crisp one-to-two-sentence learner-facing rule statement, per language. The
   *  Affix Trainer (grid tile + detail header + rule card) language-selects between
   *  these; they replace the terse English `gloss` at the render end. */
  glossNl: string
  glossEn: string
  /** Teaching-sequence rank (1-based) — the research's frequency × productivity ×
   *  transparency order (ber- → di- → meN- → -an → -kan → -i → ter- → se- →
   *  pe-/peN- → confixes → reduplication; docs/research/2026-06-15-affix-…).
   *  The Affix Trainer sorts the catalog grid by this; the pipeline ignores it
   *  (the validator checks membership only). Unique across the catalog. */
  rank: number
  /** CEFR band the affix is first introduced at — the per-affix level badge. */
  cefrLevel: CefrLevel
  /** Spelling variants of an allomorphic prefix (meN-/peN- nasalization). The
   *  prefix string that attaches to the root, e.g. ['me','mem','men','meny','meng','menge'].
   *  Present ONLY for allomorphic affixes. Nasalization is drilled at the rule tier
   *  (grammar_pattern_src, ADR 0017); this list also seeds the rule note + catalog HC. */
  allomorphClasses?: string[]
  /** How the engine derives the surface form (ADR 0019). Absent → engine cannot
   *  derive it (throws UnsupportedAffixError). */
  composition?: AffixComposition
}

// `rank` follows the research teaching sequence (frequency × productivity ×
// transparency): the nine core affixes first (ber- → di- → meN- → -an → -kan →
// -i → ter- → se- → peN-), then memper-, then confixes, stacked affixes, and
// reduplication. The array stays grouped by AffixType (distractorAffixes +
// BY_AFFIX determinism depend on insertion order); the trainer sorts by `rank`.
export const AFFIX_CATALOG: readonly AffixCatalogEntry[] = [
  // ── Verbal/nominal prefixes ────────────────────────────────────────────────
  {
    affix: 'meN-',
    affixType: 'prefix',
    gloss: 'active/agent verb-former (nasalising)',
    glossNl: 'Maakt van een basiswoord een actief (bedrijvend) werkwoord; de beginklank verandert mee (me-/mem-/men-/meng-…).',
    glossEn: 'Forms an active (agent-focused) verb from a base; the initial sound assimilates (me-/mem-/men-/meng-…).',
    rank: 3,
    cefrLevel: 'A2',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' } },
  },
  {
    affix: 'peN-',
    affixType: 'prefix',
    gloss: 'agent/instrument noun-former (nasalising)',
    glossNl: 'Maakt een zelfstandig naamwoord voor de uitvoerder of het werktuig van een handeling (peN-…); de beginklank verandert mee.',
    glossEn: 'Forms a noun for the doer or instrument of an action (peN-…); the initial sound assimilates.',
    rank: 9,
    cefrLevel: 'B1',
    allomorphClasses: ['pe', 'pem', 'pen', 'peny', 'peng', 'penge'],
    composition: { prefix: { nasal: 'pe' } },
  },
  { affix: 'ber-', affixType: 'prefix', gloss: 'intransitive / stative / possessive verb-former', glossNl: 'Maakt een onovergankelijk werkwoord: iets hebben of dragen, in een toestand zijn, of een handeling op zichzelf doen (geen lijdend voorwerp).', glossEn: 'Forms an intransitive verb: to have or wear something, to be in a state, or to do an action with no direct object.', rank: 1, cefrLevel: 'A2', composition: { prefix: { fixed: 'ber' } } },
  { affix: 'di-', affixType: 'prefix', gloss: 'passive verb-former', glossNl: 'Maakt een lijdende (passieve) werkwoordsvorm: de handeling staat centraal, niet wie hem uitvoert.', glossEn: 'Forms the passive: the action is foregrounded, not who performs it.', rank: 2, cefrLevel: 'A2', composition: { prefix: { fixed: 'di' } } },
  { affix: 'ter-', affixType: 'prefix', gloss: 'accidental / resultative / superlative', glossNl: 'Drukt een onbedoelde of voltooide handeling uit (per ongeluk, al gedaan), of de overtreffende trap (het meest …).', glossEn: 'Marks an accidental or completed action (by accident, already done), or the superlative (the most …).', rank: 7, cefrLevel: 'B1', composition: { prefix: { fixed: 'ter' } } },
  { affix: 'se-', affixType: 'prefix', gloss: 'one / same / as…as', glossNl: 'Betekent één, dezelfde of even … als; koppelt aan een basiswoord (sehari = één dag, setinggi = even hoog als).', glossEn: "Means 'one', 'the same', or 'as … as'; attaches to a base (sehari = one day, setinggi = as tall as).", rank: 8, cefrLevel: 'A2', composition: { prefix: { fixed: 'se' } } },
  { affix: 'memper-', affixType: 'prefix', gloss: 'causative (intensifying)', glossNl: 'Causatief en versterkend: iets meer of sterker maken, of iets als … behandelen.', glossEn: "Causative and intensifying: make something more or stronger, or treat it as ….", rank: 10, cefrLevel: 'B2', composition: { prefix: { fixed: 'memper' } } },
  // ── Suffixes ───────────────────────────────────────────────────────────────
  { affix: '-kan', affixType: 'suffix', gloss: 'causative / benefactive transitiviser', glossNl: 'Maakt een werkwoord overgankelijk: óf causatief (iets laten gebeuren), óf benefactief (iets vóór iemand doen).', glossEn: "Makes a verb transitive: either causative (cause something to happen) or benefactive (do something for someone).", rank: 5, cefrLevel: 'B1', composition: { suffix: 'kan' } },
  { affix: '-i', affixType: 'suffix', gloss: 'locative / repetitive transitiviser', glossNl: 'Maakt een werkwoord overgankelijk en richt de handeling op het object als doel of plaats (vaak herhaald of over een oppervlak).', glossEn: 'Makes a verb transitive and aims the action at the object as goal or location (often repeated or over a surface).', rank: 6, cefrLevel: 'B1', composition: { suffix: 'i' } },
  { affix: '-an', affixType: 'suffix', gloss: 'nominaliser (result / object)', glossNl: 'Maakt een zelfstandig naamwoord: het resultaat, object of werktuig van een handeling (makan → makanan = voedsel).', glossEn: 'Forms a noun: the result, object, or instrument of an action (makan → makanan = food).', rank: 4, cefrLevel: 'A2', composition: { suffix: 'an' } },
  // ── Confixes (circumfixes) ── shape = prefix + suffix (ADR 0019; atomicity is teaching metadata)
  { affix: 'ke-…-an', affixType: 'confix', gloss: 'abstract noun / adversative state', glossNl: 'Omsluit het basiswoord en maakt een abstract zelfstandig naamwoord, of een toestand die iemand overkomt (adil → keadilan = gerechtigheid).', glossEn: 'Wraps the base to form an abstract noun, or a state that befalls someone (adil → keadilan = justice).', rank: 11, cefrLevel: 'B1', composition: { prefix: { fixed: 'ke' }, suffix: 'an' } },
  {
    affix: 'pe-…-an',
    affixType: 'confix',
    gloss: 'process / result nominaliser',
    glossNl: 'Omsluit het basiswoord en maakt een zelfstandig naamwoord voor het proces of resultaat van een handeling; de beginklank verandert mee.',
    glossEn: 'Wraps the base to form a noun for the process or result of an action; the initial sound assimilates.',
    rank: 12,
    cefrLevel: 'B1',
    allomorphClasses: ['pe', 'pem', 'pen', 'peny', 'peng', 'penge'],
    composition: { prefix: { nasal: 'pe' }, suffix: 'an' },
  },
  { affix: 'per-…-an', affixType: 'confix', gloss: 'collective / result nominaliser', glossNl: 'Omsluit het basiswoord en maakt een zelfstandig naamwoord voor een verzameling, gebied of resultaat (kota → perkotaan = stedelijk gebied).', glossEn: 'Wraps the base to form a noun for a collective, domain, or result (kota → perkotaan = urban area).', rank: 13, cefrLevel: 'B2', composition: { prefix: { fixed: 'per' }, suffix: 'an' } },
  // ── Stacked affixes (prefix + suffix co-occurring; left half allomorphic for meN-) ──
  {
    affix: 'meN-…-kan',
    affixType: 'confix',
    gloss: 'active benefactive/causative transitiviser',
    glossNl: 'Actieve overgankelijke vorm: combineert meN- (bedrijvend) met -kan (causatief/benefactief) — iets (voor iemand) laten gebeuren.',
    glossEn: 'Active transitive form: combines meN- (active) with -kan (causative/benefactive) — make something happen (for someone).',
    rank: 14,
    cefrLevel: 'B1',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' }, suffix: 'kan' },
  },
  { affix: 'di-…-kan', affixType: 'confix', gloss: 'passive benefactive/causative transitiviser', glossNl: 'Lijdende tegenhanger van meN-…-kan: de causatieve of benefactieve handeling in de passief.', glossEn: 'Passive counterpart of meN-…-kan: the causative or benefactive action in the passive.', rank: 15, cefrLevel: 'B1', composition: { prefix: { fixed: 'di' }, suffix: 'kan' } },
  {
    affix: 'meN-…-i',
    affixType: 'confix',
    gloss: 'active locative/repetitive transitiviser',
    glossNl: 'Actieve overgankelijke vorm: combineert meN- met -i — de handeling richt zich op het object als doel of plaats.',
    glossEn: 'Active transitive form: combines meN- with -i — the action targets the object as goal or location.',
    rank: 16,
    cefrLevel: 'B1',
    allomorphClasses: ['me', 'mem', 'men', 'meny', 'meng', 'menge'],
    composition: { prefix: { nasal: 'me' }, suffix: 'i' },
  },
  { affix: 'di-…-i', affixType: 'confix', gloss: 'passive locative/repetitive transitiviser', glossNl: 'Lijdende tegenhanger van meN-…-i: de op het object gerichte handeling in de passief.', glossEn: 'Passive counterpart of meN-…-i: the object-directed action in the passive.', rank: 17, cefrLevel: 'B2', composition: { prefix: { fixed: 'di' }, suffix: 'i' } },
  { affix: 'memper-…-kan', affixType: 'confix', gloss: 'causative transitiviser (intensifying)', glossNl: 'Omsluit het basiswoord met memper-…-kan: een versterkte causatieve overgankelijke vorm.', glossEn: 'Wraps the base with memper-…-kan: an intensified causative transitive form.', rank: 18, cefrLevel: 'B2', composition: { prefix: { fixed: 'memper' }, suffix: 'kan' } },
  // ── Reduplication ───────────────────────────────────────────────────────────
  // Base modifier (ADR 0019, amended L22): double the root, then OPTIONALLY apply the
  // fixed prefix / fixed suffix slots. circumfix_left/right stay null on the row;
  // decompose_word_ex re-derives the wrap pieces from these recipes. The U+2026 in
  // `ke-…-an-reduplication` matches the confix `ke-…-an` char, but the `-reduplication`
  // tail keeps it a distinct key in BY_AFFIX (no collision).
  { affix: 'reduplication', affixType: 'reduplication', gloss: 'plurality / variety / intensity', glossNl: 'Verdubbelt het basiswoord om meervoud, verscheidenheid of nadruk uit te drukken (anak-anak = kinderen).', glossEn: 'Doubles the base to express plurality, variety, or intensity (anak-anak = children).', rank: 19, cefrLevel: 'A2', composition: { reduplicate: true } },
  { affix: 'reduplication-an', affixType: 'reduplication', gloss: 'collective/variety reduplication + -an', glossNl: 'Verdubbeling mét -an: drukt een verzameling of verscheidenheid uit (sayur → sayur-sayuran = allerlei groenten).', glossEn: 'Reduplication with -an: expresses a collection or variety (sayur → sayur-sayuran = assorted vegetables).', rank: 20, cefrLevel: 'B1', composition: { reduplicate: true, suffix: 'an' } },
  { affix: 'ke-…-an-reduplication', affixType: 'reduplication', gloss: 'approximative ("-ish") colour reduplication', glossNl: 'Verdubbeling met ke-…-an: drukt enigszins … of een tint uit (merah → kemerah-merahan = roodachtig).', glossEn: 'Reduplication with ke-…-an: expresses somewhat … or a shade (merah → kemerah-merahan = reddish).', rank: 21, cefrLevel: 'B2', composition: { prefix: { fixed: 'ke' }, reduplicate: true, suffix: 'an' } },
] as const

const BY_AFFIX = new Map<string, AffixCatalogEntry>(AFFIX_CATALOG.map((e) => [e.affix, e]))

/** Every catalog affix label — the membership set the gate asserts against. */
export const AFFIX_SET: ReadonlySet<string> = new Set(BY_AFFIX.keys())

export function isCatalogAffix(affix: string): boolean {
  return BY_AFFIX.has(affix)
}

export function affixCatalogEntry(affix: string): AffixCatalogEntry | undefined {
  return BY_AFFIX.get(affix)
}

/** Allomorph classes for an affix (empty if it is not an allomorphic affix). */
export function allomorphClassesFor(affix: string): string[] {
  return BY_AFFIX.get(affix)?.allomorphClasses ?? []
}

/**
 * Distractor affixes for the recognise_word_form_link_cap MCQ ("pick the affix"):
 * other catalog affixes, same affix_type first (closer confusables), then the rest.
 * Deterministic order (catalog order) — the packager shuffles + slices.
 */
export function distractorAffixes(correctAffix: string): string[] {
  const entry = BY_AFFIX.get(correctAffix)
  const others = AFFIX_CATALOG.filter((e) => e.affix !== correctAffix)
  if (!entry) return others.map((e) => e.affix)
  const sameType = others.filter((e) => e.affixType === entry.affixType).map((e) => e.affix)
  const otherType = others.filter((e) => e.affixType !== entry.affixType).map((e) => e.affix)
  return [...sameType, ...otherType]
}
