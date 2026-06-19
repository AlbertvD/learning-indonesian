// Grammar patterns for Lesson 18
export const grammarPatterns = [
  {
    pattern_name: 'Passieve zin met de DI-vorm (3e persoon, agens onbenoemd)',
    description:
      'Het Indonesisch gebruikt veel passieve zinnen. Voor de 3e persoon doet men dit met de DI-werkwoordsvorm. Deze vorm laat de spreker zich algemener uitdrukken: de actievoerder (agens) hoeft niet genoemd te worden. De patiens (de zaak die de handeling ondergaat) komt vooraan en centraal te staan.',
    confusion_group: 'me-di-voice',
    page_reference: 2,
    slug: 'l18-passieve-zin-met-de-di-vorm-3e-persoon',
    complexity_score: 5,
    example: 'Sudah dimakan — Die is al opgegeten (door iemand)',
  },
  {
    pattern_name: 'Passieve zin met 1e of 2e persoon als agens: patiens — agens — werkwoord',
    description:
      'Wanneer de agens de 1e of 2e persoon is (saya, kamu, kami, kita, kalian) gebruikt men GEEN di-vorm, maar de volgorde patiens — agens — werkwoordstam. Het persoonlijk voornaamwoord staat dan rechtstreeks vóór de kale werkwoordstam, zonder me- of di-prefix. De korte vormen ku- (saya) en kau- (kamu) worden aan het werkwoord vastgeschreven.',
    confusion_group: 'me-di-voice',
    page_reference: 3,
    slug: 'l18-passieve-zin-met-1e-of-2e-persoon-als-agens',
    complexity_score: 6,
    example: 'Surat itu sudah saya tulis kemarin — Die brief heb ik gisteren al geschreven',
  },
  {
    pattern_name: 'Passieve zin met 3e persoon meervoud: twee mogelijkheden',
    description:
      'Wanneer de agens de 3e persoon meervoud is (mereka = zij), zijn er twee gelijkwaardige mogelijkheden: ofwel de volgorde patiens — mereka — werkwoordstam (net als bij 1e/2e persoon), ofwel de di-vorm met aangehecht -nya. Let op: bij de passieve constructie mag tussen de agens en de werkwoordsvorm geen ander woord staan.',
    confusion_group: 'me-di-voice',
    page_reference: 3,
    slug: 'l18-passieve-zin-met-3e-persoon-meervoud',
    complexity_score: 6,
    example: 'Surat itu sudah mereka tulis kemarin — Die brief hebben zij gisteren al geschreven',
  },
  {
    pattern_name: 'YANG en passieve zinnen',
    description:
      "Het betrekkelijk voornaamwoord 'yang' (die/dat) kan een passieve bijzin inleiden. Wanneer de agens 1e of 2e persoon is, volgt na 'yang' de constructie agens — werkwoordstam (yang saya baca = die door mij gelezen wordt); bij de 3e persoon volgt de di-vorm (yang dibawanya = die door hem meegenomen is). De bijzin functioneert als bepaling bij het zelfstandig naamwoord ervoor.",
    confusion_group: 'yang-functions',
    page_reference: 3,
    slug: 'l18-yang-en-passieve-zinnen',
    complexity_score: 6,
    example: 'Buku yang dibawanya hilang — Het boek dat hij heeft meegenomen, is weg',
  },
  {
    pattern_name: 'Sudah — telah (reeds, al)',
    description:
      "Sudah en telah betekenen beide 'reeds, al'. Sudah hoort meer thuis in de spreektaal, telah meer in officiële en geschreven taal. Als kort antwoord op een vraag gebruikt men alleen sudah, nooit telah (Sudah makan? — Sudah).",
    confusion_group: 'aspect-markers',
    page_reference: 4,
    slug: 'l18-sudah-telah-reeds-al',
    complexity_score: 3,
    example: 'Saya telah makan — Ik heb al gegeten',
  },
  {
    pattern_name: 'Sesudah — setelah (na, nadat)',
    description:
      "Sesudah en setelah betekenen beide 'na, nadat' en leiden een tijdsbepaling of bijzin in. Sesudah wordt vaker gebruikt dan setelah. De combinatie 'setelah sudah' bestaat (nadat … reeds), maar 'sesudah telah' komt niet voor. Niet te verwarren met sudah/telah, die 'al, reeds' betekenen.",
    confusion_group: 'aspect-markers',
    page_reference: 4,
    slug: 'l18-sesudah-setelah-na-nadat',
    complexity_score: 4,
    example: 'Setelah makan dia mencuci piring — Na het eten waste hij de borden af',
  },
  {
    pattern_name: 'Alle, alles, allerlei, elke, geheel en iedereen',
    description:
      "Overzicht van de Indonesische woorden voor totaliteit en distributie. 'Alle/iedereen': semua (semua tamu, semua orang). 'Alle dagen/elke': tiap, setiap. 'Alles': segala(nya), semuanya, segala sesuatu. 'Allerlei': serba (toko serba ada). 'Geheel/het hele': segenap, seluruh, seantero. 'Iedereen, wie dan ook': siapa saja. De keuze hangt af van of men telbare eenheden, een totale hoeveelheid of een geheel bedoelt.",
    confusion_group: 'se-prefix',
    page_reference: 4,
    slug: 'l18-alle-alles-allerlei-elke-geheel-en-iedereen',
    complexity_score: 5,
    example: 'Seluruh isi kota berpesta — De hele stad vierde feest',
  },
]
