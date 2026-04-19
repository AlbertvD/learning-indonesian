// Published via script
export const candidates = [
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sentence": "Bu, ___ ke sekolah dulu ya! (de kinderen gaan, moeder gaat niet mee)",
      "translation": "Ma, wij gaan alvast naar school! (moeder gaat niet mee)",
      "options": [
        "kita",
        "kami",
        "mereka",
        "kalian"
      ],
      "correctOptionId": "kami",
      "explanationText": "Kami (exclusief) — de moeder wordt aangesproken maar gaat niet mee naar school."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sentence": "Bapak, mari ___ jalan-jalan! (vader wordt uitgenodigd mee te gaan)",
      "translation": "Pa, laten wij gaan wandelen! (vader wordt uitgenodigd)",
      "options": [
        "kami",
        "kita",
        "mereka",
        "saya"
      ],
      "correctOptionId": "kita",
      "explanationText": "Kita (inclusief) — vader wordt uitgenodigd om mee te gaan wandelen; hij telt mee in \"wij\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sentence": "___ harus belajar di rumah hari ini. (Titin zegt tegen Nanang — Nanang studeert ook mee)",
      "translation": "Wij moeten vandaag thuisstuderen. (Nanang telt mee)",
      "options": [
        "Kami",
        "Kita",
        "Mereka",
        "Kalian"
      ],
      "correctOptionId": "Kita",
      "explanationText": "Kita (inclusief) — Titin spreekt Nanang aan en hij studeert ook mee. Kami zou betekenen dat Nanang niet mee hoeft te studeren."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "promptText": "Titin zegt tegen Nanang: \"Wij moeten thuis studeren.\" Welk woord kiest Titin?",
      "targetMeaning": "Wij moeten thuis studeren",
      "options": [
        {
          "id": "a",
          "text": "Kita harus belajar di rumah."
        },
        {
          "id": "b",
          "text": "Kami harus belajar di rumah."
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Kita (inclusief): Titin spreekt Nanang aan — die is onderdeel van \"wij\". Kami zou impliceren dat Nanang niet meestudeert."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "promptText": "Titin zegt tegen de pembantu: \"Wij willen naar buiten.\" Welk woord kiest Titin?",
      "targetMeaning": "Wij willen naar buiten",
      "options": [
        {
          "id": "a",
          "text": "Kita mau ke luar."
        },
        {
          "id": "b",
          "text": "Kami mau ke luar."
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Kami (exclusief): de pembantu gaat niet mee naar buiten. Kita zou impliceren dat de pembantu ook meegaat."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "promptText": "Een vader zegt tegen zijn gezin: \"Laten wij morgen naar het strand gaan.\" Welk woord?",
      "targetMeaning": "Laten wij naar het strand gaan",
      "options": [
        {
          "id": "a",
          "text": "Kita ke pantai besok."
        },
        {
          "id": "b",
          "text": "Kami ke pantai besok."
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Kita (inclusief): de vader nodigt het hele gezin uit — iedereen is inbegrepen. Kami zou het gezin uitsluiten."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kita harus belajar di rumah. (Titin spreekt Nanang aan)",
      "transformationInstruction": "Verander de zin: nu spreekt Titin de pembantu aan. De pembantu gaat niet mee.",
      "acceptableAnswers": [
        "Kami harus belajar di rumah."
      ],
      "hintText": "Is de pembantu onderdeel van \"wij\"?",
      "explanationText": "Kami (exclusief) — de pembantu is niet inbegrepen in de studeersessie van Titin en Nanang."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kami mau ke luar. (Titin tegen de pembantu — pembantu gaat niet mee)",
      "transformationInstruction": "Verander de zin: nu spreekt Titin Nanang aan, en hij gaat ook mee naar buiten.",
      "acceptableAnswers": [
        "Kita mau ke luar."
      ],
      "hintText": "Gaat Nanang mee naar buiten?",
      "explanationText": "Kita (inclusief) — Nanang gaat ook mee naar buiten, dus hij is inbegrepen."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Wij (zonder de luisteraar) wonen in Bandung.",
      "requiredTargetPattern": "kami-vs-kita",
      "acceptableAnswers": [
        "Kami tinggal di Bandung."
      ],
      "disallowedShortcutForms": [
        "Kita tinggal di Bandung."
      ],
      "explanationText": "De luisteraar woont niet in Bandung, dus gebruik je kami (exclusief). Kita zou betekenen dat de luisteraar er ook woont."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Laten wij (samen, jij ook) naar de markt gaan.",
      "requiredTargetPattern": "kami-vs-kita",
      "acceptableAnswers": [
        "Mari kita ke pasar.",
        "Ayo kita ke pasar.",
        "Kita ke pasar."
      ],
      "disallowedShortcutForms": [
        "Kami ke pasar."
      ],
      "explanationText": "De luisteraar wordt uitgenodigd mee te gaan, dus kita (inclusief). Kami zou de luisteraar uitsluiten."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sentence": "Di mana ___? (mijn boek — informele afkorting)",
      "translation": "Waar is mijn boek?",
      "options": [
        "bukuku",
        "kubuku",
        "saya buku",
        "buku kami"
      ],
      "correctOptionId": "bukuku",
      "explanationText": "-ku is de informele afkorting van \"saya\" als bezittelijk suffix, direct vastgeplakt aan het zelfstandig naamwoord: buku + -ku = bukuku."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sentence": "___ rusak. (jouw auto — informele afkorting)",
      "translation": "Jouw auto is kapot.",
      "options": [
        "Mobilmu",
        "Kamu mobil",
        "Mobil kamu mu",
        "Mumobil"
      ],
      "correctOptionId": "Mobilmu",
      "explanationText": "-mu is de informele afkorting van \"kamu\" als bezittelijk suffix: mobil + -mu = mobilmu."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sentence": "___ sakit. (zijn/haar hulpje)",
      "translation": "Zijn/haar hulpje is ziek.",
      "options": [
        "Pembantunya",
        "Nya pembantu",
        "Dia pembantu",
        "Pembantu saya"
      ],
      "correctOptionId": "Pembantunya",
      "explanationText": "-nya is het bezittelijk suffix voor de derde persoon: pembantu + -nya = pembantunya (zijn/haar hulpje)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "promptText": "Titin praat informeel tegen Nanang over haar boek. Welke vorm past bij het informele register?",
      "targetMeaning": "Informele bezitsvorm met suffix -ku",
      "options": [
        {
          "id": "a",
          "text": "bukuku"
        },
        {
          "id": "b",
          "text": "buku saya"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "In een informeel gesprek tussen broer en zus is het suffix -ku de natuurlijke keuze: bukuku. 'Buku saya' is grammaticaal correct maar te formeel voor dit register — een veelgemaakte fout van Nederlandse leerders die standaard de volledige vorm gebruiken."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "promptText": "Nanang zoekt zijn sleutel en zegt tegen Titin: \"Waar is ___ sleutel?\" Welk suffix hoort bij Nanang (= de spreker)?",
      "targetMeaning": "-ku voor eerste persoon bezit, -mu voor tweede persoon bezit",
      "options": [
        {
          "id": "a",
          "text": "kunciku"
        },
        {
          "id": "b",
          "text": "kuncimu"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "-ku is het bezittelijk suffix voor de eerste persoon (ik/mijn): kunci + -ku = kunciku. -mu is voor de tweede persoon (jij/jouw). Nederlandse leerders verwarren deze soms omdat beide kort zijn en op elkaar lijken."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "promptText": "De buurkinderen zijn weg. Je vertelt: \"Hun huis is groot.\" Welke vorm is correct?",
      "targetMeaning": "-nya drukt ook meervoudig bezit (hun) uit, niet alleen zijn/haar",
      "options": [
        {
          "id": "a",
          "text": "Rumahnya besar."
        },
        {
          "id": "b",
          "text": "Rumah mereka besar."
        }
      ],
      "correctOptionId": "a",
      "explanationText": "-nya kan zowel \"zijn\", \"haar\" als \"hun\" betekenen. Nederlandse leerders denken vaak dat -nya alleen enkelvoud is en grijpen naar 'rumah mereka' voor meervoud bezit. Beide vormen zijn grammaticaal correct, maar rumahnya is de meest natuurlijke keuze in gesproken Indonesisch — context maakt duidelijk dat het om meervoud gaat."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ini buku saya.",
      "transformationInstruction": "Gebruik de verkorte -ku vorm.",
      "acceptableAnswers": [
        "Ini bukuku."
      ],
      "hintText": "-ku plakken aan het zelfstandig naamwoord",
      "explanationText": "buku + -ku = bukuku. De afgekorte vorm is informeel maar veelgebruikt in gesproken taal."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Itu mobil kamu.",
      "transformationInstruction": "Gebruik de verkorte -mu vorm.",
      "acceptableAnswers": [
        "Itu mobilmu."
      ],
      "hintText": "-mu plakken aan het zelfstandig naamwoord",
      "explanationText": "mobil + -mu = mobilmu. De afgekorte vorm -mu vervangt \"kamu\" als bezittelijk suffix."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Zijn helper is ziek.",
      "requiredTargetPattern": "possessive-suffix-placement",
      "acceptableAnswers": [
        "Pembantunya sakit.",
        "Pembantu dia sakit."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "-nya vervangt \"dia\" als bezittelijk suffix voor de derde persoon enkelvoud. Pembantunya sakit is de meest natuurlijke vorm."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Onze kleding is nog niet droog. (wij exclusief)",
      "requiredTargetPattern": "possessive-suffix-placement",
      "acceptableAnswers": [
        "Pakaian kami belum kering."
      ],
      "disallowedShortcutForms": [
        "Pakaian kita belum kering."
      ],
      "explanationText": "Met kami (exclusief) als bezittelijk voornaamwoord, achter het zelfstandig naamwoord: pakaian kami. Geen afgekorte vorm voor kami."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sentence": "___ Sahid dari mana? (neutrale, beleefde aanspreekvorm voor een man)",
      "translation": "Waar komt meneer Sahid vandaan?",
      "options": [
        "Kamu",
        "Bapak",
        "Tuan",
        "Anda"
      ],
      "correctOptionId": "Bapak",
      "explanationText": "Bapak is de neutrale dagelijkse aanspreekvorm voor een man. Tuan is formeler (voor westerlingen), Kamu te informeel, Anda sexe-neutraal."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sentence": "___ juga mau ke Taman Mini. (Titin praat informeel tegen Nanang over zichzelf)",
      "translation": "Ik wil ook naar Taman Mini. (informeel)",
      "options": [
        "Saya",
        "Aku",
        "Anda",
        "Dia"
      ],
      "correctOptionId": "Aku",
      "explanationText": "Aku is de informele \"ik\"-vorm, passend tussen broer en zus. Saya is correct maar formeler dan nodig in een huiselijke situatie."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sentence": "___ ingin makan apa? (sexe-neutrale, beleefde \"u\" in reclame)",
      "translation": "Wat wilt u eten?",
      "options": [
        "Kamu",
        "Aku",
        "Anda",
        "Kalian"
      ],
      "correctOptionId": "Anda",
      "explanationText": "Anda is sexe- en sociaal-neutraal \"u\", populair in reclame en formele teksten. Kamu is te informeel, Kalian is meervoud."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "promptText": "U ontmoet voor het eerst een Indonesische meneer. Hoe spreekt u hem aan?",
      "targetMeaning": "Neutrale, beleefde aanspreekvorm voor een volwassen man",
      "options": [
        {
          "id": "a",
          "text": "Kamu dari mana?"
        },
        {
          "id": "b",
          "text": "Bapak dari mana?"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Bapak is de neutrale, beleefde aanspreekvorm voor een volwassen man. Kamu is te informeel voor een eerste ontmoeting en kan als ongepast worden ervaren."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "promptText": "Titin spreekt haar jongere broer Nanang aan. Welke \"ik\"-vorm gebruikt ze?",
      "targetMeaning": "Informele eerste persoon enkelvoud tussen broer en zus",
      "options": [
        {
          "id": "a",
          "text": "Aku tidak senang tinggal di rumah."
        },
        {
          "id": "b",
          "text": "Saya tidak senang tinggal di rumah."
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Aku is de informele \"ik\"-vorm, geschikt tussen broer en zus of vrienden. Saya is correct maar formeler dan nodig in een huiselijke situatie."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "promptText": "De pembantu spreekt Titin aan met \"saya\". Waarom niet \"aku\"?",
      "targetMeaning": "Saya is neutraal-formeel; de pembantu houdt respectvolle afstand",
      "options": [
        {
          "id": "a",
          "text": "Saya juga tidak punya uang."
        },
        {
          "id": "b",
          "text": "Aku juga tidak punya uang."
        }
      ],
      "correctOptionId": "a",
      "explanationText": "De pembantu houdt een respectvolle afstand tot de kinderen en gebruikt daarom saya (neutraal-formeel). Aku zou te informeel zijn voor iemand in een dienstverband."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamu mau makan apa? (informeel)",
      "transformationInstruction": "Maak de zin beleefd — gebruik de neutrale aanspreekvorm voor een volwassen vrouw.",
      "acceptableAnswers": [
        "Ibu mau makan apa?",
        "Bu mau makan apa?"
      ],
      "hintText": "Welke beleefde aanspreekvorm gebruik je voor een vrouw?",
      "explanationText": "Ibu (of de verkorte vorm Bu) is de neutrale, beleefde aanspreekvorm voor een volwassen vrouw. Kamu is te informeel in een beleefde context."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya tidak senang tinggal di rumah. (neutraal)",
      "transformationInstruction": "Verander naar informeel register — je spreekt tegen je broertje.",
      "acceptableAnswers": [
        "Aku tidak senang tinggal di rumah."
      ],
      "hintText": "Welke informele \"ik\"-vorm gebruik je tussen broers en zussen?",
      "explanationText": "Aku is de informele \"ik\"-vorm, passend in huiselijke kring. Saya klinkt te formeel tegen een broertje."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Meneer, waar woont u? (neutraal beleefd)",
      "requiredTargetPattern": "pronoun-register-levels",
      "acceptableAnswers": [
        "Bapak tinggal di mana?",
        "Pak tinggal di mana?"
      ],
      "disallowedShortcutForms": [
        "Kamu tinggal di mana?",
        "Anda tinggal di mana?"
      ],
      "explanationText": "Bapak (of Pak) is de neutrale beleefde aanspreekvorm voor een volwassen man. Kamu is te informeel, Anda is sexe-neutraal en minder gebruikelijk in dagelijks taalgebruik."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Mevrouw Sutrisno, houdt u van thee? (neutraal beleefd)",
      "requiredTargetPattern": "pronoun-register-levels",
      "acceptableAnswers": [
        "Ibu Sutrisno suka teh?",
        "Bu Sutrisno suka teh?"
      ],
      "disallowedShortcutForms": [
        "Kamu suka teh?",
        "Anda suka teh?"
      ],
      "explanationText": "Ibu (of Bu) + naam is de neutrale beleefde aanspreekvorm voor een volwassen vrouw. Gebruik altijd Ibu/Bu met de achternaam in dagelijks taalgebruik."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kami mau makan di restoran. (Titin tegen de pembantu — pembantu eet niet mee)",
      "transformationInstruction": "Verander de zin: nu nodigt Titin de pembantu uit om mee te gaan eten in het restaurant.",
      "acceptableAnswers": [
        "Kita mau makan di restoran."
      ],
      "hintText": "Eet de pembantu nu mee? Kies het wij dat de luisteraar insluit.",
      "explanationText": "Kita (inclusief) — door de pembantu uit te nodigen mee te gaan eten, telt zij mee in \"wij\". Kami zou haar uitsluiten ondanks de uitnodiging."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Mari kita beli oleh-oleh di pasar. (een toerist nodigt zijn vriend uit)",
      "transformationInstruction": "Verander de zin: nu vertelt de toerist aan een onbekende meneer dat hij en zijn vriend (zonder die meneer) cadeautjes gaan kopen.",
      "acceptableAnswers": [
        "Kami beli oleh-oleh di pasar.",
        "Kami mau beli oleh-oleh di pasar."
      ],
      "hintText": "Gaat de meneer mee naar de markt?",
      "explanationText": "Kami (exclusief) — de onbekende meneer is geen onderdeel van de groep die de cadeautjes gaat kopen. Kita zou betekenen dat hij ook meegaat."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Wij (jij ook erbij) gaan vandaag naar het hotel.",
      "requiredTargetPattern": "kami-vs-kita",
      "acceptableAnswers": [
        "Kita ke hotel hari ini.",
        "Kita pergi ke hotel hari ini.",
        "Hari ini kita ke hotel."
      ],
      "disallowedShortcutForms": [
        "Kami ke hotel hari ini.",
        "Kami pergi ke hotel hari ini."
      ],
      "explanationText": "De luisteraar gaat ook mee naar het hotel, dus kita (inclusief). Kami zou de luisteraar uitsluiten en suggereren dat alleen de spreker en derden gaan."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Wij (zonder u) hebben veel koffers.",
      "requiredTargetPattern": "kami-vs-kita",
      "acceptableAnswers": [
        "Kami punya banyak koper.",
        "Koper kami banyak."
      ],
      "disallowedShortcutForms": [
        "Kita punya banyak koper.",
        "Koper kita banyak."
      ],
      "explanationText": "De aangesproken persoon hoort niet tot de groep met de koffers, dus kami (exclusief). Kita zou impliceren dat de luisteraar ook koffers heeft."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Laten wij (samen, jij ook) een taxi nemen naar het vliegveld.",
      "requiredTargetPattern": "kami-vs-kita",
      "acceptableAnswers": [
        "Mari kita naik taksi ke lapangan terbang.",
        "Ayo kita naik taksi ke lapangan terbang.",
        "Kita naik taksi ke lapangan terbang."
      ],
      "disallowedShortcutForms": [
        "Kami naik taksi ke lapangan terbang.",
        "Mari kami naik taksi ke lapangan terbang."
      ],
      "explanationText": "De luisteraar wordt uitgenodigd mee te gaan naar het vliegveld, dus kita (inclusief). Mari/ayo + kita is de standaard uitnodigingsvorm; mari + kami is ongrammaticaal."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamar kamu bersih.",
      "transformationInstruction": "Gebruik de verkorte tweede-persoons bezitsvorm.",
      "acceptableAnswers": [
        "Kamarmu bersih."
      ],
      "hintText": "Welk suffix vervangt \"kamu\" achter het zelfstandig naamwoord?",
      "explanationText": "kamar + -mu = kamarmu. Het suffix -mu is de informele afkorting van \"kamu\" als bezittelijk voornaamwoord en wordt direct vastgeplakt aan het zelfstandig naamwoord."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Itu sepeda dia.",
      "transformationInstruction": "Gebruik het bezittelijk suffix voor de derde persoon.",
      "acceptableAnswers": [
        "Itu sepedanya."
      ],
      "hintText": "Welk suffix vervangt \"dia\" achter het zelfstandig naamwoord?",
      "explanationText": "sepeda + -nya = sepedanya. Het suffix -nya vervangt \"dia\" als bezittelijk voornaamwoord en is in spreektaal de meest gebruikelijke vorm voor zijn/haar/hun."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Mijn hoed is nieuw. (informeel, tussen vrienden)",
      "requiredTargetPattern": "possessive-suffix-placement",
      "acceptableAnswers": [
        "Topiku baru."
      ],
      "disallowedShortcutForms": [
        "Topi saya baru."
      ],
      "explanationText": "Tussen vrienden is het suffix -ku natuurlijker dan \"saya\". topi + -ku = topiku. \"Topi saya\" zou grammaticaal correct zijn maar te formeel in een informele context."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Waar is jouw paspoort? (informeel)",
      "requiredTargetPattern": "possessive-suffix-placement",
      "acceptableAnswers": [
        "Paspormu di mana?",
        "Di mana paspormu?"
      ],
      "disallowedShortcutForms": [
        "Paspor kamu di mana?",
        "Di mana paspor kamu?"
      ],
      "explanationText": "In een informele context (tussen vrienden of huisgenoten) is -mu de natuurlijke vorm voor \"jouw\". paspor + -mu = paspormu. \"Paspor kamu\" is grammaticaal maar te omslachtig voor dit register."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Hun kantoor is groot. (gesproken Indonesisch — gebruik geen \"mereka\")",
      "requiredTargetPattern": "possessive-suffix-placement",
      "acceptableAnswers": [
        "Kantornya besar."
      ],
      "disallowedShortcutForms": [
        "Kantor mereka besar."
      ],
      "explanationText": "In gesproken Indonesisch dekt -nya ook \"hun\", niet alleen \"zijn/haar\". kantor + -nya = kantornya. Context maakt duidelijk dat het om meervoud gaat. \"Kantor mereka\" is correct maar minder natuurlijk in alledaagse spreektaal."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Aku mau beli batik di pasar. (informeel)",
      "transformationInstruction": "Maak de zin beleefd-neutraal — je spreekt nu tegen een onbekende verkoper.",
      "acceptableAnswers": [
        "Saya mau beli batik di pasar."
      ],
      "hintText": "Welke \"ik\"-vorm past bij een onbekende volwassene?",
      "explanationText": "Saya is de neutraal-beleefde \"ik\"-vorm en past bij een gesprek met een onbekende. Aku is te informeel en kan brutaal overkomen tegen iemand die je net ontmoet."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamu suka kopi atau teh? (informeel)",
      "transformationInstruction": "Maak de zin beleefd — je spreekt nu een onbekende meneer aan in een hotel.",
      "acceptableAnswers": [
        "Bapak suka kopi atau teh?",
        "Pak suka kopi atau teh?"
      ],
      "hintText": "Welke beleefde aanspreekvorm gebruik je voor een onbekende volwassen man?",
      "explanationText": "Bapak (of de verkorte Pak) is de neutrale beleefde aanspreekvorm voor een volwassen man. Kamu is in deze context ongepast — het signaleert te veel intimiteit met een onbekende."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Meneer, naar welke kamer wilt u? (in een hotel — beleefd)",
      "requiredTargetPattern": "pronoun-register-levels",
      "acceptableAnswers": [
        "Bapak mau ke kamar mana?",
        "Pak mau ke kamar mana?"
      ],
      "disallowedShortcutForms": [
        "Kamu mau ke kamar mana?",
        "Anda mau ke kamar mana?"
      ],
      "explanationText": "Bapak (of Pak) is de standaard beleefde aanspreekvorm voor een volwassen man, vooral in dienstverlenende contexten zoals een hotel. Kamu is te informeel; Anda klinkt afstandelijk en wordt zelden gebruikt door personeel."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Mevrouw, wilt u sate of gado-gado? (in een restaurant — beleefd)",
      "requiredTargetPattern": "pronoun-register-levels",
      "acceptableAnswers": [
        "Ibu mau sate atau gado-gado?",
        "Bu mau sate atau gado-gado?"
      ],
      "disallowedShortcutForms": [
        "Kamu mau sate atau gado-gado?",
        "Anda mau sate atau gado-gado?"
      ],
      "explanationText": "Ibu (of Bu) is de neutraal-beleefde aanspreekvorm voor een volwassen vrouw, gepast voor obers en winkelpersoneel. Kamu is te informeel in dienstverlening; Anda is te afstandelijk."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik wil ook naar de markt gaan. (Titin praat met haar broer Nanang — informeel)",
      "requiredTargetPattern": "pronoun-register-levels",
      "acceptableAnswers": [
        "Aku juga mau ke pasar.",
        "Aku mau ke pasar juga."
      ],
      "disallowedShortcutForms": [
        "Saya juga mau ke pasar.",
        "Saya mau ke pasar juga."
      ],
      "explanationText": "Tussen broer en zus is aku de natuurlijke informele \"ik\"-vorm. Saya zou grammaticaal correct maar onnodig formeel zijn binnen het gezin — het zou afstand creëren waar geen afstand hoort te zijn."
    }
  }
]
