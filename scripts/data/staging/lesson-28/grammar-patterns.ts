// Grammar patterns for Lesson 28 — Di Kantor (Bab 12)
// Focus: discourse-economie (wetten van behoud van onderwerp/tijd/getal) +
//        het me-/di- + -kan/-i applicatief-causatief contrast.
export const grammarPatterns = [
  {
    "pattern_name": "Wet van behoud van onderwerp (subject ellipsis / zero anaphora)",
    "description": "Het onderwerp wordt niet steeds herhaald: zodra het is geïntroduceerd, blijft het gelden tot een ander onderwerp expliciet wordt genoemd. Waar het Nederlands een voornaamwoord verplicht herhaalt, laat het Indonesisch het weg.",
    "confusion_group": "discourse-economy",
    "page_reference": 3,
    "slug": "l28-behoud-van-onderwerp",
    "complexity_score": 5,
    "example": "Saya dulu ke Jakarta. Sering ke mana-mana. Menginap di hotel. — Vroeger ben ik in Jakarta geweest. Vaak ging ik overal heen. Ik logeerde er in een hotel."
  },
  {
    "pattern_name": "Wet van behoud van tijd (tense-loze werkwoorden + tijdmarkers)",
    "description": "Indonesische werkwoorden vervoegen niet naar tijd. De tijd wordt één keer aangegeven met een tijdwoord of een aspectmarker (belum, baru, sedang, sudah) en geldt daarna tot een nieuwe tijdsbepaling wordt vermeld.",
    "confusion_group": "discourse-economy",
    "page_reference": 3,
    "slug": "l28-behoud-van-tijd",
    "complexity_score": 5,
    "example": "Besok ayah juga mau ke sana. Tinggal di hotel juga. — Morgen gaat vader daar ook heen. Hij zal ook in een hotel verblijven."
  },
  {
    "pattern_name": "Wet van behoud van enkelvoud en meervoud (general number)",
    "description": "Indonesisch markeert getal in principe niet. Bepaalde zaken (met itu/ini) zijn meestal enkelvoud, onbepaalde generieke uitspraken vaak meervoud. Expliciet meervoud markeer je met reduplicatie, para, een telwoord of een hoeveelheidswoord — maar nooit dubbel.",
    "confusion_group": "discourse-economy",
    "page_reference": 4,
    "slug": "l28-behoud-getal",
    "complexity_score": 5,
    "example": "Kucing itu nakal. — Die kat is stout. (vs. Kucing-kucing itu nakal — Die katten zijn stout.)"
  },
  {
    "pattern_name": "me-/di- + -kan vs -i (applicatief-causatief tegenover locatief)",
    "description": "Op dezelfde stam levert -kan een causatieve/benefactieve, meer oblique lezing op, terwijl -i een directe, object- of plaatsgerichte lezing geeft (doel, locatie of ontvanger die niet zelf verplaatst wordt). me- = actief, di- = passief.",
    "confusion_group": "applicative-causative",
    "page_reference": 5,
    "slug": "l28-kan-i-applicatief-causatief",
    "complexity_score": 6,
    "example": "Setiap hari orang itu melewati rumah saya. — Elke dag loopt die man langs mijn huis. (vs. melewatkan kemungkinan — een kans laten voorbijgaan)"
  }
]
