// Grammar patterns for Lesson 12 — Di Stasiun Gambir di Jakarta
// Focus: Indonesian acronyms/abbreviations (akronim vs. singkatan), compass directions
//        (windrichtingen / kiblat), and BER- reduplication (reciprocity, intensity, collectivity)
// Slugs verified unique against:
//   - indonesian.grammar_patterns DB (63 rows — all l1..l10 use the lN- convention)
//   - staging lesson-1 through lesson-11 grammar-patterns.ts files
export const grammarPatterns = [
  {
    pattern_name: 'Acroniemen en afkortingen — akronim en singkatan',
    description:
      "Het Indonesisch vormt zeer productief nieuwe woorden uit (begin)letters of lettergrepen van andere woorden. Twee types: (1) akronim — lettergrepen worden samengevoegd tot een uitspreekbaar woord, bv. PUSKESMAS (PUSat + KESehatan + MASyarakat = gezondheidscentrum), SIKON (SItuasi + KONdisi), JABAR (JAwa + BARat = West-Java), SUMSEL (SUMatera + SELatan = Zuid-Sumatra), NUSTENGTIM (NUSa + TENGgara + TIMur); (2) singkatan — losse beginletters die los gespeld worden, bv. KTP (Kartu Tanda Penduduk = identiteitsbewijs), SIM (Surat Izin Mengemudi = rijbewijs), KB (Keluarga Berencana = gezinsplanning). Voorbeeld: 'Saya tinggal di Jabar' = Ik woon in West-Java.",
    confusion_group: null,
    page_reference: 2,
    slug: 'l12-acroniemen-en-afkortingen',
    complexity_score: 3,
    example: 'Saya tinggal di Jabar — Ik woon in West-Java',
  },
  {
    pattern_name: 'Windrichtingen — de acht kompasrichtingen',
    description:
      "De vier hoofdrichtingen zijn utara (noorden), timur (oosten), selatan (zuiden), barat (westen). De vier tussenrichtingen worden samengesteld: barat laut (noordwest), timur laut (noordoost), tenggara (zuidoosten), barat daya (zuidwest). Let op: een windrichting maakt vaak deel uit van plaatsnamen en acroniemen (Jawa Barat -> Jabar, Sumatera Selatan -> Sumsel, Nusa Tenggara Timur -> Nustengtim). Cultureel: voor moslims is de bidrichting naar Mekka (de kiblat) belangrijk en verschilt die per eiland. Voorbeeld: 'Mekah ada di sebelah barat' = Mekka ligt in het westen.",
    confusion_group: 'direction-words',
    page_reference: 3,
    slug: 'l12-windrichtingen',
    complexity_score: 3,
    example: 'Mekah ada di sebelah barat — Mekka ligt in het westen',
  },
  {
    pattern_name: 'BER- verdubbeling (met of zonder -an) — wederkerigheid, intensiteit, collectiviteit',
    description:
      "Ber- gecombineerd met verdubbeling van het basiswoord (met of zonder -an) drukt drie dingen uit, afhankelijk van de woordklasse: (1) WEDERKERIGHEID (elkaar) bij werkwoorden en plaatswoorden — berpandang-pandangan (elkaar aankijken), berbunuh-bunuhan (elkaar doden), berdepan-depan (tegenover elkaar staan); (2) INTENSITEIT / herhaling bij zelfstandige en bijvoeglijke naamwoorden — berkali-kali (telkens, keer op keer), bertahun-tahun (jarenlang), bergegas-gegas (hals over kop); (3) COLLECTIVITEIT (een x-tal samen) bij telwoorden — berdua-dua (in groepjes van twee), berdua-duaan/berduaan (met z'n tweetjes), berpuluh-puluh (bij tientallen). Voorbeeld: 'Berkali-kali dia jatuh dari sepeda' = Telkens viel hij van de fiets.",
    confusion_group: 'reduplication',
    page_reference: 4,
    slug: 'l12-ber-verdubbeling',
    complexity_score: 6,
    example: 'Berkali-kali dia jatuh dari sepeda — Telkens viel hij van de fiets',
  },
]
