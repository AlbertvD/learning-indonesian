// Grammar patterns for Lesson 22 — Pesta Pernikahan
// Focus: Verdubbelingen (reduplication) — verbs (reciprocity/intensity/continuity),
//        nouns (plurality + obligatory diversity, lexicalised forms, sound shift,
//        noun + -AN collectives/diminutives), adjectives (intensification + synonymous/
//        antonymous compounds), fixed adverbial reduplications, and ke-...-an colour
//        '-achtig' reduplication.
export const grammarPatterns = [
  {
    pattern_name: 'Verdubbeling — algemene inleiding en de oude "angka dua"',
    description:
      'Verdubbeling (reduplicatie) is een zeer productief woordvormingsproces in het Indonesisch waarbij een basiswoord geheel wordt herhaald, verbonden met een koppelteken (anak-anak). Drie woordsoorten kunnen verdubbeld worden: het werkwoord, het zelfstandig naamwoord en het bijvoeglijk naamwoord. Vroeger werd een verdubbeling geschreven met de "angka dua" — het cijfer 2 achter het woord (anak² = anak-anak); dit is in de officiële spelling niet meer toegestaan. Let op: een verdubbeling betekent NIET automatisch meervoud — de betekenis hangt af van de woordsoort.',
    confusion_group: 'reduplication',
    page_reference: 4,
    slug: 'l22-verdubbeling-inleiding-en-de-angka-dua',
    complexity_score: 3,
    example: 'anak² — anak-anak (oude versus nieuwe spelling)',
  },
  {
    pattern_name: 'Verdubbeling van het werkwoord — wederkerigheid, intensiteit en voortduring',
    description:
      'Vrijwel alle werkwoorden kunnen worden verdubbeld. De verdubbeling drukt drie dingen uit: (1) WEDERKERIGHEID — iets over en weer doen, vaak met half-verdubbeling van de ME-vorm: sewa-menyewa (huren en verhuren), surat-menyurat (corresponderen); (2) INTENSITEIT of nadruk; (3) VOORTDURING van de handeling, of een ongericht/spelend karakter: jalan-jalan (een uitstapje maken, rondwandelen), main-main (spelenderwijs, voor de grap). De verdubbeling geeft het werkwoord dus géén meervoud maar een aspectuele of wederkerige kleuring.',
    confusion_group: 'reduplication',
    page_reference: 4,
    slug: 'l22-verdubbeling-werkwoord-wederkerigheid-intensiteit-voortduring',
    complexity_score: 5,
    example: 'Mari kita jalan-jalan — Kom, laten we een wandelingetje maken',
  },
  {
    pattern_name: 'Verdubbeling van het zelfstandig naamwoord — meervoud mét diversiteit',
    description:
      'Verdubbeling van een zelfstandig naamwoord geeft niet uitsluitend meervoud aan: er is ALTIJD een aspect van diversiteit, verscheidenheid of "allerlei" aanwezig. Vergelijk orang-orang tua (diverse ouderparen) met orang tua-tua (allerlei oude mensen) — de plaats van de verdubbeling verschuift de betekenis. Kota-kota di Indonesia ada yang besar, ada yang kecil = er zijn (allerlei) grote en kleine steden in Indonesië. Gebruik géén verdubbeling als een telwoord (dua, banyak, beberapa) het meervoud al aangeeft.',
    confusion_group: 'reduplication',
    page_reference: 5,
    slug: 'l22-verdubbeling-zelfstandig-naamwoord-meervoud-met-diversiteit',
    complexity_score: 5,
    example: 'Kota-kota di Indonesia ada yang besar, ada yang kecil — Er zijn grote en kleine steden in Indonesië',
  },
  {
    pattern_name: 'Gelexicaliseerde verdubbelingen, speciale betekenissen en klankverschuiving',
    description:
      'Een aantal verdubbelingen is gelexicaliseerd en heeft een eigen betekenis los van een meervoud. (1) Sommige zelfstandige naamwoorden bestaan ALLEEN in verdubbelde vorm: alun-alun (groot plein), labah-labah (spin), kura-kura (schildpad). (2) Bij andere levert de verdubbeling een SPECIALE betekenis op die afwijkt van het basiswoord: langit (hemel) → langit-langit (gehemelte; hemel van een hemelbed), mata (oog) → mata-mata (spion). (3) Soms treedt een KLANKVERSCHUIVING op (dwilingga salin suara): lauk-pauk (allerlei bijgerechten), sayur-mayur (allerlei groenten), teka-teki (kruiswoordraadsel), warna-warni (veelkleurig). Deze vormen moet je als vaste woorden leren.',
    confusion_group: 'reduplication',
    page_reference: 5,
    slug: 'l22-gelexicaliseerde-verdubbelingen-en-klankverschuiving',
    complexity_score: 6,
    example: 'mata → mata-mata — oog → spion (speciale betekenis)',
  },
  {
    pattern_name: 'Verdubbeling van het zelfstandig naamwoord plus -AN — collectief of "lijkend op"',
    description:
      'Een zelfstandig naamwoord kan verdubbeld worden mét het achtervoegsel -AN, met twee betekenissen. (a) COLLECTIEF / algemene verzameling, een trede abstracter dan de gewone verdubbeling: daun (blad) → daun-daun (bladeren) → daun-daunan (gebladerte); sayur (groente) → sayur-sayur (groenten) → sayur-sayuran (allerlei groentesoorten). (b) Iets dat LIJKT op het origineel — vaak een speelgoed- of namaakvorm: orang (mens) → orang-orangan (vogelverschrikker), pesawat (vliegtuig) → pesawat-pesawatan (speelgoedvliegtuigje), robot → robot-robotan (speelgoedrobotje).',
    confusion_group: 'reduplication',
    page_reference: 5,
    slug: 'l22-verdubbeling-zelfstandig-naamwoord-plus-an',
    complexity_score: 6,
    example: 'orang → orang-orangan — mens → vogelverschrikker (lijkt op)',
  },
  {
    pattern_name: 'Verdubbeling van het bijvoeglijk naamwoord — versterking en samenstellingen',
    description:
      'Een verdubbeling van het bijvoeglijk naamwoord duidt, net als bij het werkwoord, op VERSTERKING of intensivering: anak kecil-kecil (een heel klein kind), buah masam-masam (zeer zure vruchten), kertas tipis-tipis (heel dun papier). Bij deze vormen worden over het algemeen niet ook nog sekali of amat toegevoegd (in spreektaal kan dat soms wél: Anak itu benar kurus-kurus sekali = dat kind is echt broodmager). Daarnaast zijn er SAMENGESTELDE vormen: (1) twee bijvoeglijke naamwoorden met dezelfde betekenis — kecil-kurus (klein en mager), murah-meriah (goedkoop en gezellig), pintar-cerdas (intelligent), tinggi-besar (groot); (2) twee TEGENGESTELDE bijvoeglijke naamwoorden die een abstracte eigenschap benoemen — besar-kecil (de grootte/omvang), panjang-pendek (de lengte).',
    confusion_group: 'reduplication',
    page_reference: 6,
    slug: 'l22-verdubbeling-bijvoeglijk-naamwoord-versterking-en-samenstellingen',
    complexity_score: 6,
    example: 'kertas tipis-tipis — heel dun papier (versterking)',
  },
  {
    pattern_name: 'Vaste verdubbelingen met de functie van bijwoord',
    description:
      "Enkele verdubbelingen treden in het Indonesisch op als vast bijwoord en moeten als geheel geleerd worden: hati-hati (voorzichtig), kira-kira (ongeveer), mula-mula (aanvankelijk, eerst), pelan-pelan (langzaam aan, kalm aan), tiba-tiba (plotseling). Ze veranderen niet van vorm en drukken een wijze of mate uit.",
    confusion_group: 'reduplication',
    page_reference: 6,
    slug: 'l22-vaste-verdubbelingen-met-functie-van-bijwoord',
    complexity_score: 4,
    example: "Tiba-tiba adik Tuti masuk — Plotseling kwam Tuti's zusje binnen",
  },
  {
    pattern_name: 'Kleurnuances — muda/tua, vruchtvergelijkingen en de ke-...-an "-achtig" verdubbeling',
    description:
      'Het Indonesisch geeft kleurnuances op drie manieren aan. (1) De TINT met muda (licht) of tua (donker): hijau muda (lichtgroen), hijau tua (donkergroen). (2) Een specifieke kleur door VERWIJZING naar een vrucht, groente of ding: biru laut (zeeblauw), coklat sawo (sawo-bruin), merah jambu (jambu-roze), warna terong (auberginepaars). (3) Een benaderende kleur ("-achtig", agak) met de ke-...-an verdubbeling: biru → kebiru-biruan (blauwachtig), hitam → kehitam-hitaman (zwartachtig), emas → keemas-emasan (goudachtig). Deze laatste vorm combineert verdubbeling van het basiswoord met het omhulsel ke-...-an en is de Indonesische tegenhanger van het Engelse -ish / Nederlandse -achtig.',
    confusion_group: 'reduplication',
    page_reference: 7,
    slug: 'l22-kleurnuances-muda-tua-vruchten-en-ke-an-achtig-verdubbeling',
    complexity_score: 6,
    example: 'Langit kebiru-biruan — Een blauwachtige lucht',
  },
]
