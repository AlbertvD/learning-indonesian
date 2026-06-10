// Exercise candidates for lesson 15
// Hand-authored (main thread) after linguist-reviewer flagged the auto-generated
// set: fixes the menyanyi rule, the menonton/menontonkan substring-duplicate
// critical, the mis-filed/pseudo-form loanword exercises, and draft artifacts.
// review_status 'pending_review' — publish via: bun scripts/publish-approved-content.ts 15
export const candidates = [
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "l15-me-prefix-root-recovery",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "De pesinden menyanyi. Welk basiswoord hoort bij de ME-vorm 'menyanyi'?",
      "targetMeaning": "zingen",
      "options": [
        { "id": "nyanyi", "text": "nyanyi" },
        { "id": "sanyi", "text": "sanyi" }
      ],
      "correctOptionId": "nyanyi",
      "explanationText": "Valstrik: meny- komt vaak van een basiswoord op 's' (sambung → menyambung). Maar 'menyanyi' is gewoon me- + nyanyi: het basiswoord begint al met 'ny', er valt niets weg. Het basiswoord is 'nyanyi'; 'sanyi' bestaat niet."
    }
  },
  {
    "exercise_type": "sentence_transformation",
    "grammar_pattern_slug": "l15-me-prefix-root-recovery",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "sourceSentence": "Kabel itu terlalu pendek, jadi harus menyambung kabel lain.",
      "transformationInstruction": "Geef het basiswoord (kata dasar) dat schuilgaat achter de ME-vorm 'menyambung'. Vul in: 'Kata dasar menyambung adalah ___.'",
      "acceptableAnswers": [
        "Kata dasar menyambung adalah sambung.",
        "Kata dasar dari menyambung adalah sambung.",
        "Basiswoord van menyambung adalah sambung.",
        "sambung"
      ],
      "hintText": "meny- vóór een basiswoord dat begint met 's': die 's' versmelt met de neusklank en valt weg in de ME-vorm.",
      "explanationText": "'menyambung' = meny- + sambung. Het basiswoord begint met 's'; bij meny- valt die 's' weg. Het basiswoord is dus 'sambung' (= verlengen, aaneenknopen)."
    }
  },
  {
    "exercise_type": "constrained_translation",
    "grammar_pattern_slug": "l15-me-prefix-root-recovery",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "sourceLanguageSentence": "De zangeres zingt een mooi lied op het podium.",
      "requiredTargetPattern": "l15-me-prefix-root-recovery",
      "acceptableAnswers": [
        "Penyanyi itu menyanyikan lagu yang indah di panggung.",
        "Penyanyi menyanyikan lagu indah di panggung.",
        "Penyanyi itu menyanyikan sebuah lagu indah di panggung."
      ],
      "disallowedShortcutForms": [ "nyanyi" ],
      "explanationText": "Basiswoord 'nyanyi' begint met 'ny', dus de ME-vorm is 'menyanyi' (me- blijft ongewijzigd). Met een lijdend voorwerp (lagu) gebruik je de transitieve vorm 'menyanyikan', niet het kale 'nyanyi'."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "l15-me-prefix-root-recovery",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "sentence": "Dalam pertunjukan itu Bima ___ raksasa sampai kalah.",
      "translation": "In die voorstelling slaat Bima de reus tot hij verliest.",
      "options": [ "memukul", "mempukul", "dipukul", "terpukul" ],
      "correctOptionId": "memukul",
      "explanationText": "Basiswoord 'pukul' begint met 'p'; bij mem- valt die 'p' weg → 'memukul'. 'mempukul' (p blijft staan) is fout; 'dipukul' is lijdend (passief); 'terpukul' is de ter-vorm. Bima is de handelende persoon, dus de actieve ME-vorm."
    }
  },
  {
    "exercise_type": "contrast_pair",
    "grammar_pattern_slug": "l15-me-prefix-loanword-no-nasalization",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "promptText": "Het leenwoord 'parkir' betekent parkeren. Welke ME-vorm is correct?",
      "targetMeaning": "een auto parkeren",
      "options": [
        { "id": "memparkir", "text": "memparkir" },
        { "id": "memarkir", "text": "memarkir" }
      ],
      "correctOptionId": "memparkir",
      "explanationText": "Bij een gewoon woord op 'p' valt de 'p' weg (pukul → memukul). Maar 'parkir' is een leenwoord: de beginklank 'p' blijft staan → 'memparkir'. 'memarkir' (p weggevallen) is fout omdat de leenwoord-regel de gewone wegval blokkeert."
    }
  },
  {
    "exercise_type": "cloze_mcq",
    "grammar_pattern_slug": "l15-me-prefix-loanword-no-nasalization",
    "source_page": null,
    "review_status": "pending_review",
    "requiresManualApproval": true,
    "payload": {
      "sentence": "Pegawai bank itu ___ uang ke rekening saya.",
      "translation": "Die bankmedewerker maakt geld over naar mijn rekening.",
      "options": [ "mentransfer", "menransfer", "ditransfer", "tertransfer" ],
      "correctOptionId": "mentransfer",
      "explanationText": "'transfer' is een leenwoord op 't'. De gewone regel zou de 't' laten wegvallen (→ 'menransfer'), maar bij leenwoorden blijft de beginklank staan → 'mentransfer'. 'ditransfer' is passief, 'tertransfer' de ter-vorm."
    }
  }
]
