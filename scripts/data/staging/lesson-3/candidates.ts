// Published via script
export const candidates = [
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sentence": "___ banyak taksi di depan bandar udara.",
      "translation": "Er zijn veel taxi's voor het vliegveld.",
      "options": [
        "Adalah",
        "Ada",
        "Ini",
        "Yang"
      ],
      "correctOptionId": "Ada",
      "explanationText": "'Ada' = er is/zijn (existentieel). Geeft aan dat iets aanwezig is. 'Ada banyak taksi' = er zijn veel taxi's. 'Adalah' is een formeel koppelwerkwoord (zelden gebruikt), niet hetzelfde als 'ada'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sentence": "Sudah ___ hotel, Pak?",
      "translation": "Heeft u al een hotel, meneer?",
      "options": [
        "adalah",
        "ada",
        "ini",
        "itu"
      ],
      "correctOptionId": "ada",
      "explanationText": "'Ada' wordt ook gebruikt als 'hebben' in de zin van beschikken over iets. 'Sudah ada hotel' = al een hotel hebben/er is al een hotel."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sentence": "Di sini tidak ___ coklat Belanda.",
      "translation": "Hier is er geen Hollandse chocolade.",
      "options": [
        "ada",
        "adalah",
        "ini",
        "mau"
      ],
      "correctOptionId": "ada",
      "explanationText": "'Tidak ada' = er is niet / er zijn geen. 'Ada' drukt bestaan uit en wordt ontkend met 'tidak'. Uit de dialoog: 'Di sini tidak ada, kan?'"
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "promptText": "\"Dit huis is mooi\"",
      "targetMeaning": "Dit huis is mooi (eigenschap, geen bestaan)",
      "options": [
        {
          "id": "ada-cp1-a",
          "text": "Rumah ini ada bagus"
        },
        {
          "id": "ada-cp1-b",
          "text": "Rumah ini bagus"
        }
      ],
      "correctOptionId": "ada-cp1-b",
      "explanationText": "Indonesisch heeft GEEN koppelwerkwoord. 'Ada' betekent 'er is/bestaan' -- niet 'is' als koppelwerkwoord. 'Dit huis is mooi' = 'Rumah ini bagus' (zonder ada)."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "promptText": "\"Is er kaas?\"",
      "targetMeaning": "Vraag naar aanwezigheid met ada",
      "options": [
        {
          "id": "ada-cp2-a",
          "text": "Ada keju?"
        },
        {
          "id": "ada-cp2-b",
          "text": "Keju bagus?"
        }
      ],
      "correctOptionId": "ada-cp2-a",
      "explanationText": "'Ada' wordt gebruikt om naar het bestaan of de aanwezigheid van iets te vragen. 'Ada keju?' = 'Is er kaas?' 'Keju bagus?' vraagt of kaas lekker is, niet of het er is."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "promptText": "\"Ik heb honger\"",
      "targetMeaning": "Ik heb honger (toestand, geen bestaan)",
      "options": [
        {
          "id": "ada-cp3-a",
          "text": "Saya ada lapar"
        },
        {
          "id": "ada-cp3-b",
          "text": "Saya lapar"
        }
      ],
      "correctOptionId": "ada-cp3-b",
      "explanationText": "'Ada' is GEEN koppelwerkwoord. 'Ik heb honger' beschrijft een toestand, geen bestaan. 'Saya lapar' is correct. 'Saya ada lapar' is fout -- uit de grammatica: NIET 'saya ada lapar'."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Di sana banyak mobil.",
      "transformationInstruction": "Voeg \"ada\" toe om het bestaan van de auto's te benadrukken",
      "acceptableAnswers": [
        "Di sana ada banyak mobil.",
        "Ada banyak mobil di sana."
      ],
      "hintText": "'Ada' komt voor het onderwerp om bestaan uit te drukken",
      "explanationText": "'Ada' drukt bestaan/aanwezigheid uit: 'Di sana ada banyak mobil' = er zijn daar veel auto's. Het werkwoord 'ada' staat voor het zelfstandig naamwoord."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ada keju di toko itu.",
      "transformationInstruction": "Ontken de zin: er is GEEN kaas in die winkel",
      "acceptableAnswers": [
        "Tidak ada keju di toko itu."
      ],
      "hintText": "Gebruik 'tidak' voor 'ada' om te ontkennen",
      "explanationText": "'Tidak ada' = er is/zijn geen. De ontkenning 'tidak' staat direct voor 'ada'. 'Tidak ada keju' = er is geen kaas."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Hoeveel fietsen zijn er?",
      "requiredTargetPattern": "ada-existential",
      "acceptableAnswers": [
        "Ada berapa sepeda?"
      ],
      "disallowedShortcutForms": [
        "Berapa sepeda?"
      ],
      "explanationText": "'Ada' wordt gebruikt om naar het bestaan/aantal te vragen: 'Ada berapa sepeda?' = Hoeveel fietsen zijn er? Zonder 'ada' vraag je alleen 'hoeveel fietsen' zonder het bestaan te benadrukken."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "ada-existential",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Er zijn veel auto's daar.",
      "requiredTargetPattern": "ada-existential",
      "acceptableAnswers": [
        "Di sana ada banyak mobil.",
        "Ada banyak mobil di sana."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Ada' drukt bestaan uit. 'Di sana ada banyak mobil' en 'Ada banyak mobil di sana' zijn allebei correct -- de plaatsbepaling kan vooraan of achteraan staan."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sentence": "Bapak Barends ___ negeri Belanda.",
      "translation": "Meneer Barends komt uit Nederland.",
      "options": [
        "di",
        "ke",
        "dari",
        "untuk"
      ],
      "correctOptionId": "dari",
      "explanationText": "'Dari' = van/uit (herkomst, beweging weg van). 'Di' = locatie zonder beweging. 'Ke' = beweging naartoe. Herkomst -> gebruik 'dari'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sentence": "Bapak tinggal ___ hotel Ramayana.",
      "translation": "Meneer verblijft in hotel Ramayana.",
      "options": [
        "dari",
        "ke",
        "untuk",
        "di"
      ],
      "correctOptionId": "di",
      "explanationText": "'Di' = in/op/te -- locatie zonder beweging. 'Tinggal di hotel' = verblijven in het hotel. 'Ke hotel' zou beweging naar het hotel zijn."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sentence": "Besok saya pulang ___ Jakarta.",
      "translation": "Morgen ga ik terug naar Jakarta.",
      "options": [
        "di",
        "dari",
        "ke",
        "ada"
      ],
      "correctOptionId": "ke",
      "explanationText": "'Ke' = naar (beweging ergens naartoe). 'Pulang ke Jakarta' = terugkeren naar Jakarta. 'Di' zou rust/locatie zijn, 'dari' herkomst."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "promptText": "\"Ik ga naar Jakarta\"",
      "targetMeaning": "Beweging — ke voor bestemming",
      "options": [
        {
          "id": "ddk-cp1-a",
          "text": "Saya ke Jakarta"
        },
        {
          "id": "ddk-cp1-b",
          "text": "Saya di Jakarta"
        }
      ],
      "correctOptionId": "ddk-cp1-a",
      "explanationText": "'Ke' duidt beweging aan naar een bestemming (naar). 'Di' duidt rust/locatie aan (in/op). 'Ik ga NAAR Jakarta' = beweging = 'ke Jakarta'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "promptText": "\"Tono komt van huis\"",
      "targetMeaning": "Herkomst — dari voor vertrekpunt",
      "options": [
        {
          "id": "ddk-cp2-a",
          "text": "Tono di rumah"
        },
        {
          "id": "ddk-cp2-b",
          "text": "Tono dari rumah"
        }
      ],
      "correctOptionId": "ddk-cp2-b",
      "explanationText": "'Dari' duidt herkomst aan (van/vandaan). 'Di' duidt locatie aan (in/op). 'Tono dari rumah' = Tono komt van huis. 'Tono di rumah' = Tono is thuis."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "promptText": "\"Vader is op kantoor\"",
      "targetMeaning": "Locatie — di voor verblijfplaats",
      "options": [
        {
          "id": "ddk-cp3-a",
          "text": "Bapak ke kantor"
        },
        {
          "id": "ddk-cp3-b",
          "text": "Bapak di kantor"
        }
      ],
      "correctOptionId": "ddk-cp3-b",
      "explanationText": "'Di' wordt gebruikt voor rust/locatie. 'Ke' is voor beweging. Vader IS op kantoor (geen beweging) = 'Bapak di kantor'. Uit Oefening IV."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya di Bali.",
      "transformationInstruction": "Verander de zin: je gaat weg van Bali (herkomst)",
      "acceptableAnswers": [
        "Saya dari Bali."
      ],
      "hintText": "Vervang 'di' (locatie) door het voorzetsel voor herkomst",
      "explanationText": "'Di' (locatie/rust) wordt vervangen door 'dari' (herkomst/vandaan). 'Saya di Bali' = ik ben op Bali. 'Saya dari Bali' = ik kom van Bali."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Saya duduk di kota Jakarta.",
      "transformationInstruction": "Verander de zin: je vertrekt nu UIT Jakarta (herkomst, niet locatie)",
      "acceptableAnswers": [
        "Saya dari kota Jakarta.",
        "Saya datang dari kota Jakarta."
      ],
      "hintText": "Vervang 'di' (locatie/rust) door het voorzetsel voor herkomst",
      "explanationText": "'Di' duidt locatie/rust aan (in/op Jakarta). 'Dari' duidt herkomst aan (uit/van Jakarta). Door 'di' te vervangen door 'dari' verschuift de betekenis van 'ik zit in Jakarta' naar 'ik kom uit Jakarta'."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik kom uit Bali. Nu woon ik in Solo. Morgen ga ik terug naar Jakarta.",
      "requiredTargetPattern": "dari-di-ke-locative",
      "acceptableAnswers": [
        "Saya dari Bali. Sekarang tinggal di Solo. Besok saya pulang ke Jakarta.",
        "Saya dari Bali. Sekarang saya tinggal di Solo. Besok saya pulang ke Jakarta."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "Alle drie de voorzetsels van plaats in een zin: 'dari' (vandaan), 'di' (locatie), 'ke' (naartoe). Dit voorbeeld komt direct uit de grammaticasectie van les 3."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Moeder zit voor het huis.",
      "requiredTargetPattern": "dari-di-ke-locative",
      "acceptableAnswers": [
        "Ibu duduk di depan rumah."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Di depan' is een gecombineerde plaatsbepaling: 'di' (locatie) + 'depan' (voorkant). Uit Oefening IV: 'Ibu duduk di depan rumah'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sentence": "Bapak mau pergi ___?",
      "translation": "Waar wilt u naartoe gaan, meneer?",
      "options": [
        "di mana",
        "dari mana",
        "ke mana",
        "di sini"
      ],
      "correctOptionId": "ke mana",
      "explanationText": "'Ke mana?' = waarheen? (richting). 'Di mana?' = waar? (locatie). 'Dari mana?' = waar vandaan? (herkomst). Beweging naartoe + 'pergi' -> 'ke mana'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sentence": "___ Ibu mau datang ke Indonesia?",
      "translation": "Wanneer wilt u naar Indonesie komen, mevrouw?",
      "options": [
        "Siapa",
        "Di mana",
        "Kapan",
        "Apa"
      ],
      "correctOptionId": "Kapan",
      "explanationText": "'Kapan' = wanneer? Vraagt naar een tijdstip. Uit de grammaticasectie: 'Kapan Ibu mau datang?'"
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sentence": "___ nama Bapak itu?",
      "translation": "Wie is die meneer? / Hoe heet die meneer?",
      "options": [
        "Apa",
        "Siapa",
        "Kapan",
        "Berapa"
      ],
      "correctOptionId": "Siapa",
      "explanationText": "'Siapa' = wie? Vraagt naar een persoon. 'Siapa nama Bapak?' = Hoe heet u? (letterlijk: wie naam meneer?). Uit de grammaticasectie."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "promptText": "Welk vraagwoord past bij \"Waar gaat u heen?\"",
      "targetMeaning": "ke mana — richting/bestemming",
      "options": [
        {
          "id": "qw-cp1-a",
          "text": "Bapak di mana?"
        },
        {
          "id": "qw-cp1-b",
          "text": "Bapak mau ke mana?"
        }
      ],
      "correctOptionId": "qw-cp1-b",
      "explanationText": "'Ke mana?' vraagt naar een bestemming (waarheen?). 'Di mana?' vraagt naar een huidige locatie (waar?). 'Waar gaat u heen?' = beweging = 'ke mana'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "promptText": "Welk vraagwoord past bij \"Waar komt u vandaan?\"",
      "targetMeaning": "dari mana — herkomst/oorsprong",
      "options": [
        {
          "id": "qw-cp2-a",
          "text": "Bapak dari mana?"
        },
        {
          "id": "qw-cp2-b",
          "text": "Bapak di mana?"
        }
      ],
      "correctOptionId": "qw-cp2-a",
      "explanationText": "'Dari mana?' vraagt naar herkomst (waar vandaan?). 'Di mana?' vraagt naar huidige locatie. Uit de dialoog: 'Bapak dari mana?'"
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "promptText": "Welk vraagwoord past bij \"Hoe is het eten?\"",
      "targetMeaning": "bagaimana — kwaliteit/wijze",
      "options": [
        {
          "id": "qw-cp3-a",
          "text": "Apa makanan itu?"
        },
        {
          "id": "qw-cp3-b",
          "text": "Bagaimana makanan itu?"
        }
      ],
      "correctOptionId": "qw-cp3-b",
      "explanationText": "'Bagaimana' = hoe? (op welke wijze/kwaliteit). 'Apa' = wat? (vraagt naar een ding). 'Hoe is het eten?' vraagt naar kwaliteit -> 'bagaimana'."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Bapak tinggal di hotel Ramayana.",
      "transformationInstruction": "Maak een vraag: vraag WAAR meneer verblijft",
      "acceptableAnswers": [
        "Bapak tinggal di mana?",
        "Di mana Bapak tinggal?"
      ],
      "hintText": "Vervang de plaatsbepaling door het vraagwoord voor locatie",
      "explanationText": "'Di mana' = waar (locatie). Het vraagwoord vervangt de plaatsbepaling 'di hotel Ramayana'. In het Indonesisch kan het vraagwoord aan het einde of aan het begin van de zin staan."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Ibu datang dari Ujungpandang.",
      "transformationInstruction": "Maak een vraag: vraag WAAR VANDAAN mevrouw komt",
      "acceptableAnswers": [
        "Ibu datang dari mana?",
        "Dari mana Ibu datang?"
      ],
      "hintText": "Vervang de herkomst door het vraagwoord 'dari mana'",
      "explanationText": "'Dari mana' = waar vandaan? Vervangt de herkomstbepaling 'dari Ujungpandang'. Uit de grammatica voorbeelden: 'Ibu datang dari mana?'"
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Wanneer wilt u naar Indonesie komen?",
      "requiredTargetPattern": "question-words",
      "acceptableAnswers": [
        "Kapan Ibu mau datang ke Indonesia?",
        "Kapan Bapak mau datang ke Indonesia?",
        "Kapan mau datang ke Indonesia?"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Kapan' = wanneer. Het vraagwoord staat aan het begin van de zin. Uit de grammaticasectie: 'Kapan Ibu mau datang?'"
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "question-words",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Hoe heet die persoon?",
      "requiredTargetPattern": "question-words",
      "acceptableAnswers": [
        "Siapa nama orang itu?",
        "Nama orang itu siapa?"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Siapa' = wie? In combinatie met 'nama' vraagt het naar iemands naam. Uit Oefening IV: 'Siapa nama orang itu?'"
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sentence": "Bandar udara ini besar ___.",
      "translation": "Dit vliegveld is heel groot.",
      "options": [
        "sekali",
        "saja",
        "banyak",
        "benar"
      ],
      "correctOptionId": "sekali",
      "explanationText": "'Sekali' = erg/heel, staat NA het bijvoeglijk naamwoord. 'Besar sekali' = heel groot. 'Sangat' bestaat ook maar staat VOOR het bijvoeglijk naamwoord."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sentence": "Koper Ibu berat ___.",
      "translation": "De koffer van mevrouw is erg zwaar.",
      "options": [
        "banyak",
        "sekali",
        "saja",
        "ada"
      ],
      "correctOptionId": "sekali",
      "explanationText": "'Sekali' versterkt het bijvoeglijk naamwoord 'berat' (zwaar). 'Berat sekali' = erg zwaar. Uit de dialoog: 'koper saya berat sekali'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sentence": "Hotel itu mahal ___.",
      "translation": "Dat hotel is erg duur.",
      "options": [
        "ada",
        "sekali",
        "ini",
        "besar"
      ],
      "correctOptionId": "sekali",
      "explanationText": "'Mahal sekali' = erg duur. 'Sekali' staat altijd NA het bijvoeglijk naamwoord. Uit de grammatica: 'Hotel itu mahal sekali'."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "promptText": "\"Het eten is erg lekker\"",
      "targetMeaning": "Het eten is erg lekker (versterking met sekali)",
      "options": [
        {
          "id": "sk-cp1-a",
          "text": "Makanan sekali enak."
        },
        {
          "id": "sk-cp1-b",
          "text": "Makanan enak sekali."
        }
      ],
      "correctOptionId": "sk-cp1-b",
      "explanationText": "'Sekali' staat altijd NA het bijvoeglijk naamwoord: 'enak sekali' = erg lekker. 'Sekali enak' is fout -- 'sekali' kan niet voor het bijvoeglijk naamwoord staan."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "promptText": "\"De fiets is heel mooi\"",
      "targetMeaning": "De fiets is heel mooi (versterking met sekali)",
      "options": [
        {
          "id": "sk-cp2-a",
          "text": "Sepeda ini bagus sekali."
        },
        {
          "id": "sk-cp2-b",
          "text": "Sepeda ini sekali bagus."
        }
      ],
      "correctOptionId": "sk-cp2-a",
      "explanationText": "'Sekali' komt ACHTER het bijvoeglijk naamwoord. 'Bagus sekali' = heel mooi. Uit de grammatica: 'Sepeda ini bagus sekali'. De volgorde is omgekeerd vergeleken met het Nederlands."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "promptText": "\"De bagage is erg zwaar\"",
      "targetMeaning": "De bagage is erg zwaar (versterkend)",
      "options": [
        {
          "id": "sk-cp3-a",
          "text": "Barang berat sekali."
        },
        {
          "id": "sk-cp3-b",
          "text": "Barang ada berat."
        }
      ],
      "correctOptionId": "sk-cp3-a",
      "explanationText": "'Berat sekali' = erg zwaar. 'Ada' is GEEN koppelwerkwoord en hoort hier niet. Uit de dialoog: 'barang saya berat sekali'."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Barang saya berat.",
      "transformationInstruction": "Maak de zin sterker: mijn spullen zijn ERG zwaar",
      "acceptableAnswers": [
        "Barang saya berat sekali."
      ],
      "hintText": "Voeg het versterkingswoord toe NA het bijvoeglijk naamwoord",
      "explanationText": "'Sekali' (erg/zeer) wordt altijd NA het bijvoeglijk naamwoord geplaatst: 'berat sekali' = erg zwaar. Uit de dialoog: 'Barang saya berat sekali.'"
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sourceSentence": "Rumah itu bagus.",
      "transformationInstruction": "Maak de zin sterker: dat huis is ERG mooi",
      "acceptableAnswers": [
        "Rumah itu bagus sekali."
      ],
      "hintText": "Voeg 'sekali' toe achter het bijvoeglijk naamwoord",
      "explanationText": "'Bagus sekali' = erg mooi. 'Sekali' versterkt het bijvoeglijk naamwoord en staat er altijd achter. Vergelijk met het Nederlands: 'erg mooi' (erg VOOR) vs 'bagus sekali' (sekali NA)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Dat hotel is erg duur.",
      "requiredTargetPattern": "sekali-intensifier",
      "acceptableAnswers": [
        "Hotel itu mahal sekali."
      ],
      "disallowedShortcutForms": [
        "Hotel itu sangat mahal"
      ],
      "explanationText": "'Sekali' (erg/zeer) komt NA het bijvoeglijk naamwoord: 'mahal sekali' = erg duur. Let op de omgekeerde volgorde vergeleken met het Nederlands."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "sekali-intensifier",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Deze fiets is heel mooi.",
      "requiredTargetPattern": "sekali-intensifier",
      "acceptableAnswers": [
        "Sepeda ini bagus sekali."
      ],
      "disallowedShortcutForms": [
        "Sepeda ini sangat bagus"
      ],
      "explanationText": "Uit de grammatica: 'Sepeda ini bagus sekali'. 'Sekali' achter het bijvoeglijk naamwoord. 'Sangat' is een alternatief maar staat voor het bijvoeglijk naamwoord -- hier oefenen we 'sekali'."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Ik woon in de stad Utrecht.",
      "requiredTargetPattern": "dari-di-ke-locative",
      "acceptableAnswers": [
        "Saya tinggal di kota Utrecht."
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Di' voor locatie/verblijfplaats. 'Tinggal di kota Utrecht' = wonen in de stad Utrecht. Uit Oefening IV."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sourceLanguageSentence": "Waar gaat u heen, meneer Suparman?",
      "requiredTargetPattern": "dari-di-ke-locative",
      "acceptableAnswers": [
        "Bapak Suparman mau ke mana?"
      ],
      "disallowedShortcutForms": null,
      "explanationText": "'Ke mana' = waarheen (beweging). 'Mau ke mana' = wilt u naartoe gaan. Uit Oefening IV."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sentence": "Ibu berjalan ___ atas.",
      "translation": "Mevrouw loopt naar boven.",
      "options": [
        "di",
        "dari",
        "ke",
        "ada"
      ],
      "correctOptionId": "ke",
      "explanationText": "'Ke atas' = naar boven (beweging omhoog). 'Di atas' = boven zijn (locatie). 'Dari atas' = van boven (herkomst). Uit Oefening VI."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "dari-di-ke-locative",
    "review_status": "published",
    "payload": {
      "sentence": "Kucing tidur ___ bawah meja.",
      "translation": "De kat slaapt onder de tafel.",
      "options": [
        "ke",
        "dari",
        "di",
        "ada"
      ],
      "correctOptionId": "di",
      "explanationText": "'Di bawah' = onder (locatie, rust). De kat ligt daar -- geen beweging. 'Ke bawah' zou beweging naar beneden zijn. Uit Oefening VI."
    }
  }
]
