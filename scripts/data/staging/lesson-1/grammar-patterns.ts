// Grammar patterns for Lesson 1 — Di Pasar (Op de markt)
// Enriched by linguist: slugs, complexity_scores, confusion_groups added
// Source: scripts/data/lessons.ts lesson 1 grammar section
export const grammarPatterns = [
  {
    "pattern_name": "Werkwoord — geen vervoeging",
    "description": "Indonesische werkwoorden worden niet vervoegd naar persoon, getal of tijd. 'Saya beli' = ik koop/kocht. Tenzij uit de context anders blijkt, vertaalt men in de tegenwoordige tijd.",
    "confusion_group": null,
    "page_reference": 1,
    "slug": "verb-no-conjugation",
    "complexity_score": 2
  },
  {
    "pattern_name": "Zinnen zonder werkwoord",
    "description": "Zinnen zonder werkwoord zijn heel gewoon in het Indonesisch. Voorbeeld: 'Itu mahal' (Dat [is] duur). Het koppelwerkwoord 'zijn' wordt weggelaten.",
    "confusion_group": "copula-omission",
    "page_reference": 1,
    "slug": "zero-copula",
    "complexity_score": 2
  },
  {
    "pattern_name": "Werkwoorden bij elkaar — serieel werkwoord",
    "description": "Werkwoorden worden bij elkaar gezet zonder verbindingswoord. Voorbeeld: 'Saya mau beli rumah besar' (Ik wil een groot huis kopen). Vergelijk Nederlands: 'wil kopen' = 'mau beli'.",
    "confusion_group": "serial-verbs",
    "page_reference": 1,
    "slug": "serial-verb-construction",
    "complexity_score": 3
  },
  {
    "pattern_name": "Geen lidwoorden",
    "description": "Zelfstandige naamwoorden hebben geen lidwoord (de, het, een). 'Rumah' = huis / het huis / een huis. Context bepaalt de betekenis.",
    "confusion_group": null,
    "page_reference": 1,
    "slug": "no-articles",
    "complexity_score": 1
  },
  {
    "pattern_name": "Geen enkelvoud/meervoud onderscheid",
    "description": "Bij zelfstandige naamwoorden wordt geen onderscheid gemaakt tussen enkelvoud en meervoud. 'Rumah' = huis of huizen.",
    "confusion_group": "reduplication-plurality",
    "page_reference": 1,
    "slug": "no-singular-plural",
    "complexity_score": 1
  },
  {
    "pattern_name": "Reduplicatie voor meervoud",
    "description": "Herhaling van een zelfstandig naamwoord geeft meervoud of verscheidenheid aan: 'buah-buahan' (allerlei fruit). Maar: als uit context al meervoud blijkt, wordt NIET verdubbeld: 'dua rumah' (niet 'dua rumah-rumah').",
    "confusion_group": "reduplication-plurality",
    "page_reference": 1,
    "slug": "reduplication-plural",
    "complexity_score": 3
  },
  {
    "pattern_name": "Bijvoeglijk naamwoord NA zelfstandig naamwoord",
    "description": "Het bijvoeglijk naamwoord wordt achter het zelfstandig naamwoord geplaatst: 'rumah besar' (groot huis). Omgekeerde volgorde ten opzichte van het Nederlands.",
    "confusion_group": "adjective-placement",
    "page_reference": 1,
    "slug": "adjective-after-noun",
    "complexity_score": 2
  },
  {
    "pattern_name": "Belum vs tidak — ontkenning",
    "description": "'Tidak' = niet/nee (definitieve ontkenning). 'Belum' = nog niet (tijdelijke ontkenning, iets kan nog veranderen). 'Belum bisa' = nog niet mogelijk. Voor Nederlandse leerlingen: 'belum' impliceert dat het later wel kan.",
    "confusion_group": "negation-belum-tidak",
    "page_reference": 1,
    "slug": "belum-vs-tidak",
    "complexity_score": 3
  }
]
