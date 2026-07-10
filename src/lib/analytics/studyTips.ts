// src/lib/analytics/studyTips.ts
//
// Metacognitive nudges: evidence-based study techniques keyed to a learner's
// weak area, so an insight ("you're weak at producing words") becomes actionable
// ("here's HOW to get better at it") WITHOUT touching the session engine. Curated
// + deterministic (no LLM at runtime). Grounded in the learning-science /SLA
// literature:
//   - Retrieval practice >> re-reading (Karpicke, Science 2011: ~80% vs 34%).
//   - Productive retrieval (recalling the FORM) builds production specifically.
//   - Reverse translation = the strongest productive technique.
//   - Keyword mnemonic + retrieval — best for vivid/imageable words (Springer 2019).
//   - Spacing extends L2 vocab retention for years.
//   - Listening gives cues; production needs you to generate your own.

export type TipArea = 'recognise' | 'produce' | 'listen' | 'stubborn' | 'general'
type Lang = 'nl' | 'en'

interface TipSet {
  title: Record<Lang, string>
  tips: Record<Lang, string[]>
}

export const STUDY_TIPS: Record<TipArea, TipSet> = {
  produce: {
    title: { nl: 'Beter worden in produceren', en: 'Getting better at producing' },
    tips: {
      nl: [
        'Dek het Indonesisch af en schrijf het uit het Nederlands — omgekeerd vertalen. Het zélf produceren bouwt productie op, niet alleen herkennen.',
        'Gebruik het woord in je eigen zin. Bij produceren moet je je eigen geheugensteun maken — dat maakt het sterker.',
        'Maak een sleutelwoord-beeld voor levendige woorden: “makan” → een mok-kan waaruit je eet. Werkt het best bij woorden die je je kunt voorstellen.',
        'Schrijf een handvol woorden uit je hoofd op en controleer daarna. Actief ophalen onthoudt veel beter dan herlezen.',
      ],
      en: [
        'Cover the Indonesian and write it from the Dutch — reverse translation. Producing the form (not just recognising it) is what builds production.',
        'Use the word in your own sentence. When you produce, you have to generate your own cue — that makes the memory stronger.',
        'Make a keyword image for vivid words: “makan” → a mug-can you eat from. Works best for words you can picture.',
        'Write a handful of words from memory, then check. Active recall beats re-reading by a wide margin.',
      ],
    },
  },
  listen: {
    title: { nl: 'Beter worden in luisteren', en: 'Getting better at listening' },
    tips: {
      nl: [
        'Luister eerst, lees daarna pas. Haal de betekenis uit het geluid en controleer dan met de tekst.',
        'Shadowen: zeg het woord hardop, direct nadat je het hoort.',
        'Begin langzaam en bouw op naar normale snelheid — dezelfde woorden, sneller.',
      ],
      en: [
        'Listen first, read second. Pull the meaning from the sound, then check against the text.',
        'Shadow it: say the word out loud right after you hear it.',
        'Start slow, build up to full speed — same words, faster.',
      ],
    },
  },
  recognise: {
    title: { nl: 'Beter worden in herkennen', en: 'Getting better at recognising' },
    tips: {
      nl: [
        'Lees het woord in context — verhaaltjes, ondertitels — niet los. Context geeft je gratis geheugensteunen.',
        'Snelle zelftest: zie het woord, zeg de betekenis hardop, controleer.',
      ],
      en: [
        'Read the word in context — short texts, subtitles — not in isolation. Context gives you free retrieval cues.',
        'Quick self-test: see the word, say the meaning aloud, check.',
      ],
    },
  },
  stubborn: {
    // Acquisition difficulty, not retention loss: more reps is "labor in vain"
    // (Nelson & Leonesio) — the bottleneck is encoding. The evidence-backed fix is
    // a richer encoding: keyword mnemonic (best for difficult L2 vocab) + making
    // the card atomic + context. (Anki leech guidance + Springer 2019.)
    title: { nl: 'Moeilijke woorden anders aanpakken', en: 'Tackling stubborn words differently' },
    tips: {
      nl: [
        'Nóg een keer herhalen werkt hier niet — verander de aanpak. Maak een sleutelwoord-beeld: koppel het Indonesische woord aan een Nederlands klankwoord + een gek plaatje (bv. “pintar” → een schilder die heel slim is).',
        'Hak een lang of samengesteld woord in stukjes en leer die los; voeg ze daarna samen.',
        'Zet het woord in één korte, persoonlijke zin met context — context geeft gratis geheugenhaakjes, los drillen niet.',
        'Zeg het hardop en schrijf het een paar keer: verbind klank, vorm én betekenis in plaats van alleen te herkennen.',
      ],
      en: [
        'Repeating it again won’t help here — change the approach. Make a keyword image: link the Indonesian word to a Dutch/English sound-alike + a vivid picture (e.g. “pintar” → a painter who is very clever).',
        'Break a long or compound word into pieces and learn those separately, then join them.',
        'Put the word in one short, personal sentence with context — context gives free memory hooks; drilling it in isolation doesn’t.',
        'Say it aloud and write it a few times: connect sound, form and meaning instead of just recognising it.',
      ],
    },
  },
  general: {
    title: { nl: 'Beter leren in het algemeen', en: 'Getting better at learning itself' },
    tips: {
      nl: [
        'Liever een paar korte sessies verspreid over de dag dan één lange — verlaag je sessiegrootte in je profiel.',
        'De app plant je herhalingen al op het juiste moment en wisselt onderwerpen vanzelf af (FSRS) — jij hoeft vooral op te komen dagen.',
        'Houd je reeks vol: elke dag een kleine sessie beklijft beter dan af en toe een grote.',
        'Leg een woord hardop uit alsof je het iemand leert — dat legt meteen de gaten in je kennis bloot.',
        'Slaap consolideert wat je leert; een korte sessie voor het slapengaan kan helpen.',
      ],
      en: [
        'A few short sessions across the day beats one long one — lower your session size in your profile.',
        'The app already schedules your reviews at the right moment and mixes topics for you (FSRS) — your job is mainly to show up.',
        'Keep your streak: a small daily session sticks better than an occasional big one.',
        'Explain a word out loud as if teaching someone — it instantly exposes the gaps in your knowledge.',
        'Sleep consolidates what you learn; a short session before bed can help.',
      ],
    },
  },
}

export function studyTipsFor(area: TipArea, lang: Lang): { title: string; tips: string[] } {
  const set = STUDY_TIPS[area]
  return { title: set.title[lang], tips: set.tips[lang] }
}
