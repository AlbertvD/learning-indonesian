// Grammar patterns for Lesson 24 — Bab 8: Surat dari Indonesia
// Focus: DE VERHOUDING / HET CONTRAST tussen de werkwoordsachtervoegsels -KAN (Les 21)
//        en -I (Les 23). Niet elk achtervoegsel apart, maar de keuze ertussen:
//        de agens/patiens-geometrie, de minimale paren (zelfde basiswoord + -kan vs + -i
//        = andere betekenis), de focuswisseling bij van oorsprong transitieve werkwoorden,
//        en de lijst basiswoorden die beide vormen toelaten.
export const grammarPatterns = [
  {
    pattern_name: 'De verhouding tussen -KAN en -i — algemeen',
    description:
      'De hoofdfunctie van zowel -KAN (Les 21) als -i (Les 23) is dezelfde: van een basiswoord een transitieve (overgankelijke) werkwoordsvorm maken. De twee achtervoegsels treden in elkaars verlengde op — ze vullen elkaar aan in plaats van elkaar uit te sluiten. Of een bepaald basiswoord met -KAN of met -i wordt gecombineerd, hangt af van drie dingen: de BETEKENIS die je wilt uitdrukken, het GEBRUIK van het woord en de VORM van het betreffende woord. Het is dus geen vrije keuze: veel basiswoorden laten beide toe, maar telkens met een ander resultaat. Deze les leert je niet de twee achtervoegsels opnieuw los van elkaar (dat deden Les 21 en Les 23), maar juist de keuze ertussen.',
    confusion_group: 'kan-vs-i',
    page_reference: 78,
    slug: 'l24-verhouding-tussen-kan-en-i-algemeen',
    complexity_score: 5,
    example: 'duduk → mendudukkan / menduduki — laten zitten / bezetten',
  },
  {
    pattern_name: 'Het betekenisverschil: statische versus dynamische agens',
    description:
      'Het kernverschil tussen -KAN en -i zit in de geometrie tussen agens (partij 1, de actievoerder) en patiens (partij 2, wat de handeling ondergaat). Bij de -KAN-vorm is de AGENS STATISCH ten opzichte van de patiens: de patiens wordt bewogen of tot stand gebracht, weg van of door de actievoerder (causatief/benefactief — "iets/iemand laten ..."). Schema: agens (statisch) ——→ patiens. Bij de -i-vorm is de PATIENS een VAST PUNT (doelpunt, plaats, oppervlak) en beweegt de agens zich of wordt bewogen ten opzichte van dat vaste punt (locatief/directioneel — de handeling is op het doelpunt gericht). Schema: agens (dynamisch) ——→ patiens (vast). Vergelijk meloncatkan bola (de bal laten springen — bal beweegt, agens staat) met meloncati kerbau (op de buffel springen — agens beweegt naar het vaste doelpunt).',
    confusion_group: 'kan-vs-i',
    page_reference: 78,
    slug: 'l24-statische-versus-dynamische-agens',
    complexity_score: 7,
    example: 'Harimau meloncati kerbau — De tijger bespringt de buffel',
  },
  {
    pattern_name: 'Minimale paren: zelfde basiswoord, -KAN versus -i',
    description:
      'Veel basiswoorden laten zowel -KAN als -i toe, en dan verandert het achtervoegsel de betekenis. Dit zijn de minimale paren die het hart van deze les vormen. tinggal (blijven): meninggalkan = achterlaten (patiens weg van agens) tegenover meninggali = nalaten/verlaten (gericht op een doelpunt, bv. iemand iets nalaten). duduk (zitten): mendudukkan = iemand laten zitten (causatief) tegenover menduduki = bezetten (op iets gaan zitten, het doelpunt innemen). gambar (tekening): menggambarkan = afbeelden/uitbeelden (een kat schilderen — tot stand brengen) tegenover menggambari = beschilderen/illustreren (op de muur schilderen — het oppervlak als doelpunt). seberang (overkant): menyeberangkan = iemand overzetten (causatief) tegenover menyeberangi = iets oversteken (de rivier als doelpunt). Telkens geeft -KAN de causatieve/benefactieve lezing (patiens wordt bewogen of gemaakt) en -i de locatieve lezing (de handeling raakt een vast doelpunt).',
    confusion_group: 'kan-vs-i',
    page_reference: 79,
    slug: 'l24-minimale-paren-kan-versus-i',
    complexity_score: 7,
    example: 'mendudukkan ≠ menduduki — laten zitten ≠ bezetten',
  },
  {
    pattern_name: 'Focuswisseling met -i bij van oorsprong transitieve werkwoorden',
    description:
      'Net als -KAN heeft -i bij een van oorsprong al transitief werkwoord nog een eigen functie: het maakt FOCUSWISSELING mogelijk — het verschuiven van het centrale lijdend voorwerp. Vergelijk de drie bedrijvende vormen van kirim (sturen): Ibu mengirim surat (moeder stuurt een brief — kale transitief), Ibu mengirimkan surat kepada Adi (moeder stuurt een brief naar Adi — met -kan en voorzetsel kepada), en Ibu mengirimi Adi surat (moeder stuurt Adi een brief — met -i, waarbij de ONTVANGER Adi het directe lijdend voorwerp wordt, zonder kepada). De -i-vorm zet zo de bestemmeling centraal in plaats van het verstuurde. In de lijdende vorm volgt dezelfde wisseling: Surat dikirim ibu / Surat dikirimkan ibu kepada Adi / Adi dikirimi ibu surat — bij de -i-vorm komt de ontvanger (Adi) vooraan.',
    confusion_group: 'kan-vs-i',
    page_reference: 78,
    slug: 'l24-focuswisseling-met-i-bij-transitieve-werkwoorden',
    complexity_score: 8,
    example: 'Ibu mengirimi Adi surat — Moeder stuurt Adi een brief',
  },
  {
    pattern_name: 'Basiswoorden met beide afleidingen (-i en -kan)',
    description:
      'Een groot aantal basiswoorden uit Selamat Datang 1 en de voorgaande hoofdstukken levert zowel een -i- als een -kan-vorm op, telkens met een eigen betekenis langs dezelfde lijn (i = op een doelpunt gericht; kan = causatief/tot stand brengen). Voorbeelden: akhir (einde) → mengakhiri (iets beëindigen) / mengakhirkan (achteraan zetten); aku (ik) → mengakui (erkennen, toegeven) / mengakukan (doen erkennen); atas (boven) → mengatasi (te boven komen, oplossen) / mengataskan (hoger plaatsen, ophijsen); baca (lezen) → membacai (grondig herhaaldelijk lezen) / membacakan (voorlezen); habis (op) → menghabisi (beëindigen) / menghabiskan (voltooien, opmaken); hidup (leven) → menghidupi (zorgen voor iemand) / menghidupkan (aanzetten, in het leven roepen); ikut (meegaan) → mengikuti (op de voet volgen) / mengikutkan (laten deelnemen); kurang (minder) → mengurangi (verminderen) / mengurangkan (inkorten); lewat (voorbij) → melewati (passeren) / melewatkan (overslaan); pinjam (lenen) → meminjami (lenen aan iemand) / meminjamkan (uitlenen, te leen geven). Leer ze paarsgewijs: het basiswoord plus beide betekenissen.',
    confusion_group: 'kan-vs-i',
    page_reference: 79,
    slug: 'l24-basiswoorden-met-beide-afleidingen-i-en-kan',
    complexity_score: 6,
    example: 'pinjam → meminjami / meminjamkan — lenen aan / uitlenen',
  },
]
