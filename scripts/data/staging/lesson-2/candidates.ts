// Published via script
export const candidates = [
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sentence": "Ibu beli ___ ayam kecil.",
      "translation": "Moeder kocht een kleine kip.",
      "options": [
        "seorang",
        "sebuah",
        "seekor",
        "satuan"
      ],
      "correctOptionId": "seekor",
      "explanationText": "Het classificeerwoord voor dieren is \"ekor\" (staart). Met se-: \"seekor ayam kecil\" = een kleine kip. \"Seorang\" is voor mensen, \"sebuah\" voor voorwerpen."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sentence": "Di jalan ada ___ dokter Belanda.",
      "translation": "Op straat is er een Nederlandse arts.",
      "options": [
        "seekor",
        "sebuah",
        "seorang",
        "sebelas"
      ],
      "correctOptionId": "seorang",
      "explanationText": "Het classificeerwoord voor mensen is \"orang\" (persoon). Met se-: \"seorang dokter\" = een arts. Dokter is een persoon, dus \"seorang\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sentence": "Bapak beli ___ tas baru di toko.",
      "translation": "Vader koopt een nieuwe tas in de winkel.",
      "options": [
        "seorang",
        "seekor",
        "sebuah",
        "sebesar"
      ],
      "correctOptionId": "sebuah",
      "explanationText": "\"Buah\" is het classificeerwoord voor voorwerpen. Met se-: \"sebuah tas\" = een tas. Een tas is een voorwerp, dus \"sebuah\"."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "promptText": "\"een kleine kip\"",
      "targetMeaning": "Classificeerwoord voor dieren",
      "options": [
        {
          "id": "a",
          "text": "seekor ayam kecil"
        },
        {
          "id": "b",
          "text": "sebuah ayam kecil"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Het classificeerwoord voor dieren is \"ekor\". Met se-: \"seekor ayam kecil\". \"Sebuah\" is voor voorwerpen, niet voor dieren."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "promptText": "\"een Nederlander\"",
      "targetMeaning": "Classificeerwoord voor personen",
      "options": [
        {
          "id": "a",
          "text": "sebuah Belanda"
        },
        {
          "id": "b",
          "text": "seorang Belanda"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Het classificeerwoord voor mensen is \"orang\" (mens/persoon). Met se-: \"seorang Belanda\" = een Nederlander."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "promptText": "Welke woordvolgorde is juist: \"twee grote bananen\"?",
      "targetMeaning": "Twee grote bananen (telwoord - classificeerwoord - znw - bijv.nw.)",
      "options": [
        {
          "id": "a",
          "text": "dua buah pisang besar"
        },
        {
          "id": "b",
          "text": "dua pisang besar buah"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "De woordvolgorde is: telwoord - classificeerwoord - znw - bijv.nw. Dus: \"dua buah pisang besar\" = twee grote bananen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Dua orang turis datang.",
      "transformationInstruction": "Verander het telwoord naar \"een\" (gebruik se- + classificeerwoord)",
      "acceptableAnswers": [
        "Seorang turis datang.",
        "Seorang turis datang"
      ],
      "hintText": "Se- + orang = seorang (een persoon). Bij \"een\" vervalt het losse telwoord.",
      "explanationText": "Bij het telwoord \"een\" wordt se- samengevoegd met het classificeerwoord: \"seorang turis\" = een toerist. Het losse telwoord \"satu\" wordt niet gebruikt."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Seekor ayam besar.",
      "transformationInstruction": "Verander naar drie kippen (tiga)",
      "acceptableAnswers": [
        "Tiga ekor ayam besar.",
        "Tiga ekor ayam besar"
      ],
      "hintText": "Bij meerdere dieren: [telwoord] + ekor (zonder se-). Se- betekent \"een\".",
      "explanationText": "Bij telwoorden groter dan een gebruikt men het classificeerwoord zonder se-: \"tiga ekor ayam besar\" = drie grote kippen. Se- is alleen voor \"een\"."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Twee grote bananen.",
      "requiredTargetPattern": "se-classifier",
      "acceptableAnswers": [
        "Dua buah pisang besar.",
        "Dua buah pisang besar"
      ],
      "disallowedShortcutForms": [
        "Dua pisang besar"
      ],
      "explanationText": "Woordvolgorde bij classificeerwoorden: [telwoord] [classificeerwoord] [znw] [bijv.nw.]. \"Buah\" is voor vruchten/voorwerpen: \"dua buah pisang besar\"."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een leraar uit Nederland.",
      "requiredTargetPattern": "se-classifier",
      "acceptableAnswers": [
        "Seorang guru dari Belanda.",
        "Seorang guru dari Belanda",
        "Seorang guru dari negeri Belanda.",
        "Seorang guru dari negeri Belanda"
      ],
      "disallowedShortcutForms": [
        "Satu orang guru dari Belanda"
      ],
      "explanationText": "Bij \"een\" voor personen: se- + orang = seorang. \"Seorang guru dari Belanda\" = een leraar uit Nederland. Niet \"satu orang guru\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sentence": "Taksi ___ baru.",
      "translation": "Deze taxi is nieuw.",
      "options": [
        "ada",
        "itu",
        "ini",
        "yang"
      ],
      "correctOptionId": "ini",
      "explanationText": "\"Ini\" = dit/deze (nabij), staat NA het zelfstandig naamwoord. \"Taksi ini\" = deze taxi. \"Itu\" = die/dat (veraf)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sentence": "Hotel ___ mahal.",
      "translation": "Dat hotel is duur.",
      "options": [
        "ini",
        "ada",
        "itu",
        "tidak"
      ],
      "correctOptionId": "itu",
      "explanationText": "\"Itu\" als aanwijzend voornaamwoord = dat/die (met nadruk). \"Hotel itu mahal\" = dat hotel is duur."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sentence": "Rumah besar ___ mahal.",
      "translation": "Dit grote huis is duur.",
      "options": [
        "itu",
        "yang",
        "ini",
        "ada"
      ],
      "correctOptionId": "ini",
      "explanationText": "Bij znw + bijv.nw. komt ini/itu NA beide: \"Rumah besar ini\" = dit grote huis. Volgorde: znw + bijv.nw. + ini/itu."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "promptText": "\"Dit huis is klein\"",
      "targetMeaning": "Aanwijzend voornaamwoord achter het zelfstandig naamwoord",
      "options": [
        {
          "id": "a",
          "text": "Ini rumah kecil"
        },
        {
          "id": "b",
          "text": "Rumah ini kecil"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Als aanwijzend voornaamwoord staat \"ini\" achter het znw: \"Rumah ini kecil\" = dit huis is klein. \"Ini rumah kecil\" = dit is een klein huis (andere constructie)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "promptText": "\"Dat kleine huis is goedkoop\"",
      "targetMeaning": "Dat kleine huis is goedkoop (itu na znw + bijv.nw.)",
      "options": [
        {
          "id": "a",
          "text": "Rumah kecil itu murah"
        },
        {
          "id": "b",
          "text": "Rumah itu kecil murah"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Bij znw + bijv.nw. komt \"itu\" na beide: \"Rumah kecil itu murah\" = dat kleine huis is goedkoop."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "promptText": "Welke zin betekent \"Deze grote tas is duur\"?",
      "targetMeaning": "Deze grote tas is duur (ini na znw + bijv.nw.)",
      "options": [
        {
          "id": "a",
          "text": "Tas ini besar mahal"
        },
        {
          "id": "b",
          "text": "Tas besar ini mahal"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Het bijv.nw. staat direct na het znw, en ini/itu sluit de woordgroep af: \"Tas besar ini mahal\" = deze grote tas is duur."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Itu bagus.",
      "transformationInstruction": "Verander naar: \"Dat hotel is mooi\" (gebruik itu als aanwijzend voornaamwoord)",
      "acceptableAnswers": [
        "Hotel itu bagus.",
        "Hotel itu bagus"
      ],
      "hintText": "Verplaats \"itu\" van centrale positie naar achter het zelfstandig naamwoord.",
      "explanationText": "Als centraal onderwerp: \"Itu bagus\" (dat is mooi). Als aanwijzend voornaamwoord: \"Hotel itu bagus\" (dat hotel is mooi)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamar ini bagus.",
      "transformationInstruction": "Voeg \"kecil\" (klein) toe als bijvoeglijk naamwoord bij \"kamar\" en behoud \"ini\"",
      "acceptableAnswers": [
        "Kamar kecil ini bagus.",
        "Kamar kecil ini bagus"
      ],
      "hintText": "Het bijv.nw. komt tussen het znw en ini/itu: [znw] [bijv.nw.] ini.",
      "explanationText": "Volgorde: znw + bijv.nw. + ini. \"Kamar kecil ini bagus\" = deze kleine kamer is mooi."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Deze deur is zwaar.",
      "requiredTargetPattern": "ini-itu-demonstrative",
      "acceptableAnswers": [
        "Pintu ini berat.",
        "Pintu ini berat"
      ],
      "disallowedShortcutForms": [
        "Ini pintu berat"
      ],
      "explanationText": "\"Deze\" vertaalt als \"ini\" achter het znw: \"Pintu ini berat\". \"Ini pintu berat\" zou betekenen \"dit is een zware deur\" (andere constructie)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Die vriend is ziek.",
      "requiredTargetPattern": "ini-itu-demonstrative",
      "acceptableAnswers": [
        "Teman itu sakit.",
        "Teman itu sakit"
      ],
      "disallowedShortcutForms": [
        "Itu teman sakit"
      ],
      "explanationText": "\"Die\" = \"itu\" achter het znw: \"Teman itu sakit\" = die vriend is ziek."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sentence": "Jalan ___ bagus.",
      "translation": "De weg is mooi.",
      "options": [
        "ini",
        "ada",
        "itu",
        "yang"
      ],
      "correctOptionId": "itu",
      "explanationText": "\"Itu\" zonder nadruk fungeert als woordgroepmarkeerder, vergelijkbaar met \"de/het\" in het Nederlands. \"Jalan itu\" = de weg."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sentence": "Guru ___ sakit hari ini.",
      "translation": "De leraar is vandaag ziek.",
      "options": [
        "ada",
        "itu",
        "ini",
        "tidak"
      ],
      "correctOptionId": "itu",
      "explanationText": "\"Guru itu\" met \"itu\" als woordgroepmarkeerder = de leraar. Zonder nadruk fungeert \"itu\" als bepaald lidwoord."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sentence": "Kantor ___ besar dan baru.",
      "translation": "Het kantoor is groot en nieuw.",
      "options": [
        "yang",
        "ini",
        "itu",
        "ada"
      ],
      "correctOptionId": "itu",
      "explanationText": "\"Kantor itu\" = het kantoor. \"Itu\" zonder nadruk markeert de woordgroep als bepaald."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "promptText": "Welke zin betekent \"De weg is mooi\" (itu als lidwoord)?",
      "targetMeaning": "De weg is mooi (itu als woordgroepmarkeerder)",
      "options": [
        {
          "id": "a",
          "text": "Jalan itu bagus"
        },
        {
          "id": "b",
          "text": "Itu jalan bagus"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Als woordgroepmarkeerder staat \"itu\" achter het znw: \"Jalan itu bagus\" = de weg is mooi. \"Itu jalan bagus\" = dat is een mooie weg (itu als centraal onderwerp)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "promptText": "Welke zin betekent \"De mevrouw is thuis\"?",
      "targetMeaning": "De mevrouw is thuis (itu als woordgroepmarkeerder)",
      "options": [
        {
          "id": "a",
          "text": "Itu ibu di rumah"
        },
        {
          "id": "b",
          "text": "Ibu itu di rumah"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "\"Ibu itu\" met \"itu\" zonder nadruk = de mevrouw. \"Itu ibu\" zou betekenen \"dat is een mevrouw\"."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "promptText": "\"Dokter itu baik\" — wat is de functie van \"itu\" hier?",
      "targetMeaning": "Woordgroepmarkeerder (de dokter is goed)",
      "options": [
        {
          "id": "a",
          "text": "Aanwijzend voornaamwoord (die dokter)"
        },
        {
          "id": "b",
          "text": "Woordgroepmarkeerder (de dokter)"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Zonder nadruk fungeert \"itu\" als woordgroepmarkeerder: \"Dokter itu baik\" = de dokter is goed. Met nadruk zou het \"die dokter\" betekenen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Hotel besar.",
      "transformationInstruction": "Voeg \"itu\" toe als woordgroepmarkeerder (de/het) en maak een volledige zin: \"Het grote hotel is duur\"",
      "acceptableAnswers": [
        "Hotel besar itu mahal.",
        "Hotel besar itu mahal"
      ],
      "hintText": "\"Itu\" komt na het znw + bijv.nw. en markeert de woordgroep. Voeg dan het gezegde toe.",
      "explanationText": "\"Itu\" zonder nadruk sluit de woordgroep af: \"Hotel besar itu mahal\" = het grote hotel is duur."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Taksi murah.",
      "transformationInstruction": "Maak een volledige zin met \"itu\" als woordgroepmarkeerder: \"De goedkope taxi is nieuw\"",
      "acceptableAnswers": [
        "Taksi murah itu baru.",
        "Taksi murah itu baru"
      ],
      "hintText": "Volgorde: [znw] [bijv.nw.] itu [gezegde].",
      "explanationText": "\"Taksi murah itu baru\" = de goedkope taxi is nieuw. \"Itu\" markeert de woordgroep \"taksi murah\" als bepaald."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De kamer is niet groot.",
      "requiredTargetPattern": "ini-itu-group-marker",
      "acceptableAnswers": [
        "Kamar itu tidak besar.",
        "Kamar itu tidak besar"
      ],
      "disallowedShortcutForms": [
        "Kamar tidak besar"
      ],
      "explanationText": "\"De\" wordt uitgedrukt met \"itu\" als woordgroepmarkeerder: \"Kamar itu tidak besar\" = de kamer is niet groot."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De leraar is ziek.",
      "requiredTargetPattern": "ini-itu-group-marker",
      "acceptableAnswers": [
        "Guru itu sakit.",
        "Guru itu sakit"
      ],
      "disallowedShortcutForms": [
        "Guru sakit"
      ],
      "explanationText": "\"De leraar\" = \"guru itu\" met \"itu\" als woordgroepmarkeerder: \"Guru itu sakit\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sentence": "___ taksi baru.",
      "translation": "Dit is een nieuwe taxi.",
      "options": [
        "Ada",
        "Yang",
        "Ini",
        "Adalah"
      ],
      "correctOptionId": "Ini",
      "explanationText": "\"Ini\" als zelfstandig onderwerp: \"Ini taksi baru\" = dit is een nieuwe taxi. \"Ini\" staat centraal als pronomen."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sentence": "___ rumah besar.",
      "translation": "Dat is een groot huis.",
      "options": [
        "Ini",
        "Itu",
        "Ada",
        "Tidak"
      ],
      "correctOptionId": "Itu",
      "explanationText": "\"Itu\" als zelfstandig onderwerp: \"Itu rumah besar\" = dat is een groot huis."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sentence": "___ bagus.",
      "translation": "Dat is mooi.",
      "options": [
        "Ini",
        "Ada",
        "Itu",
        "Tidak"
      ],
      "correctOptionId": "Itu",
      "explanationText": "\"Itu\" als centraal onderwerp zonder zelfstandig naamwoord: \"Itu bagus\" = dat is mooi."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "promptText": "\"Dat is mooi\"",
      "targetMeaning": "Centraal onderwerp met itu",
      "options": [
        {
          "id": "a",
          "text": "Itu bagus"
        },
        {
          "id": "b",
          "text": "Bagus itu"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "Als \"itu\" zelf het onderwerp is, staat het vooraan: \"Itu bagus\" = dat is mooi. Het onderwerp staat altijd voor het gezegde."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "promptText": "Welke zin betekent \"Dit is een banaan\"?",
      "targetMeaning": "Centraal onderwerp met ini",
      "options": [
        {
          "id": "a",
          "text": "Pisang ini"
        },
        {
          "id": "b",
          "text": "Ini pisang"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "\"Ini pisang\" = dit is een banaan (ini als centraal onderwerp). \"Pisang ini\" = deze banaan (ini als aanwijzend voornaamwoord)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "promptText": "\"Ini istri saya\" versus \"Istri ini\" — wat is het verschil?",
      "targetMeaning": "\"Ini istri saya\" = dit is mijn vrouw; \"Istri ini\" = deze vrouw",
      "options": [
        {
          "id": "a",
          "text": "Ini istri saya = dit is mijn vrouw"
        },
        {
          "id": "b",
          "text": "Ini istri saya = deze vrouw van mij"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "\"Ini\" vooraan als centraal onderwerp: \"Ini istri saya\" = dit is mijn vrouw. Als ini achter het znw staat: \"Istri ini\" = deze vrouw."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Rumah ini baru.",
      "transformationInstruction": "Verander naar: \"Dit is een nieuw huis\" (ini als zelfstandig onderwerp)",
      "acceptableAnswers": [
        "Ini rumah baru.",
        "Ini rumah baru"
      ],
      "hintText": "Verplaats \"ini\" naar het begin van de zin als zelfstandig onderwerp.",
      "explanationText": "\"Rumah ini baru\" = dit huis is nieuw (ini achter znw). \"Ini rumah baru\" = dit is een nieuw huis (ini als centraal onderwerp)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Taksi itu murah.",
      "transformationInstruction": "Verander naar: \"Dat is een goedkope taxi\" (itu als centraal onderwerp)",
      "acceptableAnswers": [
        "Itu taksi murah.",
        "Itu taksi murah"
      ],
      "hintText": "Verplaats \"itu\" naar het begin als zelfstandig onderwerp.",
      "explanationText": "\"Taksi itu murah\" = die taxi is goedkoop. \"Itu taksi murah\" = dat is een goedkope taxi. Verschil: positie van itu bepaalt de functie."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dit is een banaan.",
      "requiredTargetPattern": "ini-itu-central",
      "acceptableAnswers": [
        "Ini pisang.",
        "Ini pisang"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "\"Ini\" als zelfstandig onderwerp: \"Ini pisang\" = dit is een banaan. Geen lidwoord nodig in het Indonesisch."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat is goed nieuws.",
      "requiredTargetPattern": "ini-itu-central",
      "acceptableAnswers": [
        "Itu kabar baik.",
        "Itu kabar baik"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "\"Itu\" als centraal onderwerp: \"Itu kabar baik\" = dat is goed nieuws. Let op: \"baik\" (bijv.nw.) staat na \"kabar\" (znw)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sentence": "Taksi ini ___ baru.",
      "translation": "Deze taxi is niet nieuw.",
      "options": [
        "belum",
        "bukan",
        "tidak",
        "jangan"
      ],
      "correctOptionId": "tidak",
      "explanationText": "\"Tidak\" ontkent bijvoeglijke naamwoorden en werkwoorden: \"tidak baru\" = niet nieuw. \"Bukan\" ontkent zelfstandige naamwoorden."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sentence": "Saya ___ makan pisang.",
      "translation": "Ik eet geen banaan.",
      "options": [
        "bukan",
        "tidak",
        "belum",
        "ada"
      ],
      "correctOptionId": "tidak",
      "explanationText": "\"Tidak\" voor het werkwoord \"makan\": \"Saya tidak makan pisang\". Het Nederlandse \"geen\" wordt uitgedrukt als \"tidak\" + werkwoord."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sentence": "Orang itu ___ sakit.",
      "translation": "Die persoon is niet ziek.",
      "options": [
        "tidak",
        "bukan",
        "ada",
        "sudah"
      ],
      "correctOptionId": "tidak",
      "explanationText": "\"Tidak\" voor het bijv.nw. \"sakit\": \"Orang itu tidak sakit\" = die persoon is niet ziek."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "promptText": "\"Deze taxi is niet nieuw\"",
      "targetMeaning": "Deze taxi is niet nieuw (ontkenning met tidak)",
      "options": [
        {
          "id": "a",
          "text": "Taksi ini tidak baru"
        },
        {
          "id": "b",
          "text": "Taksi ini baru tidak"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "\"Tidak\" staat altijd VOOR het woord dat ontkend wordt: \"Taksi ini tidak baru\". De ontkenning komt nooit na het bijv.nw."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "promptText": "\"Hasan verblijft niet in het hotel\"",
      "targetMeaning": "Hasan verblijft niet in het hotel (tidak voor het werkwoord)",
      "options": [
        {
          "id": "a",
          "text": "Hasan tinggal tidak di hotel"
        },
        {
          "id": "b",
          "text": "Hasan tidak tinggal di hotel"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "\"Tidak\" staat direct voor het werkwoord: \"Hasan tidak tinggal di hotel\". Niet na het werkwoord."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "promptText": "Hoe vertaal je \"Ik wil niet overnachten\"?",
      "targetMeaning": "Ik wil niet overnachten (tidak voor mau)",
      "options": [
        {
          "id": "a",
          "text": "Saya tidak mau menginap"
        },
        {
          "id": "b",
          "text": "Saya mau tidak menginap"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "\"Tidak\" voor het eerste werkwoord in de reeks: \"Saya tidak mau menginap\" = ik wil niet overnachten."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kamar ini baik.",
      "transformationInstruction": "Maak de zin ontkennend (niet)",
      "acceptableAnswers": [
        "Kamar ini tidak baik.",
        "Kamar ini tidak baik"
      ],
      "hintText": "Plaats \"tidak\" voor het woord dat ontkend wordt.",
      "explanationText": "\"Tidak\" direct voor het bijv.nw.: \"Kamar ini tidak baik\" = deze kamer is niet goed."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Hasan tinggal di hotel.",
      "transformationInstruction": "Maak de zin ontkennend (niet)",
      "acceptableAnswers": [
        "Hasan tidak tinggal di hotel.",
        "Hasan tidak tinggal di hotel"
      ],
      "hintText": "Plaats \"tidak\" voor het werkwoord.",
      "explanationText": "\"Tidak\" voor het werkwoord: \"Hasan tidak tinggal di hotel\" = Hasan verblijft niet in het hotel."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Die persoon is niet ziek.",
      "requiredTargetPattern": "tidak-negation",
      "acceptableAnswers": [
        "Orang itu tidak sakit.",
        "Orang itu tidak sakit"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "\"Tidak\" voor \"sakit\": \"Orang itu tidak sakit\". \"Itu\" is hier aanwijzend voornaamwoord (die), \"tidak\" ontkent het bijv.nw."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik eet geen banaan.",
      "requiredTargetPattern": "tidak-negation",
      "acceptableAnswers": [
        "Saya tidak makan pisang.",
        "Saya tidak makan pisang"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "\"Tidak\" voor het werkwoord \"makan\": \"Saya tidak makan pisang\". \"Geen\" in het Nederlands wordt \"tidak\" + werkwoord in het Indonesisch."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sentence": "Saya mau beli ___.",
      "translation": "Ik wil een groot huis kopen.",
      "options": [
        "besar rumah",
        "rumah yang besar",
        "rumah besar",
        "besar-rumah"
      ],
      "correctOptionId": "rumah besar",
      "explanationText": "In het Indonesisch staat het bijv.nw. NA het znw: \"rumah besar\" (huis groot). Omgekeerd aan het Nederlands \"groot huis\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sentence": "___ ini murah.",
      "translation": "Deze kleine tas is goedkoop.",
      "options": [
        "kecil tas",
        "tas kecil",
        "tas yang kecil",
        "kecil-tas"
      ],
      "correctOptionId": "tas kecil",
      "explanationText": "Het bijv.nw. \"kecil\" (klein) staat achter het znw \"tas\": \"tas kecil ini murah\" = deze kleine tas is goedkoop."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sentence": "Di sana ada jalan ___.",
      "translation": "Daar is een lange weg.",
      "options": [
        "panjang",
        "besar panjang",
        "yang lang",
        "lang"
      ],
      "correctOptionId": "panjang",
      "explanationText": "Het bijv.nw. komt direct na het znw: \"jalan panjang\" = lange weg. Geen tussenvoegsel nodig."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "promptText": "\"een grote tas\"",
      "targetMeaning": "Een grote tas (bijv.nw. na znw)",
      "options": [
        {
          "id": "a",
          "text": "besar tas"
        },
        {
          "id": "b",
          "text": "tas besar"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "In het Indonesisch staat het bijv.nw. ACHTER het znw: \"tas besar\" = grote tas. Omgekeerd aan het Nederlands."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "promptText": "Welke woordvolgorde is juist voor \"dure kamer\"?",
      "targetMeaning": "Dure kamer (bijv.nw. na znw)",
      "options": [
        {
          "id": "a",
          "text": "mahal kamar"
        },
        {
          "id": "b",
          "text": "kamar mahal"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Het bijv.nw. \"mahal\" (duur) staat achter het znw \"kamar\": \"kamar mahal\" = dure kamer."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "promptText": "Welke zin betekent \"Deze twee toeristen zijn rijk\"?",
      "targetMeaning": "Deze twee toeristen zijn rijk (bijv.nw. als gezegde)",
      "options": [
        {
          "id": "a",
          "text": "Dua orang turis ini kaya"
        },
        {
          "id": "b",
          "text": "Dua orang kaya turis ini"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "\"Kaya\" (rijk) is hier het gezegde, niet een bijvoeglijke bepaling. Volgorde: [telwoord] [classif.] [znw] [aanw.vnw.] [gezegde]."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Rumah itu mahal.",
      "transformationInstruction": "Voeg \"besar\" (groot) toe als bijvoeglijk naamwoord bij \"rumah\"",
      "acceptableAnswers": [
        "Rumah besar itu mahal.",
        "Rumah besar itu mahal"
      ],
      "hintText": "Het bijv.nw. staat direct na het znw, voor \"itu\".",
      "explanationText": "Het bijv.nw. komt direct na het znw en voor itu: \"Rumah besar itu mahal\" = dat grote huis is duur."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Pintu ini berat.",
      "transformationInstruction": "Verander \"berat\" (zwaar) naar \"kecil\" (klein)",
      "acceptableAnswers": [
        "Pintu ini kecil.",
        "Pintu ini kecil"
      ],
      "hintText": "Vervang het bijv.nw. op dezelfde positie (na het znw).",
      "explanationText": "Het bijv.nw. wisselen op dezelfde positie: \"Pintu ini kecil\" = deze deur is klein."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Deze twee toeristen zijn rijk.",
      "requiredTargetPattern": "adjective-after-noun",
      "acceptableAnswers": [
        "Dua orang turis ini kaya.",
        "Dua orang turis ini kaya"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Volledige woordgroep: [telwoord] [classif.] [znw] [aanw.vnw.] [gezegde]. \"Dua orang turis ini kaya\" = deze twee toeristen zijn rijk."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een mooie kamer.",
      "requiredTargetPattern": "adjective-after-noun",
      "acceptableAnswers": [
        "Kamar bagus.",
        "Kamar bagus",
        "Sebuah kamar bagus.",
        "Sebuah kamar bagus"
      ],
      "disallowedShortcutForms": [
        "Bagus kamar"
      ],
      "explanationText": "Het bijv.nw. staat achter het znw: \"kamar bagus\" = mooie kamer. Nederlands \"mooie kamer\" wordt Indonesisch \"kamar bagus\"."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sentence": "Hotel saya di Jalan Sinta nomor ___.",
      "translation": "Mijn hotel is op Sintastraat nummer elf.",
      "options": [
        "satu belas",
        "sebelas",
        "satubelas",
        "se belas"
      ],
      "correctOptionId": "sebelas",
      "explanationText": "\"Sebelas\" = 11. Bij de tieners vervangt \"se-\" het woord \"satu\". Dus: sebelas (niet satu belas)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sentence": "Ada ___ kamar di hotel itu.",
      "translation": "Er zijn vijftien kamers in dat hotel.",
      "options": [
        "lima puluh",
        "lima belas",
        "sebelas lima",
        "limabelas"
      ],
      "correctOptionId": "lima belas",
      "explanationText": "15 = \"lima belas\". Het patroon voor 12-19: [eenheid] + belas. \"Puluh\" is voor tientallen (20, 30, enz.)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sentence": "Di sana ada ___ taksi.",
      "translation": "Daar zijn twintig taxi's.",
      "options": [
        "dua belas",
        "dua puluh",
        "duapuluh",
        "belas dua"
      ],
      "correctOptionId": "dua puluh",
      "explanationText": "20 = \"dua puluh\". \"Puluh\" = tiental. \"Dua belas\" zou 12 zijn. Let op het verschil: belas (tiener) vs puluh (tiental)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "promptText": "hoe schrijf je 11 in het Indonesisch?",
      "targetMeaning": "Elf (11) -- se- vervangt satu bij belas",
      "options": [
        {
          "id": "a",
          "text": "satu belas"
        },
        {
          "id": "b",
          "text": "sebelas"
        }
      ],
      "correctOptionId": "b",
      "explanationText": "Bij 11 vervangt \"se-\" het woord \"satu\": sebelas (niet satu belas). Vanaf 12 gebruik je het losse telwoord: dua belas, tiga belas."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "promptText": "Wat is het verschil tussen \"dua belas\" en \"dua puluh\"?",
      "targetMeaning": "dua belas = 12, dua puluh = 20",
      "options": [
        {
          "id": "a",
          "text": "dua belas = 12, dua puluh = 20"
        },
        {
          "id": "b",
          "text": "dua belas = 20, dua puluh = 12"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "\"Belas\" = tiener (11-19), \"puluh\" = tiental (10, 20, 30...). \"Dua belas\" = 12, \"dua puluh\" = 20."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "promptText": "Hoe zeg je 18 in het Indonesisch?",
      "targetMeaning": "Achttien = delapan belas",
      "options": [
        {
          "id": "a",
          "text": "delapan belas"
        },
        {
          "id": "b",
          "text": "delapan puluh"
        }
      ],
      "correctOptionId": "a",
      "explanationText": "18 = \"delapan belas\" (tiener). \"Delapan puluh\" zou 80 zijn (tiental)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ada dua belas kamar.",
      "transformationInstruction": "Verander het getal van 12 naar 15",
      "acceptableAnswers": [
        "Ada lima belas kamar.",
        "Ada lima belas kamar"
      ],
      "hintText": "Lima = vijf. Getallen 12-19: [eenheid] + belas.",
      "explanationText": "15 = \"lima belas\". Het patroon: dua belas (12), tiga belas (13), empat belas (14), lima belas (15)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Di sana ada tiga belas taksi.",
      "transformationInstruction": "Verander het getal van 13 naar 11",
      "acceptableAnswers": [
        "Di sana ada sebelas taksi.",
        "Di sana ada sebelas taksi"
      ],
      "hintText": "Let op: 11 = sebelas (niet satu belas). Se- vervangt satu.",
      "explanationText": "11 = \"sebelas\". Uitzondering: bij 11 vervangt se- het woord satu. \"Di sana ada sebelas taksi\" = daar zijn elf taxi's."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Daar zijn elf taxi's.",
      "requiredTargetPattern": "belas-numbers",
      "acceptableAnswers": [
        "Di sana ada sebelas taksi.",
        "Di sana ada sebelas taksi"
      ],
      "disallowedShortcutForms": [
        "Di sana ada satu belas taksi"
      ],
      "explanationText": "11 = \"sebelas\" (niet \"satu belas\"). Se- vervangt \"satu\" bij belas."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Er zijn zeventien toeristen in het hotel.",
      "requiredTargetPattern": "belas-numbers",
      "acceptableAnswers": [
        "Ada tujuh belas turis di hotel.",
        "Ada tujuh belas turis di hotel",
        "Ada tujuh belas orang turis di hotel.",
        "Ada tujuh belas orang turis di hotel"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "17 = \"tujuh belas\". \"Ada tujuh belas turis di hotel\" = er zijn zeventien toeristen in het hotel."
    }
  }
]
