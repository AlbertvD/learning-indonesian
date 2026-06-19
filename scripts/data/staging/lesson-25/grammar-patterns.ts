// Grammar patterns for Lesson 25 — Bab 9 (Selamat Datang deel 2)
// Focus: het nominaliserende circumfix PE-...-AN (peN-...-an / per-...-an) dat van een
//        basiswoord een zelfstandig naamwoord van proces, handeling, resultaat,
//        abstractie of plaats maakt. Vormingsregels = PE- (Les 20) + -AN (Les 10).
export const grammarPatterns = [
  {
    pattern_name: 'Het circumfix PE-...-AN: van basiswoord naar zelfstandig naamwoord',
    description:
      'Het circumfix PE-...-AN (een voorvoegsel PE- samen met het achtervoegsel -AN) maakt van een basiswoord een zelfstandig naamwoord. De afgeleide vorm benoemt meestal het PROCES of de HANDELING, soms het RESULTAAT, een ABSTRACTIE of een PLAATS. De vorming is niet nieuw: de regels zijn identiek aan die van het voorvoegsel PE- (Les 20) en het achtervoegsel -AN (Les 10) tegelijk toegepast. Zoals we eerder zagen kan op basis van een basiswoord met ME-, ME-KAN en ME-I een werkwoord worden gemaakt; op basis van dat werkwoord maakt PE-...-AN er dan opnieuw een zelfstandig naamwoord van. Voorbeelden: jual → menjual (verkopen) → penjualan (het verkopen / de verkoop), kembang → berkembang (zich ontwikkelen) → perkembangan (de ontwikkeling), didik → mendidik (opvoeden) → pendidikan (het onderwijs, de opvoeding).',
    confusion_group: 'pe-an-circumfix',
    page_reference: 2,
    slug: 'l25-circumfix-pe-an-van-basiswoord-naar-zelfstandig-naamwoord',
    complexity_score: 6,
    example: "Penjualan mobil itu proses menjual mobil — Die autoverkoop is het proces van auto's verkopen",
  },
  {
    pattern_name: 'De PE-...-AN allomorfen: pe-/pem-/pen-/peny-/peng-/penge- (zoals PE- en ME-)',
    description:
      'De beginklank van het basiswoord bepaalt welke vorm het voorvoegsel-deel van PE-...-AN aanneemt — precies dezelfde nasaleringsregels als bij ME- (Les 13) en PE- (Les 20). (1) PE- blijft ongewijzigd vóór L, M, N, NY, R, W, Y en bij de per-...-an varianten: lingkung → lingkungan (omgeving), kembang → perkembangan (ontwikkeling), jalan → perjalanan (reis, traject). (2) PEM- vóór B en F: buka → pembukaan (opening), bayar → pembayaran (betaling). (3) PEN- vóór C, D, J: jual → penjualan (verkoop), daftar → pendaftaran (inschrijving), didik → pendidikan (onderwijs). (4) PENY- vóór S, waarbij de S wegvalt: serah → penyerahan (overdracht). (5) PENG- vóór de klinkers A, E, I, O, U en vóór G en H: kirim → pengiriman (verzending), umum → pengumuman (bekendmaking), hargai → penghargaan (waardering). (6) PENGE- bij eenlettergrepige basiswoorden: bom → pengeboman (bombardement). Net als bij PE- valt bij K, P, S, T de beginklank van het basiswoord weg en versmelt met de neusklank.',
    confusion_group: 'pe-an-circumfix',
    page_reference: 2,
    slug: 'l25-pe-an-allomorfen-pem-pen-peny-peng',
    complexity_score: 7,
    example: 'Besok pengumuman hasil perusahaan akan diumumkan — Morgen wordt de bekendmaking van de bedrijfsresultaten afgekondigd',
  },
  {
    pattern_name: 'PE-...-AN op een werkwoord: het proces of de handeling',
    description:
      'Wordt PE-...-AN op een (ME-)werkwoord gezet, dan benoemt de afgeleide vorm het PROCES of de HANDELING zelf — de Nederlandse "het ...-en"-vorm. menjual (verkopen) → penjualan mobil (het verkopen van auto\'s, de autoverkoop), membuka (openen) → pembukaan pesta (het openen van een feest, de opening), mengirim (sturen) → pengiriman surat (het verzenden van brieven, de verzending). De PE-...-AN vorm beschrijft dus de handeling als zelfstandig naamwoord, in tegenstelling tot de PE-vorm van Les 20 die de UITVOERDER aanduidt (penjual = de verkoper) en de kale -AN-vorm van Les 10 die vaak het RESULTAAT aanduidt.',
    confusion_group: 'pe-an-circumfix',
    page_reference: 2,
    slug: 'l25-pe-an-op-werkwoord-proces-of-handeling',
    complexity_score: 6,
    example: 'Pembukaan pesta merupakan hal yang menyenangkan — De opening van het feest is iets aangenaams',
  },
  {
    pattern_name: 'PE-...-AN op een zelfstandig naamwoord of bijvoeglijk naamwoord: handeling, resultaat, abstractie en plaats',
    description:
      'PE-...-AN kan ook op een zelfstandig naamwoord of een bijvoeglijk naamwoord worden gezet, telkens via het bijbehorende ME-werkwoord, en levert dan naast het proces ook RESULTAAT-, ABSTRACTIE- of PLAATS-betekenissen op. (a) Op een zelfstandig naamwoord: menghargai (waarderen) → penghargaan (de waardering / een onderscheiding), mendaftarkan (registreren) → pendaftaran (de inschrijving), merencanakan (plannen) → perencanaan (de planning); ook plaatsbetekenissen: kebun → perkebunan (plantage), ikan → perikanan (visserij), muka → permukaan (oppervlakte). (b) Op een bijvoeglijk naamwoord: menjelaskan (verklaren) → penjelasan (de uitleg), mendekati (benaderen) → pendekatan (de benadering, de aanpak), mengumumkan (bekendmaken) → pengumuman (de bekendmaking). Pendaftaran mahasiswa baru memulai pada bulan Juni = de inschrijving van nieuwe studenten begint in juni.',
    confusion_group: 'pe-an-circumfix',
    page_reference: 3,
    slug: 'l25-pe-an-op-naamwoord-en-bijvoeglijk-naamwoord-resultaat-abstractie-plaats',
    complexity_score: 6,
    example: 'Penjelasan guru itu kurang jelas — De uitleg van die leraar is niet duidelijk genoeg',
  },
  {
    pattern_name: 'PE-...-AN tegenover de PE-vorm en de kale -AN-vorm: uitvoerder, proces en resultaat onderscheiden',
    description:
      'Eén basiswoord levert via verschillende afleidingen verschillende zelfstandige naamwoorden op, en het loont de moeite ze uit elkaar te houden. De PE-vorm (Les 20) duidt de UITVOERDER of het instrument aan: penjual (verkoper), pemilih (kiezer), pendaftar (degene die zich inschrijft). De PE-...-AN vorm duidt het PROCES/de HANDELING (en soms de plaats) aan: penjualan (de verkoop, het verkopen), pendaftaran (de inschrijving als proces), perkebunan (plantage). De kale -AN vorm (Les 10) duidt vaak het RESULTAAT aan — wat er door de handeling ontstaat: pilihan (de keuze, wat gekozen is), jualan (de koopwaar). Vergelijk binnen één woord: pemilih = de kiezer, pemilihan = de verkiezing (het proces), pilihan = de keuze (het resultaat).',
    confusion_group: 'pe-an-circumfix',
    page_reference: 3,
    slug: 'l25-pe-an-tegenover-pe-vorm-en-kale-an-vorm',
    complexity_score: 7,
    example: 'pemilih / pemilihan / pilihan — de kiezer / de verkiezing / de keuze',
  },
]
