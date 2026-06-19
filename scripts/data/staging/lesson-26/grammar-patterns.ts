// Grammar patterns for Lesson 26 — Bab 10: Musim Hujan (Selamat Datang deel 2)
// Focus: het voorvoegsel TER- in al zijn betekenissen — onopzettelijk/per ongeluk
//        (accidental), resultaat/toestand (resultative-stative), het kunnen/mogelijkheid
//        (abilitative, vaak ontkennend), de overtreffende trap (superlatief) en TER- als
//        bijvoeglijke bepaling + vaste termen.
export const grammarPatterns = [
  {
    pattern_name: 'Het voorvoegsel TER- — vormen en basiswoordklassen',
    description:
      'Het voorvoegsel TER- wordt rechtstreeks aan een basiswoord gehecht en kan in twee posities optreden: (1) in de positie van een handeling (een werkwoordsvorm) en (2) in de positie van een bijvoeglijke bepaling. TER- combineert vooral met een werkwoord (tidur → tertidur = in slaap vallen) en soms met een zelfstandig naamwoord (nama → ternama = een goede naam hebben). Anders dan de ME-vorm (Les 13–15, bedrijvend) en de DI-vorm (Les 16, lijdend met een genoemde of impliciete agens) zet TER- juist de actievoerder volledig op de achtergrond: de nadruk ligt op de toestand, het onbedoelde of het mogelijke, niet op wie de handeling uitvoert. Eén TER-vorm kan, afhankelijk van het basiswoord en de context, vier betekenissen oproepen: onopzettelijk, resultaat/toestand, mogelijkheid, of — bij een bijvoeglijk naamwoord — de overtreffende trap.',
    confusion_group: 'ter-functions',
    page_reference: 4,
    slug: 'l26-voorvoegsel-ter-vormen-en-basiswoordklassen',
    complexity_score: 4,
    example: 'tidur → tertidur — slapen → in slaap vallen',
  },
  {
    pattern_name: "TER- met de betekenis 'onopzettelijk / per ongeluk'",
    description:
      "Eén van de belangrijkste betekenissen van de TER-vorm is het ONOPZETTELIJKE, ongewilde of per ongeluk gebeurde: de handeling overkomt de persoon zonder dat hij of zij die bewust uitvoert. Klassieke voorbeelden: tidur (slapen) → tertidur (in slaap vallen, in slaap sukkelen), jatuh (vallen) → terjatuh (per ongeluk vallen), tawa (lach) → tertawa (in de lach schieten, moeten lachen). Vergelijk 'Sedang menonton tv, Sarti tertidur' (terwijl ze tv keek, viel Sarti in slaap) — Sarti koos er niet voor. Dit is precies het verschil met de bedrijvende ME-vorm, die een bewuste, gerichte handeling uitdrukt (menidurkan = iemand te slapen leggen, een doelgerichte handeling). Veelgemaakte fout door Nederlandstaligen: een ME- of DI-vorm gebruiken waar het Indonesisch het onbedoelde karakter met TER- markeert.",
    confusion_group: 'ter-functions',
    page_reference: 4,
    slug: 'l26-ter-onopzettelijk-per-ongeluk',
    complexity_score: 5,
    example: 'Sedang menonton tv, Sarti tertidur — Terwijl ze tv keek, viel Sarti in slaap',
  },
  {
    pattern_name: 'TER- met de betekenis van resultaat / toestand',
    description:
      "De TER-vorm beschrijft heel vaak een RESULTAAT of een TOESTAND waarin iets verkeert — het gevolg van een eerdere handeling, zonder dat de actievoerder genoemd of belangrijk is. De vorm functioneert dan als een toestandsaanduiding, vergelijkbaar met het Nederlandse voltooid deelwoord als bijvoeglijke bepaling: buka (openen) → terbuka (open(staand), geopend), tutup (sluiten) → tertutup (gesloten, dicht), tulis (schrijven) → tertulis (geschreven, opgeschreven), letak (plaats, leggen) → terletak (gelegen/gesitueerd zijn), larang (verbieden) → terlarang (verboden), bakar (branden) → terbakar (verbrand). Voorbeelden: 'Kota Bandung terletak di Jawa Barat' (Bandung ligt in West-Java), 'Jangan masuk di situ, itu terlarang!' (Ga daar niet naar binnen, dat is verboden!). Het accidentele en het resultatieve liggen dicht bij elkaar: vaak is een toestand ontstaan zonder dat iemand die bewust heeft veroorzaakt.",
    confusion_group: 'ter-functions',
    page_reference: 4,
    slug: 'l26-ter-resultaat-toestand',
    complexity_score: 5,
    example: 'Pintu itu terbuka — Die deur staat open',
  },
  {
    pattern_name: "TER- met de betekenis 'kunnen / in staat zijn om' (vaak ontkennend)",
    description:
      "De TER-vorm kan een MOGELIJKHEID of het KUNNEN uitdrukken: dat iets gedaan, waargenomen of bereikt kán worden, los van wie het doet. Nederlands vertaalt dit vaak met 'te + werkwoord' of 'kunnen': dengar (horen) → terdengar (te horen / hoorbaar), lihat (zien) → terlihat (te zien / zichtbaar), baca (lezen) → terbaca (leesbaar / te lezen). Voorbeelden: 'Suaranya terdengar sampai di sini' (Zijn stem is tot hier te horen), 'Dari sini gunung itu terlihat' (Vanaf hier is de berg te zien). Heel kenmerkend is het ONTKENNENDE gebruik met tidak, dat de ONMOGELIJKHEID uitdrukt: angkat (optillen) → 'tidak terangkat' (niet op te tillen), 'tidak terbaca' (onleesbaar), 'tidak termakan' (oneetbaar). 'Lemari ini berat sekali, tidak terangkat oleh saya' = deze kast is zo zwaar, ik krijg hem niet opgetild. Deze abilitatieve TER- is de Indonesische tegenhanger van het Engelse -able / Nederlandse '-baar' en '(niet) te ...'.",
    confusion_group: 'ter-functions',
    page_reference: 4,
    slug: 'l26-ter-kunnen-mogelijkheid-vaak-ontkennend',
    complexity_score: 6,
    example: 'Lemari ini berat sekali, tidak terangkat — Deze kast is zo zwaar, hij is niet op te tillen',
  },
  {
    pattern_name: 'TER- als overtreffende trap, als bijvoeglijke bepaling en in vaste termen',
    description:
      "Op een BIJVOEGLIJK NAAMWOORD geeft TER- de overtreffende trap (superlatief), als alternatief voor paling (Les 8): besar (groot) → terbesar (grootst), tinggi (hoog) → tertinggi (hoogst/langst), baik (goed) → terbaik (best). 'Ini pelabuhan terbesar' = dit is de grootste haven. Daarnaast treedt TER- op als BIJVOEGLIJKE BEPALING vóór een zelfstandig naamwoord, vaak met een passief-resultatieve kleur: 'Dokter terkenal itu berangkat ke luar negeri' (Die bekende arts vertrekt naar het buitenland), 'Penyanyi pop tercinta mengadakan konser' (De geliefde popster geeft een concert). Tot slot is de TER-vorm in een aantal gevallen een VASTE TERM die je als geheel leert: tergantung dari (afhangen van), termasuk (inclusief, behoren tot), tersebut (genoemd, voornoemd), terdiri dari (bestaan uit). 'Rekening ini sudah termasuk PPN?' (Is de rekening inclusief BTW?), 'Buku ini terdiri dari 14 bab' (Dit boek bestaat uit 14 hoofdstukken).",
    confusion_group: 'overtreffende-trap',
    page_reference: 5,
    slug: 'l26-ter-overtreffende-trap-bijvoeglijke-bepaling-en-vaste-termen',
    complexity_score: 5,
    example: 'Ini pelabuhan terbesar — Dit is de grootste haven',
  },
]
