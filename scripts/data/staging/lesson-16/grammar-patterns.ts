// Grammar patterns for Lesson 16
export const grammarPatterns = [
  {
    pattern_name: 'De DI-vorm: de lijdende (passieve) werkwoordsvorm',
    description:
      'De DI-vorm vormt de passieve (lijdende) werkwoordsvorm voor de 3e persoon. De zaak die de handeling ondergaat (patiens) komt vooraan en centraal te staan; de focus verschuift weg van de actievoerder. Tegenhanger van de actieve ME-vorm.',
    confusion_group: 'me-di-voice',
    page_reference: 4,
    slug: 'l16-di-vorm-lijdende-passieve-werkwoordsvorm',
    complexity_score: 5,
    example: 'Nasi dimakannya — De rijst wordt door hem gegeten',
  },
  {
    pattern_name: 'Volgorde van de woordgroepen bij de DI-vorm',
    description:
      'De patiens komt altijd vóór de DI-vorm en de agens erachter (patiens + DI-vorm + agens). Patiens en agens hoeven niet allebei genoemd te worden; bij een plaatsbepaling is de volgorde plaatsbepaling + DI-vorm + patiens + agens.',
    confusion_group: 'me-di-voice',
    page_reference: 5,
    slug: 'l16-volgorde-woordgroepen-bij-di-vorm',
    complexity_score: 5,
    example: 'Buku itu dibeli bapak — Dat boek is door vader gekocht',
  },
  {
    pattern_name: 'Oleh, vertaling en de voorkeur voor de DI-vorm',
    description:
      "De agens kan worden voorafgegaan door 'oleh' (= door) als die niet duidelijk is; bij eigennamen laat men 'oleh' weg. Een DI-zin hoeft in het Nederlands niet altijd passief vertaald te worden. Het Indonesisch heeft een sterke voorkeur voor de DI-vorm voor de 3e persoon.",
    confusion_group: null,
    page_reference: 6,
    slug: 'l16-oleh-en-voorkeur-voor-di-vorm',
    complexity_score: 4,
    example: 'Pintu dikunci oleh bapak — Vader heeft de deur op slot gedaan',
  },
  {
    pattern_name: 'Transitieve en intransitieve werkwoorden',
    description:
      'Transitieve werkwoorden kunnen een lijdend voorwerp (patiens) bij zich hebben (eten, kopen, wassen, lezen); intransitieve werkwoorden niet (huilen, zitten, landen). Alleen transitieve werkwoorden kunnen tot een passieve DI-vorm worden omgevormd.',
    confusion_group: 'transitiviteit',
    page_reference: 6,
    slug: 'l16-transitieve-en-intransitieve-werkwoorden',
    complexity_score: 4,
    example: 'Anjing makan daging — De hond eet vlees (transitief)',
  },
  {
    pattern_name: 'DI- bij transitieve en intransitieve werkwoordsvormen',
    description:
      'DI- wordt rechtstreeks aan het basiswoord gevoegd bij transitieve werkwoordsvormen (een ME-vorm met mogelijk patiens). ME-vormen afgeleid van een bijvoeglijk naamwoord, telwoord of persoonlijk voornaamwoord zijn vrijwel altijd intransitief en kunnen geen DI-vorm krijgen.',
    confusion_group: 'me-di-voice',
    page_reference: 7,
    slug: 'l16-di-bij-transitieve-en-intransitieve-werkwoordsvormen',
    complexity_score: 6,
    example: 'Daging dimakan anjing — Het vlees wordt door de hond gegeten',
  },
]
