// Grammar patterns for Lesson 5 — Belajar
// Focus: personal pronouns (saya/aku/kamu/Anda/dia), inclusive vs exclusive we (kita vs kami),
//        possessive suffix placement (-ku, -mu, -nya)
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB (24 rows)
//   - staging lesson-1 through lesson-7 grammar-patterns.ts files
// All 3 slugs already exist in DB (published). Re-emitting for staging completeness.
export const grammarPatterns = [
  {
    pattern_name: 'KITA vs KAMI — Inclusief en exclusief wij',
    description:
      "Indonesisch heeft twee woorden voor 'wij': kita (inclusief — de aangesprokene telt mee) en kami (exclusief — de aangesprokene is uitgesloten).",
    confusion_group: 'pronouns-we',
    page_reference: 3,
    slug: 'kami-vs-kita',
    complexity_score: 4,
  },
  {
    pattern_name: 'Bezittelijk voornaamwoord — achterplaatsing en afgekorte vormen',
    description:
      'Het bezittelijk voornaamwoord staat altijd achter het zelfstandig naamwoord. Voor aku en kamu bestaan afgekorte vormen: -ku (mijn), -mu/-kau (jouw), -nya (zijn/haar/hun).',
    confusion_group: 'possessives',
    page_reference: 6,
    slug: 'possessive-suffix-placement',
    complexity_score: 4,
  },
  {
    pattern_name: 'Persoonlijk voornaamwoord — formeel, neutraal en informeel',
    description:
      "Het Indonesisch heeft veel meer persoonlijke voornaamwoorden dan het Nederlands. De keuze hangt af van situatie, sexe, leeftijd en status: formeel (Tuan/Nyonya), neutraal (Bapak/Ibu/Anda), informeel (kamu/aku).",
    confusion_group: 'pronouns-register',
    page_reference: 4,
    slug: 'pronoun-register-levels',
    complexity_score: 5,
  },
]
