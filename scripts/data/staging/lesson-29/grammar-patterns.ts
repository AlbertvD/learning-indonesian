// Grammar patterns for Lesson 29 — Internet di Indonesia (Bab 13)
// Focus: de MEMPER-/DIPER- intensieve causatief + het PER-...-AN nominaliserend
//        confix (incl. het PER-AN vs PE-AN resultaat/proces-contrast).
export const grammarPatterns = [
  {
    "pattern_name": "MEMPER- / DIPER-: de intensieve causatieve werkwoordsvorm",
    "description": "Het voorvoegsel MEMPER- (bedrijvend) en DIPER- (lijdend) vormen altijd transitieve werkwoorden met een intensievere, vaak iteratieve betekenis dan de neutralere ME-vorm. Toepasbaar op vijf typen basiswoord (werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord, plaats, telwoord). Onderscheidt zich van de pe-/pe-an stof van L20/L25: dit is de verbale, niet-nominale tak.",
    "confusion_group": "memper-derivation",
    "page_reference": 3,
    "slug": "l29-memper-diper-intensieve-causatief",
    "complexity_score": 6,
    "example": "Encik Safiee memperbesar masalah itu — Meneer Safiee blies dat probleem op (maakte het nog groter)"
  },
  {
    "pattern_name": "MEMPER- met en zonder -KAN / -i over vijf woordklassen",
    "description": "MEMPER-/DIPER- combineert met -KAN of -i (memper-...-kan, memper-...-i) of staat kaal, afhankelijk van het basiswoord. Bij werkwoord en zelfstandig naamwoord verschijnt -kan/-i vaak (memperingatkan, memperusahakan); bij een bijvoeglijk naamwoord blijft het meestal weg (memperkecil, memperbesar, memperlancar — niet *memperkecilkan).",
    "confusion_group": "memper-derivation",
    "page_reference": 3,
    "slug": "l29-memper-kan-i-versus-kaal",
    "complexity_score": 6,
    "example": "Pemerintah ingin memperlancar lalu lintas — De overheid wil het verkeer vlotter laten verlopen"
  },
  {
    "pattern_name": "De drieweg-tegenstelling membesar / membesarkan / memperbesar",
    "description": "Bij een bijvoeglijk basiswoord ontstaan drie betekenissen: membesar = uit zichzelf groter worden (intransitief); membesarkan = iets opzettelijk groot maken / het object wórdt groot (causatief -kan); memperbesar = iets dat al groot is nóg verder vergroten (intensieve causatief). Dezelfde reeks bij lancar → melancarkan → memperlancar.",
    "confusion_group": "causatief-membesarkan-memperbesar",
    "page_reference": 4,
    "slug": "l29-membesar-membesarkan-memperbesar",
    "complexity_score": 7,
    "example": "Kami memperbesar gambar itu — Wij vergroten die afbeelding (die al groot was, nog verder)"
  },
  {
    "pattern_name": "Gebiedende wijs met MEMPER- / -kan (gebod en verbod)",
    "description": "In de imperatief valt het voorvoegsel weg en blijft de kale -kan-vorm over: Peringatkan Pak Anwar! (gebod). Het verbod wordt gevormd met jangan vóór dezelfde vorm: Jangan peringatkan Pak Anwar!",
    "confusion_group": "imperatief",
    "page_reference": 4,
    "slug": "l29-gebiedende-wijs-memper-kan",
    "complexity_score": 5,
    "example": "Jangan peringatkan Pak Anwar! — Waarschuw meneer Anwar niet!"
  },
  {
    "pattern_name": "PER-...-AN: het nominaliserende confix",
    "description": "Het omhulsel PER-...-AN maakt van een basiswoord een zelfstandig naamwoord, toepasbaar op vijf woordklassen (ingat→peringatan, toko→pertokoan, baik→perbaikan, dalam→perdalaman, empat→perempatan) en vormt vaak abstracte begrippen en sectoren (perdagangan, perekonomian, perumahan).",
    "confusion_group": "nominalisatie-per-an-versus-pe-an",
    "page_reference": 4,
    "slug": "l29-per-an-nominaliserend-confix",
    "complexity_score": 5,
    "example": "Perekonomian Indonesia tumbuh cepat — De Indonesische economie groeit snel"
  },
  {
    "pattern_name": "PER-...-AN tegenover PE-...-AN: resultaat/instelling versus proces",
    "description": "Bij hetzelfde basiswoord noemt de PE-...-AN-vorm meestal het proces/de handeling en de PER-...-AN-vorm het resultaat of de instelling: pengumpulan (het verzamelen) vs perkumpulan (de vereniging); en de drieslag pengusaha (ondernemer) / pengusahaan (het produceren) / perusahaan (de onderneming). Bouwt voort op de pe-...-an stof van L25, zonder die te herhalen: hier ligt de nadruk op het per-an contrast.",
    "confusion_group": "nominalisatie-per-an-versus-pe-an",
    "page_reference": 5,
    "slug": "l29-per-an-versus-pe-an-resultaat-proces",
    "complexity_score": 6,
    "example": "Pengusaha itu memiliki tiga perusahaan — Die ondernemer bezit drie bedrijven"
  }
]
