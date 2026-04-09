// Published via script
export const candidates = [
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "De verkoper zegt: \"... bisa Bu\" (het kan NOG NIET, maar misschien later wel). Wat past?",
      "targetMeaning": "Dat kan nog niet, mevrouw (maar er is een alternatief)",
      "options": [
        {
          "id": "cp3-a",
          "text": "Belum bisa Bu"
        },
        {
          "id": "cp3-b",
          "text": "Tidak bisa Bu"
        }
      ],
      "correctOptionId": "cp3-a",
      "explanationText": "\"Belum\" = nog niet (tijdelijk, kan later veranderen). \"Tidak\" = niet (definitief). De verkoper laat de deur open voor onderhandeling, dus \"belum bisa\" past hier. Uit de dialoog: de verkoper biedt daarna een alternatief aan."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Dat is NIET duur\" — welke ontkenning past?",
      "targetMeaning": "Dat is niet duur (definitief oordeel)",
      "options": [
        {
          "id": "cp4-a",
          "text": "Itu belum mahal"
        },
        {
          "id": "cp4-b",
          "text": "Itu tidak mahal"
        }
      ],
      "correctOptionId": "cp4-b",
      "explanationText": "\"Tidak\" is de gewone ontkenning voor een definitieve uitspraak: \"Itu tidak mahal\" = Dat is niet duur. \"Belum mahal\" zou betekenen \"nog niet duur\" (maar het wordt het misschien later wel)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "reduplication-plural",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Meneer koopt twee huizen\" — welke vorm is correct?",
      "targetMeaning": "Meneer koopt twee huizen",
      "options": [
        {
          "id": "cp5-a",
          "text": "Bapak beli dua rumah"
        },
        {
          "id": "cp5-b",
          "text": "Bapak beli dua rumah-rumah"
        }
      ],
      "correctOptionId": "cp5-a",
      "explanationText": "Als uit de context al blijkt dat het meervoud is (hier: \"dua\" = twee), wordt het zelfstandig naamwoord NIET verdubbeld. Dus: \"dua rumah\" en niet \"dua rumah-rumah\"."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "zero-copula",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Dat is duur\" — hoe zeg je dit in het Indonesisch?",
      "targetMeaning": "Dat is duur",
      "options": [
        {
          "id": "cp6-a",
          "text": "Itu mahal"
        },
        {
          "id": "cp6-b",
          "text": "Itu adalah mahal"
        }
      ],
      "correctOptionId": "cp6-a",
      "explanationText": "Het koppelwerkwoord \"is/zijn\" wordt in het Indonesisch weggelaten. \"Itu mahal\" = Dat [is] duur. \"Adalah\" bestaat wel maar wordt niet zo gebruikt bij bijvoeglijke naamwoorden."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "serial-verb-construction",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Saya beli buah.",
      "transformationInstruction": "Voeg \"willen\" (mau) toe",
      "acceptableAnswers": [
        "Saya mau beli buah.",
        "Saya mau beli buah"
      ],
      "hintText": "Werkwoorden worden direct na elkaar geplaatst: [subject] [ww1] [ww2] [object]",
      "explanationText": "Seriele werkwoorden staan direct achter elkaar: \"mau beli\" = willen kopen. Geen tussenvoegsel nodig zoals in het Nederlands (\"te kopen\"). Vergelijk: \"Saya mau beli rumah besar\" uit de les."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "reduplication-plural",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Bapak beli buah.",
      "transformationInstruction": "Geef aan dat meneer allerlei soorten fruit koopt (verscheidenheid)",
      "acceptableAnswers": [
        "Bapak beli buah-buahan.",
        "Bapak beli buah-buahan"
      ],
      "hintText": "Herhaling van het woord duidt meervoud of verscheidenheid aan",
      "explanationText": "Reduplicatie (herhaling) geeft meervoud of verscheidenheid aan. \"Buah-buahan\" = allerlei fruit / vruchten. De uitgang -an versterkt het verscheidenheidsaspect. Uit de les: \"Bapak beli buah-buahan.\""
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Tidak bisa.",
      "transformationInstruction": "Verander naar \"nog niet mogelijk\" (er is nog hoop)",
      "acceptableAnswers": [
        "Belum bisa.",
        "Belum bisa"
      ],
      "hintText": "Welk woord geeft tijdelijke ontkenning aan?",
      "explanationText": "\"Belum\" vervangt \"tidak\" wanneer de ontkenning tijdelijk is — het kan later nog veranderen. \"Belum bisa\" = nog niet mogelijk (maar misschien later wel). Uit de dialoog: \"Belum bisa Bu.\""
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "zero-copula",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "De prijs is goedkoop.",
      "requiredTargetPattern": "zero-copula",
      "acceptableAnswers": [
        "Harganya murah.",
        "Harganya murah",
        "Harga murah.",
        "Harga murah"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Geen koppelwerkwoord \"is\" nodig: \"Harganya murah\" = De prijs [is] goedkoop. Het achtervoegsel \"-nya\" op \"harga\" geeft \"de\" aan (de prijs). Uit de dialoog: \"Harganya murah Bu.\""
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "serial-verb-construction",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Ik ga naar de markt.",
      "requiredTargetPattern": "serial-verb-construction",
      "acceptableAnswers": [
        "Saya ke pasar.",
        "Saya ke pasar"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "\"Ke\" = naar. Geen werkwoord \"gaan\" nodig — \"Saya ke pasar\" is een geldige zin. In het Indonesisch kunnen zinnen ook zonder werkwoord functioneren. Uit de les: \"Saya ke pasar.\""
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Dat kan nog niet, mevrouw.",
      "requiredTargetPattern": "belum-vs-tidak",
      "acceptableAnswers": [
        "Belum bisa Bu.",
        "Belum bisa, Bu.",
        "Belum bisa Bu",
        "Belum bisa, Bu"
      ],
      "disallowedShortcutForms": [
        "Tidak bisa Bu"
      ],
      "explanationText": "\"Belum\" = nog niet (tijdelijk). \"Tidak\" zou definitief zijn. De verkoper in de dialoog gebruikt \"Belum bisa Bu\" omdat hij daarna een alternatief aanbiedt — de deur blijft open."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "reduplication-plural",
    "source_page": 1,
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Meneer koopt allerlei fruit.",
      "requiredTargetPattern": "reduplication-plural",
      "acceptableAnswers": [
        "Bapak beli buah-buahan.",
        "Bapak beli buah-buahan"
      ],
      "disallowedShortcutForms": [
        "Bapak beli buah"
      ],
      "explanationText": "Reduplicatie geeft verscheidenheid aan: \"buah-buahan\" = allerlei fruit. Zonder reduplicatie (\"buah\") zou het slechts \"een vrucht\" of \"fruit\" betekenen, zonder de nadruk op verscheidenheid."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "zero-copula",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Pisang ini ___.",
      "translation": "Deze banaan is goedkoop.",
      "options": [
        "is murah",
        "murah",
        "adalah murah",
        "itu murah"
      ],
      "correctOptionId": "murah",
      "explanationText": "In het Indonesisch is er geen koppelwerkwoord 'is/zijn'. \"Pisang ini murah\" = Deze banaan [is] goedkoop. 'Adalah' bestaat maar wordt zelden bij bijvoeglijke naamwoorden gebruikt."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "zero-copula",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Ini ___ Ibu Barends.",
      "translation": "Dit is mevrouw Barends.",
      "options": [
        "ada",
        "adalah",
        "itu",
        "ialah"
      ],
      "correctOptionId": "adalah",
      "explanationText": "'Adalah' wordt wél gebruikt bij naamwoordelijke gezegdes met een zelfstandig naamwoord als naamwoorddeel (Ini adalah Ibu Barends). Bij bijvoeglijke naamwoorden valt het weg. Beide 'adalah' en weglating zijn correct, maar 'adalah' is hier de meest formele optie."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Saya ___ bisa, tapi besok bisa.",
      "translation": "Ik kan [het] nog niet, maar morgen wel.",
      "options": [
        "tidak",
        "belum",
        "bukan",
        "jangan"
      ],
      "correctOptionId": "belum",
      "explanationText": "'Belum' = nog niet (tijdelijk). De zin zegt 'morgen wel' — er is dus toekomstige mogelijkheid. 'Tidak bisa' zou permanent zijn: ik kan het niet en dat verandert niet."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "belum-vs-tidak",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Rumah ini ___ mahal.",
      "translation": "Dit huis is niet duur.",
      "options": [
        "belum",
        "tidak",
        "bukan",
        "jangan"
      ],
      "correctOptionId": "tidak",
      "explanationText": "'Tidak' ontkent bijvoeglijke naamwoorden en werkwoorden. 'Belum mahal' zou betekenen 'nog niet duur' — alsof het later misschien wél duur wordt. 'Tidak mahal' = is niet duur (definitief oordeel)."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "serial-verb-construction",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Saya ___ pisang di pasar.",
      "translation": "Ik wil bananen kopen op de markt.",
      "options": [
        "mau untuk beli",
        "mau beli",
        "ingin membeli untuk",
        "beli mau"
      ],
      "correctOptionId": "mau beli",
      "explanationText": "Seriële werkwoorden staan direct achter elkaar zonder voegwoord: 'mau beli' (willen kopen). In het Nederlands heb je 'te': 'willen kopen'. In het Indonesisch geen 'te' of 'untuk' nodig bij mau/bisa/boleh."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "no-articles",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Saya beli ___ di pasar.",
      "translation": "Ik koop een banaan op de markt.",
      "options": [
        "een pisang",
        "sebuah pisang",
        "de pisang",
        "pisang"
      ],
      "correctOptionId": "pisang",
      "explanationText": "Het Indonesisch heeft geen lidwoorden (de/het/een). 'Saya beli pisang' = Ik koop banaan. Sebuah bestaat wel maar is een classificeerwoord, niet noodzakelijk. 'Een pisang' of 'de pisang' bestaan niet in het Indonesisch."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "verb-no-conjugation",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Kemarin ibu ___ pisang di pasar.",
      "translation": "Gisteren kocht moeder bananen op de markt.",
      "options": [
        "belilah",
        "membeli",
        "beli",
        "dibeli"
      ],
      "correctOptionId": "beli",
      "explanationText": "Werkwoorden worden in het Indonesisch niet vervoegd voor tijd, persoon of getal. 'Beli' blijft altijd 'beli'. De tijd wordt duidelijk uit context (kemarin = gisteren). 'Membeli' bestaat maar is een actief transitief prefix — voor beginners gebruikt men de basisvorm."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "no-singular-plural",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Bapak beli tiga ___.",
      "translation": "Meneer koopt drie bananen.",
      "options": [
        "pisang-pisang",
        "pisangs",
        "pisang",
        "pisangan"
      ],
      "correctOptionId": "pisang",
      "explanationText": "Als het getal al duidelijk is ('tiga' = drie), wordt het zelfstandig naamwoord NIET verdubbeld. 'Tiga pisang' = drie bananen. 'Pisang-pisang' zou verscheidenheid of vage meervoud aanduiden, niet een geteld meervoud."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "reduplication-plural",
    "source_page": 1,
    "review_status": "published",
    "payload": {
      "sentence": "Di pasar ada ___ segar.",
      "translation": "Op de markt zijn er allerlei verse vruchten.",
      "options": [
        "buah",
        "buah-buah",
        "buah-buahan",
        "beberapa buah"
      ],
      "correctOptionId": "buah-buahan",
      "explanationText": "'Buah-buahan' (reduplicatie + -an) duidt verscheidenheid aan: allerlei soorten fruit. 'Buah-buah' is ook meervoud maar minder idiomatisch. 'Buah' alleen is enkelvoud/uncountable. 'Buah-buahan' is de meest idiomatische vorm voor 'allerlei fruit'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "verb-no-conjugation",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Gisteren kocht ik fruit\" — welke vorm van het werkwoord is correct?",
      "targetMeaning": "Gisteren kocht ik fruit",
      "options": [
        {
          "id": "cp-vnc-a",
          "text": "Kemarin saya beli buah"
        },
        {
          "id": "cp-vnc-b",
          "text": "Kemarin saya belikan buah"
        }
      ],
      "correctOptionId": "cp-vnc-a",
      "explanationText": "Indonesische werkwoorden worden niet vervoegd. 'Beli' blijft altijd 'beli', ongeacht de tijd. 'Kemarin' (gisteren) geeft de verleden tijd aan. 'Belikan' is een ander woord (suffix -kan = voor iemand anders kopen)."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "verb-no-conjugation",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Saya beli pisang.",
      "transformationInstruction": "Verander de zin naar de verleden tijd (gisteren)",
      "acceptableAnswers": [
        "Kemarin saya beli pisang.",
        "Kemarin saya beli pisang",
        "Saya beli pisang kemarin.",
        "Saya beli pisang kemarin"
      ],
      "hintText": "Het werkwoord verandert niet — voeg alleen een tijdswoord toe",
      "explanationText": "In het Indonesisch verandert het werkwoord niet voor de verleden tijd. Je voegt een tijdsaanduiding toe: 'kemarin' (gisteren). Het werkwoord 'beli' blijft exact hetzelfde."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "verb-no-conjugation",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Moeder koopt fruit op de markt.",
      "requiredTargetPattern": "verb-no-conjugation",
      "acceptableAnswers": [
        "Ibu beli buah di pasar.",
        "Ibu beli buah di pasar"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Het werkwoord 'beli' (kopen) wordt niet vervoegd. In het Nederlands: ik koop, moeder koopt — in het Indonesisch altijd 'beli'. 'Ibu beli buah di pasar' = Moeder koopt fruit op de markt."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "zero-copula",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "De bananen zijn goedkoop.",
      "transformationInstruction": "Vertaal naar het Indonesisch (zonder koppelwerkwoord)",
      "acceptableAnswers": [
        "Pisang murah.",
        "Pisang murah",
        "Pisangnya murah.",
        "Pisangnya murah"
      ],
      "hintText": "Het koppelwerkwoord 'zijn' wordt weggelaten in het Indonesisch",
      "explanationText": "In het Indonesisch is er geen koppelwerkwoord 'zijn'. 'Pisang murah' = Bananen [zijn] goedkoop. Het werkwoord wordt simpelweg weggelaten — het bijvoeglijk naamwoord volgt direct op het onderwerp."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "serial-verb-construction",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Ik wil fruit kopen\" — welke volgorde is correct?",
      "targetMeaning": "Ik wil fruit kopen",
      "options": [
        {
          "id": "cp-svc-a",
          "text": "Saya mau beli buah"
        },
        {
          "id": "cp-svc-b",
          "text": "Saya mau untuk beli buah"
        }
      ],
      "correctOptionId": "cp-svc-a",
      "explanationText": "Bij seriële werkwoorden staat er geen verbindingswoord tussen de werkwoorden. 'Mau beli' = willen kopen. 'Untuk' (om te) is hier niet nodig en klinkt onnatuurlijk. Vergelijk Nederlands: 'wil kopen' zonder 'te'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "no-articles",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Ik koop fruit\" — welke vertaling is correct?",
      "targetMeaning": "Ik koop fruit",
      "options": [
        {
          "id": "cp-na-a",
          "text": "Saya beli buah"
        },
        {
          "id": "cp-na-b",
          "text": "Saya beli sebuah buah"
        }
      ],
      "correctOptionId": "cp-na-a",
      "explanationText": "Het Indonesisch heeft geen lidwoorden (de/het/een). 'Saya beli buah' = Ik koop fruit. 'Sebuah' is een classificeerwoord (telwoord voor ronde dingen), geen lidwoord — het is hier niet nodig."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "no-articles",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Het huis is groot.",
      "transformationInstruction": "Vertaal naar het Indonesisch (zonder lidwoord)",
      "acceptableAnswers": [
        "Rumah besar.",
        "Rumah besar",
        "Rumahnya besar.",
        "Rumahnya besar"
      ],
      "hintText": "Er zijn geen lidwoorden (de/het/een) in het Indonesisch",
      "explanationText": "Het Indonesisch heeft geen lidwoorden. 'Het huis' wordt simpelweg 'rumah'. Gecombineerd met het weglaten van het koppelwerkwoord: 'Rumah besar' = [Het] huis [is] groot."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "no-articles",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Meneer koopt een huis.",
      "requiredTargetPattern": "no-articles",
      "acceptableAnswers": [
        "Bapak beli rumah.",
        "Bapak beli rumah"
      ],
      "disallowedShortcutForms": [
        "Bapak beli sebuah rumah"
      ],
      "explanationText": "Geen lidwoord nodig: 'een huis' wordt gewoon 'rumah'. 'Sebuah' (classificeerwoord) is grammaticaal correct maar niet verplicht. Op A1-niveau leer je eerst dat lidwoorden niet bestaan in het Indonesisch."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "no-singular-plural",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "\"Ik koop vijf bananen\" — welke vorm is correct?",
      "targetMeaning": "Ik koop vijf bananen",
      "options": [
        {
          "id": "cp-nsp-a",
          "text": "Saya beli lima pisang"
        },
        {
          "id": "cp-nsp-b",
          "text": "Saya beli lima pisang-pisang"
        }
      ],
      "correctOptionId": "cp-nsp-a",
      "explanationText": "Als het aantal al duidelijk is door een telwoord ('lima' = vijf), wordt het zelfstandig naamwoord NIET verdubbeld. 'Lima pisang' = vijf bananen. Reduplicatie is overbodig bij een telwoord."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "no-singular-plural",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Saya beli pisang.",
      "transformationInstruction": "Geef aan dat je twee bananen koopt (gebruik een telwoord)",
      "acceptableAnswers": [
        "Saya beli dua pisang.",
        "Saya beli dua pisang"
      ],
      "hintText": "Voeg het telwoord toe — het zelfstandig naamwoord verandert niet",
      "explanationText": "In het Indonesisch verandert het zelfstandig naamwoord niet voor meervoud. Je voegt gewoon het telwoord toe: 'dua pisang' = twee bananen. 'Pisang' blijft 'pisang', nooit 'pisangs' of 'pisang-pisang' met een telwoord."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "no-singular-plural",
    "review_status": "published",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "Meneer koopt drie huizen.",
      "requiredTargetPattern": "no-singular-plural",
      "acceptableAnswers": [
        "Bapak beli tiga rumah.",
        "Bapak beli tiga rumah"
      ],
      "disallowedShortcutForms": [
        "Bapak beli tiga rumah-rumah"
      ],
      "explanationText": "Geen meervoudsvorm nodig bij een telwoord: 'tiga rumah' = drie huizen. 'Rumah-rumah' bij een telwoord is fout. In het Nederlands verandert 'huis' naar 'huizen' — in het Indonesisch blijft 'rumah' altijd 'rumah'."
    }
  }
]
