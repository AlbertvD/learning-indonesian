// Grammar patterns for Lesson 8 — Di Sarinah Jaya (Batik)
// Focus: interjections/discourse particles, comparative (lebih/daripada), superlative (paling/ter-),
//        equality comparison (se-/sama dengan), diminutive comparison (kurang/tidak begitu)
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB (39 rows)
//   - staging lesson-1 through lesson-7 grammar-patterns.ts files
export const grammarPatterns = [
  {
    pattern_name: 'Interjecties — discourse particles in spreektaal',
    description:
      "Indonesisch heeft veel korte partikels die emotie, nadruk of verbazing uitdrukken: dong (nadruk/verzachtend bij gebiedende wijs), kok (verbazing), wah (milde verbazing), deh (afsluitend/overtuigend), lho (verbazing), sih (nadruk/topicmarkeerder), nah (nadruk), nih (milde verbazing), ya (bevestigend). Ze komen voornamelijk in spreektaal voor. Voorbeeld: 'Lihat dong!' = Kijk dan! / 'Kok, mahal?' = Hoe kan het duur zijn?",
    confusion_group: null,
    page_reference: 4,
    slug: 'interjections-discourse-particles',
    complexity_score: 3,
  },
  {
    pattern_name: 'Vergrotende trap — lebih ... (daripada)',
    description:
      "De vergrotende trap (comparatief) wordt gevormd met lebih + bijvoeglijk naamwoord (+ daripada voor vergelijking). In spreektaal vaak 'dari' in plaats van 'daripada'. 'Jauh lebih' versterkt: jauh lebih mahal = veel duurder. Voorbeeld: 'Kain ini lebih bagus daripada kain itu' = Deze doek is mooier dan die doek.",
    confusion_group: 'comparison-degrees',
    page_reference: 4,
    slug: 'lebih-comparative',
    complexity_score: 3,
  },
  {
    pattern_name: 'Overtreffende trap — paling / ter-',
    description:
      "De overtreffende trap (superlatief) wordt gevormd met paling + bijv.nw. of het voorvoegsel ter- + bijv.nw. Beide zijn uitwisselbaar: paling besar = terbesar. Speciale vorm: maha- voor verheven begrippen (Mahakuasa). se-...-...-nya drukt het uiterste uit: secepat-cepatnya = zo snel mogelijk.",
    confusion_group: 'comparison-degrees',
    page_reference: 5,
    slug: 'paling-ter-superlative',
    complexity_score: 4,
  },
  {
    pattern_name: 'Gelijkheid — se- en sama ... dengan',
    description:
      "Gelijkheid wordt uitgedrukt met se- + bijv.nw. (sebesar = even groot als) of sama + bijv.nw. + dengan (sama besar dengan = even groot als). se- vervangt het vergelijkingswoord: 'Rumah sebesar kantor' = Een huis zo groot als een kantoor. 'Lemariku sama kecil dengan lemarimu' = Mijn kast is even klein als jouw kast.",
    confusion_group: 'comparison-degrees',
    page_reference: 5,
    slug: 'se-sama-equality-comparison',
    complexity_score: 4,
  },
  {
    pattern_name: 'Ongelijkheid verkleinend — kurang / tidak begitu',
    description:
      "Verkleinende ongelijkheid: kurang + bijv.nw. = niet ... genoeg / minder. kurang + bijv.nw. + daripada = minder ... dan. tidak begitu + bijv.nw. = niet zo ... Let op dubbele betekenis: 'kurang besar' = niet groot genoeg (te klein). Voorbeeld: 'Meja ini kurang bagus daripada meja itu' = Deze tafel is minder mooi dan die tafel.",
    confusion_group: 'comparison-degrees',
    page_reference: 6,
    slug: 'kurang-diminutive-comparison',
    complexity_score: 4,
  },
]
