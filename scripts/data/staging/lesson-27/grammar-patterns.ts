// Grammar patterns for Lesson 27 — Sewa Rumah (Bab 11)
// Focus: het circumfix KE-...-AN — abstract zelfstandig naamwoord (Functie A),
//        accidenteel/adversatief werkwoord (Functie B), toevallige excessiviteit
//        (Functie C), de KE-...-AN + verdubbeling "-achtig"-vorm, en het contrast
//        van KE-...-AN met ME- en TER-.
export const grammarPatterns = [
  {
    pattern_name: 'KE-...-AN: abstract zelfstandig naamwoord (Functie A)',
    description:
      'Het circumfix ke-...-an vormt een abstract zelfstandig naamwoord uit een werkwoord, zelfstandig naamwoord of bijvoeglijk naamwoord: datang → kedatangan (de komst), raja → kerajaan (koninkrijk), bersih → kebersihan (hygiëne/netheid). Dit is de meest regelmatige en productieve KE-...-AN-functie; in het Nederlands komt er meestal -heid/-schap/-ing of een infinitief-als-nomen uit (kebaikan = goedheid, kehidupan = het leven).',
    confusion_group: 'ke-an-functions',
    page_reference: 3,
    slug: 'l27-ke-an-abstract-noun',
    complexity_score: 4,
    example: 'Kedatangan Ratu Beatrix ke Indonesia direncanakan pada bulan Agustus 1995 — De komst van koningin Beatrix naar Indonesië was gepland in augustus 1995',
  },
  {
    pattern_name: 'KE-...-AN: accidenteel werkwoord (Functie B)',
    description:
      'Het circumfix ke-...-an vormt een werkwoordsvorm met accidenteel/adversatief karakter: het onderwerp ondergaat iets onbedoeld of wordt ergens door getroffen, zónder controle over die toestand. lihat → kelihatan (zichtbaar), hujan → kehujanan (door regen overvallen), kurang → kekurangan (gebrek hebben aan). Veelgemaakte fout bij Nederlandstaligen: kelihatan actief lezen ("hij ziet") i.p.v. statief/accidenteel ("het is zichtbaar"); de Nederlandse lijdende vorm of "overvallen/getroffen door" is de beste brug.',
    confusion_group: 'ke-an-functions',
    page_reference: 4,
    slug: 'l27-ke-an-accidental-verb',
    complexity_score: 6,
    example: 'Kemarin saya kehujanan di jalan — Gisteren werd ik onderweg door een regenbui overvallen',
  },
  {
    pattern_name: "KE-...-AN: toevallige excessiviteit ('te ...') (Functie C)",
    description:
      'Een combinatie van Functie A en B waarbij ke-...-an op een bijvoeglijk naamwoord de betekenis "te (veel)" krijgt: besar → kebesaran (te groot), mahal → kemahalan (te duur), pedas → kepedasan (te pittig). Contextueel een dubbelganger van Functie A — kebesaran kan "grootte" (abstract nomen) OF "te groot" (excessief) betekenen; alleen de predikaatpositie + een ervaarder (vaak met untuk "voor X") geeft de excessieve lezing. Tegenover de al bekende analytische vorm terlalu besar voegt ke-...-an een nuance van "toevallig/ongewenst te" toe.',
    confusion_group: 'ke-an-functions',
    page_reference: 4,
    slug: 'l27-ke-an-excessive',
    complexity_score: 6,
    example: 'Untuk saudara kemeja ini kebesaran — Voor jou is dit hemd te groot',
  },
  {
    pattern_name: "KE-...-AN + verdubbeld bijvoeglijk naamwoord = '-achtig'",
    description:
      'Ke-...-an om een gereduplikeerd bijvoeglijk naamwoord geeft de betekenis "ergens op lijken" / "-achtig": putih → keputih-putihan (witachtig), hijau → kehijau-hijauan (groenachtig), biru → kebiru-biruan (blauwachtig). Dit is de enige KE-...-AN-vorm die verdubbeling vereist; de "-achtig"-betekenis ("een zweem van, lijkend op") is de duidelijkste Nederlandse brug. Deze vorm is in les 22 al aangeraakt voor kleurnuances en wordt hier in het volledige KE-...-AN-systeem geplaatst.',
    confusion_group: 'ke-an-functions',
    page_reference: 4,
    slug: 'l27-ke-an-reduplicated-resembling',
    complexity_score: 6,
    example: 'Gorden itu berwarna kehijau-hijauan — Dat gordijn is groenachtig (heeft een groene zweem)',
  },
  {
    pattern_name: 'KE-...-AN vergeleken met ME- en TER-',
    description:
      'Dezelfde waarneming kan met ME- (actief: mendengar "ik hoor"), TER- (resultaat/toestand: terdengar "is te horen") of KE-...-AN (waarnemersgericht: kedengaran "is hoorbaar voor mij") worden uitgedrukt. De cursustekst geeft de vuistregel: TER- = "te zien/horen door", KE-...-AN = "zichtbaar/hoorbaar voor". TER- benadrukt het toestands-/resultaatkarakter zonder agens; KE-...-AN benadrukt de waarnemer/ervaarder. Het drievoudige onderscheid valt in het Nederlands grotendeels samen, dus bied de vormen altijd als triade aan.',
    confusion_group: 'ke-an-functions',
    page_reference: 4,
    slug: 'l27-ke-an-vs-ter-me',
    complexity_score: 7,
    example: 'Saya mendengar gamelan / terdengar gamelan / suara gamelan kedengaran — Ik hoor / is te horen / is hoorbaar',
  },
]
