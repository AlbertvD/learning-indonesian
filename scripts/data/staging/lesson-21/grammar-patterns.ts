// Grammar patterns for Lesson 21
export const grammarPatterns = [
  {
    pattern_name: 'De werkwoordsvorm met -KAN — hoofdfunctie',
    description:
      'Het achtervoegsel -KAN maakt van een basiswoord een transitieve (overgankelijke) werkwoordsvorm: het werkwoord krijgt een lijdend voorwerp (patiens) dat genoemd moet worden. Is het basiswoord al een transitief werkwoord, dan legt -KAN extra nadruk op de patiens. -KAN voegt twee betekenissen toe die je uit de context afleidt: een CAUSATIEVE lezing ("iets/iemand laten of doen ...", vgl. Nederlands laten/maken: menjatuhkan = laten vallen, mendudukkan = iemand laten zitten) en een BENEFACTIEVE lezing ("iets doen vóór/voor iemand": membelikan = voor iemand kopen). Bij de benefactieve vorm wordt de begunstigde het directe lijdend voorwerp, zonder voorzetsel untuk.',
    confusion_group: 'kan-suffix',
    page_reference: 2,
    slug: 'l21-werkwoordsvorm-met-kan-hoofdfunctie',
    complexity_score: 6,
    example: 'Utun menjatuhkan mata kailnya — Utun laat zijn dobber vallen',
  },
  {
    pattern_name: 'ME-...-KAN naast DI-...-KAN — bedrijvend en lijdend',
    description:
      'Naast elke bedrijvende ME-...-KAN-vorm bestaat een lijdende (passieve) DI-...-KAN-vorm. De ME-vorm zet de actievoerder (agens) centraal (Yono menurunkan koper = Yono haalt de koffer naar beneden); de DI-vorm zet de zaak die de handeling ondergaat (patiens) vooraan en centraal (Koper diturunkan Yono = de koffer wordt door Yono naar beneden gehaald). De stam blijft hetzelfde, alleen het voorvoegsel wisselt van meN- naar di-; het achtervoegsel -kan blijft staan.',
    confusion_group: 'me-di-voice',
    page_reference: 2,
    slug: 'l21-me-kan-naast-di-kan',
    complexity_score: 6,
    example: 'Koper diturunkan Yono dari lemari — De koffer is door Yono van de kast gehaald',
  },
  {
    pattern_name: 'Zes woordklassen als basiswoord voor -KAN',
    description:
      'Het achtervoegsel -KAN kan op zes soorten basiswoorden worden gezet: (1a) een transitief werkwoord (beli → membelikan, iets kopen voor iemand), (1b) een intransitief werkwoord (duduk → mendudukkan, iemand laten zitten), (2) een zelfstandig naamwoord (tempat → menempatkan, iets neerzetten), (3) een bijvoeglijk naamwoord (bersih → membersihkan, iets schoonmaken), (4) een telwoord (zeldzaam: dua → menduakan, iets verdubbelen), (5) een persoonlijk voornaamwoord (zeldzaam: aku → mengakukan, laten erkennen) en (6) een woord van plaats (zeldzaam: ke muka → mengemukakan, naar voren brengen). De eerste vier zijn de gangbare gevallen.',
    confusion_group: 'kan-suffix',
    page_reference: 2,
    slug: 'l21-zes-woordklassen-als-basiswoord-voor-kan',
    complexity_score: 5,
    example: 'tempat → menempatkan — plaats → iets neerzetten',
  },
  {
    pattern_name: 'Benefactief -KAN bij een transitief werkwoord (1a)',
    description:
      'Bij een transitief basiswoord geeft -KAN een BENEFACTIEVE lezing: de handeling gebeurt vóór/ten behoeve van iemand. Vergelijk: Ibu membeli buku untuk anaknya (moeder koopt een boek voor haar kind, met voorzetsel untuk) tegenover Ibu membelikan anaknya buku (moeder koopt voor haar kind een boek). In de -KAN-vorm vervalt untuk en wordt de begunstigde (anaknya) het directe lijdend voorwerp, gevolgd door de zaak. In de lijdende vorm kan de begunstigde vooraan komen: Anaknya dibelikan ibu buku.',
    confusion_group: 'kan-suffix',
    page_reference: 3,
    slug: 'l21-benefactief-kan-bij-transitief-werkwoord',
    complexity_score: 7,
    example: 'Ibu membelikan anaknya buku — Moeder koopt voor haar kind een boek',
  },
  {
    pattern_name: 'Causatief -KAN bij intransitief werkwoord, naamwoord en bijvoeglijk naamwoord (1b, 2, 3)',
    description:
      'Bij een intransitief werkwoord, een zelfstandig naamwoord of een bijvoeglijk naamwoord geeft -KAN een CAUSATIEVE lezing: "maken/laten dat ...". Intransitief werkwoord: naik (omhoog gaan) → menaikkan (iets omhoog laten gaan, hijsen) — Dia menaikkan bendera (hij hijst de vlag). Zelfstandig naamwoord: uang (geld) → menguangkan (te gelde maken, verzilveren) — Hasan menguangkan ceknya. Bijvoeglijk naamwoord: bersih (schoon) → membersihkan (schoonmaken, schoon maken) — Pak sopir membersihkan mobil. Telkens maakt de causatieve -KAN-vorm het werkwoord transitief, met een DI-tegenhanger (Bendera dinaikkannya, Mobil dibersihkan Pak sopir).',
    confusion_group: 'kan-suffix',
    page_reference: 3,
    slug: 'l21-causatief-kan-bij-intransitief-naamwoord-bijvoeglijk',
    complexity_score: 7,
    example: 'Pak sopir membersihkan mobil — De chauffeur maakt de auto schoon',
  },
  {
    pattern_name: 'Gebiedende wijs met -KAN',
    description:
      'In de gebiedende wijs (imperatief) markeert -KAN het verschil tussen "iets doen" en "iets (voor iemand / iets) doen". Vergelijk beli! (koop het!) met belikan! (koop het voor mij!), en turun! (stap uit! — intransitief) met turunkan! (laat het zakken! — causatief transitief). Een verbod vorm je met jangan: Jangan turunkan! (laat het niet zakken!).',
    confusion_group: 'kan-suffix',
    page_reference: 4,
    slug: 'l21-gebiedende-wijs-met-kan',
    complexity_score: 4,
    example: 'Jangan turunkan! — Laat het niet zakken!',
  },
  {
    pattern_name: 'Passieve zinsconstructie met -KAN per persoon',
    description:
      'De passieve (lijdende) zin met een -KAN-vorm hangt af van de persoon van de agens. Bij de 1e en 2e persoon staat de patiens vooraan, gevolgd door het persoonlijk voornaamwoord en de kale stam-met-kan zonder di-: Koper saya turunkan (1e ev.), Koper kamu turunkan (2e ev.), Koper kita/kami turunkan, Koper kalian turunkan. Bij de 3e persoon gebruik je de di-...-kan-vorm met -nya (Koper diturunkannya) of de patiens + mereka + kale stam-met-kan (Koper mereka turunkan). Vergelijk met de bedrijvende grondvorm Saya/Kamu/Dia menurunkan koper (zie ook Les 2).',
    confusion_group: 'me-di-voice',
    page_reference: 4,
    slug: 'l21-passieve-zinsconstructie-met-kan-per-persoon',
    complexity_score: 8,
    example: 'Koper saya turunkan — De koffer haal ik naar beneden',
  },
]
