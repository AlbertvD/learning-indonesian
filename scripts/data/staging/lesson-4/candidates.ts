// Auto-generated from lesson 4 extraction (local mock)
// Status: pending_review
export const candidates = [
  {
    "exercise_type": "contrast_pair",
    "page_reference": 1,
    "grammar_pattern_id": "subject_verb_agreement",
    "source_text": "Saya bekerja sebagai guru.",
    "prompt_text": "Which sentence is correct for \"I work as a teacher\"?",
    "answer_key": [
      "0"
    ],
    "correctOptionId": "0",
    "options": [
      "Saya bekerja sebagai guru.",
      "Saya bekerja seperti guru."
    ],
    "explanation": "Use \"sebagai\" (as) for professions, not \"seperti\" (like)",
    "review_status": "approved",
    "created_at": "2026-04-03T21:42:36.040Z"
  },
  {
    "exercise_type": "sentence_transformation",
    "page_reference": 2,
    "grammar_pattern_id": "question_words",
    "source_text": "Anda berasal dari mana?",
    "prompt_text": "Transform to statement: \"I come from Jakarta\"",
    "answer_key": [
      "Saya berasal dari Jakarta",
      "Saya berasal dari Jakarta."
    ],
    "explanation": "Change the question to a statement by replacing \"Anda\" (you) with \"Saya\" (I) and providing a location.",
    "review_status": "approved",
    "created_at": "2026-04-03T21:42:36.040Z"
  },
  {
    "exercise_type": "constrained_translation",
    "page_reference": 2,
    "grammar_pattern_id": "noun_phrases",
    "source_text": "I am an engineer.",
    "prompt_text": "Translate: \"I am an engineer.\" (Use: seorang, insinyur)",
    "answer_key": [
      "Saya seorang insinyur",
      "Saya adalah seorang insinyur"
    ],
    "requiredTargetPattern": "seorang insinyur",
    "explanation": "In Indonesian, professions use \"seorang\" (an/a) + noun. You can omit \"adalah\".",
    "review_status": "approved",
    "created_at": "2026-04-03T21:42:36.040Z"
  },
  {
    "exercise_type": "speaking",
    "page_reference": 1,
    "source_text": "Memperkenalkan diri",
    "prompt_text": "Introduce yourself: name, where you are from, and your occupation",
    "answer_key": [
      "Open-ended"
    ],
    "explanation": "Use the patterns: \"Nama saya...\", \"Saya dari...\", \"Saya seorang...\"",
    "targetPatternOrScenario": "Self-introduction with name, origin, and profession",
    "review_status": "approved",
    "created_at": "2026-04-03T21:42:36.040Z"
  }
] as const
