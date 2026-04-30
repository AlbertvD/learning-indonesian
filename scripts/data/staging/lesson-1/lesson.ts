// Lesson 1 — reverse-engineered from DB by reverse-engineer-staging.ts
export const lesson = {
  "title": "Les 1 - Di Pasar (Op de markt)",
  "description": "Leer de basisuitspraakregels van het Indonesisch, essentiële grammaticaprincipes (werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord), en oefen met een marktdialoog en de getallen 0-10.",
  "level": "A1",
  "module_id": "module-1",
  "order_index": 1,
  "sections": [
    {
      "title": "Uitspraak",
      "order_index": 0,
      "content": {
        "type": "text",
        "intro": "De Indonesische woorden kan men in het begin het best rustig en zonder klemtoon uitspreken. Van belang bij de uitspraak is een gelijkmatig ritme. Hierbij worden we geholpen door het feit dat de woorden over het algemeen niet lang zijn en een indeling in lettergrepen makkelijk te maken is.",
        "examples": [
          {
            "dutch": "Welkom",
            "phonetic": "Se-la-mat da-tang",
            "indonesian": "Selamat datang"
          },
          {
            "dutch": "Hoe is het ermee?",
            "phonetic": "A-pa ka-bar?",
            "indonesian": "Apa kabar?"
          },
          {
            "dutch": "Goed, dank u wel",
            "phonetic": "Ba-ik, te-ri-ma ka-sih",
            "indonesian": "Baik, terima kasih"
          },
          {
            "dutch": "Gaat u naar Bandung?",
            "phonetic": "Ba-pak ke Ban-dung?",
            "indonesian": "Bapak ke Bandung?"
          }
        ],
        "spelling": [
          {
            "rule": "c = tj",
            "dutch": "voldoende",
            "example": "cukup (tjoekoep)"
          },
          {
            "rule": "j = dj",
            "dutch": "Jakarta",
            "example": "Jakarta (Djakarta)"
          },
          {
            "rule": "u = oe",
            "dutch": "mevrouw, u",
            "example": "Ibu (Iboe)"
          },
          {
            "rule": "y = j",
            "dutch": "Surabaya",
            "example": "Surabaya (Soerabaja)"
          },
          {
            "rule": "ny = nj",
            "dutch": "mevrouw, u",
            "example": "nyonya (njonja)"
          },
          {
            "rule": "kh = ch",
            "dutch": "einde",
            "example": "akhir (achir)"
          }
        ]
      }
    },
    {
      "title": "Eenvoudige zinnen",
      "order_index": 1,
      "content": {
        "type": "text",
        "sentences": [
          {
            "dutch": "Ik ga/ging naar de/een markt",
            "indonesian": "Saya ke pasar"
          },
          {
            "dutch": "Ik koop/kocht een vrucht/vruchten",
            "indonesian": "Saya beli buah"
          },
          {
            "dutch": "Meneer koopt/kocht fruit",
            "indonesian": "Bapak beli buah-buahan"
          },
          {
            "dutch": "Meneer en mevrouw kopen/kochten een ananas",
            "indonesian": "Bapak dan Ibu beli nanas"
          },
          {
            "dutch": "Ik wil/wilde een groot huis kopen",
            "indonesian": "Saya mau beli rumah besar"
          }
        ]
      }
    },
    {
      "title": "Grammatica",
      "order_index": 2,
      "content": {
        "type": "grammar",
        "intro": "In de voorgaande Indonesische zinnen zijn enkele bijzonderheden op te merken, namelijk:",
        "categories": [
          {
            "rules": [
              "Zinnen zonder een werkwoord zijn heel gewoon.",
              "Werkwoorden worden niet vervoegd naar enkel- of meervoud.",
              "Werkwoorden worden niet vervoegd naar tegenwoordige of verleden tijd. Tenzij uit de context anders blijkt, vertaalt men het werkwoord in de tegenwoordige tijd.",
              "Werkwoorden worden bij elkaar gezet."
            ],
            "title": "Werkwoord",
            "examples": [
              {
                "dutch": "Dat [is] duur (geen koppelwerkwoord)",
                "indonesian": "Itu mahal"
              },
              {
                "dutch": "Ik koop een vrucht (geen vervoeging)",
                "indonesian": "Saya beli buah"
              },
              {
                "dutch": "Ik wil een groot huis kopen (werkwoorden bij elkaar)",
                "indonesian": "Saya mau beli rumah besar"
              }
            ]
          },
          {
            "rules": [
              "Zelfstandige naamwoorden hebben geen lidwoord (de, het, een).",
              "Er wordt bij zelfstandige naamwoorden geen onderscheid gemaakt tussen enkelvoud en meervoud.",
              "Herhaling van een zelfstandig naamwoord geeft meervoud of verscheidenheid aan.",
              "Als uit de context blijkt dat er sprake is van meervoud of verscheidenheid, wordt een zelfstandig naamwoord niet verdubbeld (2 huizen = dua rumah en niet dua rumah-rumah)."
            ],
            "title": "Zelfstandig naamwoord",
            "examples": [
              {
                "dutch": "Ik koop een/het huis (geen lidwoord)",
                "indonesian": "Saya beli rumah"
              },
              {
                "dutch": "Twee huizen (geen meervoud bij telwoord)",
                "indonesian": "Dua rumah"
              },
              {
                "dutch": "Allerlei fruit (reduplicatie = verscheidenheid)",
                "indonesian": "Buah-buahan"
              }
            ]
          },
          {
            "rules": [
              "Het bijvoeglijk naamwoord wordt achter het zelfstandig naamwoord geplaatst."
            ],
            "title": "Bijvoeglijk naamwoord",
            "examples": [
              {
                "dutch": "Een groot huis (bijv.nw. na znw.)",
                "indonesian": "Rumah besar"
              }
            ]
          }
        ]
      }
    },
    {
      "title": "Di Pasar (Op de markt)",
      "order_index": 3,
      "content": {
        "type": "dialogue",
        "lines": [
          {
            "text": "Pak, saya mau beli tiga buah pisang. Berapa harganya?",
            "speaker": "Ibu"
          },
          {
            "text": "Harganya murah Bu, delapan rupiah.",
            "speaker": "Penjual"
          },
          {
            "text": "Itu mahal ya! Empat rupiah boleh?",
            "speaker": "Ibu"
          },
          {
            "text": "Belum bisa Bu. Tetapi kalau mau lima buah, bisa sembilan rupiah.",
            "speaker": "Penjual"
          }
        ],
        "setup": "Ibu mau ke pasar. Mau beli pisang."
      }
    },
    {
      "title": "Woordenlijst",
      "order_index": 4,
      "content": {
        "type": "vocabulary",
        "items": [
          {
            "dutch": "einde",
            "indonesian": "akhir"
          },
          {
            "dutch": "wat?",
            "indonesian": "apa?"
          },
          {
            "dutch": "taal",
            "indonesian": "bahasa"
          },
          {
            "dutch": "goed",
            "indonesian": "baik"
          },
          {
            "dutch": "meneer, vader, u",
            "indonesian": "bapak"
          },
          {
            "dutch": "kopen",
            "indonesian": "beli"
          },
          {
            "dutch": "nog niet",
            "indonesian": "belum"
          },
          {
            "dutch": "hoeveel?",
            "indonesian": "berapa?"
          },
          {
            "dutch": "groot",
            "indonesian": "besar"
          },
          {
            "dutch": "kunnen, mogen",
            "indonesian": "bisa"
          },
          {
            "dutch": "mogen, kunnen",
            "indonesian": "boleh"
          },
          {
            "dutch": "vrucht",
            "indonesian": "buah"
          },
          {
            "dutch": "voldoende",
            "indonesian": "cukup"
          },
          {
            "dutch": "en",
            "indonesian": "dan"
          },
          {
            "dutch": "uit, van",
            "indonesian": "dari"
          },
          {
            "dutch": "komen",
            "indonesian": "datang"
          },
          {
            "dutch": "in, op, te",
            "indonesian": "di"
          },
          {
            "dutch": "prijs",
            "indonesian": "harga"
          },
          {
            "dutch": "hotel",
            "indonesian": "hotel"
          },
          {
            "dutch": "mevrouw, moeder, u",
            "indonesian": "ibu"
          },
          {
            "dutch": "indonesië",
            "indonesian": "indonesia"
          },
          {
            "dutch": "dat, die",
            "indonesian": "itu"
          },
          {
            "dutch": "bericht",
            "indonesian": "kabar"
          },
          {
            "dutch": "indien, wanneer",
            "indonesian": "kalau"
          },
          {
            "dutch": "gunst, genegenheid",
            "indonesian": "kasih"
          },
          {
            "dutch": "naar",
            "indonesian": "ke"
          },
          {
            "dutch": "leeg",
            "indonesian": "kosong"
          },
          {
            "dutch": "duur",
            "indonesian": "mahal"
          },
          {
            "dutch": "eten",
            "indonesian": "makan"
          },
          {
            "dutch": "willen",
            "indonesian": "mau"
          },
          {
            "dutch": "goedkoop",
            "indonesian": "murah"
          },
          {
            "dutch": "ananas",
            "indonesian": "nanas"
          },
          {
            "dutch": "mevrouw, u",
            "indonesian": "nyonya"
          },
          {
            "dutch": "mens",
            "indonesian": "orang"
          },
          {
            "dutch": "markt",
            "indonesian": "pasar"
          },
          {
            "dutch": "verkoper",
            "indonesian": "penjual"
          },
          {
            "dutch": "banaan",
            "indonesian": "pisang"
          },
          {
            "dutch": "huis",
            "indonesian": "rumah"
          },
          {
            "dutch": "munteenheid",
            "indonesian": "rupiah (Rp)"
          },
          {
            "dutch": "ik, mijn",
            "indonesian": "saya"
          },
          {
            "dutch": "veilig, welzijn",
            "indonesian": "selamat"
          },
          {
            "dutch": "ontvangen",
            "indonesian": "terima"
          },
          {
            "dutch": "maar, echter",
            "indonesian": "tetapi"
          },
          {
            "dutch": "niet, nee",
            "indonesian": "tidak"
          }
        ]
      }
    },
    {
      "title": "Uitdrukkingen",
      "order_index": 5,
      "content": {
        "type": "expressions",
        "items": [
          {
            "dutch": "Hoe gaat het ermee?",
            "indonesian": "Apa kabar?"
          },
          {
            "dutch": "Goed, dank u wel",
            "indonesian": "Baik-baik saja"
          },
          {
            "dutch": "Wat kost het?",
            "indonesian": "Berapa harganya?"
          },
          {
            "dutch": "Het is goedkoop; de prijs is laag",
            "indonesian": "Harganya murah"
          },
          {
            "dutch": "Welkom",
            "indonesian": "Selamat datang"
          },
          {
            "dutch": "Dank u wel",
            "indonesian": "Terima kasih"
          }
        ]
      }
    },
    {
      "title": "Telwoorden",
      "order_index": 6,
      "content": {
        "type": "numbers",
        "items": [
          {
            "dutch": "0",
            "indonesian": "nol, kosong"
          },
          {
            "dutch": "1",
            "indonesian": "satu"
          },
          {
            "dutch": "2",
            "indonesian": "dua"
          },
          {
            "dutch": "3",
            "indonesian": "tiga"
          },
          {
            "dutch": "4",
            "indonesian": "empat"
          },
          {
            "dutch": "5",
            "indonesian": "lima"
          },
          {
            "dutch": "6",
            "indonesian": "enam"
          },
          {
            "dutch": "7",
            "indonesian": "tujuh"
          },
          {
            "dutch": "8",
            "indonesian": "delapan"
          },
          {
            "dutch": "9",
            "indonesian": "sembilan"
          },
          {
            "dutch": "10",
            "indonesian": "sepuluh"
          }
        ]
      }
    },
    {
      "title": "Uitspraakoefening",
      "order_index": 7,
      "content": {
        "type": "pronunciation",
        "letters": [
          {
            "rule": "kort als in kam",
            "letter": "a",
            "examples": [
              "apa",
              "akan",
              "siapa",
              "tetapi"
            ]
          },
          {
            "rule": "als in bang",
            "letter": "b",
            "examples": [
              "bagus",
              "bapak",
              "barang",
              "berapa"
            ]
          },
          {
            "rule": "als in tjalk",
            "letter": "c",
            "examples": [
              "cendol",
              "coklat",
              "kecil",
              "kunci"
            ]
          },
          {
            "rule": "als in denken",
            "letter": "d",
            "examples": [
              "dan",
              "dari",
              "delapan",
              "datang"
            ]
          },
          {
            "rule": "als in bericht",
            "letter": "e",
            "examples": [
              "beli",
              "berat",
              "dekat",
              "enam"
            ]
          },
          {
            "rule": "als in Eva",
            "letter": "é",
            "examples": [
              "sate (saté)",
              "sore (soré)"
            ]
          },
          {
            "rule": "als in bek",
            "letter": "è",
            "examples": [
              "enak (ènak)",
              "teh (tèh)"
            ]
          },
          {
            "rule": "als in falen",
            "letter": "f",
            "examples": [
              "fanatik",
              "famili",
              "fakir",
              "faham"
            ]
          },
          {
            "rule": "als in 'go'",
            "letter": "g",
            "examples": [
              "gampang",
              "gelas",
              "gigi",
              "gengsi"
            ]
          },
          {
            "rule": "als in heet",
            "letter": "h",
            "examples": [
              "hangat",
              "harus",
              "hati",
              "helai"
            ]
          },
          {
            "rule": "als in iep",
            "letter": "i",
            "examples": [
              "ikan",
              "istri",
              "ikut",
              "isi"
            ]
          },
          {
            "rule": "als in 'James'",
            "letter": "j",
            "examples": [
              "jam",
              "jangan",
              "juga",
              "saja"
            ]
          },
          {
            "rule": "als in kalm",
            "letter": "k",
            "examples": [
              "kabar",
              "kamar",
              "kalau",
              "ke"
            ]
          },
          {
            "rule": "als in lang",
            "letter": "l",
            "examples": [
              "lama",
              "lalu",
              "lagi",
              "laku"
            ]
          },
          {
            "rule": "als in mak",
            "letter": "m",
            "examples": [
              "makan",
              "masih",
              "mau",
              "mati"
            ]
          },
          {
            "rule": "als in na",
            "letter": "n",
            "examples": [
              "nasi",
              "nanas",
              "nanti",
              "negeri"
            ]
          },
          {
            "rule": "als in optiek",
            "letter": "o",
            "examples": [
              "opelet",
              "orang",
              "otak",
              "otot"
            ]
          },
          {
            "rule": "als in pa",
            "letter": "p",
            "examples": [
              "pada",
              "pagi",
              "paksa",
              "pasar"
            ]
          },
          {
            "rule": "als in kalm",
            "letter": "q",
            "examples": [
              "qari",
              "qariah",
              "Quran",
              "Alquran"
            ]
          },
          {
            "rule": "als in radio",
            "letter": "r",
            "examples": [
              "raba",
              "rambut",
              "rasa",
              "rumah"
            ]
          },
          {
            "rule": "als in staan",
            "letter": "s",
            "examples": [
              "saya",
              "sayang",
              "sudah",
              "sayur"
            ]
          },
          {
            "rule": "als in trein",
            "letter": "t",
            "examples": [
              "terima",
              "teman",
              "tenun",
              "tiga"
            ]
          },
          {
            "rule": "als in oever",
            "letter": "u",
            "examples": [
              "uang",
              "ubi",
              "utara",
              "tubuh"
            ]
          },
          {
            "rule": "als in varen",
            "letter": "v",
            "examples": [
              "via",
              "visa",
              "vitamin",
              "vokal"
            ]
          },
          {
            "rule": "als in waar",
            "letter": "w",
            "examples": [
              "wah!",
              "walau",
              "warta",
              "wisma"
            ]
          },
          {
            "rule": "als in ex",
            "letter": "x",
            "examples": [
              "xerox",
              "sinar-X",
              "xilofon",
              "xenograf"
            ]
          },
          {
            "rule": "als in ja",
            "letter": "y",
            "examples": [
              "yakin",
              "yang",
              "ayam",
              "ya"
            ]
          },
          {
            "rule": "als in zang",
            "letter": "z",
            "examples": [
              "zaman",
              "ziarah",
              "zina",
              "zakat"
            ]
          }
        ]
      }
    },
    {
      "title": "Oefeningen",
      "order_index": 8,
      "content": {
        "type": "exercises",
        "sections": [
          {
            "type": "translation",
            "items": [
              {
                "answer": "Saya ke pasar",
                "prompt": "Ik ga naar de markt"
              },
              {
                "answer": "Ibu beli enam pisang",
                "prompt": "Mevrouw koopt zes bananen"
              },
              {
                "answer": "Berapa harganya?",
                "prompt": "Wat kost het?"
              },
              {
                "answer": "Selamat datang Bu, apa kabar?",
                "prompt": "Welkom mevrouw, hoe is het met u?"
              },
              {
                "answer": "Saya tidak mau pisang, saya mau nanas",
                "prompt": "Ik wil geen bananen, ik wil ananas"
              },
              {
                "answer": "Bapak makan buah",
                "prompt": "Meneer eet een vrucht"
              },
              {
                "answer": "Ibu Gusti Ayu dan ibu datang dari Bali",
                "prompt": "Mevrouw Gusti Ayu en moeder komen uit Bali"
              },
              {
                "answer": "Di toko pisang mahal, di pasar murah",
                "prompt": "In de winkel zijn bananen duur, op de markt zijn ze goedkoop"
              },
              {
                "answer": "Apa kabar? Baik, terima kasih",
                "prompt": "Hoe gaat het ermee? Goed, dank u wel"
              },
              {
                "answer": "Dua ibu beli sembilan buah",
                "prompt": "Twee dames kopen negen vruchten"
              }
            ],
            "title": "Oefening I",
            "instruction": "Vertaal in het Indonesisch."
          },
          {
            "type": "translation",
            "items": [
              {
                "answer": "Ik wil geen bananen eten",
                "prompt": "Saya tidak mau makan pisang"
              },
              {
                "answer": "Welkom, mevrouw, hoe gaat het ermee?",
                "prompt": "Selamat datang, Bu, apa kabar?"
              },
              {
                "answer": "Goed, dank u wel",
                "prompt": "Baik, terima kasih"
              },
              {
                "answer": "De prijs van bananen is goedkoop, de prijs van ananas is duur",
                "prompt": "Harga pisang murah, harga nanas mahal"
              },
              {
                "answer": "Meneer en mevrouw willen niet naar de markt, maar naar het hotel",
                "prompt": "Bapak dan Ibu tidak mau ke pasar, tetapi mau ke hotel"
              },
              {
                "answer": "Hoeveel vruchten wilt u, meneer? Drie",
                "prompt": "Bapak mau berapa buah? Tiga"
              },
              {
                "answer": "Zeven ananassen is niet genoeg",
                "prompt": "Tujuh nanas tidak cukup"
              },
              {
                "answer": "Ik wil acht kopen",
                "prompt": "Saya mau beli delapan"
              },
              {
                "answer": "Mevrouw komt van de markt en koopt ananas en bananen",
                "prompt": "Ibu datang dari pasar dan beli nanas dan pisang"
              },
              {
                "answer": "Negen vruchten zijn duur, ik wil zes vruchten",
                "prompt": "Sembilan buah mahal, saya mau enam buah"
              }
            ],
            "title": "Oefening II",
            "instruction": "Vertaal in het Nederlands."
          },
          {
            "type": "grammar_drill",
            "items": [
              {
                "answer": "dua pisang",
                "prompt": "2 bananen"
              },
              {
                "answer": "sembilan bapak",
                "prompt": "9 heren"
              },
              {
                "answer": "tujuh nanas",
                "prompt": "7 ananassen"
              },
              {
                "answer": "enam ibu",
                "prompt": "6 dames"
              },
              {
                "answer": "empat penjual",
                "prompt": "4 verkopers"
              },
              {
                "answer": "tiga toko",
                "prompt": "3 winkels"
              },
              {
                "answer": "tiga ibu",
                "prompt": "drie dames"
              },
              {
                "answer": "sembilan toko",
                "prompt": "negen winkels"
              },
              {
                "answer": "dua orang",
                "prompt": "twee mensen"
              },
              {
                "answer": "enam nanas",
                "prompt": "zes ananassen"
              },
              {
                "answer": "lima bahasa",
                "prompt": "vijf talen"
              },
              {
                "answer": "empat rupiah",
                "prompt": "vier rupiah"
              }
            ],
            "title": "Oefening III",
            "instruction": "Schrijf voluit in het Indonesisch."
          }
        ]
      }
    }
  ]
}
