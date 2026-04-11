// Grammar patterns for Lesson 7 — Libur Sekolah
// Focus: -nya construction (possessive, nominalizer, topicalization), time expressions, time/place word order
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB (27 rows)
//   - staging lesson-1 through lesson-6 grammar-patterns.ts files
export const grammarPatterns = [
  {
    pattern_name: '-nya als bezittelijk achtervoegsel',
    description:
      "Het achtervoegsel -nya achter een zelfstandig naamwoord drukt bezit uit: 'zijn/haar/hun'. Nooit aan eigennamen: 'Rumah Tuti' (niet 'Tutinya rumah'). Voorbeeld: 'Sepedanya hitam' = Zijn/haar fiets is zwart.",
    confusion_group: 'nya-functions',
    page_reference: 6,
    slug: 'nya-possessive-suffix',
    complexity_score: 3,
  },
  {
    pattern_name: '-nya topicalisatie — drie zinsconstructies',
    description:
      "Door -nya kan de woordgroep in drie volgordes verschijnen: (1) A B C: 'Warna mobil itu putih', (2) B A-nya C: 'Mobil itu warnanya putih', (3) B C A-nya: 'Mobil itu putih warnanya'. De vooraanstaande woordgroep krijgt de meeste nadruk.",
    confusion_group: 'nya-functions',
    page_reference: 7,
    slug: 'nya-topicalization',
    complexity_score: 5,
  },
  {
    pattern_name: '-nya als nominalisator van bijvoeglijke naamwoorden',
    description:
      "Wanneer -nya achter een bijvoeglijk naamwoord staat, wordt het een zelfstandig naamwoord (de eigenschap): 'tingginya' = de hoogte, 'jauhnya' = de afstand, 'panjangnya' = de lengte. Voorbeeld: 'Pohon itu tingginya 18 meter'.",
    confusion_group: 'nya-functions',
    page_reference: 8,
    slug: 'nya-adjective-nominalizer',
    complexity_score: 4,
  },
  {
    pattern_name: 'Tijdsaanduidingen — kemarin, hari ini, besok, lusa',
    description:
      "Indonesische tijdswoorden: kemarin dulu (eergisteren), kemarin (gisteren), hari ini (vandaag), besok (morgen), lusa (overmorgen). Relatief aan het heden: tadi (zoeven), nanti (straks), dulu (vroeger), depan (komend).",
    confusion_group: 'time-system',
    page_reference: 9,
    slug: 'time-adverbs-basic',
    complexity_score: 3,
  },
  {
    pattern_name: 'Tijdsbepaling en plaatsbepaling — woordvolgorde',
    description:
      "Bepalingen van tijd en plaats staan aan het begin of eind van de zin, nooit tussen onderwerp en werkwoord. Als beide voorkomen en de zin met plaats begint, staat tijd aan het eind (en omgekeerd). Nooit: 'Saya sekarang makan'. Wel: 'Sekarang saya makan' of 'Saya makan sekarang'.",
    confusion_group: null,
    page_reference: 10,
    slug: 'time-place-word-order',
    complexity_score: 4,
  },
]
