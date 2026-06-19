// Grammar patterns for Lesson 20 — Bab 4: Biar Lambat Asal Selamat (Selamat Datang deel 2)
// Focus: het nominaliserende voorvoegsel PE- (peN-) dat van een basiswoord een
//        handelend persoon of instrument-zelfstandig-naamwoord maakt, met de
//        allomorfen pe-/pem-/pen-/peng-/peny-/penge- (parallel aan ME-),
//        de afwijkende pe-vormen, de overdrijvings-bijbetekenis en de
//        samenstellingen met PE-.
// Slugs van de vorm l20-{title}, geverifieerd uniek tegen:
//   - indonesian.grammar_patterns DB (97 rijen, bevraagd 2026-06-18; geen pe-/peN-/l20- treffer)
//   - staging lesson-1 t/m lesson-19 grammar-patterns.ts
export const grammarPatterns = [
  {
    pattern_name: 'Het voorvoegsel PE-: vorming van een handelend persoon of instrument',
    description:
      'Het voorvoegsel PE- (de peN-familie) maakt van een basiswoord een zelfstandig naamwoord met de betekenis van een handelend persoon of een ding/instrument dat de handeling verricht. Voorbeelden: penjual = seorang yang menjual (verkoper), pembaca = lezer, pembuka = alat untuk membuka (opener). Vaak hoort er een ME-werkwoord bij hetzelfde basiswoord: menjual → penjual, membaca → pembaca. PE- kan worden gecombineerd met een werkwoord (duduk → penduduk = ingezetene), een zelfstandig naamwoord (laut → pelaut = zeeman), een bijvoeglijk naamwoord (malas → pemalas = luilak) en zeldzaam met een telwoord (dua → pendua).',
    confusion_group: 'pe-prefix',
    page_reference: 4,
    slug: 'l20-voorvoegsel-pe-handelend-persoon-instrument',
    complexity_score: 6,
    example: 'Penjual itu ramah — Die verkoper is vriendelijk',
  },
  {
    pattern_name: 'PE- zonder klankverandering en de allomorfen pem-/pen-/peng-',
    description:
      'PE- wordt op dezelfde wijze voorgevoegd als ME-, waarbij de beginklank van het basiswoord bepaalt welke vorm verschijnt. (1) PE- blijft ongewijzigd vóór L, M, N, NY, R, W, Y: lapor → pelapor (rapporteur), nyanyi → penyanyi (zanger), waris → pewaris (erfgenaam). (2) PEM- verschijnt vóór B en F: baca → pembaca (lezer), fitnah → pemfitnah (lasteraar). (3) PEN- verschijnt vóór C, D, J: curi → pencuri (dief), dengar → pendengar (luisteraar), jual → penjual (verkoper). (4) PENG- verschijnt vóór de klinkers A, E, I, O, U en vóór G en H: ajar → pengajar (onderwijzer), ikut → pengikut (volgeling), ganti → pengganti (vervanger), hitung → penghitung (teller).',
    confusion_group: 'pe-prefix',
    page_reference: 5,
    slug: 'l20-pe-allomorfen-pem-pen-peng',
    complexity_score: 7,
    example: 'Pendengar setia radio itu banyak — Die radio heeft veel trouwe luisteraars',
  },
  {
    pattern_name: 'PE- met wegval van de beginklank bij K, P, S, T (peng-/pem-/peny-/pen-)',
    description:
      'Bij basiswoorden die met K, P, S of T beginnen valt die beginklank weg en versmelt met de neusklank van het voorvoegsel — precies zoals bij ME-. K wordt peng- (kemudi → pengemudi = bestuurder), P wordt pem- (pesan → pemesan = opdrachtgever), S wordt peny- (sewa → penyewa = huurder), T wordt pen- (tulis → penulis = schrijver). De oorspronkelijke medeklinker is in het afgeleide woord dus niet meer hoorbaar; let erop dat je het basiswoord herkent ondanks de wegval.',
    confusion_group: 'pe-prefix',
    page_reference: 6,
    slug: 'l20-pe-wegval-beginklank-k-p-s-t',
    complexity_score: 7,
    example: 'Penulis buku itu terkenal — De schrijver van dat boek is beroemd',
  },
  {
    pattern_name: 'PE- met de bijbetekenis van overdrijving en de afwijkende pe-vormen',
    description:
      'Soms drukt PE- uit dat iemand iets in overdreven mate is of doet: pemalas (luilak), pemberani (waaghals), peminum (dronkaard, zuiplap), penangis (huilebalk), pendiam (zwijgzaam persoon), pengopi (koffieleut), penidur (slaapkop), peribut (herrieschopper). Daarnaast worden de algemene plaatsingsregels niet altijd toegepast: bij sommige woorden blijft PE- onveranderd waar je een neusklank zou verwachten — pedagang (handelaar), pejabat (hoge ambtenaar), peserta (deelnemer), petani (landbouwer). Het blijft daarom zaak de spelling in een goed woordenboek te controleren.',
    confusion_group: 'pe-prefix',
    page_reference: 6,
    slug: 'l20-pe-overdrijving-en-afwijkende-vormen',
    complexity_score: 6,
    example: 'Adik saya pemalas — Mijn jongere broertje is een luilak',
  },
  {
    pattern_name: 'Samenstellingen met PE-: het instrument- of agensnaamwoord in een woordgroep',
    description:
      'Een PE-vorm verschijnt vaak als kern van een samenstelling/woordgroep, waarin het de naam van een instrument of beroep aanduidt gevolgd door een bepaling: alat pembuka (opener), wanita pencuci (wasvrouw), pencuci rambut (shampoo), pengharum ruangan (luchtverfrisser), alat penghitung (telmachine), perekam suara (antwoordapparaat / geluidsrecorder), pil penenang (kalmeringspil). Let op het betekenisverschil binnen één basiswoord tussen de PE-vorm (de uitvoerder/het middel) en de -an-vorm (het resultaat): pemilih = seorang yang memilih (de kiezer), pilihan = apa yang dipilih (de keuze, wat gekozen is).',
    confusion_group: 'pe-prefix',
    page_reference: 6,
    slug: 'l20-samenstellingen-met-pe',
    complexity_score: 6,
    example: 'Pengharum ruangan ini wangi sekali — Deze luchtverfrisser ruikt heerlijk',
  },
]
