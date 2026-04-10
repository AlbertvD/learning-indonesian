/**
 * sample-candidates.ts — fixture representing existing candidates in various states
 * Used to test the merge logic in generate-exercises.ts
 */

export const sampleCandidates = [
  {
    exercise_type: 'contrast_pair',
    grammar_pattern_slug: 'yang-relative-pronoun',
    source_page: 5,
    review_status: 'published',
    requiresManualApproval: true,
    payload: {
      promptText: 'Pilih yang benar: "Een banaan die te oud is"',
      targetMeaning: 'Een banaan die te oud is, is niet lekker',
      options: [
        { id: 'cp1-a', text: 'Pisang yang terlalu tua tidak enak' },
        { id: 'cp1-b', text: 'Pisang terlalu tua tidak enak' },
      ],
      correctOptionId: 'cp1-a',
      explanationText: 'Yang als betrekkelijk voornaamwoord staat altijd na het zelfstandig naamwoord.',
    },
  },
  {
    exercise_type: 'sentence_transformation',
    grammar_pattern_slug: 'yang-relative-pronoun',
    source_page: 5,
    review_status: 'pending_review',
    requiresManualApproval: true,
    payload: {
      sourceSentence: 'De Nederlander woont in Bogor.',
      transformationInstruction: 'Verbind de twee zinnen met yang.',
      acceptableAnswers: ['Ini orang Belanda yang tinggal di Bogor'],
      hintText: null,
      explanationText: 'Yang als betrekkelijk voornaamwoord verbindt de bijzin met het hoofdzelfstandig naamwoord.',
    },
  },
  {
    exercise_type: 'cloze_mcq',
    grammar_pattern_slug: 'yang-single-adjective-emphasis',
    source_page: 5,
    review_status: 'approved',
    requiresManualApproval: true,
    payload: {
      sentence: 'Rumah ___ besar itu milik siapa?',
      translation: 'Van wie is dat GROTE huis?',
      options: ['yang', 'dan', 'ini', 'itu'],
      correctOptionId: 'yang',
      explanationText: 'Yang vóór het bijvoeglijk naamwoord benadrukt die eigenschap.',
    },
  },
]
