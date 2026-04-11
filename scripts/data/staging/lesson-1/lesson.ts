// Lesson 1 — Di Pasar (Op de markt)
// Grammar/exercise sections structured by linguist-creator
// Vocabulary/expressions/numbers/dialogue/text/pronunciation sections live in the DB (seeded via legacy path)
export const lesson = {
  "title": "Les 1 - Di Pasar (Op de markt)",
  "description": "Leer de basisuitspraakregels van het Indonesisch, essentiële grammaticaprincipes (werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord), en oefen met een marktdialoog en de getallen 0-10.",
  "level": "A1",
  "module_id": "module-1",
  "order_index": 1,
  "sections": [
    {
      "title": "Grammatica",
      "order_index": 2,
      "content": {
        "type": "grammar",
        "intro": "In de voorgaande Indonesische zinnen zijn enkele bijzonderheden op te merken, namelijk:",
        "categories": [
          {
            "title": "Werkwoord",
            "rules": [
              "Zinnen zonder een werkwoord zijn heel gewoon.",
              "Werkwoorden worden niet vervoegd naar enkel- of meervoud.",
              "Werkwoorden worden niet vervoegd naar tegenwoordige of verleden tijd. Tenzij uit de context anders blijkt, vertaalt men het werkwoord in de tegenwoordige tijd.",
              "Werkwoorden worden bij elkaar gezet."
            ],
            "examples": [
              { "indonesian": "Itu mahal", "dutch": "Dat [is] duur (geen koppelwerkwoord)" },
              { "indonesian": "Saya beli buah", "dutch": "Ik koop een vrucht (geen vervoeging)" },
              { "indonesian": "Saya mau beli rumah besar", "dutch": "Ik wil een groot huis kopen (werkwoorden bij elkaar)" }
            ]
          },
          {
            "title": "Zelfstandig naamwoord",
            "rules": [
              "Zelfstandige naamwoorden hebben geen lidwoord (de, het, een).",
              "Er wordt bij zelfstandige naamwoorden geen onderscheid gemaakt tussen enkelvoud en meervoud.",
              "Herhaling van een zelfstandig naamwoord geeft meervoud of verscheidenheid aan.",
              "Als uit de context blijkt dat er sprake is van meervoud of verscheidenheid, wordt een zelfstandig naamwoord niet verdubbeld (2 huizen = dua rumah en niet dua rumah-rumah)."
            ],
            "examples": [
              { "indonesian": "Saya beli rumah", "dutch": "Ik koop een/het huis (geen lidwoord)" },
              { "indonesian": "Dua rumah", "dutch": "Twee huizen (geen meervoud bij telwoord)" },
              { "indonesian": "Buah-buahan", "dutch": "Allerlei fruit (reduplicatie = verscheidenheid)" }
            ]
          },
          {
            "title": "Bijvoeglijk naamwoord",
            "rules": [
              "Het bijvoeglijk naamwoord wordt achter het zelfstandig naamwoord geplaatst."
            ],
            "examples": [
              { "indonesian": "Rumah besar", "dutch": "Een groot huis (bijv.nw. na znw.)" }
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
            "title": "Oefening I",
            "instruction": "Vertaal in het Indonesisch.",
            "type": "translation",
            "items": [
              { "prompt": "Ik ga naar de markt", "answer": "Saya ke pasar" },
              { "prompt": "Mevrouw koopt zes bananen", "answer": "Ibu beli enam pisang" },
              { "prompt": "Wat kost het?", "answer": "Berapa harganya?" },
              { "prompt": "Welkom mevrouw, hoe is het met u?", "answer": "Selamat datang Bu, apa kabar?" },
              { "prompt": "Ik wil geen bananen, ik wil ananas", "answer": "Saya tidak mau pisang, saya mau nanas" },
              { "prompt": "Meneer eet een vrucht", "answer": "Bapak makan buah" },
              { "prompt": "Mevrouw Gusti Ayu en moeder komen uit Bali", "answer": "Ibu Gusti Ayu dan ibu datang dari Bali" },
              { "prompt": "In de winkel zijn bananen duur, op de markt zijn ze goedkoop", "answer": "Di toko pisang mahal, di pasar murah" },
              { "prompt": "Hoe gaat het ermee? Goed, dank u wel", "answer": "Apa kabar? Baik, terima kasih" },
              { "prompt": "Twee dames kopen negen vruchten", "answer": "Dua ibu beli sembilan buah" }
            ]
          },
          {
            "title": "Oefening II",
            "instruction": "Vertaal in het Nederlands.",
            "type": "translation",
            "items": [
              { "prompt": "Saya tidak mau makan pisang", "answer": "Ik wil geen bananen eten" },
              { "prompt": "Selamat datang, Bu, apa kabar?", "answer": "Welkom, mevrouw, hoe gaat het ermee?" },
              { "prompt": "Baik, terima kasih", "answer": "Goed, dank u wel" },
              { "prompt": "Harga pisang murah, harga nanas mahal", "answer": "De prijs van bananen is goedkoop, de prijs van ananas is duur" },
              { "prompt": "Bapak dan Ibu tidak mau ke pasar, tetapi mau ke hotel", "answer": "Meneer en mevrouw willen niet naar de markt, maar naar het hotel" },
              { "prompt": "Bapak mau berapa buah? Tiga", "answer": "Hoeveel vruchten wilt u, meneer? Drie" },
              { "prompt": "Tujuh nanas tidak cukup", "answer": "Zeven ananassen is niet genoeg" },
              { "prompt": "Saya mau beli delapan", "answer": "Ik wil acht kopen" },
              { "prompt": "Ibu datang dari pasar dan beli nanas dan pisang", "answer": "Mevrouw komt van de markt en koopt ananas en bananen" },
              { "prompt": "Sembilan buah mahal, saya mau enam buah", "answer": "Negen vruchten zijn duur, ik wil zes vruchten" }
            ]
          },
          {
            "title": "Oefening III",
            "instruction": "Schrijf voluit in het Indonesisch.",
            "type": "grammar_drill",
            "items": [
              { "prompt": "2 bananen", "answer": "dua pisang" },
              { "prompt": "9 heren", "answer": "sembilan bapak" },
              { "prompt": "7 ananassen", "answer": "tujuh nanas" },
              { "prompt": "6 dames", "answer": "enam ibu" },
              { "prompt": "4 verkopers", "answer": "empat penjual" },
              { "prompt": "3 winkels", "answer": "tiga toko" },
              { "prompt": "drie dames", "answer": "tiga ibu" },
              { "prompt": "negen winkels", "answer": "sembilan toko" },
              { "prompt": "twee mensen", "answer": "dua orang" },
              { "prompt": "zes ananassen", "answer": "enam nanas" },
              { "prompt": "vijf talen", "answer": "lima bahasa" },
              { "prompt": "vier rupiah", "answer": "empat rupiah" }
            ]
          }
        ]
      }
    }
  ]
}
