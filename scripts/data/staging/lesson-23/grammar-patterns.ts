// Grammar patterns for Lesson 23 — Berdisko di Jakarta
// Focus: het werkwoordelijke achtervoegsel -I (locatief/directioneel transitief +
//        iteratief/intensief aspect), de zes basiswoordklassen, meN-...-i / di-...-i
//        voice, de imperatief en de passieve persoonsparadigma — telkens in contrast
//        met het -KAN van les 21.
export const grammarPatterns = [
  {
    pattern_name: 'De werkwoordsvorm met -I — hoofdfunctie',
    description:
      'Het achtervoegsel -I maakt van een basiswoord een transitieve (overgankelijke) werkwoordsvorm. Het kenmerkende betekenisaspect is LOCATIEF-DIRECTIONEEL: de handeling wordt gericht op een vast punt — een persoon, plaats, voorwerp of zaak — dat het directe lijdend voorwerp (patiens) wordt, vaak zónder voorzetsel. Vergelijk Petani menanami sawahnya dengan bibit (de boer beplant zijn sawah met zaaigoed): het object "sawah" is de plek waar de handeling op neerkomt, terwijl het materiaal (bibit) met dengan wordt aangeduid. Belangrijk contrast met het -KAN van Les 21: -KAN duwt iets WEG van de actievoerder of brengt iets tot stand (causatief: menjatuhkan = laten vallen; benefactief: membelikan = voor iemand kopen), terwijl -I de handeling juist NAAR een doelpunt richt en dat punt als oppervlak/bestemming behandelt (menanami = iets beplanten, menyeberangi = iets oversteken, mendekati = iets benaderen). N.B. Eindigt het basiswoord al op -i (beli, cari, beri), dan kan er geen -i meer worden toegevoegd.',
    confusion_group: 'i-suffix',
    page_reference: 3,
    slug: 'l23-werkwoordsvorm-met-i-hoofdfunctie',
    complexity_score: 6,
    example: 'Petani menanami sawahnya dengan bibit — De boer beplant zijn sawah met zaaigoed',
  },
  {
    pattern_name: 'Iteratief/intensief aspect bij -I op een transitief basiswoord',
    description:
      'Wordt -I gecombineerd met een van oorsprong al transitief werkwoord, dan komt er een extra betekenisaspect bij: de handeling van het basiswerkwoord wordt HERHAALDELIJK of INTENSIEF uitgevoerd. Het klassieke voorbeeld is pukul (slaan) → memukuli (herhaaldelijk slaan): Orang ini memukuli anjing = deze man sloeg de hond herhaaldelijk. Het basiswerkwoord op zichzelf duidt één keer slaan aan; de -I-vorm maakt er een reeks van. Dit aspect onderscheidt -I van -KAN, dat geen iteratieve lezing toevoegt maar een causatieve of benefactieve.',
    confusion_group: 'i-suffix',
    page_reference: 3,
    slug: 'l23-iteratief-intensief-aspect-bij-i',
    complexity_score: 6,
    example: 'Orang ini memukuli anjing — Deze man sloeg de hond herhaaldelijk',
  },
  {
    pattern_name: 'Zes woordklassen als basiswoord voor -I',
    description:
      'Net als -KAN (Les 21) kan -I op zes soorten basiswoorden worden gezet: (1a) een transitief werkwoord (tanam → menanami, iets beplanten), (1b) een intransitief werkwoord (duduk → menduduki, iets bezetten — letterlijk "ergens op gaan zitten"), (2) een zelfstandig naamwoord (seberang → menyeberangi, iets oversteken; tanda tangan → menandatangani, iets ondertekenen), (3) een bijvoeglijk naamwoord (dekat → mendekati, iets benaderen; jauh → menjauhi, zich verwijderen van), (4) een telwoord (zeldzaam: dua → menduai, een tweede vrouw nemen), (5) een persoonlijk voornaamwoord (zeldzaam: aku → mengakui, iets erkennen) en (6) een woord van plaats (zeldzaam: atas → mengatasi, iets te boven komen). De eerste drie zijn de gangbare gevallen. Telkens richt -I de handeling op het object als doelpunt/oppervlak, waar -KAN bij dezelfde basiswoorden een causatieve of benefactieve lezing zou geven.',
    confusion_group: 'i-suffix',
    page_reference: 3,
    slug: 'l23-zes-woordklassen-als-basiswoord-voor-i',
    complexity_score: 5,
    example: 'seberang → menyeberangi — overkant → iets oversteken',
  },
  {
    pattern_name: 'ME-...-I naast DI-...-I — bedrijvend en lijdend',
    description:
      'Naast elke bedrijvende meN-...-i-vorm bestaat een lijdende (passieve) di-...-i-vorm. De meN-vorm zet de actievoerder (agens) centraal: Anak-anak menyeberangi jalan (de kinderen steken de weg over), Orang ini memukuli anjing (deze man slaat de hond herhaaldelijk). De di-vorm zet de zaak die de handeling ondergaat (patiens) vooraan en centraal: Jalan diseberangi anak-anak (de weg wordt door de kinderen overgestoken), Anjing dipukuli orang ini (de hond wordt door deze man herhaaldelijk geslagen). De stam blijft hetzelfde; alleen het voorvoegsel wisselt van meN- naar di-, het achtervoegsel -i blijft staan. Dit is precies hetzelfde voice-mechanisme als bij de di-vorm van Les 16 en de di-...-kan-vorm van Les 21, nu toegepast op het -i-achtervoegsel.',
    confusion_group: 'me-di-voice',
    page_reference: 4,
    slug: 'l23-me-i-naast-di-i',
    complexity_score: 6,
    example: 'Jalan diseberangi anak-anak — De weg wordt door de kinderen overgestoken',
  },
  {
    pattern_name: 'Gebiedende wijs met -I',
    description:
      'In de gebiedende wijs (imperatief) gebruik je de kale stam-met-i zonder voorvoegsel: Ikuti contoh itu! (volg dat voorbeeld!), Kunjungi disko itu! (bezoek die discotheek!). Een verbod vorm je met jangan: Jangan kunjungi disko itu! (ga niet naar die discotheek!). Het -i blijft de handeling op een doelpunt richten, ook in de bevelvorm.',
    confusion_group: 'i-suffix',
    page_reference: 5,
    slug: 'l23-gebiedende-wijs-met-i',
    complexity_score: 4,
    example: 'Jangan kunjungi disko itu! — Ga niet naar die discotheek!',
  },
  {
    pattern_name: 'Passieve zinsconstructie met -I per persoon',
    description:
      'De passieve (lijdende) zin met een -I-vorm hangt af van de persoon van de agens — precies parallel aan de -KAN-paradigma van Les 21 en de di-vorm van Les 16/18. Bij de 1e en 2e persoon staat de patiens vooraan, gevolgd door het persoonlijk voornaamwoord en de kale stam-met-i zonder di-: Sawah saya tanami (1e ev.), Sawah kamu tanami (2e ev.), Sawah kita/kami tanami, Sawah kalian tanami. Bij de 3e persoon gebruik je de di-...-i-vorm met -nya (Sawah ditanaminya) of de patiens + mereka + kale stam-met-i (Sawah mereka tanami). Vergelijk met de bedrijvende grondvorm Saya/Kamu/Dia menanami sawah.',
    confusion_group: 'me-di-voice',
    page_reference: 5,
    slug: 'l23-passieve-zinsconstructie-met-i-per-persoon',
    complexity_score: 8,
    example: 'Sawah saya tanami — De sawah beplant ik',
  },
]
