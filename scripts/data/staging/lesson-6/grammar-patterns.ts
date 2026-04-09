// Grammar patterns for Lesson 6 — negation (belum/bukan/tidak/jangan), imperative, -kah, time
// Existing DB slugs referenced but NOT re-added: belum-vs-tidak, tidak-negation
export const grammarPatterns = [
  {
    pattern_name: 'Bukan — ontkenning van zelfstandig naamwoorden',
    description:
      'Bukan ontkent zelfstandige naamwoorden, eigennamen, persoonlijke voornaamwoorden en met "yang" genominaliseerde woorden. Vaak in combinatie met "tetapi" (niet X, maar Y). Vergelijk Nederlands: "Dit is geen huis" = "Ini bukan rumah".',
    confusion_group: 'negation-types',
    page_reference: 4,
    slug: 'bukan-negation',
    complexity_score: 3,
  },
  {
    pattern_name: "Bukan / 'kan — tag question (nietwaar?)",
    description:
      "Bukan (of de afgekorte vorm 'kan) achteraan in de zin werkt als tag question: 'nietwaar?', 'is het niet?'. Vergelijk Nederlands: 'De tv is nog nieuw, nietwaar?' = 'TV di Indonesia masih baru, bukan?'",
    confusion_group: 'bukan-functions',
    page_reference: 4,
    slug: 'bukan-tag-question',
    complexity_score: 2,
  },
  {
    pattern_name: 'Jangan — verbod (negatieve gebiedende wijs)',
    description:
      "Jangan drukt een verbod uit: 'doe het niet'. Staat voor het werkwoord of zelfstandig. Vergelijk Nederlands: 'Niet doen!' = 'Jangan!', 'Drink niet teveel bier!' = 'Jangan minum bir terlalu banyak!'",
    confusion_group: 'negation-types',
    page_reference: 5,
    slug: 'jangan-prohibition',
    complexity_score: 2,
  },
  {
    pattern_name: 'Gebiedende wijs met -lah (beleefde imperatief)',
    description:
      "Het achtervoegsel -lah verzacht de gebiedende wijs tot een beleefd verzoek. Silakan/mari/ayo introduceren uitnodigingen en aansporingen. Vergelijk: 'Minum!' (bevel) vs 'Minumlah!' (beleefd verzoek) vs 'Silakan minum!' (uitnodiging).",
    confusion_group: null,
    page_reference: 5,
    slug: 'imperative-lah-suffix',
    complexity_score: 3,
  },
  {
    pattern_name: '-kah — vraagachtervoegsel voor nadruk',
    description:
      "Het achtervoegsel -kah leidt een vragende zin in met extra nadruk. Vergelijk: 'Ada pisang?' (neutraal) vs 'Adakah pisang?' (nadrukkelijker). In gesproken taal vaak weggelaten.",
    confusion_group: null,
    page_reference: 6,
    slug: 'kah-question-suffix',
    complexity_score: 2,
  },
  {
    pattern_name: 'Dagdelen — malam, pagi, siang, sore',
    description:
      "Indonesische dagdelen wijken af van het Nederlandse systeem. Een nieuwe dag begint na zonsondergang (ca. 18.00): malam (18.30-03.00), pagi (05.00-11.00), siang (11.00-16.00), sore (16.00-18.30). 'Maandagavond' in NL = 'malam Selasa' in het Indonesisch.",
    confusion_group: 'time-system',
    page_reference: 6,
    slug: 'indonesian-day-parts',
    complexity_score: 4,
  },
  {
    pattern_name: 'Kloktijd — jam, pukul, lewat, kurang',
    description:
      "Kloktijd wordt aangegeven met jam/pukul + telwoord. 'Lewat' = over, 'kurang' = voor. Bij het halve uur telt men vooruit: 'setengah tujuh' = half zeven = 06.30. Vergelijk Nederlands: 'kwart over zes' = 'jam enam lewat seperempat'.",
    confusion_group: 'time-system',
    page_reference: 7,
    slug: 'clock-time-telling',
    complexity_score: 5,
  },
]
