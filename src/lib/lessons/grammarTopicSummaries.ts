// src/lib/lessons/grammarTopicSummaries.ts
//
// Short, customer-friendly one-line grammar summaries per lesson, for the Ontdek
// "Grammatica podcasts" hub (src/pages/GrammarPodcasts.tsx). Each lesson teaches
// 3–11 grammar points whose technical names (grammar_patterns.name) are too long
// and jargon-heavy to list in a podcast picker, so the hub labels each row with
// one friendly theme instead. Hand-authored from each lesson's actual grammar
// patterns (verified against indonesian.grammar_patterns, 2026-07-08). Keyed by
// lesson order_index. This is UI copy, like the i18n strings — not schedulable
// content — so it lives in the frontend rather than a content table.
export interface GrammarTopicSummary {
  nl: string
  en: string
}

export const GRAMMAR_TOPIC_SUMMARIES: Record<number, GrammarTopicSummary> = {
  1: {
    nl: 'De woordsoorten: werkwoord, zelfstandig en bijvoeglijk naamwoord',
    en: 'Word classes: verb, noun and adjective',
  },
  2: {
    nl: 'Aanwijzende woorden (ini/itu), classificeerwoorden en ontkenning',
    en: 'Demonstratives (ini/itu), classifiers and negation',
  },
  3: {
    nl: 'Er is/zijn (ada), plaatswoorden (dari, di, ke) en sekali',
    en: 'There is/are (ada), place words (dari, di, ke) and sekali',
  },
  4: {
    nl: 'Het woordje yang: die/dat, nadruk en nominalisering',
    en: 'The word yang: relative clauses, emphasis and nominalisation',
  },
  5: {
    nl: 'Persoonlijke voornaamwoorden (ik, jij, hij/zij, wij, u)',
    en: 'Personal pronouns (I, you, he/she, we, formal you)',
  },
  6: {
    nl: 'Ontkenning (belum, bukan, tidak, jangan), gebiedende wijs en tijd',
    en: 'Negation (belum, bukan, tidak, jangan), the imperative and telling time',
  },
  7: {
    nl: 'Het achtervoegsel -nya, de dagen van de week en tijd- en plaatsbepalingen',
    en: 'The suffix -nya, days of the week and time & place phrases',
  },
  8: {
    nl: 'Trappen van vergelijking en vergelijkingen maken',
    en: 'Comparatives, superlatives and making comparisons',
  },
  9: {
    nl: 'Bijwoorden van aspect en hun volgorde in de zin',
    en: 'Aspect adverbs and their order in the sentence',
  },
  10: {
    nl: 'Rangtelwoorden, rekenen, voegwoorden en het achtervoegsel -an',
    en: 'Ordinal numbers, arithmetic, conjunctions and the suffix -an',
  },
  11: {
    nl: 'Werkwoorden met het voorvoegsel ber-',
    en: 'Verbs with the prefix ber-',
  },
  12: {
    nl: 'Ber- met verdubbeling, acroniemen en windrichtingen',
    en: 'Ber- with reduplication, acronyms and compass directions',
  },
  13: {
    nl: 'De ME-werkwoordsvorm (mem-, men-, meng-) en de klankregels',
    en: 'The ME- verb form (mem-, men-, meng-) and its sound rules',
  },
  14: {
    nl: 'De ME-vorm bij verschillende woordsoorten; ber- en me- vergeleken',
    en: 'The ME- form across word classes; ber- and me- compared',
  },
  15: {
    nl: 'Het basiswoord terugvinden onder de voorvoegsels',
    en: 'Finding the root word beneath the prefixes',
  },
  16: {
    nl: 'De passieve werkwoordsvorm met di-',
    en: 'The passive verb form with di-',
  },
  17: {
    nl: 'Vraagwoorden (apa, siapa, mana) en de clitica -ku, -mu, -nya',
    en: 'Question words (apa, siapa, mana) and the clitics -ku, -mu, -nya',
  },
  18: {
    nl: 'Passieve zinnen per persoon en tijdswoorden (sudah, sesudah)',
    en: 'Passive sentences by person and time words (sudah, sesudah)',
  },
  19: {
    nl: 'Zinsbouw en voegwoorden van reden, doel en gevolg',
    en: 'Sentence structure and conjunctions of reason, purpose and result',
  },
  20: {
    nl: 'Het voorvoegsel pe-: de handelende persoon of het instrument',
    en: 'The prefix pe-: the doer or instrument',
  },
  21: {
    nl: 'Het achtervoegsel -kan: benefactief en causatief',
    en: 'The suffix -kan: benefactive and causative',
  },
  22: {
    nl: 'Verdubbeling: meervoud, versterking en vaste vormen',
    en: 'Reduplication: plurals, intensification and fixed forms',
  },
  23: {
    nl: 'Het achtervoegsel -i: herhaalde en gerichte handeling',
    en: 'The suffix -i: repeated and directed action',
  },
  24: {
    nl: '-kan tegenover -i: het verschil en minimale paren',
    en: '-kan versus -i: the difference and minimal pairs',
  },
  25: {
    nl: 'De pe-...-an-vorm: proces, resultaat en plaats',
    en: 'The pe-...-an form: process, result and place',
  },
  26: {
    nl: 'Het voorvoegsel ter-: onopzettelijk, mogelijkheid en overtreffende trap',
    en: 'The prefix ter-: accidental, ability and superlative',
  },
  27: {
    nl: 'De ke-...-an-vorm: abstract naamwoord en onopzettelijke handeling',
    en: 'The ke-...-an form: abstract noun and accidental action',
  },
  28: {
    nl: 'Waarom het Indonesisch woorden weglaat: onderwerp, tijd en getal',
    en: 'Why Indonesian leaves words out: subject, tense and number',
  },
  29: {
    nl: 'De memper-vorm en per-...-an: intensieve causatief en nominalisering',
    en: 'The memper- form and per-...-an: intensive causative and nominalisation',
  },
  30: {
    nl: 'Voorvoegsels voor beroepen en begrippen (pra-, pramu-, tuna-, -wan)',
    en: 'Prefixes for professions and concepts (pra-, pramu-, tuna-, -wan)',
  },
}
