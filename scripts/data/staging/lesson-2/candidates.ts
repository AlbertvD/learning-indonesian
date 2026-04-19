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
        "Ini",
        "Itu",
        "Yang",
        "Bukan"
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
        "besar",
        "mahal",
        "bagus"
      ],
      "correctOptionId": "panjang",
      "explanationText": "Het bijv.nw. komt direct na het znw: \"jalan panjang\" = lange weg. Geen tussenvoegsel nodig. \"besar\", \"mahal\" en \"bagus\" zijn ook bijv.nw. die na een znw kunnen, maar de Nederlandse vertaling vereist \"lang\" = panjang."
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
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Tiga orang anak datang.",
      "transformationInstruction": "Verander het telwoord van drie naar een (gebruik se- + classificeerwoord)",
      "acceptableAnswers": [
        "Seorang anak datang.",
        "Seorang anak datang"
      ],
      "hintText": "Bij \"een\" voor mensen smelt se- met orang samen.",
      "explanationText": "Bij telwoord \"een\" wordt se- vastgehecht aan het classificeerwoord: \"seorang anak\" = een kind. Het losse \"satu orang\" vervalt; \"satu\" verschijnt nooit naast het classificeerwoord."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Lima ekor kambing kecil.",
      "transformationInstruction": "Verander het telwoord van vijf naar een (gebruik se- + classificeerwoord)",
      "acceptableAnswers": [
        "Seekor kambing kecil.",
        "Seekor kambing kecil"
      ],
      "hintText": "Voor dieren is het classificeerwoord ekor; bij \"een\" smelt se- daarmee samen.",
      "explanationText": "Voor dieren is het classificeerwoord \"ekor\" (letterlijk staart). Bij telwoord \"een\" wordt het se-ekor = seekor. Volgorde blijft [classif.] [znw] [bijv.nw.]."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een nieuwe koffer.",
      "requiredTargetPattern": "se-classifier",
      "acceptableAnswers": [
        "Sebuah koper baru.",
        "Sebuah koper baru"
      ],
      "disallowedShortcutForms": [
        "Satu koper baru",
        "Satu buah koper baru"
      ],
      "explanationText": "\"Een\" voor een voorwerp wordt se- + buah = sebuah. Een koffer is een voorwerp, dus \"sebuah koper baru\". Niet \"satu koper\" of \"satu buah koper\"."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een vogel zit in de boom.",
      "requiredTargetPattern": "se-classifier",
      "acceptableAnswers": [
        "Seekor burung di pohon.",
        "Seekor burung di pohon",
        "Seekor burung ada di pohon.",
        "Seekor burung ada di pohon"
      ],
      "disallowedShortcutForms": [
        "Satu burung di pohon"
      ],
      "explanationText": "Een vogel is een dier, dus het classificeerwoord is \"ekor\". Bij \"een\" smelt se- ermee samen: \"seekor burung\". \"Satu burung\" zonder classificeerwoord komt natuurlijke spraak nauwelijks voor."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "se-classifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een Japanse chauffeur.",
      "requiredTargetPattern": "se-classifier",
      "acceptableAnswers": [
        "Seorang sopir Jepang.",
        "Seorang sopir Jepang"
      ],
      "disallowedShortcutForms": [
        "Satu sopir Jepang",
        "Satu orang sopir Jepang"
      ],
      "explanationText": "Een chauffeur is een persoon, dus het classificeerwoord is \"orang\". Bij \"een\" smelt se- ermee samen: \"seorang sopir\". Het herkomstwoord \"Jepang\" volgt het znw als bepaling."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Koper itu berat.",
      "transformationInstruction": "Voeg het bijvoeglijk naamwoord \"besar\" (groot) toe binnen de woordgroep en behoud \"itu\"",
      "acceptableAnswers": [
        "Koper besar itu berat.",
        "Koper besar itu berat"
      ],
      "hintText": "Volgorde binnen de woordgroep: znw + bijv.nw. + ini/itu.",
      "explanationText": "Het bijv.nw. zit in de woordgroep, voor de aanwijzer: \"Koper besar itu berat\" = die grote koffer is zwaar. \"Itu\" sluit de woordgroep af, gevolgd door het gezegde."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Sepeda ini rusak.",
      "transformationInstruction": "Voeg het bijvoeglijk naamwoord \"merah\" (rood) toe binnen de woordgroep en behoud \"ini\"",
      "acceptableAnswers": [
        "Sepeda merah ini rusak.",
        "Sepeda merah ini rusak"
      ],
      "hintText": "Volgorde: znw + bijv.nw. + ini, dan het gezegde.",
      "explanationText": "Een kleur als bijv.nw. zit in dezelfde woordgroep als de aanwijzer: \"Sepeda merah ini\" = deze rode fiets. \"Ini\" markeert het einde van de woordgroep; het gezegde \"rusak\" volgt buiten de groep."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Deze sleutel is klein.",
      "requiredTargetPattern": "ini-itu-demonstrative",
      "acceptableAnswers": [
        "Kunci ini kecil.",
        "Kunci ini kecil"
      ],
      "disallowedShortcutForms": [
        "Ini kunci kecil"
      ],
      "explanationText": "\"Deze\" als aanwijzing bij een specifieke sleutel: \"ini\" achter het znw. \"Kunci ini kecil\" = deze sleutel is klein. \"Ini kunci kecil\" zou betekenen \"dit is een kleine sleutel\" (centraal onderwerp)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat kind is moe.",
      "requiredTargetPattern": "ini-itu-demonstrative",
      "acceptableAnswers": [
        "Anak itu capek.",
        "Anak itu capek"
      ],
      "disallowedShortcutForms": [
        "Itu anak capek"
      ],
      "explanationText": "\"Dat\" als aanwijzer bij een bepaald kind: \"itu\" achter het znw. \"Anak itu capek\" = dat kind is moe. \"Itu anak capek\" zou een centrale presentatie zijn (\"dat is een moe kind\")."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-demonstrative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Die gele stoel is nieuw.",
      "requiredTargetPattern": "ini-itu-demonstrative",
      "acceptableAnswers": [
        "Kursi kuning itu baru.",
        "Kursi kuning itu baru"
      ],
      "disallowedShortcutForms": [
        "Kursi itu kuning baru"
      ],
      "explanationText": "Het bijv.nw. zit binnen de woordgroep, voor de aanwijzer: [znw] [bijv.nw.] itu = \"kursi kuning itu\" (die gele stoel). Daarna komt het gezegde \"baru\" buiten de woordgroep."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Mobil baru.",
      "transformationInstruction": "Maak een volledige zin waarin de woordgroep met \"itu\" wordt afgesloten (de/het) en eindig op \"mahal\"",
      "acceptableAnswers": [
        "Mobil baru itu mahal.",
        "Mobil baru itu mahal"
      ],
      "hintText": "Volgorde: [znw] [bijv.nw.] itu [gezegde].",
      "explanationText": "Zonder nadruk fungeert \"itu\" als woordgroepmarkeerder, vergelijkbaar met \"de\" in het Nederlands: \"Mobil baru itu mahal\" = de nieuwe auto is duur. \"Itu\" sluit de groep, daarna komt het gezegde."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Pasar besar.",
      "transformationInstruction": "Maak een volledige zin waarin de woordgroep met \"itu\" wordt afgesloten en eindig op \"jauh\"",
      "acceptableAnswers": [
        "Pasar besar itu jauh.",
        "Pasar besar itu jauh"
      ],
      "hintText": "\"Itu\" zonder nadruk = de/het. Volgorde: znw + bijv.nw. + itu + gezegde.",
      "explanationText": "\"Itu\" als woordgroepmarkeerder bakent de bepaalde groep af: \"Pasar besar itu jauh\" = de grote markt is ver. Zonder \"itu\" zou de groep onbepaald blijven."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Het kind eet rijst.",
      "requiredTargetPattern": "ini-itu-group-marker",
      "acceptableAnswers": [
        "Anak itu makan nasi.",
        "Anak itu makan nasi"
      ],
      "disallowedShortcutForms": [
        "Anak makan nasi"
      ],
      "explanationText": "\"Het\" wijst op een specifiek kind in de context: \"itu\" zonder nadruk markeert dat als bepaald. Zonder \"itu\" wordt het algemeen (\"een kind / kinderen eten rijst\")."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De koffer is zwaar.",
      "requiredTargetPattern": "ini-itu-group-marker",
      "acceptableAnswers": [
        "Koper itu berat.",
        "Koper itu berat"
      ],
      "disallowedShortcutForms": [
        "Koper berat"
      ],
      "explanationText": "Bepaalde lidwoord \"de\" wordt vertaald als \"itu\" achter het znw, zonder nadruk. \"Koper itu berat\" = de koffer is zwaar. Zonder \"itu\" wordt het generiek."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-group-marker",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Het restaurant is dichtbij.",
      "requiredTargetPattern": "ini-itu-group-marker",
      "acceptableAnswers": [
        "Restoran itu dekat.",
        "Restoran itu dekat"
      ],
      "disallowedShortcutForms": [
        "Restoran dekat"
      ],
      "explanationText": "\"Het\" als bepaald lidwoord = \"itu\" zonder nadruk achter het znw. \"Restoran itu dekat\" verwijst naar een eerder genoemd specifiek restaurant. Zonder \"itu\" zou het een algemene uitspraak zijn."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kemeja itu murah.",
      "transformationInstruction": "Verander naar een presentatieve zin: \"Dat is een goedkoop hemd\" (aanwijzer als zelfstandig onderwerp)",
      "acceptableAnswers": [
        "Itu kemeja murah.",
        "Itu kemeja murah"
      ],
      "hintText": "Verplaats de aanwijzer naar het begin als zelfstandig onderwerp.",
      "explanationText": "Vooraan fungeert \"itu\" als zelfstandig onderwerp (presentatief): \"Itu kemeja murah\" = dat is een goedkoop hemd. Achter het znw zou \"kemeja itu murah\" betekenen \"dat hemd is goedkoop\"."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Anak ini sakit.",
      "transformationInstruction": "Verander naar een presentatieve zin: \"Dit is een ziek kind\" (aanwijzer als zelfstandig onderwerp)",
      "acceptableAnswers": [
        "Ini anak sakit.",
        "Ini anak sakit"
      ],
      "hintText": "Verplaats de aanwijzer naar het begin van de zin.",
      "explanationText": "Vooraan is \"ini\" zelf het onderwerp en presenteert: \"Ini anak sakit\" = dit is een ziek kind. Achter het znw is \"ini\" een aanwijzing bij het kind: \"Anak ini sakit\" = dit kind is ziek."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dit is een sleutel.",
      "requiredTargetPattern": "ini-itu-central",
      "acceptableAnswers": [
        "Ini kunci.",
        "Ini kunci"
      ],
      "disallowedShortcutForms": [
        "Kunci ini"
      ],
      "explanationText": "Presentatief: \"ini\" is zelf het onderwerp en staat vooraan, daarna het gepresenteerde znw. Geen lidwoord nodig in het Indonesisch. \"Kunci ini\" zou betekenen \"deze sleutel\" (aanwijzing)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat is mijn vader.",
      "requiredTargetPattern": "ini-itu-central",
      "acceptableAnswers": [
        "Itu bapak saya.",
        "Itu bapak saya",
        "Itu ayah saya.",
        "Itu ayah saya"
      ],
      "disallowedShortcutForms": [
        "Bapak saya itu"
      ],
      "explanationText": "Presentatieve zin: \"itu\" vooraan als zelfstandig onderwerp, gevolgd door het gepresenteerde znw met bezitter. \"Bapak saya itu\" zou een aanwijzing zijn (die vader van mij)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ini-itu-central",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dit is een glas water.",
      "requiredTargetPattern": "ini-itu-central",
      "acceptableAnswers": [
        "Ini segelas air.",
        "Ini segelas air",
        "Ini segelas air putih.",
        "Ini segelas air putih"
      ],
      "disallowedShortcutForms": [
        "Segelas air ini"
      ],
      "explanationText": "Presentatief met \"ini\" vooraan: \"Ini segelas air\" = dit is een glas water. Het classificeerwoord \"gelas\" smelt met se- tot \"segelas\" (een glas). \"Segelas air ini\" zou \"dit glas water\" betekenen."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kopi ini dingin.",
      "transformationInstruction": "Maak de zin ontkennend (niet)",
      "acceptableAnswers": [
        "Kopi ini tidak dingin.",
        "Kopi ini tidak dingin"
      ],
      "hintText": "Plaats het negatiewoord direct voor het bijv.nw.",
      "explanationText": "\"Tidak\" ontkent bijvoeglijke naamwoorden en staat altijd direct voor het ontkende woord: \"Kopi ini tidak dingin\" = deze koffie is niet koud. \"Bukan\" past hier niet, want dat is voor zelfstandige naamwoorden."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Anak itu suka pisang.",
      "transformationInstruction": "Maak de zin ontkennend (niet/houdt niet van)",
      "acceptableAnswers": [
        "Anak itu tidak suka pisang.",
        "Anak itu tidak suka pisang"
      ],
      "hintText": "Plaats het negatiewoord direct voor het werkwoord.",
      "explanationText": "\"Tidak\" ontkent werkwoorden door direct ervoor te staan: \"Anak itu tidak suka pisang\" = dat kind houdt niet van bananen. \"Bukan\" zou hier fout zijn (geen znw-ontkenning)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Het kind houdt niet van rijst.",
      "requiredTargetPattern": "tidak-negation",
      "acceptableAnswers": [
        "Anak itu tidak suka nasi.",
        "Anak itu tidak suka nasi"
      ],
      "disallowedShortcutForms": [
        "Anak itu bukan suka nasi"
      ],
      "explanationText": "Werkwoorden zoals \"suka\" worden ontkend met \"tidak\", niet met \"bukan\". \"Bukan\" reserveer je voor de ontkenning van zelfstandige naamwoorden (\"bukan nasi\" = geen rijst)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "De koffer is niet groot.",
      "requiredTargetPattern": "tidak-negation",
      "acceptableAnswers": [
        "Koper itu tidak besar.",
        "Koper itu tidak besar"
      ],
      "disallowedShortcutForms": [
        "Koper itu bukan besar"
      ],
      "explanationText": "Bijvoeglijke naamwoorden zoals \"besar\" worden ontkend met \"tidak\", niet met \"bukan\". \"Itu\" markeert hier de bepaalde woordgroep (de koffer); \"tidak\" ontkent het gezegde."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "tidak-negation",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik kom vandaag niet.",
      "requiredTargetPattern": "tidak-negation",
      "acceptableAnswers": [
        "Saya tidak datang hari ini.",
        "Saya tidak datang hari ini",
        "Hari ini saya tidak datang.",
        "Hari ini saya tidak datang"
      ],
      "disallowedShortcutForms": [
        "Saya bukan datang hari ini"
      ],
      "explanationText": "\"Tidak\" staat direct voor het werkwoord \"datang\". De tijdsbepaling \"hari ini\" kan voor of achter het zinsdeel staan. \"Bukan\" is hier ongeschikt omdat het een werkwoord ontkent."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Anak ini baik.",
      "transformationInstruction": "Voeg \"kecil\" (klein) toe als bijvoeglijk naamwoord bij \"anak\" en behoud de betekenis \"is goed\"",
      "acceptableAnswers": [
        "Anak kecil ini baik.",
        "Anak kecil ini baik"
      ],
      "hintText": "Het bijv.nw. binnen de woordgroep komt direct na het znw, voor de aanwijzer.",
      "explanationText": "Binnen een naamwoordgroep staat het bijv.nw. ACHTER het znw: anak kecil = klein kind. De aanwijzer \"ini\" sluit de groep af; daarna volgt het gezegde \"baik\". Volgorde: [znw] [bijv.nw.] [aanw.vnw.] [gezegde]."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Kemeja itu murah.",
      "transformationInstruction": "Verander \"murah\" (goedkoop) naar \"bersih\" (schoon) op dezelfde plek",
      "acceptableAnswers": [
        "Kemeja itu bersih.",
        "Kemeja itu bersih"
      ],
      "hintText": "Vervang het bijv.nw. op dezelfde positie; de woordvolgorde verandert niet.",
      "explanationText": "Het bijv.nw. blijft op dezelfde positie staan: \"Kemeja itu bersih\" = dat hemd is schoon. In het Indonesisch staat het bijv.nw. dat dient als gezegde achter de naamwoordgroep met aanwijzer."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een kleine sleutel.",
      "requiredTargetPattern": "adjective-after-noun",
      "acceptableAnswers": [
        "Kunci kecil.",
        "Kunci kecil",
        "Sebuah kunci kecil.",
        "Sebuah kunci kecil"
      ],
      "disallowedShortcutForms": [
        "Kecil kunci"
      ],
      "explanationText": "Het bijv.nw. \"kecil\" volgt het znw \"kunci\". Omgekeerd aan het Nederlands. Eventueel met classificeerwoord (\"sebuah kunci kecil\"), maar de bijv.nw.-positie is altijd na het znw."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Het schone hemd.",
      "requiredTargetPattern": "adjective-after-noun",
      "acceptableAnswers": [
        "Kemeja bersih.",
        "Kemeja bersih",
        "Kemeja bersih itu.",
        "Kemeja bersih itu"
      ],
      "disallowedShortcutForms": [
        "Bersih kemeja"
      ],
      "explanationText": "Het bijv.nw. staat achter het znw: \"kemeja bersih\". Het bepaalde lidwoord \"het\" kan optioneel uitgedrukt worden met \"itu\" achter het bijv.nw.: \"kemeja bersih itu\". De volgorde znw + bijv.nw. blijft."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "adjective-after-noun",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Een witte stoel en een gele tafel.",
      "requiredTargetPattern": "adjective-after-noun",
      "acceptableAnswers": [
        "Kursi putih dan meja kuning.",
        "Kursi putih dan meja kuning",
        "Sebuah kursi putih dan sebuah meja kuning.",
        "Sebuah kursi putih dan sebuah meja kuning"
      ],
      "disallowedShortcutForms": [
        "Putih kursi dan kuning meja"
      ],
      "explanationText": "Beide bijv.nw. (kleurnamen) volgen hun znw: \"kursi putih\", \"meja kuning\". De voegwoord-constructie verandert die volgorde niet. Eventuele classificeerwoorden (\"sebuah\") staan voor het znw."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ada empat belas orang di sana.",
      "transformationInstruction": "Verander het getal van veertien naar negentien",
      "acceptableAnswers": [
        "Ada sembilan belas orang di sana.",
        "Ada sembilan belas orang di sana"
      ],
      "hintText": "Sembilan = negen. Voor 12-19: [eenheid] + belas, los geschreven.",
      "explanationText": "19 = \"sembilan belas\". Het patroon voor de tieners blijft [eenheid] + belas, losgeschreven. Alleen 11 is uitzondering (sebelas)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ada sebelas sepeda di taman.",
      "transformationInstruction": "Verander het getal van elf naar zestien",
      "acceptableAnswers": [
        "Ada enam belas sepeda di taman.",
        "Ada enam belas sepeda di taman"
      ],
      "hintText": "Enam = zes. Vanaf 12 gebruik je het losse eenheidswoord + belas.",
      "explanationText": "16 = \"enam belas\". Vanaf 12 wordt het eenheidswoord los geschreven voor \"belas\". Alleen bij 11 smelt se- met belas tot \"sebelas\"."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Er zijn dertien koffers.",
      "requiredTargetPattern": "belas-numbers",
      "acceptableAnswers": [
        "Ada tiga belas koper.",
        "Ada tiga belas koper",
        "Ada tiga belas buah koper.",
        "Ada tiga belas buah koper"
      ],
      "disallowedShortcutForms": [
        "Ada tiga puluh koper"
      ],
      "explanationText": "13 = \"tiga belas\" (tiener). \"Tiga puluh\" zou 30 zijn (tiental). Optioneel met classificeerwoord \"buah\" voor voorwerpen: \"tiga belas buah koper\"."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Veertien kinderen wachten thuis.",
      "requiredTargetPattern": "belas-numbers",
      "acceptableAnswers": [
        "Empat belas anak menunggu di rumah.",
        "Empat belas anak menunggu di rumah",
        "Empat belas orang anak menunggu di rumah.",
        "Empat belas orang anak menunggu di rumah"
      ],
      "disallowedShortcutForms": [
        "Empat puluh anak menunggu di rumah"
      ],
      "explanationText": "14 = \"empat belas\" (tiener). \"Empat puluh\" zou 40 zijn. Bij personen kun je het classificeerwoord \"orang\" toevoegen tussen telwoord en znw."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belas-numbers",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Negentien dagen vakantie.",
      "requiredTargetPattern": "belas-numbers",
      "acceptableAnswers": [
        "Sembilan belas hari libur.",
        "Sembilan belas hari libur"
      ],
      "disallowedShortcutForms": [
        "Sembilan puluh hari libur"
      ],
      "explanationText": "19 = \"sembilan belas\" (tiener). \"Sembilan puluh\" zou 90 zijn. Het zelfstandig naamwoord (hari) en de bepaling (libur) volgen het telwoord direct."
    }
  }
]
