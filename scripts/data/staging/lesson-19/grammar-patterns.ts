// Grammar patterns for Lesson 19 — Bab 3: Zinsbouw (Selamat Datang deel 2)
// Focus: Indonesian active-sentence syntax — agens/patiens + parties 3 & 4 (voor wie / waarmee),
//        the usual word order of an active sentence (tijd · agens · wijze · handeling · patiens ·
//        partij 3 · partij 4 · plaats), and the conjunctions for reason/cause (sebab, karena,
//        sebab itu, karena itu) and purpose/result (supaya, sehingga).
// Slugs of the form l19-{title}, verified unique against:
//   - indonesian.grammar_patterns DB (97 rows, queried 2026-06-18; no l19- slugs present)
//   - staging lesson-1 through lesson-18 + lesson-20 grammar-patterns.ts files
export const grammarPatterns = [
  {
    pattern_name: 'Agens, patiens en de partijen in de zin (zinsbouwschema)',
    description:
      'Een Indonesische zin geeft informatie over verschillende "partijen", verbonden door een werkwoordsvorm (de handeling). Partij 1 is de agens: de persoon of zaak die de handeling uitvoert. Partij 2 is de patiens: de persoon of zaak die de handeling ondergaat. De basisstructuur is Agens — handeling — Patiens (Presiden membuka sekolah baru = De president opent een nieuwe school). Het schema kan worden uitgebreid met partij 3 (ten behoeve van wie/wat, voorafgegaan door bagi, buat, kepada of untuk) en partij 4 (met wie/waarmee, voorafgegaan door dengan, sama of tanpa).',
    confusion_group: 'me-di-voice',
    page_reference: 1,
    slug: 'l19-agens-patiens-en-de-partijen-in-de-zin',
    complexity_score: 5,
    example: 'Presiden membuka sekolah baru — De president opent een nieuwe school',
  },
  {
    pattern_name: 'De gebruikelijke volgorde in een actieve zin (tijd · wijze · plaats)',
    description:
      'Een actieve Indonesische zin kan naast de partijen ook bepalingen van tijd (tijdsbepaling), wijze (wijze van uitvoering) en plaats (plaatsbepaling) bevatten. De gebruikelijke volgorde is: tijdsbepaling — partij 1 (agens) — wijze van uitvoering — handeling — partij 2 (patiens) — partij 3 (voor wie: bagi/buat/kepada/untuk) — partij 4 (met wie/waarmee: dengan/sama/tanpa) — plaatsbepaling (dari/di/ke). De wijze van uitvoering wordt vaak gevormd met secara (+ bijvoeglijk naamwoord) of een bijwoord (cepat, lekas). Door meer informatie toe te voegen verandert de zinsbouw niet wezenlijk. Belangrijk: wat de spreker het belangrijkst vindt — vaak een tijd- of plaatsbepaling — komt vooraan in de zin; verschuift de focus, dan verandert de volgorde (Di Denpasar presiden membuka… zet de plaats centraal).',
    confusion_group: 'zinsvolgorde-bepalingen',
    page_reference: 3,
    slug: 'l19-gebruikelijke-volgorde-in-een-actieve-zin',
    complexity_score: 6,
    example:
      'Pekan lalu presiden secara resmi membuka sekolah baru di Denpasar — Vorige week opende de president officieel een nieuwe school in Denpasar',
  },
  {
    pattern_name: 'Reden en oorzaak: sebab, karena, sebab itu, karena itu',
    description:
      'Om een reden of oorzaak in te leiden gebruik je sebab of karena (= omdat): Sebab dia sedang makan, kita berangkat sebentar lagi (Omdat hij nog aan het eten is, vertrekken wij wat later); Karena feri tidak datang, orang harus tunggu lama (Omdat de ferry niet komt, moeten de mensen lang wachten). Om een gevolg "daarom / om die reden" uit te drukken gebruik je sebab itu of karena itu: Bapak sakit, sebab itu dia tidak ke kantor (Vader is ziek, daarom gaat hij niet naar kantoor). Na karena/sebab hoeft het onderwerp niet herhaald te worden als het uit de hoofdzin al duidelijk is.',
    confusion_group: 'voegwoorden-reden-gevolg',
    page_reference: 5,
    slug: 'l19-reden-en-oorzaak-sebab-karena',
    complexity_score: 4,
    example: 'Bapak sakit, sebab itu dia tidak ke kantor — Vader is ziek, daarom gaat hij niet naar kantoor',
  },
  {
    pattern_name: 'Doel en gevolg: supaya (opdat) tegenover sehingga (zodat)',
    description:
      'Twee voegwoorden leiden een doel of gevolg in. Supaya betekent "opdat / zodat" met het oog op een bedoeling (doel): de tweede clausule beschrijft iets dat men wíl bereiken — Dia makan sedikit supaya badannya menjadi kurus (Zij eet weinig opdat zij afvalt). Sehingga betekent "zodat" in de zin van een gevolg dat zich vanzelf voordoet (resultaat), niet bewust nagestreefd — Dia sakit dan tidak makan sehingga badannya menjadi kurus (Zij is ziek en eet niet zodat zij afvalt). De kern van het onderscheid: supaya = beoogd doel, sehingga = optredend gevolg. (Agar is een formelere variant van supaya, vooral in geschreven taal.)',
    confusion_group: 'voegwoorden-reden-gevolg',
    page_reference: 6,
    slug: 'l19-doel-en-gevolg-supaya-tegenover-sehingga',
    complexity_score: 5,
    example: 'Dia makan sedikit supaya badannya menjadi kurus — Zij eet weinig opdat zij afvalt',
  },
]
