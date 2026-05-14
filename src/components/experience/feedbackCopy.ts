import type { FeedbackCopy } from '@/components/exercises/primitives'

export const FEEDBACK_COPY_NL: FeedbackCopy = {
  outcomeCorrect:      'Correct',
  outcomeAlmost:       'Bijna goed',
  outcomeWrong:        'Fout',
  announceCorrect:     'Correct',
  announceWrong:       'Fout. Het juiste antwoord is {x}.',
  announceFuzzy:       'Bijna goed — het antwoord is {x}.',
  roleLabelHeard:      'Je hoorde',
  roleLabelShown:      'Je zag',
  roleLabelSaid:       'Het woord was',
  roleLabelTarget:     'Juist antwoord',
  roleLabelYourAnswer: 'Jouw antwoord',
  roleLabelMeaning:    'Betekent',
  roleLabelExplanation:'Uitleg',
  alsoAccepted:        'Ook goed',
  replayAudio:         'Herhaal audio',
  commitFailed:        'Kon beoordeling niet opslaan — we gaan toch door.',
  emptyAnswer:         '(geen antwoord)',
}

export const FEEDBACK_COPY_EN: FeedbackCopy = {
  outcomeCorrect:      'Correct',
  outcomeAlmost:       'Almost',
  outcomeWrong:        'Wrong',
  announceCorrect:     'Correct',
  announceWrong:       'Wrong. The correct answer is {x}.',
  announceFuzzy:       'Almost — the answer is {x}.',
  roleLabelHeard:      'You heard',
  roleLabelShown:      'You saw',
  roleLabelSaid:       'The word was',
  roleLabelTarget:     'Correct answer',
  roleLabelYourAnswer: 'Your answer',
  roleLabelMeaning:    'Means',
  roleLabelExplanation:'Explanation',
  alsoAccepted:        'Also accepted',
  replayAudio:         'Replay audio',
  commitFailed:        'Couldn\'t save the review — moving on anyway.',
  emptyAnswer:         '(no answer)',
}

export const CONTINUE_LABEL_NL = 'Doorgaan'
export const CONTINUE_LABEL_EN = 'Continue'

export function feedbackCopyFor(userLanguage: 'nl' | 'en'): { copy: FeedbackCopy; continueLabel: string } {
  if (userLanguage === 'en') {
    return { copy: FEEDBACK_COPY_EN, continueLabel: CONTINUE_LABEL_EN }
  }
  return { copy: FEEDBACK_COPY_NL, continueLabel: CONTINUE_LABEL_NL }
}
