// Published via script
export const candidates = [
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "kami-vs-kita",
    "source_page": 3,
    "review_status": "published",
    "payload": {
      "promptText": "Titin zegt tegen Nanang: \"Wij moeten thuis studeren.\" Welk woord kiest Titin?",
      "targetMeaning": "Kita — Nanang is inbegrepen in \"wij\"",
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
    "source_page": 3,
    "review_status": "published",
    "payload": {
      "promptText": "Titin zegt tegen de pembantu: \"Wij willen naar buiten.\" De pembantu gaat niet mee. Welk woord kiest Titin?",
      "targetMeaning": "Kami — de pembantu is NIET inbegrepen in \"wij\"",
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
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "kami-vs-kita",
    "source_page": 3,
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
    "source_page": 3,
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
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "kami-vs-kita",
    "source_page": 3,
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
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "source_page": 6,
    "review_status": "published",
    "payload": {
      "promptText": "Hoe zeg je \"mijn boek\" in het Indonesisch?",
      "targetMeaning": "bezittelijk voornaamwoord staat ACHTER het zelfstandig naamwoord",
      "options": [
        {
          "id": "a",
          "text": "buku saya"
        },
        {
          "id": "b",
          "text": "saya buku"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "In het Indonesisch staat het bezittelijk voornaamwoord altijd ACHTER het zelfstandig naamwoord: [znw] + [bez. vnw.]. \"Saya buku\" is geen correcte Indonesische woordvolgorde."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "source_page": 6,
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
    "source_page": 6,
    "review_status": "published",
    "payload": {
      "sentence": "___ rusak. (jouw auto — informele afkorting)",
      "translation": "Jouw auto is kapot.",
      "options": [
        "Mobilmu",
        "Kamu mobil",
        "Mobil kamu mu",
        "Mumu mobil"
      ],
      "correctOptionId": "Mobilmu",
      "explanationText": "-mu is de informele afkorting van \"kamu\" als bezittelijk suffix: mobil + -mu = mobilmu."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "source_page": 6,
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
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "possessive-suffix-placement",
    "source_page": 6,
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
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "pronoun-register-levels",
    "source_page": 4,
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
    "source_page": 4,
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
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "pronoun-register-levels",
    "source_page": 4,
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
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "kami-vs-kita",
    "source_page": 3,
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
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "source_page": 4,
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamu mau makan apa? (informeel)",
      "transformationInstruction": "Maak de zin beleefd — gebruik de neutrale aanspreekvorm voor een volwassen vrouw.",
      "acceptableAnswers": [
        "Ibu mau makan apa?"
      ],
      "hintText": "Welke beleefde aanspreekvorm gebruik je voor een vrouw?",
      "explanationText": "Ibu is de neutrale, beleefde aanspreekvorm voor een volwassen vrouw. Kamu is te informeel in een beleefde context."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "pronoun-register-levels",
    "source_page": 4,
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
  }
]
