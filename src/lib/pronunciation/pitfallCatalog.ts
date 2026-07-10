// The pronunciation pitfall catalog — the single source of truth for the closed
// set of Indonesian pronunciation pitfalls a Dutch- or English-speaking learner
// systematically gets wrong (ADR 0025). Runtime-only (the pipeline never reads
// it), so it lives in its own lib/pronunciation module — unlike affixCatalog,
// which lib/capabilities owns for pipeline sharing.
//
// A code constant, not a DB table: a frozen, curated reference list with no
// per-row authoring and no runtime writes. The primer page, the perception
// drills, and the one-off podcast scripts all read from here.

import { normalizeTtsText } from '@/lib/ttsNormalize'

/** First language of the learner — the axis pitfalls are selected on. */
export type L1 = 'nl' | 'en'

export interface MinimalPair {
  /** The two contrasting Indonesian words (e.g. 'makan' vs 'makam'). */
  a: string
  b: string
  /** What the contrast demonstrates, learner-facing, per language. */
  contrastNl: string
  contrastEn: string
}

export interface Pitfall {
  /** Stable slug — 'hard-g', 'tapped-r', … */
  id: string
  /** The Indonesian letter/sound at issue — 'g', 'r', 'e'. */
  sound: string
  /** Which first languages systematically trip on this sound. */
  l1: L1[]
  /** Crisp learner-facing rule (how the sound IS pronounced), per language. */
  ruleNl: string
  ruleEn: string
  /** The contrastive mistake to avoid (how the L1 gets it wrong), per language. */
  pitfallNl: string
  pitfallEn: string
  /** Indonesian example words demonstrating the correct sound. */
  examples: string[]
  /** Optional minimal pairs for perception training (slice 2). */
  minimalPairs?: MinimalPair[]
  /** Teaching-sequence rank (1-based), unique across the catalog. */
  rank: number
}

const CATALOG: readonly Pitfall[] = [
  // ── Dutch-speaker priority pitfall (the #1 letter-to-sound trap) ────────────
  {
    id: 'u-oe',
    sound: 'u',
    l1: ['nl'],
    ruleNl: "De u klinkt altijd als 'oe' (zoals in 'boek'): susu = 'soesoe'.",
    ruleEn: "u always sounds like 'oo' in 'boot'.",
    pitfallNl: "Lees de u nooit als de Nederlandse u van 'muur'. In de oude spelling schreef men zelfs oe: soesoe, Soekarno.",
    pitfallEn: 'Never the Dutch ü-like u.',
    examples: ['susu', 'buku', 'untuk', 'minum'],
    rank: 1,
  },
  // ── Shared pitfalls (both Dutch and English speakers) ──────────────────────
  {
    id: 'e-two-sounds',
    sound: 'e',
    l1: ['nl', 'en'],
    ruleNl: "De e heeft twee klanken: een stomme e (zoals in 'de') in 'besar', en een heldere é (zoals in 'mee') in 'soré'.",
    ruleEn: "e has two sounds: a schwa (like 'a' in 'ago') in 'besar', and a clear é (like 'e' in 'café') in 'soré'.",
    pitfallNl: 'De spelling laat het verschil niet zien — onthoud per woord welke e het is.',
    pitfallEn: "The spelling doesn't mark the difference — learn per word which e it is.",
    examples: ['besar', 'beli', 'sore', 'enam'],
    rank: 2,
  },
  {
    id: 'c-ch',
    sound: 'c',
    l1: ['nl', 'en'],
    ruleNl: "De c spreek je altijd uit als 'tj' (zoals in 'tjalk', Engels 'church').",
    ruleEn: "c is always pronounced 'ch' as in 'church'.",
    pitfallNl: 'Nooit als een k of een s.',
    pitfallEn: 'Never as k or s.',
    examples: ['cinta', 'coklat', 'kecil', 'cuci'],
    minimalPairs: [
      {
        a: 'cari',
        b: 'kari',
        contrastNl: "'cari' (zoeken) begint met de tj-klank; 'kari' (kerrie) met een k.",
        contrastEn: "'cari' (to look for) starts with the 'ch' sound; 'kari' (curry) with a k.",
      },
      {
        a: 'curang',
        b: 'kurang',
        contrastNl: "'curang' (vals spelen) begint met de tj-klank; 'kurang' (minder) met een k.",
        contrastEn: "'curang' (to cheat) starts with the 'ch' sound; 'kurang' (less) with a k.",
      },
    ],
    rank: 3,
  },
  {
    id: 'ng-digraph',
    sound: 'ng',
    l1: ['nl', 'en'],
    ruleNl: "ng is één klank (zoals in 'lang', 'zingen'), niet n + g.",
    ruleEn: "ng is a single sound (as in 'singer'), not n + g.",
    pitfallNl: 'Laat geen aparte g horen.',
    pitfallEn: "Don't pronounce a separate g.",
    examples: ['dengan', 'bangun', 'uang', 'orang'],
    rank: 4,
  },
  {
    id: 'ny-digraph',
    sound: 'ny',
    l1: ['nl', 'en'],
    ruleNl: "ny is één klank, zoals de 'nj' in 'oranje' of de Spaanse ñ.",
    ruleEn: "ny is a single sound, like the ñ in 'señor' or 'ny' in 'canyon'.",
    pitfallNl: 'Spreek het niet uit als losse n + j.',
    pitfallEn: "Don't split it into n + y.",
    examples: ['nyonya', 'banyak', 'hanya', 'nyaman'],
    rank: 5,
  },
  {
    id: 'final-consonants',
    sound: 'n / m / k',
    l1: ['nl', 'en'],
    ruleNl: 'Eindmedeklinkers zijn duidelijk maar zonder extra klank; de eind-k is vaak een lichte keelslag.',
    ruleEn: 'Final consonants are clear but unreleased; final k is often a light glottal stop.',
    pitfallNl: 'Verwar de eind-n en de eind-m niet.',
    pitfallEn: "Don't blur final n and final m.",
    examples: ['makan', 'minum', 'anak', 'tidak'],
    minimalPairs: [
      {
        a: 'makan',
        b: 'makam',
        contrastNl: "'makan' (eten) eindigt op -n; 'makam' (graf) op -m.",
        contrastEn: "'makan' (to eat) ends in -n; 'makam' (grave) ends in -m.",
      },
      {
        a: 'tuan',
        b: 'tuang',
        contrastNl: "'tuan' (meneer) eindigt op -n; 'tuang' (inschenken) op -ng.",
        contrastEn: "'tuan' (sir) ends in -n; 'tuang' (to pour) in -ng.",
      },
    ],
    rank: 6,
  },
  // ── Dutch-speaker pitfalls ─────────────────────────────────────────────────
  {
    id: 'hard-g',
    sound: 'g',
    l1: ['nl'],
    ruleNl: "De g is altijd een harde g, zoals in het Engelse 'go'.",
    ruleEn: "g is always a hard g, as in English 'go'.",
    pitfallNl: "Nederlanders maken er vaak de zachte keel-g van ('gaan') — dat klopt niet.",
    pitfallEn: 'Dutch speakers often use the soft guttural g — that is wrong here.',
    examples: ['gampang', 'gelas', 'gigi', 'gula'],
    minimalPairs: [
      {
        a: 'gali',
        b: 'kali',
        contrastNl: "'gali' (graven) heeft de harde g; 'kali' (keer/rivier) een k.",
        contrastEn: "'gali' (to dig) has the hard g; 'kali' (times/river) a k.",
      },
      {
        a: 'bagi',
        b: 'baki',
        contrastNl: "'bagi' (voor/delen) heeft de harde g; 'baki' (dienblad) een k.",
        contrastEn: "'bagi' (for/to divide) has the hard g; 'baki' (tray) a k.",
      },
      {
        a: 'garam',
        b: 'karam',
        contrastNl: "'garam' (zout) begint met de harde g; 'karam' (vergaan/zinken) met een k.",
        contrastEn: "'garam' (salt) starts with the hard g; 'karam' (to sink) with a k.",
      },
    ],
    rank: 7,
  },
  {
    id: 'w-sound',
    sound: 'w',
    l1: ['nl'],
    ruleNl: "De w is een Engelse w met ronde lippen, zoals in 'wow'.",
    ruleEn: "w is an English w with rounded lips, as in 'wow'.",
    pitfallNl: 'Niet de Nederlandse v-achtige w gebruiken.',
    pitfallEn: 'Not the Dutch v-like w.',
    examples: ['waktu', 'warna', 'bawa', 'siswa'],
    rank: 8,
  },
  {
    id: 'j-sound',
    sound: 'j',
    l1: ['nl'],
    ruleNl: "De j klinkt als de Engelse j ('dzj', zoals in 'James'), niet als de Nederlandse j in 'jas'.",
    ruleEn: "j sounds like English j (as in 'jam'), not the Dutch y-like j.",
    pitfallNl: "Geen 'j' zoals in 'jas' — gebruik de 'dzj'-klank.",
    pitfallEn: 'For Dutch speakers: use the English j, not the y-sound.',
    examples: ['jam', 'jalan', 'saja', 'belajar'],
    rank: 9,
  },
  // ── English-speaker pitfalls ───────────────────────────────────────────────
  {
    id: 'tapped-r',
    sound: 'r',
    l1: ['en'],
    ruleNl: 'De r wordt getikt/gerold met de tongpunt, zoals in het Spaans.',
    ruleEn: 'r is tapped/trilled with the tip of the tongue, like Spanish.',
    pitfallNl: 'Engelstaligen gebruiken de Engelse glij-r — die bestaat niet in het Indonesisch.',
    pitfallEn: 'English speakers use the English approximant r — it does not exist in Indonesian.',
    examples: ['rumah', 'lari', 'besar', 'kerja'],
    minimalPairs: [
      {
        a: 'rusa',
        b: 'lusa',
        contrastNl: "'rusa' (hert) begint met de getikte r; 'lusa' (overmorgen) met een l.",
        contrastEn: "'rusa' (deer) starts with the tapped r; 'lusa' (the day after tomorrow) with an l.",
      },
      {
        a: 'tari',
        b: 'tali',
        contrastNl: "'tari' (dans) heeft de getikte r; 'tali' (touw) een l.",
        contrastEn: "'tari' (dance) has the tapped r; 'tali' (rope) an l.",
      },
    ],
    rank: 10,
  },
  {
    id: 'pure-vowels',
    sound: 'a i u e o',
    l1: ['en'],
    ruleNl: 'De klinkers zijn zuiver en kort, zonder na-glijder.',
    ruleEn: 'Vowels are pure and short — a, i, u, e, o each stay one steady sound.',
    pitfallNl: 'Engelstaligen voegen een na-klank toe; houd ze zuiver.',
    pitfallEn: "English speakers add a glide (o → 'ow', e → 'ey'); keep them pure.",
    examples: ['kota', 'baju', 'satu', 'minggu'],
    rank: 11,
  },
  {
    id: 'diphthongs-au-ai',
    sound: 'au / ai',
    l1: ['en'],
    ruleNl: "au klinkt als 'auw' (pulau), ai als 'ai' in 'haai' (pantai) — kort en strak.",
    ruleEn: "au sounds like 'ow' in 'now' (pulau); ai like 'eye' (pantai) — quick and tight.",
    pitfallNl: 'Rek de tweeklank niet uit.',
    pitfallEn: "Don't smooth or drawl them into long vowels ('pull-oh', 'pant-ay').",
    examples: ['pulau', 'pantai', 'kalau', 'sampai'],
    rank: 12,
  },
  {
    id: 'unaspirated-stops',
    sound: 'p t k',
    l1: ['en'],
    ruleNl: 'p, t en k zonder lucht-pufje.',
    ruleEn: "p, t, k are unaspirated — no puff of air, unlike English 'pin', 'top', 'key'.",
    pitfallNl: 'Engelstaligen blazen p/t/k; houd de lucht binnen.',
    pitfallEn: 'English speakers aspirate initial p/t/k; hold the air back.',
    examples: ['pagi', 'tiga', 'kaki', 'pintu'],
    minimalPairs: [
      {
        a: 'pagi',
        b: 'bagi',
        contrastNl: "'pagi' (ochtend) begint met een p zonder lucht-pufje; 'bagi' (voor) met een b.",
        contrastEn: "'pagi' (morning) starts with an unaspirated p; 'bagi' (for) with a b — without the puff they're easy to confuse.",
      },
      {
        a: 'parang',
        b: 'barang',
        contrastNl: "'parang' (kapmes) met een p; 'barang' (spul) met een b.",
        contrastEn: "'parang' (machete) with a p; 'barang' (goods) with a b.",
      },
      {
        a: 'tua',
        b: 'dua',
        contrastNl: "'tua' (oud) begint met een t zonder pufje; 'dua' (twee) met een d.",
        contrastEn: "'tua' (old) starts with an unaspirated t; 'dua' (two) with a d.",
      },
    ],
    rank: 13,
  },
  {
    id: 'initial-ng',
    sound: 'ng-',
    l1: ['en'],
    ruleNl: 'Indonesisch gebruikt ng ook aan het begin van een woord.',
    ruleEn: "Indonesian uses ng at the START of a word (the 'singer' sound, word-initial).",
    pitfallNl: 'Engels begint nooit met ng; oefen deze klank.',
    pitfallEn: 'English never starts a word with ng — practise it.',
    examples: ['ngeri', 'ngantuk', 'nganga'],
    rank: 14,
  },
  // ── Cross-language pitfall (prosody, ranked last — segmentals before stress) ─
  {
    id: 'penultimate-stress',
    sound: 'bi-CA-ra',
    l1: ['nl', 'en'],
    ruleNl: 'De klemtoon ligt bijna altijd op de voorlaatste lettergreep: biCAra, seLAmat, keluARga.',
    ruleEn: 'Stress almost always falls on the next-to-last syllable: biCAra, seLAmat, keluARga.',
    pitfallNl: 'Houd de klemtoon licht — Indonesisch kent geen zware klemtoon zoals het Nederlands.',
    pitfallEn: 'Keep the stress light — Indonesian stress is much weaker than in English.',
    examples: ['bicara', 'selamat', 'keluarga', 'bagaimana'],
    rank: 15,
  },
]

/** All pitfalls relevant to a given first language, in teaching order. */
export function getPitfallsForL1(l1: L1): Pitfall[] {
  return CATALOG.filter((p) => p.l1.includes(l1)).sort((a, b) => a.rank - b.rank)
}

/** Every distinct example + minimal-pair word across the catalog, for audio
 *  prefetch and coverage checks. Normalized to the TTS lookup form. */
export function allExampleWords(): string[] {
  const words = new Set<string>()
  for (const p of CATALOG) {
    for (const w of p.examples) words.add(normalizeTtsText(w))
    for (const mp of p.minimalPairs ?? []) {
      words.add(normalizeTtsText(mp.a))
      words.add(normalizeTtsText(mp.b))
    }
  }
  return [...words]
}

/** Every distinct minimal-pair word across the catalog (pairs only, no plain
 *  examples), normalized to the TTS lookup form. Parallel to `allExampleWords`
 *  (which stays as-is and keeps covering pair words too) — this is the
 *  narrower set the voice-paired perception drills (EarQuiz) and the seeding
 *  script's second pass need. */
export function allMinimalPairWords(): string[] {
  const words = new Set<string>()
  for (const p of CATALOG) {
    for (const mp of p.minimalPairs ?? []) {
      words.add(normalizeTtsText(mp.a))
      words.add(normalizeTtsText(mp.b))
    }
  }
  return [...words]
}

/** Voices the perception drills request per pair word (HVPT talker variability).
 *  Achird is also the app-wide default seeding voice. */
export const PAIR_DRILL_VOICES = [
  'id-ID-Chirp3-HD-Achird',
  'id-ID-Chirp3-HD-Despina',
  'id-ID-Chirp3-HD-Orus',
] as const
