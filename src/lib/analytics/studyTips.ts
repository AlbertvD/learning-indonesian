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

export type TipArea = 'recognise' | 'produce' | 'listen' | 'at_risk' | 'general'
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
  at_risk: {
    title: { nl: 'Wegzakkende woorden terughalen', en: 'Bringing slipping words back' },
    tips: {
      nl: [
        'Doe nu een snelle zelftest: afdekken, ophalen, controleren. Eén geslaagde ophaalbeurt verstevigt het geheugenspoor.',
        'Spreid je herhalingen over dagen — gespreid ophalen beschermt woorden jarenlang.',
        'Zeg de wegzakkende woorden hardop en koppel ze aan een beeld of een korte zin.',
      ],
      en: [
        'Do a quick self-test now: cover, recall, check. One successful retrieval re-strengthens the memory trace.',
        'Space the retrievals across days — spaced recall protects words for years.',
        'Say the slipping words aloud and tie each to an image or a short sentence.',
      ],
    },
  },
  general: {
    title: { nl: 'Beter leren in het algemeen', en: 'Getting better at learning itself' },
    tips: {
      nl: [
        'Spreid je oefening over de week in plaats van alles in één keer — gespreid leren beklijft veel langer dan stampen.',
        'Test jezelf in plaats van te herlezen. Jezelf overhoren is de krachtigste leertechniek die er is.',
        'Wissel onderwerpen door elkaar (interleaving) — dat leert beter dan lange blokken van hetzelfde.',
        'Klein en vaak verslaat lang en zelden: een paar minuten per dag werkt beter dan één lange sessie.',
        'Leg het hardop uit alsof je het iemand leert — dat legt meteen de gaten in je kennis bloot.',
        'Slaap consolideert wat je leert; een korte sessie voor het slapengaan kan helpen.',
      ],
      en: [
        'Space your practice across the week instead of cramming — spaced learning sticks far longer.',
        'Test yourself instead of re-reading. Self-quizzing is the single most powerful study technique.',
        'Interleave topics — mixing them up beats long blocks of the same thing.',
        'Little and often beats long and rare: a few minutes a day works better than one long session.',
        'Explain it out loud as if teaching someone — it instantly exposes the gaps in your knowledge.',
        'Sleep consolidates what you learn; a short session before bed can help.',
      ],
    },
  },
}

export function studyTipsFor(area: TipArea, lang: Lang): { title: string; tips: string[] } {
  const set = STUDY_TIPS[area]
  return { title: set.title[lang], tips: set.tips[lang] }
}
