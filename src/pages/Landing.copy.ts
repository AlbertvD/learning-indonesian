// src/pages/Landing.copy.ts — landing-page copy, NL-primary with EN.
//
// Deliberately NOT in src/lib/i18n.ts: that module is entry-chunk-resident,
// and the slice-1 bundle rule is "the app entry chunk must not grow"
// (docs/plans/2026-07-03-desktop-program-design.md §Slice 1). Only Landing.tsx
// imports this file, so the copy ships inside the lazy landing chunk. It
// follows the same nl/en shape and Lang type as i18n.ts.
//
// Copy-honesty rule (owner, 2026-07-03): all audio is TTS — never claim native
// speakers or human narration; audio is mentioned neutrally where it describes
// a real feature, nowhere else.

import type { Lang } from '@/lib/i18n'

const nl = {
  login: 'Inloggen',
  registerCta: 'Aanmelden met code',
  heroEyebrow: 'Alleen op uitnodiging',
  heroTitlePre: 'Leer Indonesisch dat',
  heroTitleEm: 'blijft hangen',
  heroSub: 'Echte lessen met grammatica, dialogen en audio — en een dagelijkse sessie die precies weet wanneer je een woord bijna vergeet, en het dán terugbrengt.',
  heroCta: 'Ik heb een uitnodigingscode',
  heroLogin: 'Al een account? Inloggen →',
  specAria: 'Een woordkaart uit de app: pasar betekent de markt',
  specTag: 'Woordenschat · markt',
  specNr: 'nr. 412',
  specPhon: '/ˈpa.sar/ · zelfstandig naamwoord',
  specGloss: 'de markt',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'Ik ga naar de markt.',
  specNext: 'Volgende herhaling over 3 dagen',
  howKicker: 'Zo werkt het',
  howTitle: 'Lezen, oefenen, onthouden — elke dag een beetje.',
  how1Title: 'Lees een les',
  how1Body: 'Grammatica helder uitgelegd, met dialogen uit het echte leven.',
  how2Title: 'Oefen één sessie per dag',
  how2Body: 'De app plant slim: woorden die je bijna vergeet komen terug, wat je al kent blijft weg.',
  how3Title: 'Zie je woordenschat groeien',
  how3Body: 'Volg per woord hoe goed je het kent — van eerste kennismaking tot blijvend gekend.',
  featKicker: 'Wat je krijgt',
  feat1Title: '30 lessen, A1–B1',
  feat1Body: 'Een doorlopende cursus, van eerste woorden tot vlot lezen.',
  feat2Title: 'Podcasts & verhalen',
  feat2Body: 'Luister en lees op jouw niveau, met meelezen per zin.',
  feat3Title: 'Uitspraak & woordbouw',
  feat3Body: 'Train de affixen en klanken — de motor van het Indonesisch.',
  feat4Title: 'Voortgang per woord',
  feat4Body: 'Zie hoeveel je kent van de 1000 meest gebruikte woorden.',
  feat4BarCap: '640 / 1000 gekend',
  inviteEyebrow: 'Besloten preview',
  inviteTitle: 'Kamoe Bisa is nu op uitnodiging',
  inviteBody: 'We bouwen de app samen met een kleine groep leerders. Heb je een code gekregen? Dan kun je meteen aan de slag.',
  footerMade: 'gemaakt in Nederland',
  footerPrivacy: 'Privacy',
}

const en: typeof nl = {
  login: 'Log in',
  registerCta: 'Sign up with code',
  heroEyebrow: 'Invite only',
  heroTitlePre: 'Learn Indonesian that',
  heroTitleEm: 'sticks',
  heroSub: 'Real lessons with grammar, dialogues and audio — and a daily session that knows exactly when you are about to forget a word, and brings it back right then.',
  heroCta: 'I have an invite code',
  heroLogin: 'Already have an account? Log in →',
  specAria: 'A word card from the app: pasar means the market',
  specTag: 'Vocabulary · market',
  specNr: 'no. 412',
  specPhon: '/ˈpa.sar/ · noun',
  specGloss: 'the market',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'I am going to the market.',
  specNext: 'Next review in 3 days',
  howKicker: 'How it works',
  howTitle: 'Read, practise, remember — a little every day.',
  how1Title: 'Read a lesson',
  how1Body: 'Grammar clearly explained, with dialogues from real life.',
  how2Title: 'Practise one session a day',
  how2Body: 'The app schedules smartly: words you are about to forget come back, what you already know stays away.',
  how3Title: 'Watch your vocabulary grow',
  how3Body: 'Track how well you know each word — from first encounter to lasting knowledge.',
  featKicker: 'What you get',
  feat1Title: '30 lessons, A1–B1',
  feat1Body: 'A continuous course, from your first words to fluent reading.',
  feat2Title: 'Podcasts & stories',
  feat2Body: 'Listen and read at your level, with sentence-by-sentence follow-along.',
  feat3Title: 'Pronunciation & word building',
  feat3Body: 'Train the affixes and sounds — the engine of Indonesian.',
  feat4Title: 'Progress per word',
  feat4Body: 'See how many of the 1000 most common words you know.',
  feat4BarCap: '640 / 1000 known',
  inviteEyebrow: 'Private preview',
  inviteTitle: 'Kamoe Bisa is currently invite-only',
  inviteBody: 'We are building the app together with a small group of learners. Got a code? Then you can start right away.',
  footerMade: 'made in the Netherlands',
  footerPrivacy: 'Privacy',
}

export const landingCopy: Record<Lang, typeof nl> = { nl, en }
