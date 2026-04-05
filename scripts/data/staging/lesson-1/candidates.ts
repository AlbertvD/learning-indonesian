// Exercise candidates for Lesson 1 — Di Pasar (Op de markt)
// Grammar focus: basic sentence structure, adjective placement, reduplication, negation
// All grammar exercises require manual approval before seeding

export const candidates = [
  // ============================================================
  // CONTRAST PAIR — adjective-placement: NL vs ID word order
  // ============================================================
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'adjective-after-noun',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: 'Pilih yang benar: "een groot huis"',
      targetMeaning: 'een groot huis',
      options: [
        { id: 'cp1-a', text: 'besar rumah' },
        { id: 'cp1-b', text: 'rumah besar' },
      ],
      correctOptionId: 'cp1-b',
      explanationText: 'In het Indonesisch komt het bijvoeglijk naamwoord NA het zelfstandig naamwoord: "rumah besar" (huis groot). Dit is omgekeerd aan het Nederlands waar we zeggen "groot huis".',
    },
  },
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'adjective-after-noun',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: 'Pilih yang benar: "goedkoop fruit"',
      targetMeaning: 'goedkoop fruit (goedkope vruchten)',
      options: [
        { id: 'cp2-a', text: 'buah murah' },
        { id: 'cp2-b', text: 'murah buah' },
      ],
      correctOptionId: 'cp2-a',
      explanationText: 'Bijvoeglijk naamwoord achter het zelfstandig naamwoord: "buah murah" (vrucht goedkoop). In het Nederlands: "goedkoop fruit" — omgekeerde volgorde.',
    },
  },

  // ============================================================
  // CONTRAST PAIR — belum vs tidak (negation)
  // ============================================================
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'belum-vs-tidak',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: 'De verkoper zegt: "... bisa Bu" (het kan NOG NIET, maar misschien later wel). Wat past?',
      targetMeaning: 'Dat kan nog niet, mevrouw (maar er is een alternatief)',
      options: [
        { id: 'cp3-a', text: 'Belum bisa Bu' },
        { id: 'cp3-b', text: 'Tidak bisa Bu' },
      ],
      correctOptionId: 'cp3-a',
      explanationText: '"Belum" = nog niet (tijdelijk, kan later veranderen). "Tidak" = niet (definitief). De verkoper laat de deur open voor onderhandeling, dus "belum bisa" past hier. Uit de dialoog: de verkoper biedt daarna een alternatief aan.',
    },
  },
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'belum-vs-tidak',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: '"Dat is NIET duur" — welke ontkenning past?',
      targetMeaning: 'Dat is niet duur (definitief oordeel)',
      options: [
        { id: 'cp4-a', text: 'Itu belum mahal' },
        { id: 'cp4-b', text: 'Itu tidak mahal' },
      ],
      correctOptionId: 'cp4-b',
      explanationText: '"Tidak" is de gewone ontkenning voor een definitieve uitspraak: "Itu tidak mahal" = Dat is niet duur. "Belum mahal" zou betekenen "nog niet duur" (maar het wordt het misschien later wel).',
    },
  },

  // ============================================================
  // CONTRAST PAIR — reduplication-plurality
  // ============================================================
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'reduplication-plural',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: '"Meneer koopt twee huizen" — welke vorm is correct?',
      targetMeaning: 'Meneer koopt twee huizen',
      options: [
        { id: 'cp5-a', text: 'Bapak beli dua rumah' },
        { id: 'cp5-b', text: 'Bapak beli dua rumah-rumah' },
      ],
      correctOptionId: 'cp5-a',
      explanationText: 'Als uit de context al blijkt dat het meervoud is (hier: "dua" = twee), wordt het zelfstandig naamwoord NIET verdubbeld. Dus: "dua rumah" en niet "dua rumah-rumah".',
    },
  },

  // ============================================================
  // CONTRAST PAIR — zero-copula
  // ============================================================
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'zero-copula',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      promptText: '"Dat is duur" — hoe zeg je dit in het Indonesisch?',
      targetMeaning: 'Dat is duur',
      options: [
        { id: 'cp6-a', text: 'Itu mahal' },
        { id: 'cp6-b', text: 'Itu adalah mahal' },
      ],
      correctOptionId: 'cp6-a',
      explanationText: 'Het koppelwerkwoord "is/zijn" wordt in het Indonesisch weggelaten. "Itu mahal" = Dat [is] duur. "Adalah" bestaat wel maar wordt niet zo gebruikt bij bijvoeglijke naamwoorden.',
    },
  },

  // ============================================================
  // SENTENCE TRANSFORMATION — adjective placement & serial verbs
  // ============================================================
  {
    exercise_type: 'sentence_transformation',
    grammar_pattern_slug: 'adjective-after-noun',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceSentence: 'Saya beli rumah.',
      transformationInstruction: 'Voeg "groot" (besar) toe aan het huis',
      acceptableAnswers: [
        'Saya beli rumah besar.',
        'Saya beli rumah besar',
      ],
      hintText: 'Het bijvoeglijk naamwoord komt NA het zelfstandig naamwoord',
      explanationText: 'In het Indonesisch staat het bijvoeglijk naamwoord achter het zelfstandig naamwoord: "rumah besar" (huis groot). Uit de les: "Saya mau beli rumah besar" = Ik wil een groot huis kopen.',
    },
  },
  {
    exercise_type: 'sentence_transformation',
    grammar_pattern_slug: 'serial-verb-construction',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceSentence: 'Saya beli buah.',
      transformationInstruction: 'Voeg "willen" (mau) toe',
      acceptableAnswers: [
        'Saya mau beli buah.',
        'Saya mau beli buah',
      ],
      hintText: 'Werkwoorden worden direct na elkaar geplaatst: [subject] [ww1] [ww2] [object]',
      explanationText: 'Seriele werkwoorden staan direct achter elkaar: "mau beli" = willen kopen. Geen tussenvoegsel nodig zoals in het Nederlands ("te kopen"). Vergelijk: "Saya mau beli rumah besar" uit de les.',
    },
  },
  {
    exercise_type: 'sentence_transformation',
    grammar_pattern_slug: 'reduplication-plural',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceSentence: 'Bapak beli buah.',
      transformationInstruction: 'Geef aan dat meneer allerlei soorten fruit koopt (verscheidenheid)',
      acceptableAnswers: [
        'Bapak beli buah-buahan.',
        'Bapak beli buah-buahan',
      ],
      hintText: 'Herhaling van het woord duidt meervoud of verscheidenheid aan',
      explanationText: 'Reduplicatie (herhaling) geeft meervoud of verscheidenheid aan. "Buah-buahan" = allerlei fruit / vruchten. De uitgang -an versterkt het verscheidenheidsaspect. Uit de les: "Bapak beli buah-buahan."',
    },
  },
  {
    exercise_type: 'sentence_transformation',
    grammar_pattern_slug: 'belum-vs-tidak',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceSentence: 'Tidak bisa.',
      transformationInstruction: 'Verander naar "nog niet mogelijk" (er is nog hoop)',
      acceptableAnswers: [
        'Belum bisa.',
        'Belum bisa',
      ],
      hintText: 'Welk woord geeft tijdelijke ontkenning aan?',
      explanationText: '"Belum" vervangt "tidak" wanneer de ontkenning tijdelijk is — het kan later nog veranderen. "Belum bisa" = nog niet mogelijk (maar misschien later wel). Uit de dialoog: "Belum bisa Bu."',
    },
  },

  // ============================================================
  // CONSTRAINED TRANSLATION — translate Dutch to Indonesian
  // ============================================================
  {
    exercise_type: 'constrained_translation',
    grammar_pattern_slug: 'adjective-after-noun',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceLanguageSentence: 'Ik wil een groot huis kopen.',
      requiredTargetPattern: 'adjective-after-noun',
      acceptableAnswers: [
        'Saya mau beli rumah besar.',
        'Saya mau beli rumah besar',
      ],
      disallowedShortcutForms: ['Saya mau beli besar rumah'],
      explanationText: 'Bijvoeglijk naamwoord NA het zelfstandig naamwoord: "rumah besar" (niet "besar rumah"). Seriele werkwoorden: "mau beli" = willen kopen. Volledig: "Saya mau beli rumah besar." Rechtstreeks uit de les.',
    },
  },
  {
    exercise_type: 'constrained_translation',
    grammar_pattern_slug: 'zero-copula',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceLanguageSentence: 'De prijs is goedkoop.',
      requiredTargetPattern: 'zero-copula',
      acceptableAnswers: [
        'Harganya murah.',
        'Harganya murah',
        'Harga murah.',
        'Harga murah',
      ],
      disallowedShortcutForms: null,
      explanationText: 'Geen koppelwerkwoord "is" nodig: "Harganya murah" = De prijs [is] goedkoop. Het achtervoegsel "-nya" op "harga" geeft "de" aan (de prijs). Uit de dialoog: "Harganya murah Bu."',
    },
  },
  {
    exercise_type: 'constrained_translation',
    grammar_pattern_slug: 'serial-verb-construction',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceLanguageSentence: 'Ik ga naar de markt.',
      requiredTargetPattern: 'serial-verb-construction',
      acceptableAnswers: [
        'Saya ke pasar.',
        'Saya ke pasar',
      ],
      disallowedShortcutForms: null,
      explanationText: '"Ke" = naar. Geen werkwoord "gaan" nodig — "Saya ke pasar" is een geldige zin. In het Indonesisch kunnen zinnen ook zonder werkwoord functioneren. Uit de les: "Saya ke pasar."',
    },
  },
  {
    exercise_type: 'constrained_translation',
    grammar_pattern_slug: 'belum-vs-tidak',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceLanguageSentence: 'Dat kan nog niet, mevrouw.',
      requiredTargetPattern: 'belum-vs-tidak',
      acceptableAnswers: [
        'Belum bisa Bu.',
        'Belum bisa, Bu.',
        'Belum bisa Bu',
        'Belum bisa, Bu',
      ],
      disallowedShortcutForms: ['Tidak bisa Bu'],
      explanationText: '"Belum" = nog niet (tijdelijk). "Tidak" zou definitief zijn. De verkoper in de dialoog gebruikt "Belum bisa Bu" omdat hij daarna een alternatief aanbiedt — de deur blijft open.',
    },
  },
  {
    exercise_type: 'constrained_translation',
    grammar_pattern_slug: 'reduplication-plural',
    source_page: 1,
    review_status: 'pending_review' as const,
    requiresManualApproval: true,
    payload: {
      sourceLanguageSentence: 'Meneer koopt allerlei fruit.',
      requiredTargetPattern: 'reduplication-plural',
      acceptableAnswers: [
        'Bapak beli buah-buahan.',
        'Bapak beli buah-buahan',
      ],
      disallowedShortcutForms: ['Bapak beli buah'],
      explanationText: 'Reduplicatie geeft verscheidenheid aan: "buah-buahan" = allerlei fruit. Zonder reduplicatie ("buah") zou het slechts "een vrucht" of "fruit" betekenen, zonder de nadruk op verscheidenheid.',
    },
  },
]
