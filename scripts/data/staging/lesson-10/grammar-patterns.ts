// Grammar patterns for Lesson 10 — Ke Kantor Pos (naar het postkantoor)
// Focus: -AN nominalisatie, KE- rangtelwoord, rekenkundige operatoren, voegwoorden,
//        routebeschrijving, kale imperatief + mari/ayo, mentale werkwoorden rasa/kira/pikir
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB
//   - staging lesson-1 through lesson-9 grammar-patterns.ts files
// Related existing slugs (NOT re-added):
//   - imperative-lah-suffix / jangan-prohibition (lesson 6): cover -lah and the jangan-verbod;
//     bare-imperative-and-invitation adds the kale imperatief (stam vooraan) plus mari/ayo
//   - direction-words confusion_group (lessons 3/6): direction-route-instructions extends it
//     to full route-chaining (belok/terus/menyeberang/lewat + oriëntatiepunten)
export const grammarPatterns = [
  {
    pattern_name: 'Achtervoegsel -AN — naamwoordvorming',
    description:
      'Het achtervoegsel -AN vormt zelfstandige naamwoorden uit werkwoorden (makan -> makanan), zelfstandige naamwoorden (pasar -> pasaran; tijdwoorden hari -> harian "dagelijks"), bijvoeglijke naamwoorden (asin -> asinan) en telwoorden (puluh -> puluhan). De meest productieve betekenis is "apa yang di-(basis)": makanan = wat gegeten wordt = voedsel, minuman = drank, tulisan = het geschrevene. NB: niet elk grondwoord neemt -AN aan — raadpleeg bij twijfel een woordenboek.',
    confusion_group: 'affix-derivation',
    page_reference: null,
    slug: 'an-suffix-nominalization',
    complexity_score: 5,
    example: 'Makanan di warung itu enak sekali. — Het eten in dat eethuisje is heel lekker.',
  },
  {
    pattern_name: 'Rangtelwoord — KE- + telwoord',
    description:
      'Rangtelwoorden ("...de/...ste") worden gevormd met het voorvoegsel KE- (kedua, ketiga, kesebelas), behalve "eerste" = pertama (Sanskriet-leenwoord; kesatu bestaat maar wordt zelden gebruikt). Het rangtelwoord staat achter het zelfstandig naamwoord (kamar kedua = de tweede kamer). Let op: kedua + zelfstandig naamwoord vooraan betekent "beide" (kedua kamar itu = beide kamers), terwijl "kamar dua" kamer nummer 2 als label aanduidt.',
    confusion_group: 'number-system',
    page_reference: null,
    slug: 'ke-ordinal-numbers',
    complexity_score: 4,
    example: 'Di jalan pertama belok kiri. — Sla bij de eerste straat linksaf.',
  },
  {
    pattern_name: 'Rekenen — tambah, kurang, kali, dibagi, per',
    description:
      'Rekenkundige bewerkingen: tambah (+), kurang (-), kali (x), dibagi (:), ... per ... (breuk). De uitkomst wordt ingeleid met "sama dengan" (= is gelijk aan). Let op homoniemen die de leerling al kent: tambah betekent ook "toevoegen/erbij", kurang betekent ook "tekort/minder". In rekencontext zijn het optellen en aftrekken. Breuken: "lima perenam" = 5/6, dus [teller] per[noemer aaneengeschreven].',
    confusion_group: 'number-system',
    page_reference: null,
    slug: 'arithmetic-operators',
    complexity_score: 3,
    example: 'Delapan tambah dua sama dengan sepuluh. — Acht plus twee is tien.',
  },
  {
    pattern_name: 'Voegwoorden — onder- en nevenschikkend',
    description:
      'Voegwoorden verbinden zinnen: reden (karena/sebab = omdat), gevolg-inleiding (karena itu/sebab itu = daarom), voorwaarde (kalau/jikalau = indien, asal = mits), doel (supaya/agar = opdat/zodat-doel), gevolg (sehingga = zodat-resultaat), tijd (sebelum = voordat, sementara = terwijl, bilamana/apabila = op het moment dat), toegeving (meskipun/walaupun = ofschoon) en correlatief (tidak saja..., tetapi juga... = niet alleen..., maar ook...). Leerlingen verwarren doel (supaya/agar) en gevolg (sehingga).',
    confusion_group: null,
    page_reference: null,
    slug: 'subordinating-conjunctions',
    complexity_score: 5,
    example:
      'Sebaiknya kamu lewat jembatan penyeberangan supaya lebih aman. — Je kunt beter via de voetgangersbrug gaan zodat het veiliger is.',
  },
  {
    pattern_name: 'Routebeschrijving — belok, terus, menyeberang, lewat',
    description:
      'Vaste richtingswoorden voor het wijzen van de weg: belok kiri/kanan (links/rechts afslaan), terus (rechtdoor/verder), jalan kaki (te voet), naik becak (met de fietstaxi), menyeberang (oversteken), lewat (via/langs), sampai (tot aan), turun (uitstappen). Plaatsbepaling met di/dari/ke + oriëntatiepunt (di ujung jalan, di muka Pasar Baru, di dekat Gedung Kesenian). Veelgemaakte fout: kiri/kanan verwisselen of lewat (via) verwarren met menyeberang (dwars oversteken).',
    confusion_group: 'direction-words',
    page_reference: null,
    slug: 'direction-route-instructions',
    complexity_score: 4,
    example:
      'Di jalan pertama belok kiri sampai jembatan di ujung jalan itu. — Sla bij de eerste straat linksaf, tot aan de brug aan het eind van die straat.',
  },
  {
    pattern_name: 'Gebiedende wijs en uitnodiging — kale imperatief, mari, ayo',
    description:
      'De kale (onverbogen) imperatief plaatst de werkwoordstam zonder onderwerp vooraan (Beli mobil!, Duduk di sini!). Het verbod gebruikt jangan + werkwoord (Jangan naik bus! = stap niet in die bus). Een uitnodiging in de wij-vorm gebruikt mari (formeel/neutraal) of ayo (informeel, aansporend) + (kita): Mari kita pulang = laten we naar huis gaan. Verzachting met -lah (Duduklah) of het partikel "saja" (Beli saja = koop toch maar).',
    confusion_group: 'imperative-forms',
    page_reference: null,
    slug: 'bare-imperative-and-invitation',
    complexity_score: 3,
    example: 'Mari kita kembali! — Kom, laten we teruggaan!',
  },
  {
    pattern_name: 'Denken en voelen — rasa, kira, pikir',
    description:
      'Drie "menen/vinden"-werkwoorden naar bron van het oordeel: rasa = gevoelsmatig (zintuigen/hart/ziel), kira = vermoeden/inschatten (vaak een gok), pikir = verstandelijk nadenken. In spreektaal worden saya rasa / saya kira / saya pikir vaak door elkaar gebruikt voor "ik denk dat...", maar het register-onderscheid blijft: rasa is intuïtief/gevoelsmatig, pikir is rationeel, kira is een inschatting. Voor Nederlandstaligen verwarrend omdat "vinden/denken/menen" alle drie kunnen worden vertaald.',
    confusion_group: 'mental-verbs',
    page_reference: null,
    slug: 'rasa-kira-pikir-mental-verbs',
    complexity_score: 6,
    example: 'Saya rasa buah ini kurang manis. — Ik vind deze vrucht niet zoet genoeg.',
  },
]
