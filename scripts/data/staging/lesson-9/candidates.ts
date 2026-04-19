// Published via script
export const candidates = [
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sentence": "Saya ___ mau datang ke rumah sakit.",
      "translation": "Ik wil niet naar het ziekenhuis komen.",
      "options": [
        "tidak",
        "mau",
        "datang",
        "sudah"
      ],
      "correctOptionId": "tidak",
      "explanationText": "Negatie (groep A) staat altijd vóór de modaal (groep B). De correcte volgorde is A-B-C: tidak (A) + mau (B) + datang (C). Nederlandstaligen plaatsen negatie vaak achter de modaal (mau tidak), maar dat is fout."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sentence": "Ibu ___ bisa berangkat karena masih sakit.",
      "translation": "Moeder kan nog niet vertrekken omdat ze nog ziek is.",
      "options": [
        "belum",
        "bisa",
        "berangkat",
        "mau"
      ],
      "correctOptionId": "belum",
      "explanationText": "Belum hoort bij groep A (fase) en staat vóór de modaal bisa (groep B) en het hoofdwerkwoord berangkat (groep C). De vaste volgorde A-B-C mag nooit worden omgedraaid; belum en bisa zijn niet inwisselbaar van positie."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sentence": "Dia akan ___ cari obat di pasar.",
      "translation": "Hij zal proberen een medicijn te zoeken op de markt.",
      "options": [
        "coba",
        "akan",
        "sudah",
        "belum"
      ],
      "correctOptionId": "coba",
      "explanationText": "Coba hoort bij groep B (aspect/modaal) en staat tussen akan (A) en cari (C). Akan, sudah en belum horen allemaal bij groep A en kunnen dus niet op de B-positie staan; alleen coba vult die plek correct."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "promptText": "De dokter zegt tegen bapak dat hij al toestemming heeft om weer te gaan werken.",
      "targetMeaning": "Bapak mag al gaan werken — A-B-C volgorde.",
      "options": [
        {
          "id": "Bapak sudah boleh bekerja.",
          "text": "Bapak sudah boleh bekerja."
        },
        {
          "id": "Bapak boleh sudah bekerja.",
          "text": "Bapak boleh sudah bekerja."
        }
      ],
      "correctOptionId": "Bapak sudah boleh bekerja.",
      "explanationText": "Sudah (groep A, fase) moet altijd vóór boleh (groep B, modaal) staan. De vaste volgorde is A-B-C: boleh sudah draait de groepen om en is niet grammaticaal in het Indonesisch."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "promptText": "Dit kind is te jong om zelf in bad te gaan, en haar moeder legt dit aan de dokter uit.",
      "targetMeaning": "Anak ini belum bisa mandi — A-B-C volgorde.",
      "options": [
        {
          "id": "Anak ini belum bisa mandi.",
          "text": "Anak ini belum bisa mandi."
        },
        {
          "id": "Anak ini bisa belum mandi.",
          "text": "Anak ini bisa belum mandi."
        }
      ],
      "correctOptionId": "Anak ini belum bisa mandi.",
      "explanationText": "Belum is een groep-A-woord (fase, negatie) en hoort vóór bisa (groep B, modaal). De omgekeerde volgorde bisa belum bestaat niet in het Indonesisch; groepen mogen niet van plaats wisselen."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "promptText": "Je hebt vandaag nog steeds een verplichting: een afspraak op kantoor.",
      "targetMeaning": "Ik moet nog naar kantoor — masih-harus-pergi in A-B-C.",
      "options": [
        {
          "id": "Saya masih harus pergi ke kantor.",
          "text": "Saya masih harus pergi ke kantor."
        },
        {
          "id": "Saya harus masih pergi ke kantor.",
          "text": "Saya harus masih pergi ke kantor."
        }
      ],
      "correctOptionId": "Saya masih harus pergi ke kantor.",
      "explanationText": "Masih hoort bij groep A (fase/aspect) en staat vóór harus (groep B, modaal). Nederlandstaligen maken vaak harus masih naar analogie van het Nederlands, maar in het Indonesisch is deze volgorde strikt A-B-C."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya mau datang.",
      "transformationInstruction": "Maak de zin negatief door een groep-A-woord toe te voegen (niet willen komen).",
      "acceptableAnswers": [
        "Saya tidak mau datang.",
        "Saya tidak mau datang"
      ],
      "hintText": null,
      "explanationText": "Negatie hoort bij groep A en wordt toegevoegd vóór de modaal mau (groep B). De volgorde blijft strikt A-B-C: tidak + mau + datang. Nooit mau tidak datang; negatie gaat altijd vóór de modaal."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Dia bisa pulang.",
      "transformationInstruction": "Voeg een groep-A-woord toe dat aangeeft dat iets nog steeds het geval is (nog kunnen terugkeren).",
      "acceptableAnswers": [
        "Dia masih bisa pulang.",
        "Dia masih bisa pulang"
      ],
      "hintText": null,
      "explanationText": "Masih hoort bij groep A (fase) en komt vóór bisa (groep B). Zo ontstaat de volledige A-B-C-keten: masih + bisa + pulang. De modaal bisa verandert niet van plaats; er wordt alleen iets op de A-positie ingevoegd."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik wil niet vertrekken.",
      "requiredTargetPattern": "verb-ordering-abc",
      "acceptableAnswers": [
        "Saya tidak mau berangkat.",
        "Saya tidak mau pergi."
      ],
      "disallowedShortcutForms": [
        "Saya mau tidak berangkat.",
        "Saya mau tidak pergi."
      ],
      "explanationText": "Gebruik de volgorde A (tidak) + B (mau) + C (berangkat/pergi). De Nederlandse cluster wil niet vertrekken verleidt tot mau tidak, maar Indonesisch plaatst negatie altijd vóór de modaal."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Moeder kan nog niet naar de markt komen.",
      "requiredTargetPattern": "verb-ordering-abc",
      "acceptableAnswers": [
        "Ibu belum bisa datang ke pasar.",
        "Ibu belum bisa pergi ke pasar."
      ],
      "disallowedShortcutForms": [
        "Ibu bisa belum datang ke pasar.",
        "Ibu tidak bisa datang ke pasar."
      ],
      "explanationText": "Belum (A) + bisa (B) + datang (C) geeft kan nog niet komen. Tidak bisa betekent kan niet en mist de tijdsdimensie nog niet. De volgorde belum bisa is vast; bisa belum bestaat niet."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sentence": "Harga pisang ini ___ mahal.",
      "translation": "De prijs van deze banaan is erg hoog.",
      "options": [
        "amat",
        "sekali",
        "benar",
        "betul"
      ],
      "correctOptionId": "amat",
      "explanationText": "Amat staat altijd vóór het bijvoeglijk naamwoord (PRE-positie). Sekali, benar en betul horen juist achter het bijv.nw. (POST-positie); sekali mahal of benar mahal als intensifier is ongrammaticaal."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sentence": "Kaki saya sakit ___ , dokter.",
      "translation": "Mijn voet doet erg pijn, dokter.",
      "options": [
        "sekali",
        "amat",
        "sangat",
        "paling"
      ],
      "correctOptionId": "sekali",
      "explanationText": "Sekali komt achter het bijvoeglijk naamwoord: sakit sekali betekent erg pijnlijk. Amat en sangat horen vóór het bijv.nw. (amat sakit, sangat sakit), dus hier passen ze positioneel niet. Paling betekent het meest en heeft een andere functie."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sentence": "Mobil itu ___ cepat.",
      "translation": "Die auto is zeer snel.",
      "options": [
        "sangat",
        "sekali",
        "betul",
        "benar"
      ],
      "correctOptionId": "sangat",
      "explanationText": "Sangat staat altijd vóór het bijv.nw. (PRE-positie) en is formeel van register. Sekali, betul en benar zijn POST-intensifiers; ze komen achter het bijv.nw. en kunnen niet op deze plek staan."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "promptText": "Je wilt in alledaagse spreektaal zeggen dat een boom heel hoog is.",
      "targetMeaning": "Pohon itu tinggi sekali — POST-intensifier sekali.",
      "options": [
        {
          "id": "Pohon itu tinggi sekali.",
          "text": "Pohon itu tinggi sekali."
        },
        {
          "id": "Pohon itu sekali tinggi.",
          "text": "Pohon itu sekali tinggi."
        }
      ],
      "correctOptionId": "Pohon itu tinggi sekali.",
      "explanationText": "Sekali hoort bij de POST-intensifiers en staat achter het bijv.nw.: tinggi sekali. Sekali tinggi is een veelvoorkomende Nederlandstalige fout, omdat zeer hoog in het Nederlands PRE staat; in het Indonesisch gaat sekali altijd achteraan."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "promptText": "Een journalist schrijft in formele nieuwstekst dat de prijzen op de markt erg hoog zijn.",
      "targetMeaning": "Harga sangat mahal — sangat op PRE-positie.",
      "options": [
        {
          "id": "Harga di pasar sangat mahal.",
          "text": "Harga di pasar sangat mahal."
        },
        {
          "id": "Harga di pasar mahal sangat.",
          "text": "Harga di pasar mahal sangat."
        }
      ],
      "correctOptionId": "Harga di pasar sangat mahal.",
      "explanationText": "Sangat is een PRE-intensifier en staat vóór het bijv.nw.: sangat mahal. De POST-positie mahal sangat bestaat niet; alleen benar, betul en sekali mogen achter het bijv.nw. staan."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "promptText": "Je bevestigt dat een bepaald kind tijdens het onderzoek door de dokter heel bang is.",
      "targetMeaning": "Anak itu takut benar — benar op POST-positie.",
      "options": [
        {
          "id": "Anak itu takut benar.",
          "text": "Anak itu takut benar."
        },
        {
          "id": "Anak itu benar takut.",
          "text": "Anak itu benar takut."
        }
      ],
      "correctOptionId": "Anak itu takut benar.",
      "explanationText": "Als intensifier erg zeer staat benar achter het bijv.nw.: takut benar. De vorm benar takut in PRE-positie zou juist de waarheidsbijwoord-lezing oproepen echt bang zijn en niet de intensifier-betekenis."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kota ini besar.",
      "transformationInstruction": "Versterk het bijv.nw. met een POST-intensifier (sekali, benar of betul).",
      "acceptableAnswers": [
        "Kota ini besar sekali.",
        "Kota ini besar benar.",
        "Kota ini besar betul.",
        "Kota ini besar sekali",
        "Kota ini besar benar",
        "Kota ini besar betul"
      ],
      "hintText": "POST = na het bijv.nw.",
      "explanationText": "POST-intensifiers (sekali, benar, betul) komen achter het bijv.nw. Alle drie zijn hier grammaticaal correct; het register verschilt licht (sekali is neutraal, benar en betul iets nadrukkelijker). Sekali besar zou fout zijn."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Pisang itu murah.",
      "transformationInstruction": "Versterk het bijv.nw. met een PRE-intensifier (amat of sangat).",
      "acceptableAnswers": [
        "Pisang itu amat murah.",
        "Pisang itu sangat murah.",
        "Pisang itu amat murah",
        "Pisang itu sangat murah"
      ],
      "hintText": "PRE = vóór het bijv.nw.",
      "explanationText": "PRE-intensifiers amat en sangat komen vóór het bijv.nw. Sangat is iets formeler dan amat; beide zijn correct. Murah amat of murah sangat bestaan niet in standaard-Indonesisch; alleen POST-intensifiers mogen achteraan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Die auto is zeer snel. (formeel register — gebruik een PRE-intensifier)",
      "requiredTargetPattern": "intensifier-position",
      "acceptableAnswers": [
        "Mobil itu sangat cepat.",
        "Mobil itu amat cepat."
      ],
      "disallowedShortcutForms": [
        "Mobil itu cepat sangat.",
        "Mobil itu sekali cepat."
      ],
      "explanationText": "Sangat en amat zijn PRE-intensifiers en staan vóór het bijv.nw. cepat. Sekali is een POST-intensifier en mag nooit PRE staan; sekali cepat is ongrammaticaal in standaardtaal."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De prijs van deze banaan is heel laag. (alledaags register — gebruik een POST-intensifier)",
      "requiredTargetPattern": "intensifier-position",
      "acceptableAnswers": [
        "Harga pisang ini murah sekali.",
        "Harga pisang ini murah benar.",
        "Harga pisang ini murah betul."
      ],
      "disallowedShortcutForms": [
        "Harga pisang ini sekali murah.",
        "Harga pisang ini sangat murah."
      ],
      "explanationText": "POST-intensifiers (sekali, benar, betul) komen achter het bijv.nw. Sangat zou PRE zijn en past niet bij het gevraagde register; sekali murah is ongrammaticaal omdat sekali nooit vóór het bijv.nw. mag staan."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sentence": "Saya ___ lupa.",
      "translation": "Ik ben het echt vergeten.",
      "options": [
        "betul-betul",
        "sekali",
        "sangat",
        "paling"
      ],
      "correctOptionId": "betul-betul",
      "explanationText": "Reduplicatie betul-betul functioneert als waarheidsbijwoord en betekent werkelijk echt écht. Sekali is een POST-intensifier bij bijv.nw., sangat een PRE-intensifier; beide versterken adjectieven, niet werkwoorden zoals lupa."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sentence": "Itu ___ , tetapi saya belum pulang.",
      "translation": "Dat is juist, maar ik ben nog niet naar huis gegaan.",
      "options": [
        "benar",
        "sangat",
        "sekali",
        "amat"
      ],
      "correctOptionId": "benar",
      "explanationText": "Als waarheidsbijwoord betekent benar juist waar correct en kan het losstaand als predicaat staan. Sangat, sekali en amat zijn intensifiers voor bijv.nw. en kunnen hier niet predicatief staan; Itu sangat is geen volledige zin."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sentence": "Kaki saya ___ patah.",
      "translation": "Mijn voet is écht gebroken.",
      "options": [
        "betul",
        "sekali",
        "sangat",
        "paling"
      ],
      "correctOptionId": "betul",
      "explanationText": "Betul vóór het predicaat patah functioneert als waarheidsbijwoord: echt gebroken, niet gespeeld. Sekali is alleen POST, sangat combineert zelden met een werkwoordelijk predicaat als patah, en paling (het meest) heeft hier geen betekenis."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "promptText": "Een vriendin zegt iets over de stad. Je wilt bevestigen dat wat ze zegt klopt.",
      "targetMeaning": "Betul, kota ini besar — bevestiging dat klopt.",
      "options": [
        {
          "id": "Betul, kota ini besar.",
          "text": "Betul, kota ini besar."
        },
        {
          "id": "Kota ini besar betul.",
          "text": "Kota ini besar betul."
        }
      ],
      "correctOptionId": "Betul, kota ini besar.",
      "explanationText": "Betul losstaand of aan het begin is een waarheidsbijwoord: Klopt die stad is groot. De variant kota ini besar betul gebruikt betul als intensifier (erg groot) en past niet bij bevestiging van een uitspraak."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "promptText": "Je wilt zeggen dat een stad écht heel groot is — het is geen overdrijving.",
      "targetMeaning": "Kota ini betul besar — waarheidsbijwoord echt.",
      "options": [
        {
          "id": "Kota ini betul besar.",
          "text": "Kota ini betul besar."
        },
        {
          "id": "Kota ini besar betul.",
          "text": "Kota ini besar betul."
        }
      ],
      "correctOptionId": "Kota ini betul besar.",
      "explanationText": "In PRE-positie voor het bijv.nw. heeft betul de waarheidsbijwoord-betekenis echt werkelijk. In POST-positie (besar betul) is het een gewone intensifier erg groot. Positie bepaalt hier de betekenis."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "promptText": "Iemand twijfelt of jij het medicijn écht bent vergeten. Je bevestigt het nadrukkelijk.",
      "targetMeaning": "Saya betul-betul lupa — ik ben het werkelijk vergeten.",
      "options": [
        {
          "id": "Saya betul-betul lupa.",
          "text": "Saya betul-betul lupa."
        },
        {
          "id": "Saya lupa sekali.",
          "text": "Saya lupa sekali."
        }
      ],
      "correctOptionId": "Saya betul-betul lupa.",
      "explanationText": "Reduplicatie betul-betul is waarheidsbijwoord werkelijk écht en past bij werkwoorden zoals lupa. Sekali is een POST-intensifier voor bijv.nw. en combineert niet goed met lupa; lupa sekali klinkt onnatuurlijk als echt vergeten."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya lupa.",
      "transformationInstruction": "Voeg de gereduplikeerde waarheidsbijwoord-vorm toe om nadruk te geven (ik ben het werkelijk of écht vergeten).",
      "acceptableAnswers": [
        "Saya betul-betul lupa.",
        "Saya benar-benar lupa.",
        "Saya betul-betul lupa",
        "Saya benar-benar lupa"
      ],
      "hintText": null,
      "explanationText": "De verdubbelingsvorm betul-betul of benar-benar staat vóór het werkwoord en betekent werkelijk écht. Beide zijn nagenoeg synoniem; betul-betul is in spreektaal iets frequenter dan benar-benar."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Dia sakit.",
      "transformationInstruction": "Voeg vóór het predicaat een waarheidsbijwoord toe dat echt betekent (niet een intensifier zeer).",
      "acceptableAnswers": [
        "Dia betul sakit.",
        "Dia benar sakit.",
        "Dia betul sakit",
        "Dia benar sakit"
      ],
      "hintText": null,
      "explanationText": "In PRE-positie vóór het predicaat fungeert betul of benar als waarheidsbijwoord echt. In POST-positie (sakit betul) zou het een intensifier zeer ziek worden; de plaatsing bepaalt de lezing."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat klopt, ik ben het vergeten.",
      "requiredTargetPattern": "benar-betul-truth-adverb",
      "acceptableAnswers": [
        "Betul, saya lupa.",
        "Benar, saya lupa."
      ],
      "disallowedShortcutForms": [
        "Saya lupa sekali.",
        "Saya sangat lupa."
      ],
      "explanationText": "Betul of benar losstaand aan het begin van de zin is een bevestigend waarheidsbijwoord dat klopt betekent. Een intensifier zoals sekali of sangat hoort bij bijv.nw. en past hier niet; bevestiging gaat via de waarheidsbijwoord-functie."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Haar moeder schrok écht toen zij thuiskwam.",
      "requiredTargetPattern": "benar-betul-truth-adverb",
      "acceptableAnswers": [
        "Ibunya betul-betul kaget waktu dia pulang.",
        "Ibunya benar-benar kaget waktu dia pulang."
      ],
      "disallowedShortcutForms": [
        "Ibunya kaget sekali waktu dia pulang.",
        "Ibunya sangat kaget waktu dia pulang."
      ],
      "explanationText": "Het Nederlandse écht in deze context is een waarheidsbijwoord en wordt weergegeven door reduplicatie betul-betul of benar-benar vóór het predicaat. Sekali of sangat zijn intensifiers zeer geschrokken en missen de nuance werkelijk echt waar."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya ingin tidur.",
      "transformationInstruction": "Voeg een groep-A-woord toe dat aangeeft dat de gewenste situatie nog niet gerealiseerd is (nog niet willen slapen).",
      "acceptableAnswers": [
        "Saya belum ingin tidur.",
        "Saya belum ingin tidur"
      ],
      "hintText": null,
      "explanationText": "Belum hoort bij groep A (fase, nog-niet) en gaat vóór de modaal ingin (groep B). Volgorde A-B-C: belum + ingin + tidur. De omgekeerde positie ingin belum bestaat niet; A-woorden gaan altijd voorop."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Anak itu makan nasi.",
      "transformationInstruction": "Voeg een modaal toe (groep B) die noodzaak uitdrukt (moet eten), zonder een groep-A-woord.",
      "acceptableAnswers": [
        "Anak itu harus makan nasi.",
        "Anak itu harus makan nasi"
      ],
      "hintText": null,
      "explanationText": "Harus is een groep-B-woord (modaal: moeten) en wordt direct vóór het hoofdwerkwoord makan (C) ingevoegd. Zonder groep-A is de structuur B+C: harus + makan. Het in NL gebruikelijke om te tussen modaal en werkwoord (moet om te eten) bestaat niet in Indonesisch."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Wij willen samen Indonesisch leren.",
      "requiredTargetPattern": "verb-ordering-abc",
      "acceptableAnswers": [
        "Kami mau belajar bahasa Indonesia bersama.",
        "Kita mau belajar bahasa Indonesia bersama.",
        "Kami ingin belajar bahasa Indonesia bersama.",
        "Kita ingin belajar bahasa Indonesia bersama."
      ],
      "disallowedShortcutForms": [
        "Kami belajar mau bahasa Indonesia bersama.",
        "Kami mau untuk belajar bahasa Indonesia bersama."
      ],
      "explanationText": "Mau (B) staat direct vóór belajar (C); A is hier leeg. Indonesisch kent géén infinitiefmarkeerder untuk tussen B en C: mau untuk belajar is fout. De B-positie kan ook door ingin worden gevuld; beide drukken willen uit."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Mijn vriend kan vandaag niet de bus nemen.",
      "requiredTargetPattern": "verb-ordering-abc",
      "acceptableAnswers": [
        "Teman saya tidak bisa naik bus hari ini.",
        "Teman saya hari ini tidak bisa naik bus."
      ],
      "disallowedShortcutForms": [
        "Teman saya bisa tidak naik bus hari ini.",
        "Teman saya naik bus tidak bisa hari ini."
      ],
      "explanationText": "A (tidak) + B (bisa) + C (naik) is de vaste keten. Naik fungeert hier als hoofdwerkwoord met direct object bus. De Nederlandse volgorde kan niet leidt vaak tot bisa tidak, maar dat is in Indonesisch ongrammaticaal: groep A komt altijd vóór groep B."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-ordering-abc",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Hij zal morgen jamu moeten drinken.",
      "requiredTargetPattern": "verb-ordering-abc",
      "acceptableAnswers": [
        "Dia akan harus minum jamu besok.",
        "Besok dia akan harus minum jamu.",
        "Dia harus minum jamu besok."
      ],
      "disallowedShortcutForms": [
        "Dia harus akan minum jamu besok.",
        "Dia minum jamu akan harus besok."
      ],
      "explanationText": "Akan (A, futuur) + harus (B, modaal) + minum (C, hoofdwerkwoord) = A-B-C. Harus is de enige groep-B die vóór andere B-woorden mag staan, maar het komt nooit vóór een A-woord zoals akan; harus akan is fout."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kepala saya pusing.",
      "transformationInstruction": "Versterk het predicaat met een POST-intensifier (sekali, benar of betul).",
      "acceptableAnswers": [
        "Kepala saya pusing sekali.",
        "Kepala saya pusing benar.",
        "Kepala saya pusing betul.",
        "Kepala saya pusing sekali",
        "Kepala saya pusing benar",
        "Kepala saya pusing betul"
      ],
      "hintText": "POST = direct na het predicaat.",
      "explanationText": "POST-intensifiers (sekali, benar, betul) komen achter het predicaat: pusing sekali = erg duizelig. Sekali pusing of benar pusing in PRE-positie zou ongrammaticaal zijn voor de intensifier-betekenis."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Nasi ini pedas.",
      "transformationInstruction": "Versterk het bijv.nw. met een PRE-intensifier (amat of sangat).",
      "acceptableAnswers": [
        "Nasi ini amat pedas.",
        "Nasi ini sangat pedas.",
        "Nasi ini amat pedas",
        "Nasi ini sangat pedas"
      ],
      "hintText": "PRE = vóór het bijv.nw.",
      "explanationText": "Amat en sangat staan altijd vóór het bijv.nw. (PRE-positie): amat pedas, sangat pedas. De omgekeerde volgorde pedas amat of pedas sangat bestaat niet in standaardtaal — alleen sekali, benar en betul mogen achter het bijv.nw. staan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De weg naar het dorp is heel ver. (alledaags register — gebruik een POST-intensifier)",
      "requiredTargetPattern": "intensifier-position",
      "acceptableAnswers": [
        "Jalan ke desa jauh sekali.",
        "Jalan ke desa jauh benar.",
        "Jalan ke desa jauh betul."
      ],
      "disallowedShortcutForms": [
        "Jalan ke desa sekali jauh.",
        "Jalan ke desa sangat jauh."
      ],
      "explanationText": "POST-intensifiers (sekali, benar, betul) komen achter het bijv.nw. jauh. Sangat zou PRE zijn en past niet bij het gevraagde alledaagse register; sekali jauh is positioneel ongrammaticaal."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Deze kamer is zeer schoon. (formeel register — gebruik een PRE-intensifier)",
      "requiredTargetPattern": "intensifier-position",
      "acceptableAnswers": [
        "Kamar ini sangat bersih.",
        "Kamar ini amat bersih."
      ],
      "disallowedShortcutForms": [
        "Kamar ini bersih sangat.",
        "Kamar ini sekali bersih."
      ],
      "explanationText": "Sangat en amat zijn PRE-intensifiers en gaan vóór het bijv.nw. bersih. Bersih sangat in POST-positie bestaat niet; alleen benar, betul en sekali zijn POST-intensifiers."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "intensifier-position",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat kind is heel zwak. (alledaags register — gebruik een POST-intensifier)",
      "requiredTargetPattern": "intensifier-position",
      "acceptableAnswers": [
        "Anak itu lemah sekali.",
        "Anak itu lemah benar.",
        "Anak itu lemah betul."
      ],
      "disallowedShortcutForms": [
        "Anak itu sekali lemah.",
        "Anak itu sangat lemah."
      ],
      "explanationText": "POST-intensifiers (sekali, benar, betul) staan achter het bijv.nw. lemah. Sangat zou PRE zijn en past niet bij het alledaagse register; sekali lemah in PRE-positie is ongrammaticaal."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya capek.",
      "transformationInstruction": "Voeg de gereduplikeerde waarheidsbijwoord-vorm toe om te benadrukken dat het werkelijk zo is (niet alleen een beetje).",
      "acceptableAnswers": [
        "Saya betul-betul capek.",
        "Saya benar-benar capek.",
        "Saya betul-betul capek",
        "Saya benar-benar capek"
      ],
      "hintText": null,
      "explanationText": "De reduplicatie betul-betul of benar-benar staat vóór het predicaat capek en betekent werkelijk écht. Een POST-intensifier zoals capek sekali zou erg moe betekenen, maar mist de nuance werkelijk waar dat de spreker hier wil overbrengen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Dia demam.",
      "transformationInstruction": "Voeg vóór het predicaat een waarheidsbijwoord toe dat echt betekent (niet een intensifier zeer).",
      "acceptableAnswers": [
        "Dia betul demam.",
        "Dia benar demam.",
        "Dia betul demam",
        "Dia benar demam"
      ],
      "hintText": null,
      "explanationText": "In PRE-positie vóór het predicaat demam fungeert betul of benar als waarheidsbijwoord echt: dia betul demam = hij heeft écht koorts. In POST-positie (demam betul) zou het een intensifier worden (zeer veel koorts); de plaatsing bepaalt de lezing."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat klopt, het hotel is duur.",
      "requiredTargetPattern": "benar-betul-truth-adverb",
      "acceptableAnswers": [
        "Betul, hotel itu mahal.",
        "Benar, hotel itu mahal."
      ],
      "disallowedShortcutForms": [
        "Hotel itu mahal sekali.",
        "Hotel itu sangat mahal."
      ],
      "explanationText": "Betul of benar losstaand aan het begin is een bevestigend waarheidsbijwoord dat klopt betekent. Een intensifier zoals sekali of sangat zou enkel zeer duur uitdrukken en mist de bevestigende bedoeling van de spreker."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Het kind is écht misselijk, dokter.",
      "requiredTargetPattern": "benar-betul-truth-adverb",
      "acceptableAnswers": [
        "Anak itu betul-betul mual, dokter.",
        "Anak itu benar-benar mual, dokter."
      ],
      "disallowedShortcutForms": [
        "Anak itu mual sekali, dokter.",
        "Anak itu sangat mual, dokter."
      ],
      "explanationText": "Het Nederlandse écht is hier een waarheidsbijwoord en wordt vertaald door reduplicatie betul-betul of benar-benar vóór het predicaat mual. Sekali of sangat geven enkel intensiteit zeer misselijk, maar missen de werkelijk-waar-nuance die de ouder tegen de dokter wil benadrukken."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "benar-betul-truth-adverb",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Klopt, ik heb het medicijn al ingenomen.",
      "requiredTargetPattern": "benar-betul-truth-adverb",
      "acceptableAnswers": [
        "Betul, saya sudah minum obat.",
        "Benar, saya sudah minum obat."
      ],
      "disallowedShortcutForms": [
        "Saya sudah minum obat sekali.",
        "Saya sangat sudah minum obat."
      ],
      "explanationText": "Betul of benar losstaand aan het begin is een bevestigend waarheidsbijwoord (klopt). Sekali en sangat zijn intensifiers en passen niet bij een werkwoordelijke handeling als minum obat in deze bevestigende functie; bovendien is de POST-positie sudah minum obat sekali semantisch en positioneel onnatuurlijk."
    }
  }
]
