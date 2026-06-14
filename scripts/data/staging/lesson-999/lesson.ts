// Common Words — the hidden gap-word home for frequency-band collections
// (collections spec §6). NOT a coursebook lesson: it is the ingestion vehicle for
// high-frequency words taught in no chapter. module_id 'common-words' +
// order_index 999 match the seeded hidden `lessons` row (migration.sql §"Common
// Words"); is_hidden=true keeps it out of get_lessons_overview and the sign-in
// backfill, so its caps surface ONLY via collection activation.
//
// Publish with: bun scripts/publish-approved-content.ts 999
// Vocab-only → Stage A writes the section + learning_items + vocab caps; Stage B
// is a no-op for vocab. Words already taught elsewhere are deduped by the
// pipeline's resolve-or-create on normalized_text, so a superset is safe.
//
// Glosses authored 2026-06-14 from the PBWL top-100 residual (analyze-top100.ts).
// NL is the author-reviewed answer key; many are grammatical particles that are
// weak as isolated flashcards (learned in context) but belong to the frequency
// band as coverage. REVIEW the NL before relying on it.
export const lesson = {
  "title": "Common Words",
  "description": "Veelvoorkomende woorden uit de frequentielijst die in geen enkel hoofdstuk worden onderwezen (woordenlijsten / frequentiebanden).",
  "level": "A1",
  "module_id": "common-words",
  "order_index": 999,
  "sections": [
    {
      "title": "Veelvoorkomende woorden",
      "order_index": 0,
      "content": {
        "type": "vocabulary",
        "items": [
          { "indonesian": "untuk",   "dutch": "voor, om te",            "english": "for, in order to" },
          { "indonesian": "bagai",   "dutch": "zoals, als",             "english": "like, as" },
          { "indonesian": "adalah",  "dutch": "is, zijn (koppelwerkwoord)", "english": "is, are (copula)" },
          { "indonesian": "oleh",    "dutch": "door (in lijdende vorm)", "english": "by (agent in passive)" },
          { "indonesian": "cara",    "dutch": "manier, wijze",          "english": "way, method, manner" },
          { "indonesian": "saat",    "dutch": "moment, tijdens, toen",  "english": "moment, when, at the time" },
          { "indonesian": "bahwa",   "dutch": "dat (voegwoord)",        "english": "that (conjunction)" },
          { "indonesian": "jika",    "dutch": "als, indien",            "english": "if" },
          { "indonesian": "tiap",    "dutch": "elk, ieder",             "english": "each, every" },
          { "indonesian": "pun",     "dutch": "ook, zelfs (partikel)",  "english": "even, also (particle)" },
          { "indonesian": "ketika",  "dutch": "toen, wanneer",          "english": "when, at the time that" },
          { "indonesian": "sering",  "dutch": "vaak, dikwijls",         "english": "often" },
          { "indonesian": "masing",  "dutch": "elk, ieder (masing-masing)", "english": "each (in masing-masing)" },
          { "indonesian": "ya",      "dutch": "ja",                     "english": "yes" },
          { "indonesian": "sang",    "dutch": "de/het (eervol lidwoord)", "english": "the (honorific article)" },
          { "indonesian": "mohon",   "dutch": "verzoeken, alstublieft", "english": "to request, please" },
          { "indonesian": "sila",    "dutch": "alstublieft, ga uw gang (silakan)", "english": "please, go ahead (silakan)" },
          { "indonesian": "mengapa", "dutch": "waarom",                 "english": "why" },
          { "indonesian": "kenapa",  "dutch": "waarom (informeel)",     "english": "why (informal)" },
          { "indonesian": "kapan",   "dutch": "wanneer",                "english": "when" },
          { "indonesian": "mari",    "dutch": "laten we, kom",          "english": "let's, come on" },
          { "indonesian": "ayo",     "dutch": "kom op, laten we",       "english": "come on, let's" },
          { "indonesian": "laku",    "dutch": "gewild zijn, verkocht worden", "english": "to sell well, be in demand" },
          { "indonesian": "guna",    "dutch": "nut, gebruik; om te",    "english": "use, purpose; in order to" },
          { "indonesian": "hingga",  "dutch": "tot, totdat",            "english": "until, up to" },
          { "indonesian": "milik",   "dutch": "bezit, eigendom",        "english": "possession, property" }
        ]
      }
    }
  ]
}
