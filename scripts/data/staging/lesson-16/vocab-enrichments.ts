export const vocabEnrichments = [
  // ── Nouns ──────────────────────────────────────────────────────────────
  {
    // anjing — hond
    learning_item_slug: 'anjing',
    recognition_distractors_nl: ['kat', 'vogel', 'vis'],
    cued_recall_distractors_id: ['kucing', 'burung', 'ikan'],
    cloze_distractors_id: ['kucing', 'burung', 'ikan'],
  },
  {
    // daging — vlees
    learning_item_slug: 'daging',
    recognition_distractors_nl: ['gekookte rijst', 'brood', 'vis'],
    cued_recall_distractors_id: ['dapur', 'nasi', 'ikan'],
    cloze_distractors_id: ['nasi', 'roti', 'ikan'],
  },
  {
    // dapur — keuken
    learning_item_slug: 'dapur',
    recognition_distractors_nl: ['deur', 'stoel', 'mand'],
    cued_recall_distractors_id: ['daging', 'pintu', 'kursi'],
    cloze_distractors_id: ['pintu', 'kursi', 'keranjang'],
  },
  {
    // Dik (Adik) — aanspreektitel voor jongeman / jonge vrouw
    learning_item_slug: 'dik',
    recognition_distractors_nl: ['meneer / vader', 'mevrouw / moeder', 'oom'],
    cued_recall_distractors_id: ['bapak', 'ibu', 'paman'],
    cloze_distractors_id: ['bapak', 'ibu', 'paman'],
  },
  {
    // ekspor — export
    learning_item_slug: 'ekspor',
    recognition_distractors_nl: ['kwaliteit', 'filatelie', 'kilo'],
    cued_recall_distractors_id: ['impor', 'kualitas', 'filateli'],
    cloze_distractors_id: ['kualitas', 'filateli', 'kilo'],
  },
  {
    // filateli — filatelie
    learning_item_slug: 'filateli',
    recognition_distractors_nl: ['kwaliteit', 'export', 'loket'],
    cued_recall_distractors_id: ['filsafat', 'kualitas', 'ekspor'],
    cloze_distractors_id: ['kualitas', 'ekspor', 'loket'],
  },
  {
    // kartu pos — ansichtkaart
    learning_item_slug: 'kartu pos',
    recognition_distractors_nl: ['brief', 'expresse brief', 'postzegel'],
    cued_recall_distractors_id: ['surat', 'surat kilat', 'pos udara'],
    cloze_distractors_id: ['surat', 'surat kilat', 'pos udara'],
  },
  {
    // keranjang — mand
    learning_item_slug: 'keranjang',
    recognition_distractors_nl: ['stoel', 'keuken', 'doos'],
    cued_recall_distractors_id: ['kursi', 'kerang', 'dapur'],
    cloze_distractors_id: ['kursi', 'dapur', 'pintu'],
  },
  {
    // kilat — bliksemschicht
    learning_item_slug: 'kilat',
    recognition_distractors_nl: ['kilo (gewicht)', 'kwaliteit', 'export'],
    cued_recall_distractors_id: ['kilo', 'kualitas', 'lekat'],
    cloze_distractors_id: ['kilo', 'kualitas', 'ekspor'],
  },
  {
    // kilo — kilo (gewicht) / kilometer
    learning_item_slug: 'kilo',
    recognition_distractors_nl: ['bliksemschicht', 'kwaliteit', 'export'],
    cued_recall_distractors_id: ['kilat', 'kualitas', 'ekspor'],
    cloze_distractors_id: ['kilat', 'kualitas', 'ekspor'],
  },
  {
    // kualitas — kwaliteit
    learning_item_slug: 'kualitas',
    recognition_distractors_nl: ['export', 'filatelie', 'kilo (gewicht)'],
    cued_recall_distractors_id: ['kuantitas', 'ekspor', 'kilo'],
    cloze_distractors_id: ['ekspor', 'filateli', 'kilo'],
  },
  {
    // lem (lèm) — lijm
    learning_item_slug: 'lem',
    recognition_distractors_nl: ['postzegel', 'teken', 'mand'],
    cued_recall_distractors_id: ['lekat', 'tanda', 'surat'],
    cloze_distractors_id: ['tanda', 'surat', 'keranjang'],
  },
  {
    // loket (lokèt) — loket
    learning_item_slug: 'loket',
    recognition_distractors_nl: ['mand', 'keuken', 'deur'],
    cued_recall_distractors_id: ['lekat', 'keranjang', 'dapur'],
    cloze_distractors_id: ['keranjang', 'dapur', 'pintu'],
  },
  {
    // pos laut — zeepost
    learning_item_slug: 'pos laut',
    recognition_distractors_nl: ['luchtpost', 'expresse brief', 'ansichtkaart'],
    cued_recall_distractors_id: ['pos udara', 'surat kilat', 'kartu pos'],
    cloze_distractors_id: ['pos udara', 'surat kilat', 'kartu pos'],
  },
  {
    // pos udara — luchtpost
    learning_item_slug: 'pos udara',
    recognition_distractors_nl: ['zeepost', 'expresse brief', 'ansichtkaart'],
    cued_recall_distractors_id: ['pos laut', 'surat kilat', 'kartu pos'],
    cloze_distractors_id: ['pos laut', 'surat kilat', 'kartu pos'],
  },
  {
    // surat — brief
    learning_item_slug: 'surat',
    recognition_distractors_nl: ['ansichtkaart', 'teken', 'lijm'],
    cued_recall_distractors_id: ['kartu pos', 'tanda', 'sepatu'],
    cloze_distractors_id: ['kartu pos', 'tanda', 'lem'],
  },
  {
    // surat kilat — expresse brief
    learning_item_slug: 'surat kilat',
    recognition_distractors_nl: ['luchtpost', 'zeepost', 'ansichtkaart'],
    cued_recall_distractors_id: ['pos udara', 'pos laut', 'kartu pos'],
    cloze_distractors_id: ['pos udara', 'pos laut', 'kartu pos'],
  },
  {
    // surat kilat khusus — extra snelle expresse brief
    learning_item_slug: 'surat kilat khusus',
    recognition_distractors_nl: ['luchtpost', 'zeepost', 'ansichtkaart'],
    cued_recall_distractors_id: ['surat kilat', 'pos udara', 'pos laut'],
    cloze_distractors_id: ['surat kilat', 'pos udara', 'pos laut'],
  },
  {
    // tanda — teken
    learning_item_slug: 'tanda',
    recognition_distractors_nl: ['handtekening', 'brief', 'lijm'],
    cued_recall_distractors_id: ['tanda tangan', 'tangkap', 'surat'],
    cloze_distractors_id: ['tanda tangan', 'surat', 'lem'],
  },
  {
    // tanda tangan — handtekening
    learning_item_slug: 'tanda tangan',
    recognition_distractors_nl: ['teken', 'brief', 'ansichtkaart'],
    cued_recall_distractors_id: ['tanda', 'surat', 'kartu pos'],
    cloze_distractors_id: ['tanda', 'surat', 'kartu pos'],
  },
  {
    // cendol (cèndol) — drankje met kokossap
    learning_item_slug: 'cendol',
    recognition_distractors_nl: ['gekookte rijst', 'banaan', 'brood'],
    cued_recall_distractors_id: ['nasi', 'pisang', 'roti'],
    cloze_distractors_id: ['nasi', 'pisang', 'roti'],
  },

  // ── Verbs ──────────────────────────────────────────────────────────────
  {
    // dibayar — betaald
    learning_item_slug: 'dibayar',
    recognition_distractors_nl: ['gevuld', 'gewogen', 'verkocht'],
    cued_recall_distractors_id: ['diisi', 'ditimbang', 'dibeli'],
    cloze_distractors_id: ['diisi', 'ditimbang', 'dibeli'],
  },
  {
    // diisi — gevuld
    learning_item_slug: 'diisi',
    recognition_distractors_nl: ['betaald', 'gewogen', 'geopend'],
    cued_recall_distractors_id: ['dibayar', 'ditimbang', 'dibuka'],
    cloze_distractors_id: ['dibayar', 'ditimbang', 'dibuka'],
  },
  {
    // ditimbang — gewogen
    learning_item_slug: 'ditimbang',
    recognition_distractors_nl: ['betaald', 'gevuld', 'gestuurd'],
    cued_recall_distractors_id: ['dibayar', 'diisi', 'dikirim'],
    cloze_distractors_id: ['dibayar', 'diisi', 'dikirim'],
  },
  {
    // lekat — kleven / plakken
    learning_item_slug: 'lekat',
    recognition_distractors_nl: ['kiezen', 'lenen', 'vangen'],
    cued_recall_distractors_id: ['pilih', 'kejar', 'pinjam'],
    cloze_distractors_id: ['pilih', 'pinjam', 'tangkap'],
  },
  {
    // makan waktu — tijd kosten
    learning_item_slug: 'makan waktu',
    recognition_distractors_nl: ['verzamelen', 'wegen', 'vangen'],
    cued_recall_distractors_id: ['mengumpulkan', 'timbang', 'tangkap'],
    cloze_distractors_id: ['mengumpulkan', 'timbang', 'tangkap'],
  },
  {
    // mengumpulkan — verzamelen
    learning_item_slug: 'mengumpulkan',
    recognition_distractors_nl: ['kiezen', 'lenen', 'vangen'],
    cued_recall_distractors_id: ['pilih', 'pinjam', 'kejar'],
    cloze_distractors_id: ['pilih', 'pinjam', 'tangkap'],
  },
  {
    // pilih — kiezen
    learning_item_slug: 'pilih',
    recognition_distractors_nl: ['lenen', 'verzamelen', 'wegen'],
    cued_recall_distractors_id: ['pinjam', 'pulih', 'timbang'],
    cloze_distractors_id: ['pinjam', 'mengumpulkan', 'timbang'],
  },
  {
    // pinjam — lenen
    learning_item_slug: 'pinjam',
    recognition_distractors_nl: ['kiezen', 'najagen', 'vangen'],
    cued_recall_distractors_id: ['pilih', 'kejar', 'tangkap'],
    cloze_distractors_id: ['pilih', 'kejar', 'tangkap'],
  },
  {
    // kejar — najagen / achterna zitten
    learning_item_slug: 'kejar',
    recognition_distractors_nl: ['vangen', 'wegen', 'kiezen'],
    cued_recall_distractors_id: ['tangkap', 'pilih', 'timbang'],
    cloze_distractors_id: ['tangkap', 'timbang', 'pilih'],
  },
  {
    // tangkap — vangen
    learning_item_slug: 'tangkap',
    recognition_distractors_nl: ['najagen', 'wegen', 'lenen'],
    cued_recall_distractors_id: ['kejar', 'timbang', 'pinjam'],
    cloze_distractors_id: ['kejar', 'timbang', 'pinjam'],
  },
  {
    // timbang — wegen
    learning_item_slug: 'timbang',
    recognition_distractors_nl: ['vangen', 'najagen', 'kiezen'],
    cued_recall_distractors_id: ['tangkap', 'kejar', 'pilih'],
    cloze_distractors_id: ['tangkap', 'kejar', 'mengumpulkan'],
  },

  // ── Adverbs ────────────────────────────────────────────────────────────
  {
    // baru — pas / zojuist
    learning_item_slug: 'baru',
    recognition_distractors_nl: ['hierheen', 'heel mooi', 'voor / maken'],
    cued_recall_distractors_id: ['ke mari', 'bagus-bagus', 'buat'],
    cloze_distractors_id: ['ke mari', 'bagus-bagus', 'buat'],
  },
  {
    // ke mari — hierheen
    learning_item_slug: 'ke mari',
    recognition_distractors_nl: ['pas / zojuist', 'heel mooi', 'voor / maken'],
    cued_recall_distractors_id: ['baru', 'bagus-bagus', 'buat'],
    cloze_distractors_id: ['baru', 'bagus-bagus', 'buat'],
  },

  // ── Preposition ────────────────────────────────────────────────────────
  {
    // buat — voor / maken
    learning_item_slug: 'buat',
    recognition_distractors_nl: ['hierheen', 'pas / zojuist', 'heel mooi'],
    cued_recall_distractors_id: ['ke mari', 'baru', 'bagus-bagus'],
    cloze_distractors_id: ['ke mari', 'baru', 'bagus-bagus'],
  },

  // ── Adjective ──────────────────────────────────────────────────────────
  {
    // bagus-bagus — heel mooi
    learning_item_slug: 'bagus-bagus',
    recognition_distractors_nl: ['pas / zojuist', 'hierheen', 'voor / maken'],
    cued_recall_distractors_id: ['baru', 'ke mari', 'buat'],
    cloze_distractors_id: ['baru', 'ke mari', 'buat'],
  },
]
