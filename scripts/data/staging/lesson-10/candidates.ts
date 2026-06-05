// Published via script
// Lesson 10 — Ke Kantor Pos (naar het postkantoor)
// Grammar exercise candidates for the 7 patterns:
//   an-suffix-nominalization, ke-ordinal-numbers, arithmetic-operators,
//   subordinating-conjunctions, direction-route-instructions,
//   bare-imperative-and-invitation, rasa-kira-pikir-mental-verbs
// 15 candidates per pattern (3 cloze_mcq, 3 contrast_pair, 4 sentence_transformation,
//   5 constrained_translation). All vocabulary drawn from the cumulative pool (L1-L10).
export const candidates = [
  // ============================================================
  // PATTERN 1: an-suffix-nominalization
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sentence": "___ di warung itu enak sekali.",
      "translation": "Het eten in dat eethuisje is heel lekker.",
      "options": [
        "Makanan",
        "Makan",
        "Minuman",
        "Pikiran"
      ],
      "correctOptionId": "Makanan",
      "explanationText": "Makanan (makan + -AN) is het zelfstandig naamwoord 'voedsel/het eten' — letterlijk 'apa yang dimakan'. De kale stam makan is het werkwoord 'eten' en kan geen onderwerp van 'enak sekali' zijn. Minuman ('drank') en pikiran ('gedachte') zijn betekeniskundig fout."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Paman minta ___ rokok kretek dari Belanda.",
      "translation": "Oom vraagt om een zending kretek-sigaretten uit Nederland.",
      "options": [
        "kiriman",
        "kirim",
        "kembali",
        "kantor"
      ],
      "correctOptionId": "kiriman",
      "explanationText": "Kiriman (kirim + -AN) betekent 'zending/datgene wat gezonden wordt' — een zelfstandig naamwoord dat object van minta kan zijn. De stam kirim is het werkwoord 'sturen' en past hier niet als zelfstandig naamwoord. Kembali en kantor zijn betekeniskundig fout."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Saya beli ___ dingin di pasar.",
      "translation": "Ik koop een koud drankje op de markt.",
      "options": [
        "minuman",
        "minum",
        "makanan",
        "kiriman"
      ],
      "correctOptionId": "minuman",
      "explanationText": "Minuman (minum + -AN) is het zelfstandig naamwoord 'drank/drankje' — 'apa yang diminum'. De stam minum is het werkwoord 'drinken' en kan geen object van beli zijn dat door dingin wordt bepaald. Makanan ('voedsel') en kiriman ('zending') passen niet bij dingin in deze context."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je wijst op het bord op tafel en wilt zeggen dat het voedsel daar lekker is.",
      "targetMeaning": "makanan - het voedsel (zelfstandig naamwoord)",
      "options": [
        { "id": "makanan", "text": "makanan" },
        { "id": "makan", "text": "makan" }
      ],
      "correctOptionId": "makanan",
      "explanationText": "Als onderwerp van de zin heb je het zelfstandig naamwoord makanan ('voedsel') nodig, gevormd met -AN uit het werkwoord makan ('eten'). De kale stam makan blijft het werkwoord en kan niet als naamwoord het onderwerp zijn."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Op het postkantoor vraagt iemand of er een pakket voor hem is binnengekomen, dus iets wat naar hem toe gestuurd is.",
      "targetMeaning": "kiriman - de zending (zelfstandig naamwoord)",
      "options": [
        { "id": "kiriman", "text": "kiriman" },
        { "id": "kirim", "text": "kirim" }
      ],
      "correctOptionId": "kiriman",
      "explanationText": "Het ding zelf — 'datgene wat gestuurd is' — is kiriman (kirim + -AN), een zelfstandig naamwoord. Kirim alleen is het werkwoord 'sturen' en kan niet 'de zending' als ding aanduiden."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Iemand zegt dat hij iets niet mag doen: hij mag niet te lang blijven malen, hij moet gewoon zijn gedachte volgen.",
      "targetMeaning": "pikiran - de gedachte (zelfstandig naamwoord)",
      "options": [
        { "id": "pikiran", "text": "pikiran" },
        { "id": "pikir", "text": "pikir" }
      ],
      "correctOptionId": "pikiran",
      "explanationText": "'Zijn gedachte' is een ding/begrip: pikiran (pikir + -AN). De stam pikir is het werkwoord 'denken/nadenken'. Het -AN-achtervoegsel maakt van het werkwoord het zelfstandig naamwoord 'gedachte'."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Saya mau minum di warung.",
      "transformationInstruction": "Vorm uit het werkwoord een zelfstandig naamwoord met het achtervoegsel -AN ('een drankje') en maak er het object van: 'Ik wil een drankje in het eethuisje.'",
      "acceptableAnswers": [
        "Saya mau minuman di warung.",
        "Saya mau minuman di warung"
      ],
      "hintText": "minum = drinken",
      "explanationText": "Het werkwoord minum ('drinken') wordt met -AN het zelfstandig naamwoord minuman ('drank/drankje', 'apa yang diminum'). Zo verandert de zin van een handeling ('willen drinken') naar een object ('een drankje willen')."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Dia mau makan sekarang.",
      "transformationInstruction": "Vervang het werkwoord door het bijbehorende zelfstandig naamwoord op -AN ('voedsel') als object: 'Hij wil nu voedsel.'",
      "acceptableAnswers": [
        "Dia mau makanan sekarang.",
        "Dia mau makanan sekarang"
      ],
      "hintText": "makan = eten",
      "explanationText": "Makan ('eten', werkwoord) wordt met -AN makanan ('voedsel', zelfstandig naamwoord). Het achtervoegsel -AN zet de handeling om in het concrete ding dat resultaat/object van de handeling is."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Paman mau kirim rokok ke Belanda.",
      "transformationInstruction": "Maak uit het werkwoord een zelfstandig naamwoord op -AN ('zending') en formuleer: 'Oom wil een zending sigaretten naar Nederland.'",
      "acceptableAnswers": [
        "Paman mau kiriman rokok ke Belanda.",
        "Paman mau kiriman rokok ke Belanda"
      ],
      "hintText": "kirim = sturen",
      "explanationText": "Kirim ('sturen', werkwoord) wordt met -AN kiriman ('zending', het gezondene). Het -AN-achtervoegsel vormt het ding dat het resultaat is van de handeling kirim."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Het eten in dat restaurant is heel lekker.",
      "requiredTargetPattern": "an-suffix-nominalization",
      "acceptableAnswers": [
        "Makanan di restoran itu enak sekali.",
        "Makanan di restoran itu enak sekali"
      ],
      "disallowedShortcutForms": [
        "Makan di restoran itu enak sekali."
      ],
      "explanationText": "'Het eten' als ding is makanan (makan + -AN), niet de kale stam makan (= het werkwoord 'eten'). Het -AN-achtervoegsel maakt van de handeling het zelfstandig naamwoord 'voedsel'."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Oma vraagt om een zending gezouten vis.",
      "requiredTargetPattern": "an-suffix-nominalization",
      "acceptableAnswers": [
        "Nenek minta kiriman ikan asin.",
        "Nenek minta kiriman ikan asin"
      ],
      "disallowedShortcutForms": [
        "Nenek minta kirim ikan asin."
      ],
      "explanationText": "De zending zelf is kiriman (kirim + -AN), het gezondene. Kirim is het werkwoord 'sturen' en kan geen object van minta zijn. Het -AN-achtervoegsel vormt hier het ding."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Ik koop een koud drankje en wat voedsel.",
      "requiredTargetPattern": "an-suffix-nominalization",
      "acceptableAnswers": [
        "Saya beli minuman dingin dan makanan.",
        "Saya beli minuman dingin dan makanan"
      ],
      "disallowedShortcutForms": [
        "Saya beli minum dingin dan makan."
      ],
      "explanationText": "Een 'drankje' is minuman (minum + -AN) en 'voedsel' is makanan (makan + -AN). De kale stammen minum en makan blijven werkwoorden; alleen met -AN worden het de objecten die je kunt kopen."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Volg gewoon je gedachte.",
      "requiredTargetPattern": "an-suffix-nominalization",
      "acceptableAnswers": [
        "Ikuti saja pikiranmu.",
        "Ikuti saja pikiran kamu.",
        "Ikuti saja pikiranmu"
      ],
      "disallowedShortcutForms": [
        "Ikuti saja pikir kamu."
      ],
      "explanationText": "'Gedachte' als ding/begrip is pikiran (pikir + -AN). De stam pikir is het werkwoord 'denken'. Het -AN-achtervoegsel maakt het zelfstandig naamwoord 'gedachte'."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "an-suffix-nominalization",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "De drank op de markt is goedkoop.",
      "requiredTargetPattern": "an-suffix-nominalization",
      "acceptableAnswers": [
        "Minuman di pasar murah.",
        "Minuman di pasar murah"
      ],
      "disallowedShortcutForms": [
        "Minum di pasar murah."
      ],
      "explanationText": "'De drank' is minuman (minum + -AN), het zelfstandig naamwoord dat onderwerp van murah ('goedkoop') kan zijn. De kale stam minum blijft het werkwoord 'drinken'."
    }
  },

  // ============================================================
  // PATTERN 2: ke-ordinal-numbers
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Di jalan ___ belok kiri.",
      "translation": "Sla bij de eerste straat linksaf.",
      "options": [
        "pertama",
        "kesatu",
        "kedua",
        "satu"
      ],
      "correctOptionId": "pertama",
      "explanationText": "'Eerste' is pertama (Sanskriet-leenwoord), NIET kesatu — kesatu bestaat maar wordt vrijwel nooit gebruikt. Kedua betekent 'tweede/beide' en satu is het kardinale telwoord 'één' (nummer als label, geen rangorde)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Kamar ___ belum bersih.",
      "translation": "De tweede kamer is nog niet schoon.",
      "options": [
        "kedua",
        "dua",
        "pertama",
        "ketiga"
      ],
      "correctOptionId": "kedua",
      "explanationText": "Het rangtelwoord 'tweede' is kedua (KE- + dua) en staat achter het naamwoord: kamar kedua. Het kale dua zou 'kamer nummer 2' (een label) betekenen, niet 'de tweede in volgorde'. Pertama is 'eerste' en ketiga 'derde'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Orang itu selalu yang ___ datang ke kantor.",
      "translation": "Die man komt altijd als eerste op kantoor aan.",
      "options": [
        "pertama",
        "kesatu",
        "kedua",
        "satu"
      ],
      "correctOptionId": "pertama",
      "explanationText": "Na yang gebruik je voor 'de eerste' het rangtelwoord pertama, niet kesatu. Kedua betekent 'de tweede/beide' en satu is het kardinale getal 'één'. Onthoud: 'eerste' is altijd pertama."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "promptText": "De gast vraagt waar zijn kamer is. Je wijst hem de kamer die als tweede in de rij ligt.",
      "targetMeaning": "kamar kedua - de tweede kamer (rangorde)",
      "options": [
        { "id": "kamar kedua", "text": "kamar kedua" },
        { "id": "kamar dua", "text": "kamar dua" }
      ],
      "correctOptionId": "kamar kedua",
      "explanationText": "Voor de rangorde ('de tweede in volgorde') gebruik je het rangtelwoord kedua (KE- + dua): kamar kedua. Kamar dua zou 'kamer nummer 2' als label betekenen — een nummerplaatje, geen plaats in de volgorde."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je vertelt over twee kamers in het hotel en zegt dat ze allebei leeg staan.",
      "targetMeaning": "kedua kamar - beide kamers",
      "options": [
        { "id": "kedua kamar itu kosong", "text": "kedua kamar itu kosong" },
        { "id": "kamar kedua itu kosong", "text": "kamar kedua itu kosong" }
      ],
      "correctOptionId": "kedua kamar itu kosong",
      "explanationText": "Kedua vooraan + naamwoord betekent 'beide': kedua kamar = beide kamers. Staat kedua juist achter het naamwoord (kamar kedua), dan betekent het 'de tweede kamer'. De positie bepaalt de betekenis."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je legt uit dat je bij de straat die als eerste komt linksaf moet slaan.",
      "targetMeaning": "jalan pertama - de eerste straat",
      "options": [
        { "id": "jalan pertama", "text": "jalan pertama" },
        { "id": "jalan kesatu", "text": "jalan kesatu" }
      ],
      "correctOptionId": "jalan pertama",
      "explanationText": "'Eerste' is altijd pertama, een Sanskriet-leenwoord. De regelmatig met KE- gevormde variant kesatu bestaat wel, maar wordt in het normale Indonesisch nooit gebruikt. Vanaf 'tweede' geldt KE- (kedua, ketiga); 'eerste' is de uitzondering."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamar dua kosong.",
      "transformationInstruction": "Verander 'kamer nummer twee' in het rangtelwoord 'de tweede kamer' (rangorde), met het juiste voorvoegsel.",
      "acceptableAnswers": [
        "Kamar kedua kosong.",
        "Kamar kedua kosong"
      ],
      "hintText": "kosong = leeg",
      "explanationText": "Het rangtelwoord 'tweede' wordt gevormd met KE- + dua = kedua, en staat achter het naamwoord: kamar kedua ('de tweede kamer'). Het kale dua duidt het nummer als label aan ('kamer 2'), niet de rangorde."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamar tiga belum bersih.",
      "transformationInstruction": "Maak van het nummer een rangtelwoord ('de derde kamer') met het juiste voorvoegsel.",
      "acceptableAnswers": [
        "Kamar ketiga belum bersih.",
        "Kamar ketiga belum bersih"
      ],
      "hintText": "bersih = schoon",
      "explanationText": "'Derde' is ketiga (KE- + tiga), achter het naamwoord: kamar ketiga. Vanaf 'tweede' worden alle rangtelwoorden regelmatig met KE- gevormd; alleen 'eerste' (pertama) is onregelmatig."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Pintu sebelas itu kosong.",
      "transformationInstruction": "Maak van het getal een rangtelwoord ('de elfde deur') met het juiste voorvoegsel.",
      "acceptableAnswers": [
        "Pintu kesebelas itu kosong.",
        "Pintu kesebelas itu kosong"
      ],
      "hintText": "pintu = deur",
      "explanationText": "Ook samengestelde getallen krijgen KE-: kesebelas ('elfde', KE- + sebelas). Het rangtelwoord staat achter het naamwoord: pintu kesebelas."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Sla bij de eerste straat linksaf.",
      "requiredTargetPattern": "ke-ordinal-numbers",
      "acceptableAnswers": [
        "Di jalan pertama belok kiri.",
        "Belok kiri di jalan pertama.",
        "Di jalan pertama belok kiri"
      ],
      "disallowedShortcutForms": [
        "Di jalan kesatu belok kiri.",
        "Di jalan satu belok kiri."
      ],
      "explanationText": "'Eerste' is pertama, niet kesatu (dat bestaat wel maar wordt niet gebruikt) en niet satu (kardinaal 'één'). Het rangtelwoord staat achter het naamwoord jalan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "De tweede kamer is nog niet schoon.",
      "requiredTargetPattern": "ke-ordinal-numbers",
      "acceptableAnswers": [
        "Kamar kedua belum bersih.",
        "Kamar kedua belum bersih"
      ],
      "disallowedShortcutForms": [
        "Kamar dua belum bersih.",
        "Kedua kamar belum bersih."
      ],
      "explanationText": "De rangorde 'de tweede' is kedua, achter het naamwoord: kamar kedua. Kamar dua = 'kamer nummer 2' (label) en kedua kamar = 'beide kamers' — beide veranderen de betekenis."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Beide kamers staan leeg.",
      "requiredTargetPattern": "ke-ordinal-numbers",
      "acceptableAnswers": [
        "Kedua kamar itu kosong.",
        "Kedua kamar kosong.",
        "Kedua kamar itu kosong"
      ],
      "disallowedShortcutForms": [
        "Kamar kedua itu kosong."
      ],
      "explanationText": "'Beide' is kedua vooraan, vóór het naamwoord: kedua kamar. Staat kedua achter het naamwoord (kamar kedua), dan betekent het 'de tweede kamer'. De positie bepaalt de betekenis."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Hij is altijd de laatste.",
      "requiredTargetPattern": "ke-ordinal-numbers",
      "acceptableAnswers": [
        "Dia selalu yang terakhir.",
        "Dia selalu yang terakhir"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'De laatste' is yang terakhir (van akhir = einde). Net als yang pertama ('de eerste') gebruikt het Indonesisch yang + rang-/positiewoord om 'de ...ste' uit te drukken."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ke-ordinal-numbers",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Die student komt altijd als eerste op de universiteit aan.",
      "requiredTargetPattern": "ke-ordinal-numbers",
      "acceptableAnswers": [
        "Mahasiswa itu selalu yang pertama tiba di universitas.",
        "Mahasiswa itu selalu yang pertama datang ke universitas.",
        "Mahasiswa itu selalu yang pertama tiba di universitas"
      ],
      "disallowedShortcutForms": [
        "Mahasiswa itu selalu yang kesatu tiba di universitas."
      ],
      "explanationText": "'Als eerste' is yang pertama, nooit yang kesatu. 'Eerste' is het onregelmatige pertama; alle hogere rangtelwoorden krijgen KE-."
    }
  },

  // ============================================================
  // PATTERN 3: arithmetic-operators
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Delapan ___ dua sama dengan sepuluh.",
      "translation": "Acht plus twee is tien.",
      "options": [
        "tambah",
        "kurang",
        "kali",
        "dibagi"
      ],
      "correctOptionId": "tambah",
      "explanationText": "Tambah betekent in rekencontext 'plus' (optellen): 8 + 2 = 10. Kurang is 'min', kali is 'maal' en dibagi is 'gedeeld door' — die geven andere uitkomsten. De uitkomst wordt ingeleid met sama dengan ('is gelijk aan')."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Sepuluh ___ dua sama dengan lima.",
      "translation": "Tien gedeeld door twee is vijf.",
      "options": [
        "dibagi",
        "kali",
        "tambah",
        "kurang"
      ],
      "correctOptionId": "dibagi",
      "explanationText": "Dibagi ('gedeeld door', de passieve di-vorm van bagi) geeft 10 : 2 = 5. Kali ('maal') zou 20 geven, tambah ('plus') 12 en kurang ('min') 8. Alleen dibagi past bij de uitkomst vijf."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Sepuluh kali dua ___ dua puluh.",
      "translation": "Tien maal twee is gelijk aan twintig.",
      "options": [
        "sama dengan",
        "tambah",
        "kurang",
        "dibagi"
      ],
      "correctOptionId": "sama dengan",
      "explanationText": "De uitkomst van een berekening wordt ingeleid met sama dengan ('is gelijk aan', het =-teken). Tambah, kurang en dibagi zijn rekenoperatoren en kunnen het gelijkteken niet vervangen."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je leest hardop een aftreksom voor: van tien neem je twee weg, dat geeft acht.",
      "targetMeaning": "kurang - min (aftrekken)",
      "options": [
        { "id": "Sepuluh kurang dua sama dengan delapan.", "text": "Sepuluh kurang dua sama dengan delapan." },
        { "id": "Sepuluh tambah dua sama dengan delapan.", "text": "Sepuluh tambah dua sama dengan delapan." }
      ],
      "correctOptionId": "Sepuluh kurang dua sama dengan delapan.",
      "explanationText": "Aftrekken is kurang ('min'): 10 - 2 = 8. Tambah betekent 'plus' (optellen) en zou 12 geven. Let op: kurang betekent buiten de rekencontext 'tekort/minder', maar in een som is het 'min'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je vermenigvuldigt: vijf keer twee komt uit op tien.",
      "targetMeaning": "kali - maal (vermenigvuldigen)",
      "options": [
        { "id": "Lima kali dua sama dengan sepuluh.", "text": "Lima kali dua sama dengan sepuluh." },
        { "id": "Lima tambah dua sama dengan sepuluh.", "text": "Lima tambah dua sama dengan sepuluh." }
      ],
      "correctOptionId": "Lima kali dua sama dengan sepuluh.",
      "explanationText": "Vermenigvuldigen is kali ('maal'): 5 x 2 = 10. Tambah ('plus') zou 5 + 2 = 7 geven, wat niet klopt. Elke bewerking heeft zijn eigen operator."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je noemt de breuk vijf zesde hardop in het Indonesisch.",
      "targetMeaning": "lima perenam - vijf zesde (5/6)",
      "options": [
        { "id": "lima perenam", "text": "lima perenam" },
        { "id": "lima kali enam", "text": "lima kali enam" }
      ],
      "correctOptionId": "lima perenam",
      "explanationText": "Een breuk vormt men met per + de aaneengeschreven noemer: lima perenam = 5/6 (teller 'lima', noemer 'enam'). Lima kali enam is de vermenigvuldiging 5 x 6, een heel andere bewerking."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Delapan tambah dua sama dengan sepuluh.",
      "transformationInstruction": "Schrijf dezelfde som als een aftreksom: tien min twee. Gebruik de juiste rekenoperator en sluit af met het gelijkteken-woord.",
      "acceptableAnswers": [
        "Sepuluh kurang dua sama dengan delapan.",
        "Sepuluh kurang dua sama dengan delapan"
      ],
      "hintText": null,
      "explanationText": "Aftrekken is kurang ('min'): 10 - 2 = 8. De uitkomst wordt steeds ingeleid met sama dengan ('is gelijk aan'). Tambah (optellen) en kurang (aftrekken) zijn elkaars tegenpolen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Lima tambah lima sama dengan sepuluh.",
      "transformationInstruction": "Herschrijf als een vermenigvuldiging die dezelfde uitkomst geeft (vijf maal twee). Gebruik de juiste operator.",
      "acceptableAnswers": [
        "Lima kali dua sama dengan sepuluh.",
        "Lima kali dua sama dengan sepuluh"
      ],
      "hintText": null,
      "explanationText": "Vermenigvuldigen is kali ('maal'): 5 x 2 = 10. Elke bewerking heeft een eigen operator: tambah (+), kurang (-), kali (x), dibagi (:). De uitkomst staat na sama dengan."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Sepuluh kali dua sama dengan dua puluh.",
      "transformationInstruction": "Herschrijf als een deelsom die dezelfde getallen gebruikt (twintig gedeeld door twee). Gebruik de juiste operator.",
      "acceptableAnswers": [
        "Dua puluh dibagi dua sama dengan sepuluh.",
        "Dua puluh dibagi dua sama dengan sepuluh"
      ],
      "hintText": null,
      "explanationText": "Delen is dibagi ('gedeeld door', passieve di-vorm van bagi): 20 : 2 = 10. Vermenigvuldigen (kali) en delen (dibagi) zijn elkaars omgekeerde bewerking."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Acht plus twee is tien.",
      "requiredTargetPattern": "arithmetic-operators",
      "acceptableAnswers": [
        "Delapan tambah dua sama dengan sepuluh.",
        "Delapan tambah dua sama dengan sepuluh"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Optellen is tambah ('plus') en het resultaat wordt ingeleid met sama dengan ('is gelijk aan'): 8 + 2 = 10."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Tien min twee is acht.",
      "requiredTargetPattern": "arithmetic-operators",
      "acceptableAnswers": [
        "Sepuluh kurang dua sama dengan delapan.",
        "Sepuluh kurang dua sama dengan delapan"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Aftrekken is kurang ('min'): 10 - 2 = 8. In rekencontext betekent kurang 'min'; daarbuiten betekent het 'tekort/minder'. De uitkomst volgt na sama dengan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Tien gedeeld door twee is vijf.",
      "requiredTargetPattern": "arithmetic-operators",
      "acceptableAnswers": [
        "Sepuluh dibagi dua sama dengan lima.",
        "Sepuluh dibagi dua sama dengan lima"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Delen is dibagi ('gedeeld door', passieve di-vorm van bagi): 10 : 2 = 5. De uitkomst volgt na sama dengan ('is gelijk aan')."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Vijf maal twee is gelijk aan tien.",
      "requiredTargetPattern": "arithmetic-operators",
      "acceptableAnswers": [
        "Lima kali dua sama dengan sepuluh.",
        "Lima kali dua sama dengan sepuluh"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Vermenigvuldigen is kali ('maal'): 5 x 2 = 10. Het gelijkteken (=) wordt altijd uitgesproken als sama dengan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "arithmetic-operators",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Een half plus een kwart.",
      "requiredTargetPattern": "arithmetic-operators",
      "acceptableAnswers": [
        "Setengah tambah seperempat.",
        "Setengah tambah seperempat"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Optellen is tambah ('plus'). Setengah ('de helft') en seperempat ('een kwart') zijn breuken die de leerling al kent; ze worden net als gewone getallen met tambah opgeteld."
    }
  },

  // ============================================================
  // PATTERN 4: subordinating-conjunctions
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Sebaiknya kamu lewat jembatan penyeberangan ___ lebih aman.",
      "translation": "Je kunt beter via de voetgangersbrug gaan zodat het veiliger is.",
      "options": [
        "supaya",
        "karena",
        "meskipun",
        "sebelum"
      ],
      "correctOptionId": "supaya",
      "explanationText": "Supaya ('opdat/zodat-doel') leidt het doel van de handeling in: je gaat via de brug mét het doel veiliger te zijn. Karena ('omdat') geeft een oorzaak, meskipun ('ofschoon') een toegeving en sebelum ('voordat') een tijd — geen van die past hier."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Jalan itu ramai sekali, ___ kami lewat jembatan.",
      "translation": "Die straat is heel druk, daarom gaan wij via de brug.",
      "options": [
        "karena itu",
        "karena",
        "kalau",
        "supaya"
      ],
      "correctOptionId": "karena itu",
      "explanationText": "Karena itu ('daarom') leidt het gevolg in dat achteraf komt. Karena alleen betekent 'omdat' (oorzaak vooraf) en zou de zin omdraaien. Kalau ('indien') en supaya ('zodat-doel') passen niet bij dit oorzaak-gevolg."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Dia senang belajar di sana ___ kadang-kadang rindu.",
      "translation": "Hij studeert daar graag, ofschoon hij soms heimwee heeft.",
      "options": [
        "meskipun",
        "karena",
        "supaya",
        "sehingga"
      ],
      "correctOptionId": "meskipun",
      "explanationText": "Meskipun ('ofschoon/hoewel') drukt een toegeving uit: iets is waar ondanks iets anders. Karena ('omdat') geeft een oorzaak, supaya ('zodat-doel') een doel en sehingga ('zodat-gevolg') een resultaat — die kloppen logisch niet."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je adviseert iemand de brug te nemen, en je noemt het doel van die keuze: het is dan veiliger.",
      "targetMeaning": "supaya - opdat/zodat (doel)",
      "options": [
        { "id": "supaya", "text": "supaya" },
        { "id": "sehingga", "text": "sehingga" }
      ],
      "correctOptionId": "supaya",
      "explanationText": "Supaya (= agar) leidt een doel in: je kiest de brug mét de bedoeling veiliger te zijn. Sehingga leidt een gevolg/resultaat in ('zodat het zo loopt dat...'). Leerlingen verwarren doel (supaya/agar) en gevolg (sehingga)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je legt de reden uit waarom jullie via de brug gaan: de straat is namelijk heel druk. De reden komt vooraf.",
      "targetMeaning": "karena - omdat (oorzaak vooraf)",
      "options": [
        { "id": "karena", "text": "karena" },
        { "id": "karena itu", "text": "karena itu" }
      ],
      "correctOptionId": "karena",
      "explanationText": "Karena ('omdat') leidt de oorzaak in die vooraf staat: 'Kami lewat jembatan karena jalan itu ramai.' Karena itu betekent 'daarom' en leidt juist het gevolg in dat achteraf komt. Het is hetzelfde grondwoord met een verschillende functie."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je stelt een voorwaarde: pas als iemand van de brug af is, moet hij linksaf slaan.",
      "targetMeaning": "kalau - indien/als (voorwaarde)",
      "options": [
        { "id": "kalau", "text": "kalau" },
        { "id": "meskipun", "text": "meskipun" }
      ],
      "correctOptionId": "kalau",
      "explanationText": "Kalau ('indien/als') leidt een voorwaarde in: het afslaan gebeurt alleen ÁLS de voorwaarde vervuld is. Meskipun ('ofschoon') leidt juist een toegeving in (iets gebeurt ondanks iets anders), wat de betekenis omkeert."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Jalan itu ramai sekali. Kami lewat jembatan.",
      "transformationInstruction": "Verbind de twee zinnen tot één zin met het voegwoord voor 'daarom' (gevolg, achteraf).",
      "acceptableAnswers": [
        "Jalan itu ramai sekali, karena itu kami lewat jembatan.",
        "Jalan itu ramai sekali karena itu kami lewat jembatan.",
        "Jalan itu ramai sekali, sebab itu kami lewat jembatan."
      ],
      "hintText": null,
      "explanationText": "Karena itu (of sebab itu) = 'daarom' en leidt het gevolg in dat na de oorzaak komt. Het onderscheidt zich van karena ('omdat'), dat de oorzaak vooraf zou inleiden."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamu lewat jembatan penyeberangan. Lebih aman.",
      "transformationInstruction": "Verbind de twee zinnen met het voegwoord dat het doel uitdrukt ('opdat/zodat het veiliger is').",
      "acceptableAnswers": [
        "Kamu lewat jembatan penyeberangan supaya lebih aman.",
        "Kamu lewat jembatan penyeberangan agar lebih aman."
      ],
      "hintText": "aman = veilig",
      "explanationText": "Supaya en agar leiden allebei een doel in ('opdat/zodat-doel'): je neemt de brug mét de bedoeling veiliger te zijn. Verwar het niet met sehingga ('zodat-gevolg'), dat een onbedoeld resultaat aanduidt."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Dia senang belajar di sana. Dia kadang-kadang rindu.",
      "transformationInstruction": "Verbind de twee zinnen met het voegwoord voor een toegeving ('ofschoon/hoewel').",
      "acceptableAnswers": [
        "Dia senang belajar di sana meskipun kadang-kadang rindu.",
        "Dia senang belajar di sana walaupun kadang-kadang rindu.",
        "Dia senang belajar di sana meskipun dia kadang-kadang rindu."
      ],
      "hintText": "rindu = heimwee",
      "explanationText": "Meskipun en walaupun ('ofschoon/hoewel') drukken een toegeving uit: iets blijft waar ondanks een tegengestelde omstandigheid. Anders dan karena ('omdat') geven ze geen oorzaak maar een tegenstelling."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Wij gaan via de brug omdat die straat heel druk is.",
      "requiredTargetPattern": "subordinating-conjunctions",
      "acceptableAnswers": [
        "Kami lewat jembatan karena jalan itu ramai sekali.",
        "Kami lewat jembatan sebab jalan itu ramai sekali.",
        "Kami lewat jembatan karena jalan itu ramai sekali"
      ],
      "disallowedShortcutForms": [
        "Kami lewat jembatan karena itu jalan itu ramai sekali."
      ],
      "explanationText": "'Omdat' is karena (of sebab) en leidt de oorzaak in die hier achteraan staat. Karena itu betekent 'daarom' en zou het gevolg inleiden — dat keert de logica om."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Als je van de brug af bent, sla je linksaf.",
      "requiredTargetPattern": "subordinating-conjunctions",
      "acceptableAnswers": [
        "Kalau kamu sudah turun dari jembatan, belok kiri.",
        "Kalau kamu turun dari jembatan, belok kiri.",
        "Kalau kamu sudah turun dari jembatan belok kiri."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Als/indien' is kalau, dat een voorwaarde inleidt: het afslaan gebeurt pas als de voorwaarde (van de brug zijn) vervuld is."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Neem de brug zodat het veiliger is.",
      "requiredTargetPattern": "subordinating-conjunctions",
      "acceptableAnswers": [
        "Lewat jembatan supaya lebih aman.",
        "Lewat jembatan agar lebih aman.",
        "Lewat jembatan saja supaya lebih aman."
      ],
      "disallowedShortcutForms": [
        "Lewat jembatan sehingga lebih aman."
      ],
      "explanationText": "Het Nederlandse 'zodat' dekt hier een doel — gebruik supaya/agar. Sehingga zou 'zodat (gevolg/resultaat)' betekenen, een onbedoeld gevolg, en past niet bij een advies met een bedoeling."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Hij studeert daar graag, ofschoon hij soms heimwee heeft.",
      "requiredTargetPattern": "subordinating-conjunctions",
      "acceptableAnswers": [
        "Dia senang belajar di sana meskipun kadang-kadang rindu.",
        "Dia senang belajar di sana walaupun kadang-kadang rindu.",
        "Dia senang belajar di sana meskipun dia kadang-kadang rindu."
      ],
      "disallowedShortcutForms": [
        "Dia senang belajar di sana karena kadang-kadang rindu."
      ],
      "explanationText": "'Ofschoon' is meskipun/walaupun (toegeving). Karena ('omdat') zou er een oorzaak van maken — dat klopt logisch niet: heimwee is geen reden om er graag te studeren."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "subordinating-conjunctions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Die straat is heel druk, daarom gaan wij te voet.",
      "requiredTargetPattern": "subordinating-conjunctions",
      "acceptableAnswers": [
        "Jalan itu ramai sekali, karena itu kami jalan kaki.",
        "Jalan itu ramai sekali, sebab itu kami jalan kaki.",
        "Jalan itu ramai sekali karena itu kami jalan kaki."
      ],
      "disallowedShortcutForms": [
        "Jalan itu ramai sekali, karena kami jalan kaki."
      ],
      "explanationText": "'Daarom' is karena itu (of sebab itu) en leidt het gevolg in. Karena alleen betekent 'omdat' (oorzaak) en zou de oorzaak-gevolgrelatie omdraaien."
    }
  },

  // ============================================================
  // PATTERN 5: direction-route-instructions
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Di jalan pertama ___ kiri sampai jembatan.",
      "translation": "Sla bij de eerste straat linksaf tot aan de brug.",
      "options": [
        "belok",
        "terus",
        "naik",
        "turun"
      ],
      "correctOptionId": "belok",
      "explanationText": "Belok betekent 'afslaan/van richting veranderen': belok kiri = linksaf. Terus is juist 'rechtdoor blijven gaan', naik is 'instappen/omhoog' en turun is 'uitstappen/afdalen' — die passen niet bij een richtingverandering naar links."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Dari situ ___ kamu jalan kaki sampai ke kantor pos.",
      "translation": "Vanaf daar loop je rechtdoor verder te voet tot aan het postkantoor.",
      "options": [
        "terus",
        "belok",
        "menyeberang",
        "turun"
      ],
      "correctOptionId": "terus",
      "explanationText": "Terus betekent 'rechtdoor/verder gaan' zonder af te slaan. Belok ('afslaan') zou een richtingverandering inhouden, menyeberang is 'oversteken' en turun is 'uitstappen' — alleen terus past bij 'verder lopen'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Sebaiknya kamu ___ jembatan penyeberangan saja, itu lebih aman.",
      "translation": "Je kunt beter gewoon via de voetgangersbrug gaan, dat is veiliger.",
      "options": [
        "lewat",
        "menyeberang",
        "belok",
        "turun"
      ],
      "correctOptionId": "lewat",
      "explanationText": "Lewat betekent 'via/langs' een route of object: lewat jembatan = via de brug. Menyeberang is 'dwars oversteken' (van de ene kant naar de andere), wat hier niet de bedoeling is — je gaat OVER de brug, niet de brug oversteken."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je wijst iemand de weg: bij de eerste straat moet hij niet rechtdoor, maar van richting veranderen naar links.",
      "targetMeaning": "belok kiri - linksaf slaan",
      "options": [
        { "id": "belok kiri", "text": "belok kiri" },
        { "id": "terus", "text": "terus" }
      ],
      "correctOptionId": "belok kiri",
      "explanationText": "Belok kiri = 'linksaf slaan' (van richting veranderen). Terus betekent juist 'rechtdoor blijven gaan', het tegenovergestelde. De twee zijn de kernkeuze in elke routebeschrijving."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je legt uit dat hij de hele lengte van de brug aflegt en zo van de ene kant naar de andere komt.",
      "targetMeaning": "lewat jembatan - via de brug gaan",
      "options": [
        { "id": "lewat jembatan", "text": "lewat jembatan" },
        { "id": "menyeberang jembatan", "text": "menyeberang jembatan" }
      ],
      "correctOptionId": "lewat jembatan",
      "explanationText": "Lewat betekent 'via/over' een route: je gaat over de brug (lewat jembatan). Menyeberang betekent 'dwars oversteken' — dat doe je met een weg of rivier, niet mét de brug zelf. Verwar lewat (via) niet met menyeberang (dwars over)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je zegt dat hij eerst de fietstaxi neemt tot aan de Jalan Antara — hij stapt erin om mee te rijden.",
      "targetMeaning": "naik becak - met de fietstaxi gaan",
      "options": [
        { "id": "naik becak", "text": "naik becak" },
        { "id": "turun becak", "text": "turun becak" }
      ],
      "correctOptionId": "naik becak",
      "explanationText": "Naik betekent 'instappen/met een vervoermiddel gaan': naik becak = met de fietstaxi. Turun is juist 'uitstappen/afdalen' — het tegenovergestelde. Aan het begin van de rit stap je in (naik), aan het eind uit (turun)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Di jalan pertama belok kiri.",
      "transformationInstruction": "Verander de richting van links naar rechts.",
      "acceptableAnswers": [
        "Di jalan pertama belok kanan.",
        "Di jalan pertama belok kanan"
      ],
      "hintText": "kanan = rechts",
      "explanationText": "Belok ('afslaan') wordt gevolgd door de richting: belok kiri (links) of belok kanan (rechts). Het richtingswerkwoord blijft hetzelfde; alleen het richtingswoord kiri/kanan wisselt."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamu naik becak sampai ke pasar.",
      "transformationInstruction": "Verander het vervoer: in plaats van met de fietstaxi gaat de persoon nu te voet.",
      "acceptableAnswers": [
        "Kamu jalan kaki sampai ke pasar.",
        "Kamu jalan kaki sampai ke pasar"
      ],
      "hintText": "jalan kaki = te voet gaan",
      "explanationText": "Naik becak ('met de fietstaxi') wordt jalan kaki ('te voet gaan'). Naik + vervoermiddel betekent 'met dat vervoermiddel gaan'; jalan kaki is de vaste uitdrukking voor lopend reizen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamu menyeberang jalan itu.",
      "transformationInstruction": "Verander de instructie: in plaats van oversteken moet de persoon nu via de voetgangersbrug gaan (route langs/over).",
      "acceptableAnswers": [
        "Kamu lewat jembatan penyeberangan.",
        "Kamu lewat jembatan penyeberangan itu.",
        "Kamu lewat jembatan penyeberangan"
      ],
      "hintText": "jembatan penyeberangan = voetgangersbrug",
      "explanationText": "Menyeberang ('dwars oversteken') wordt lewat ('via/over'): lewat jembatan penyeberangan = via de voetgangersbrug. Lewat duidt de gevolgde route aan; menyeberang het dwars overgaan van een weg."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Sla bij de eerste straat rechtsaf tot aan de brug.",
      "requiredTargetPattern": "direction-route-instructions",
      "acceptableAnswers": [
        "Di jalan pertama belok kanan sampai jembatan.",
        "Di jalan pertama belok kanan sampai ke jembatan.",
        "Belok kanan di jalan pertama sampai jembatan."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Rechtsaf slaan' is belok kanan, en 'tot aan' is sampai. De routebeschrijving ketent richtingswerkwoord (belok), richting (kanan) en eindpunt (sampai jembatan)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Vanaf daar ga je verder te voet tot aan het postkantoor.",
      "requiredTargetPattern": "direction-route-instructions",
      "acceptableAnswers": [
        "Dari situ terus kamu jalan kaki sampai ke kantor pos.",
        "Dari situ kamu terus jalan kaki sampai kantor pos.",
        "Dari situ terus jalan kaki sampai ke kantor pos."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Verder gaan' is terus, 'te voet' is jalan kaki en 'tot aan' is sampai (ke). De zin koppelt het startpunt (dari situ), de voortzetting (terus jalan kaki) en het eindpunt (sampai ke kantor pos)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Je kunt beter via de voetgangersbrug gaan, dat is veiliger.",
      "requiredTargetPattern": "direction-route-instructions",
      "acceptableAnswers": [
        "Sebaiknya kamu lewat jembatan penyeberangan saja, itu lebih aman.",
        "Sebaiknya kamu lewat jembatan penyeberangan, itu lebih aman.",
        "Sebaiknya lewat jembatan penyeberangan saja, itu lebih aman."
      ],
      "disallowedShortcutForms": [
        "Sebaiknya kamu menyeberang jembatan penyeberangan saja, itu lebih aman."
      ],
      "explanationText": "'Via de brug gaan' is lewat jembatan (lewat = via/over een route). Menyeberang ('dwars oversteken') is fout: je gaat OVER de brug, niet de brug zelf overdwars."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Neem eerst de fietstaxi tot aan de Jalan Antara.",
      "requiredTargetPattern": "direction-route-instructions",
      "acceptableAnswers": [
        "Kamu naik becak dulu sampai ke Jalan Antara.",
        "Naik becak dulu sampai ke Jalan Antara.",
        "Kamu naik becak dulu sampai Jalan Antara."
      ],
      "disallowedShortcutForms": [
        "Kamu turun becak dulu sampai ke Jalan Antara."
      ],
      "explanationText": "'Met de fietstaxi gaan' is naik becak (naik = instappen/met vervoer). Turun ('uitstappen') is het tegenovergestelde en zou betekenen dat je uit de becak stapt. 'Eerst' is dulu en 'tot aan' is sampai (ke)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "direction-route-instructions",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Steek de Jalan Kantor Pos over en het gebouw ligt dichtbij.",
      "requiredTargetPattern": "direction-route-instructions",
      "acceptableAnswers": [
        "Menyeberang Jalan Kantor Pos dan gedung itu dekat.",
        "Kamu menyeberang Jalan Kantor Pos dan gedung itu dekat.",
        "Menyeberang Jalan Kantor Pos, gedung itu dekat."
      ],
      "disallowedShortcutForms": [
        "Lewat Jalan Kantor Pos dan gedung itu dekat."
      ],
      "explanationText": "'Oversteken' (dwars over een weg) is menyeberang. Lewat ('via/langs') zou betekenen dat je de straat volgt in plaats van hem over te steken — een ander route-idee. Dekat is 'dichtbij'."
    }
  },

  // ============================================================
  // PATTERN 6: bare-imperative-and-invitation
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sentence": "___ kita kembali sekarang!",
      "translation": "Kom, laten we nu teruggaan!",
      "options": [
        "Mari",
        "Jangan",
        "Duduk",
        "Beli"
      ],
      "correctOptionId": "Mari",
      "explanationText": "Mari (kita) ... = 'laten we ...' — de uitnodiging in de wij-vorm. Jangan vormt een verbod ('doe niet'), terwijl duduk en beli kale imperatieven zijn ('ga zitten', 'koop') die niet samengaan met kita in een uitnodiging."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sentence": "___ naik bus itu, naik becak saja!",
      "translation": "Stap niet in die bus, neem gewoon de fietstaxi!",
      "options": [
        "Jangan",
        "Mari",
        "Ayo",
        "Tidak"
      ],
      "correctOptionId": "Jangan",
      "explanationText": "Een verbod gebruikt jangan + werkwoord: Jangan naik = 'stap niet in / ga niet'. Mari en ayo leiden juist een uitnodiging in ('laten we'), en tidak ontkent een bewering maar vormt geen verbod aan een gebiedende wijs."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sentence": "___ di sini, jangan minum air di situ!",
      "translation": "Ga hier zitten, drink daar geen water!",
      "options": [
        "Duduk",
        "Mari",
        "Jangan",
        "Ayo"
      ],
      "correctOptionId": "Duduk",
      "explanationText": "De kale imperatief plaatst de werkwoordstam zonder onderwerp vooraan: Duduk di sini! = 'Ga hier zitten!'. Mari/ayo zijn uitnodigingen ('laten we') en jangan vormt een verbod — geen van die geeft het directe bevel 'ga zitten'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je stelt je vriend en jezelf voor om samen naar huis te gaan; je nodigt hem uit om mee terug te keren.",
      "targetMeaning": "mari kita pulang - laten we naar huis gaan",
      "options": [
        { "id": "Mari kita pulang!", "text": "Mari kita pulang!" },
        { "id": "Pulang!", "text": "Pulang!" }
      ],
      "correctOptionId": "Mari kita pulang!",
      "explanationText": "Een uitnodiging in de wij-vorm gebruikt mari (kita): Mari kita pulang = 'laten we naar huis gaan'. De kale imperatief Pulang! is een direct bevel aan één persoon ('ga naar huis!') en sluit de spreker niet in."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je waarschuwt iemand: hij mag absoluut niet in die bus stappen.",
      "targetMeaning": "jangan naik - stap niet in (verbod)",
      "options": [
        { "id": "Jangan naik bus itu!", "text": "Jangan naik bus itu!" },
        { "id": "Naik bus itu!", "text": "Naik bus itu!" }
      ],
      "correctOptionId": "Jangan naik bus itu!",
      "explanationText": "Een verbod gebruikt jangan + werkwoord: Jangan naik bus itu! = 'stap niet in die bus!'. De kale imperatief Naik bus itu! is juist het tegenovergestelde — een bevel om wél in te stappen."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je geeft een vriendelijke aansporing om gewoon een auto te kopen; je wilt het bevel verzachten met een partikel.",
      "targetMeaning": "beli saja - koop toch maar",
      "options": [
        { "id": "Beli saja mobil!", "text": "Beli saja mobil!" },
        { "id": "Jangan beli mobil!", "text": "Jangan beli mobil!" }
      ],
      "correctOptionId": "Beli saja mobil!",
      "explanationText": "De kale imperatief beli ('koop') verzacht met het partikel saja tot Beli saja = 'koop toch maar'. Jangan beli betekent juist het tegenovergestelde: 'koop geen auto' — een verbod."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamu duduk di sini.",
      "transformationInstruction": "Maak er een kale gebiedende wijs van (een direct bevel zonder onderwerp).",
      "acceptableAnswers": [
        "Duduk di sini!",
        "Duduk di sini"
      ],
      "hintText": "duduk = zitten",
      "explanationText": "De kale imperatief laat het onderwerp (kamu) weg en plaatst de werkwoordstam vooraan: Duduk di sini! = 'Ga hier zitten!'. Het werkwoord blijft onverbogen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kamu naik bus itu.",
      "transformationInstruction": "Maak er een verbod van (de persoon mag dit niet doen).",
      "acceptableAnswers": [
        "Jangan naik bus itu!",
        "Jangan naik bus itu"
      ],
      "hintText": "naik = instappen",
      "explanationText": "Een verbod wordt gevormd met jangan + werkwoord: Jangan naik bus itu! = 'stap niet in die bus!'. Jangan is het vaste verbodswoord vóór het werkwoord."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kita kembali sekarang.",
      "transformationInstruction": "Maak er een uitnodiging in de wij-vorm van ('laten we ...').",
      "acceptableAnswers": [
        "Mari kita kembali sekarang!",
        "Ayo kita kembali sekarang!",
        "Mari kita kembali sekarang"
      ],
      "hintText": "kembali = teruggaan",
      "explanationText": "Een uitnodiging in de wij-vorm gebruikt mari (neutraal/formeel) of ayo (informeel) + kita: Mari kita kembali = 'laten we teruggaan'. Het sluit de spreker zelf in de handeling in."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Beli mobil.",
      "transformationInstruction": "Verzacht het bevel met een partikel zodat het 'koop toch maar' wordt.",
      "acceptableAnswers": [
        "Beli saja mobil!",
        "Beli saja mobil",
        "Beli mobil saja!"
      ],
      "hintText": "saja = toch maar / slechts",
      "explanationText": "Het partikel saja verzacht de kale imperatief: Beli saja = 'koop toch maar'. Saja maakt het bevel minder dwingend en meer een vriendelijke aansporing."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Kom, laten we teruggaan!",
      "requiredTargetPattern": "bare-imperative-and-invitation",
      "acceptableAnswers": [
        "Mari kita kembali!",
        "Ayo kita kembali!",
        "Mari kita pulang!"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Laten we ...' is mari (kita) of ayo (kita) + werkwoord. Mari is neutraal/formeel, ayo informeel en aansporend; beide sluiten de spreker in de handeling in."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Stap niet in die bus!",
      "requiredTargetPattern": "bare-imperative-and-invitation",
      "acceptableAnswers": [
        "Jangan naik bus itu!",
        "Jangan naik bus itu"
      ],
      "disallowedShortcutForms": [
        "Tidak naik bus itu!"
      ],
      "explanationText": "Een verbod gebruikt jangan + werkwoord, niet tidak. Tidak ontkent een bewering ('niet'), maar voor een verbod aan iemand ('doe niet') is jangan verplicht."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Koop toch een auto!",
      "requiredTargetPattern": "bare-imperative-and-invitation",
      "acceptableAnswers": [
        "Beli saja mobil!",
        "Beli mobil saja!",
        "Beli saja mobil"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "De kale imperatief beli ('koop') met het verzachtende partikel saja geeft 'koop toch maar': Beli saja mobil! Het werkwoord staat onverbogen vooraan, zonder onderwerp."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Ga hier zitten!",
      "requiredTargetPattern": "bare-imperative-and-invitation",
      "acceptableAnswers": [
        "Duduk di sini!",
        "Duduklah di sini!",
        "Duduk di sini"
      ],
      "disallowedShortcutForms": [
        "Kamu duduk di sini."
      ],
      "explanationText": "De kale imperatief laat het onderwerp weg en plaatst het werkwoord vooraan: Duduk di sini! De vorm met kamu erbij ('kamu duduk di sini') is een mededeling, geen bevel."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "bare-imperative-and-invitation",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Kom, laten we even langsgaan!",
      "requiredTargetPattern": "bare-imperative-and-invitation",
      "acceptableAnswers": [
        "Mari kita mampir!",
        "Ayo kita mampir!",
        "Mari mampir saja!"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Laten we ...' is mari/ayo (kita) + werkwoord. Mampir ('kort langsgaan') is het werkwoord; mari kita mampir nodigt de aangesprokene samen met de spreker uit."
    }
  },

  // ============================================================
  // PATTERN 7: rasa-kira-pikir-mental-verbs
  // ============================================================
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Saya ___ buah ini kurang manis.",
      "translation": "Ik vind deze vrucht niet zoet genoeg.",
      "options": [
        "rasa",
        "kira",
        "pikir",
        "lihat"
      ],
      "correctOptionId": "rasa",
      "explanationText": "Rasa drukt een gevoelsmatige, zintuiglijke indruk uit — het proeven van de vrucht is een persoonlijke smaakervaring. Kira ('inschatten/vermoeden') en pikir ('verstandelijk nadenken') passen minder bij een directe smaakindruk; lihat ('zien') hoort niet bij een oordeel."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Saya ___ batik yang ini lebih halus, tapi saya tidak yakin.",
      "translation": "Ik denk/schat dat deze batik fijner is, maar ik weet het niet zeker.",
      "options": [
        "kira",
        "rasa",
        "lihat",
        "tahu"
      ],
      "correctOptionId": "kira",
      "explanationText": "Kira drukt een inschatting/vermoeden uit, vaak met onzekerheid — past precies bij 'maar ik weet het niet zeker'. Rasa is gevoelsmatig, lihat is 'zien' en tahu ('weten') zou juist zekerheid impliceren, wat het tweede zinsdeel tegenspreekt."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sentence": "Jangan ___ tentang hal itu, ikuti saja pikiranmu.",
      "translation": "Pieker niet over die kwestie, volg gewoon je gedachte.",
      "options": [
        "pikir-pikir",
        "rasa",
        "kira",
        "lihat"
      ],
      "correctOptionId": "pikir-pikir",
      "explanationText": "Pikir-pikir (gereduceerde vorm van pikir) betekent 'lang zitten malen/piekeren' — verstandelijk over iets blijven nadenken. Rasa (gevoelsmatig) en kira (inschatten) dekken het malen niet, en lihat ('zien') hoort hier niet."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je proeft een vrucht op de markt en geeft je persoonlijke, zintuiglijke indruk: hij is niet zoet genoeg.",
      "targetMeaning": "rasa - voelen/vinden (gevoelsmatig)",
      "options": [
        { "id": "Saya rasa buah ini kurang manis.", "text": "Saya rasa buah ini kurang manis." },
        { "id": "Saya pikir buah ini kurang manis.", "text": "Saya pikir buah ini kurang manis." }
      ],
      "correctOptionId": "Saya rasa buah ini kurang manis.",
      "explanationText": "Rasa hoort bij een zintuiglijke, gevoelsmatige indruk — het proeven van een vrucht. Pikir is verstandelijk redeneren en past niet bij een directe smaakervaring. Het Indonesisch scheidt het gevoelsmatige (rasa) van het rationele (pikir)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je doet een onzekere schatting over twee stuks batik: deze is volgens jou waarschijnlijk fijner, maar je weet het niet zeker.",
      "targetMeaning": "kira - inschatten/vermoeden (onzeker)",
      "options": [
        { "id": "Saya kira batik ini lebih halus.", "text": "Saya kira batik ini lebih halus." },
        { "id": "Saya rasa batik ini lebih halus.", "text": "Saya rasa batik ini lebih halus." }
      ],
      "correctOptionId": "Saya kira batik ini lebih halus.",
      "explanationText": "Kira drukt een vermoeden/inschatting met onzekerheid uit — precies een gok over de kwaliteit. Rasa zou een gevoelsmatige, persoonlijke indruk aangeven. Bij een onzekere schatting is kira de natuurlijke keuze."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "promptText": "Je raadt iemand aan niet langer verstandelijk over een lastige kwestie te blijven malen.",
      "targetMeaning": "pikir - verstandelijk nadenken/piekeren",
      "options": [
        { "id": "Jangan pikir-pikir tentang hal itu.", "text": "Jangan pikir-pikir tentang hal itu." },
        { "id": "Jangan rasa-rasa tentang hal itu.", "text": "Jangan rasa-rasa tentang hal itu." }
      ],
      "correctOptionId": "Jangan pikir-pikir tentang hal itu.",
      "explanationText": "Piekeren = verstandelijk blijven nadenken, dus pikir(-pikir). Rasa is gevoelsmatig/zintuiglijk en de vorm rasa-rasa in deze betekenis is ongebruikelijk. Het 'malen over een kwestie' is een denkproces (pikir), geen gevoel (rasa)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Buah ini kurang manis.",
      "transformationInstruction": "Voeg vooraan het mentale werkwoord toe dat een gevoelsmatige, zintuiglijke indruk uitdrukt ('ik vind/proef ...').",
      "acceptableAnswers": [
        "Saya rasa buah ini kurang manis.",
        "Saya rasa buah ini kurang manis"
      ],
      "hintText": null,
      "explanationText": "Voor een zintuiglijke, gevoelsmatige indruk gebruik je rasa: Saya rasa ... ('ik vind/proef ...'). Rasa hoort bij het hart en de zintuigen, in tegenstelling tot het rationele pikir."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Kantor pos sudah tutup.",
      "transformationInstruction": "Voeg vooraan het mentale werkwoord toe dat een onzekere inschatting/vermoeden uitdrukt ('ik denk/schat dat ...').",
      "acceptableAnswers": [
        "Saya kira kantor pos sudah tutup.",
        "Saya kira kantor pos sudah tutup"
      ],
      "hintText": "tutup = dicht/gesloten",
      "explanationText": "Voor een inschatting met onzekerheid gebruik je kira: Saya kira ... ('ik denk/schat dat ...'). Kira bevat een element van gissen, anders dan het zekere tahu ('weten')."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceSentence": "Saya kira batik ini lebih halus.",
      "transformationInstruction": "Vervang het mentale werkwoord door dat van een gevoelsmatige indruk (van een inschatting naar een persoonlijk gevoel).",
      "acceptableAnswers": [
        "Saya rasa batik ini lebih halus.",
        "Saya rasa batik ini lebih halus"
      ],
      "hintText": "halus = fijn (kwaliteit)",
      "explanationText": "Kira ('inschatten/vermoeden, een gok') wordt rasa ('gevoelsmatig vinden'). Het verschil: kira is een onzekere schatting, rasa een persoonlijke, gevoelsmatige indruk. De zin blijft verder gelijk."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Ik vind deze vrucht niet zoet genoeg.",
      "requiredTargetPattern": "rasa-kira-pikir-mental-verbs",
      "acceptableAnswers": [
        "Saya rasa buah ini kurang manis.",
        "Saya rasa buah ini kurang manis"
      ],
      "disallowedShortcutForms": [
        "Saya pikir buah ini kurang manis."
      ],
      "explanationText": "Een smaakoordeel is gevoelsmatig/zintuiglijk, dus rasa. Pikir ('verstandelijk denken') past niet bij een directe smaakindruk — het Indonesisch scheidt het gevoel (rasa) van het verstand (pikir)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Ik denk dat deze batik fijner is, maar ik weet het niet zeker.",
      "requiredTargetPattern": "rasa-kira-pikir-mental-verbs",
      "acceptableAnswers": [
        "Saya kira batik ini lebih halus, tapi saya tidak yakin.",
        "Saya kira batik ini lebih halus, tetapi saya tidak yakin.",
        "Saya kira batik yang ini lebih halus, tapi saya tidak yakin."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Bij een onzekere inschatting hoort kira ('denken/vermoeden, een gok'). De toevoeging 'maar ik weet het niet zeker' bevestigt de onzekerheid die kira typeert — anders dan het zekere tahu ('weten')."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Zit niet zo te tobben over die kwestie.",
      "requiredTargetPattern": "rasa-kira-pikir-mental-verbs",
      "acceptableAnswers": [
        "Jangan pikir-pikir tentang hal itu.",
        "Jangan pikir-pikir soal itu.",
        "Jangan pikir-pikir tentang hal itu lagi."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Tobben/piekeren is verstandelijk blijven nadenken, dus de gereduceerde vorm pikir-pikir. De reduplicatie geeft het langdurige, herhaalde malen aan. Rasa en kira passen niet bij dit denkproces."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Hij denkt dat het postkantoor al dicht is, maar ik heb het gevoel dat het nog open is.",
      "requiredTargetPattern": "rasa-kira-pikir-mental-verbs",
      "acceptableAnswers": [
        "Dia pikir kantor pos sudah tutup, tapi saya rasa masih buka.",
        "Dia pikir kantor pos sudah tutup, tetapi saya rasa masih buka.",
        "Dia pikir kantor pos sudah tutup, tapi saya rasa masih buka."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Het contrast in de zin maakt het verschil zichtbaar: pikir ('hij denkt', verstandelijk) tegenover rasa ('ik heb het gevoel', gevoelsmatig). Twee verschillende mentale werkwoorden voor twee verschillende soorten oordeel."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "rasa-kira-pikir-mental-verbs",
    "review_status": "pending_review",
    "payload": {
      "sourceLanguageSentence": "Ik denk dat het ongeveer tien kilometer is.",
      "requiredTargetPattern": "rasa-kira-pikir-mental-verbs",
      "acceptableAnswers": [
        "Saya kira kira-kira sepuluh kilometer.",
        "Saya kira sekitar sepuluh kilometer.",
        "Saya kira kurang lebih sepuluh kilometer."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Een schatting van afstand is bij uitstek kira ('inschatten/vermoeden'). Het past natuurlijk samen met kira-kira ('ongeveer') of kurang lebih ('plusminus') — beide drukken de onzekerheid van een gok uit."
    }
  },
]
