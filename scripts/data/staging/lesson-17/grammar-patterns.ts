// Grammar patterns for Lesson 17 — Bab 1: Telur Mata Sapi (Selamat Datang deel 2)
// Focus: active ME-verb agens/patiens word order + pronoun-clitic patiens (-ku/-mu/-nya);
//        the question word berapa? (+ noun-nya answer pattern); siapa? vs apa? vs mana?.
// Slugs of the form l17-{title}, verified unique against:
//   - indonesian.grammar_patterns DB (97 rows, queried 2026-06-18)
//   - staging lesson-1 through lesson-16 grammar-patterns.ts files
export const grammarPatterns = [
  {
    pattern_name: 'Agens — ME-werkwoordsvorm — patiens: de volgorde in de actieve zin',
    description:
      'In een actieve (bedrijvende) zin staat de agens vóór de ME-werkwoordsvorm en de patiens erná: Agens — ME-vorm — Patiens. De agens is de persoon of zaak die de handeling uitvoert; de patiens is de persoon of zaak die de handeling ondergaat. Voorbeelden: "Siapa mencari saya?" (Wie zoekt mij?), "Ibu memanggil kamu" (Moeder roept jou), "Guru melihat dia" (De leraar zag hem/haar/het). De ME-werkwoordsvorm is altijd transitief in deze constructie: hij heeft een patiens nodig.',
    confusion_group: 'me-di-voice',
    page_reference: 3,
    slug: 'l17-agens-werkwoord-patiens-volgorde',
    complexity_score: 5,
    example: 'Guru melihat dia — De leraar zag hem/haar/het',
  },
  {
    pattern_name: 'De patiens als persoonlijk voornaamwoord: de clitica -ku / -mu / -nya',
    description:
      'Wanneer de patiens een persoonlijk voornaamwoord is, kan dat als enclitisch achtervoegsel direct aan de ME-werkwoordsvorm worden vastgehecht: saya → -ku, kamu → -mu, dia → -nya. Zo wordt "Siapa mencari saya?" ook "Siapa mencariku?", "Ibu memanggil kamu" wordt "Ibu memanggilmu", en "Guru melihat dia" wordt "Guru melihatnya". Alleen saya/kamu/dia hebben een clitische vorm; kami/kita, kalian en mereka blijven volle woorden achter het werkwoord ("Mereka menelepon kami", "Bapak mengantar kalian"). De clitische vorm is optioneel en vooral spreektalig/compact; de volle vorm met los voornaamwoord blijft altijd correct. Let op het verschil met de bezittelijke -nya uit L7 (bukunya = zijn boek): hier markeert -nya het lijdend voorwerp van een werkwoord (melihatnya = hem/haar zien).',
    confusion_group: 'nya-functions',
    page_reference: 3,
    slug: 'l17-patiens-persoonlijk-voornaamwoord-clitica',
    complexity_score: 6,
    example: 'Ibu memanggilmu — Moeder roept jou',
  },
  {
    pattern_name: 'Berapa? = hoeveel? — het vraagwoord dat een getal verwacht',
    description:
      'Berapa? betekent "hoeveel?" en gebruik je wanneer je een getal als antwoord verwacht. Vaak combineer je berapa met een zelfstandig naamwoord + -nya, waarbij -nya verwijst naar de zaak waarover je vraagt: "Berapa nomornya?" (Wat is het nummer ervan?), "Berapa beratnya?" (Hoe zwaar is het?), "Berapa harganya?" (Wat is de prijs / wat kost het?), "Berapa tingginya?" (Hoe hoog is het?). In het antwoord mag het kernwoord herhaald worden, maar dat hoeft niet: "Berapa harganya?" → "(Harganya) 35.000 rupiah". De -nya hier is dezelfde topic/bezit-markeerder als in L7, nu toegepast op een getalsvraag.',
    confusion_group: 'time-expressions',
    page_reference: 3,
    slug: 'l17-berapa-vraagwoord-getal',
    complexity_score: 4,
    example: 'Berapa harganya? — Wat is de prijs / wat kost het?',
  },
  {
    pattern_name: 'Siapa? vs apa? vs mana? — wie, wat, welke',
    description:
      'Het vraagwoord hangt af van wat je bevraagt. Siapa? (= wie?) gebruik je voor personen en voor gepersonifieerde zaken (zoals een pop): "Siapa namanya?" (Hoe heet hij?), "Bonekamu siapa namanya?" (Hoe heet je pop?), "Ini koper siapa?" (Van wie is deze koffer?). Apa? (= wat?) gebruik je voor dieren, dingen en zaken: "Bapak/Ibu ingin apa?" (Wat wilt u?), "Ini mobil apa?" (Wat voor auto is dit?), "Nama hotel itu apa?" (Wat is de naam van dat hotel?). Mana? (= welk(e)?) gebruik je om een keuze uit een verzameling te vragen, vaak met yang: "Mana yang enak?" (Welke is/zijn lekker?), "Koper Bapak yang mana?" (Welke koffer is van u?). Veelgemaakte fout door Nederlandstaligen: apa gebruiken om naar een naam te vragen — bij een naam vraag je in het Indonesisch wél met siapa (Siapa namanya?), niet met apa.',
    confusion_group: 'question-words-selection',
    page_reference: 4,
    slug: 'l17-siapa-apa-mana-selectie',
    complexity_score: 4,
    example: 'Ini mobil apa? — Wat voor auto is dit?',
  },
  {
    pattern_name: 'Mana als afkorting + herhaling van het kernwoord in het bevestigend antwoord',
    description:
      'Mana? heeft naast "welk(e)?" twee afgeleide betekenissen: als afkorting van bagaimana? (= hoe?) — "Mana mungkin?" (Hoe kan dat nou?) — en als afkorting van di mana? (= waar?) — "Mana orangnya?" (Waar zit hij?). Verder geldt: bij een bevestigend antwoord wordt het kernwoord uit de vraag in het algemeen herhaald, niet "ja" gezegd. "Apa(kah) Anda mau ikut?" → bevestigend "Mau", ontkennend "Tidak mau"; "Apa kamu sudah lama di sini?" → "Sudah / Lama" of ontkennend "Belum"; "Apa itu enak?" → "Enak" of "Tidak enak". Het juiste ontkennende woord (tidak vs belum) hangt af van het kernwoord.',
    confusion_group: 'question-words-selection',
    page_reference: 4,
    slug: 'l17-mana-afkorting-en-kernwoord-herhaling',
    complexity_score: 5,
    example: 'Apa itu enak? — Enak / Tidak enak',
  },
]
