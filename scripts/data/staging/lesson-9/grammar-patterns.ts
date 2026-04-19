// Grammar patterns for Lesson 9 — Ke Puskesmas / Dukun en Jamu
// Focus: A-B-C verb ordering (phase-aspect-main-verb), intensifier adverb position,
//        benar/betul as truth adverb ('echt, juist, echt waar')
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB (44 rows)
//   - staging lesson-1 through lesson-8 grammar-patterns.ts files
// Related existing slugs (NOT re-added):
//   - serial-verb-construction (lesson 7): covers the simple V+V case; this lesson extends it with the A-B-C schema
//   - sekali-intensifier (lesson 3/6): covers sekali specifically; new pattern adds the positional contrast with amat/sangat/benar/betul
export const grammarPatterns = [
  {
    pattern_name: 'Volgorde werkwoorden — A (fase) · B (aspect) · C (hoofdwerkwoord)',
    description:
      "Indonesische werkwoordsgroepen volgen een vaste driedelige volgorde: A (fase: tidak/belum/akan/sudah/masih/sedang...) · B (aspect: mau/harus/bisa/boleh/ingin/coba...) · C (hoofdwerkwoord: datang/pergi/makan/tidur...). Een hoofdwerkwoord (C) is altijd nodig; woorden uit A en B zijn optioneel en worden in die volgorde gestapeld. Voorbeelden: 'Saya tidak mau datang' = A+B+C (Ik wil niet komen); 'Dia akan coba cari hotel' = A+B+C (Hij zal proberen een hotel te zoeken); 'Saya masih harus masuk sekolah' = A+B+C (Ik moet nog naar school gaan). Regels: tidak staat voor akan/bakal (tidak akan); harus staat voor alle andere groep-B-woorden (harus bisa, harus mau).",
    confusion_group: 'serial-verbs',
    page_reference: null,
    slug: 'verb-ordering-abc',
    complexity_score: 5,
  },
  {
    pattern_name: 'Intensiveerders — positie van amat/sangat vs benar/betul/sekali',
    description:
      "Indonesisch heeft vijf woorden die 'erg, zeer' betekenen, met strikte positie rond het bijvoeglijk naamwoord. Vóór het bijv.nw.: amat en sangat ('amat mahal' = erg duur, 'sangat cepat' = zeer snel). Achter het bijv.nw.: benar, betul en sekali ('besar betul' = erg groot, 'takut benar' = zeer bang, 'murah sekali' = zeer goedkoop). Register: sangat is formeel (nieuws, toespraken), amat is redelijk formeel, sekali is neutraal tot alledaags, banget (buiten deze les) is informeel. Ze zijn niet vrij uitwisselbaar van positie: *sangat cepat* is correct, maar *cepat sangat* niet.",
    confusion_group: 'intensifier-position',
    page_reference: null,
    slug: 'intensifier-position',
    complexity_score: 3,
  },
  {
    pattern_name: "Benar / betul als waarheidsbijwoord — 'echt, juist, waar'",
    description:
      "Naast hun gebruik als intensiveerder (achter een bijv.nw., 'zeer') kunnen benar en betul ook 'echt, juist, echt waar' betekenen. In die functie staan ze niet achter een bijv.nw. maar voor het werkwoord/bijv.nw. of los als bevestiging: 'Itu benar' = Dat klopt; 'Betul, saya lupa' = Dat is waar, ik ben het vergeten; 'Dia betul sakit' = Hij is écht ziek. Verdubbeling betul-betul / benar-benar versterkt tot 'werkelijk, echt écht': 'saya betul-betul lupa' = ik ben het écht vergeten. Let op: 'Kota ini besar betul' (achter bijv.nw.) = erg groot; 'Ini betul besar' (voor bijv.nw.) = dit is echt groot. Betekenis verandert met positie.",
    confusion_group: 'intensifier-position',
    page_reference: null,
    slug: 'benar-betul-truth-adverb',
    complexity_score: 4,
  },
]
