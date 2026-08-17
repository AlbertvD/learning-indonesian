// src/pages/Landing.copy.ts — landing-page copy, NL-primary with EN.
//
// Deliberately NOT in src/lib/i18n.ts: that module is entry-chunk-resident,
// and the slice-1 bundle rule is "the app entry chunk must not grow"
// (docs/plans/2026-07-03-desktop-program-design.md §Slice 1). Landing.tsx is its
// only RUNTIME importer, so the copy ships inside the lazy landing chunk. It
// follows the same nl/en shape and Lang type as i18n.ts.
// (scripts/check-cloud-config.ts also imports it — to assert the pricing band
// quotes the declared price — but that is a build-time script outside the Vite
// graph, so the chunking property is unaffected.)
//
// ── Copy rules, all enforced by the `marketing` skill (.claude/skills/marketing)
//
// Rewritten 2026-08-17 per docs/plans/2026-08-16-landing-page-redesign.md.
// The argument is the owner's own story (D2) aimed at Robin, the partner (D1,
// docs/marketing/personas.md §1). Completeness is sold as ASSEMBLY, never as a
// feature list (D4, positioning.md §1).
//
// Standing honesty rules — breaking these is misleading advertising, not a
// style slip. There are ZERO paying customers, so no reviews, ratings,
// testimonials or learner counts may be invented or implied. All audio is TTS —
// never claim native speakers or human narration. No efficacy numbers ("learn
// 3x faster"): nobody has measured it. Every count here is DB-verified —
// 173 loanwords (loan_source_nl) and 66 register pairs (register='informal'),
// both checked 2026-08-16.
//
// The register limit (personas.md §1 ⚠️): the coursebook dialogues are formal
// and touristy. Copy may promise "you will understand the register they actually
// use" — true, 66 pairs shipped — but never "chat with your in-laws by week two".
//
// The science band quotes ADR 0007 verbatim in substance: a 36-hour audit on
// 2026-05-18 found 30.1% of reviews were part of a within-session repeat-group
// on the same source_ref, worst case three tests on apa kabar? in 31 seconds.
// Simplifying source_ref to "hetzelfde woord" is fine; inflating the number or
// dropping the 36-hour window is not.

import type { Lang } from '@/lib/i18n'

const nl = {
  login: 'Inloggen',
  registerCta: 'Gratis beginnen',

  // ── Hero: the story, on the batik-green ground (D8). No tier claim here —
  //    D7 keeps the argument off pricing; the closing band carries the facts.
  heroEyebrow: 'Indonesisch voor Nederlandstaligen',
  heroTitlePre: 'Aan tafel schakelt iedereen over op',
  heroTitleEm: 'Nederlands',
  heroLede: 'Uit beleefdheid. En jij zit erbij en volgt het net niet.',
  heroStory:
    'Ik wilde de taal van mijn partner echt leren. Ik eindigde met Anki, een tekstboek, een reader, een luister-app en een grammaticasite tegelijk open — dat werkt, maar het is een tweede hobby. Kamoe Bisa is die stapel, al in elkaar gezet.',
  heroSignature: 'Albert van Duijn',
  heroCta: 'Gratis beginnen',
  heroLogin: 'Al een account? Inloggen →',

  specAria: 'Een woordkaart uit de app: pasar betekent de markt',
  specTag: 'Woordenschat · markt',
  specNr: 'nr. 412',
  specPhon: '/ˈpa.sar/ · zelfstandig naamwoord',
  specGloss: 'de markt',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'Ik ga naar de markt.',
  specNext: 'Volgende herhaling over 3 dagen',

  // ── The stack you would otherwise assemble (D4 — assembly, not features)
  stackKicker: 'Wat je anders zelf bij elkaar zoekt',
  stackTitle: 'Vijf dingen tegelijk open. Of één.',
  stackIntro:
    'Wie het serieus aanpakt bouwt deze stapel zelf. Het werkt ook. Het kost alleen elke week onderhoud.',
  stack1Tool: 'Anki',
  stack1Body:
    'Plant je herhalingen perfect — maar je maakt elke kaart zelf. En je maakt geen kaart voor een woord waarvan je niet weet dat het bestaat.',
  stack2Tool: 'Een tekstboek',
  stack2Body: 'Grammatica die klopt, in een tempo dat niet het jouwe is.',
  stack3Tool: 'Een reader',
  stack3Body: 'Teksten op jouw niveau — als je ze kunt vinden.',
  stack4Tool: 'Een luister-app',
  stack4Body: 'Luisteren zonder tekst ernaast, en zonder dat het meetelt.',
  stack5Tool: 'Een grammaticasite',
  stack5Body: 'Antwoorden op vragen die je nog niet kon stellen.',
  stackClose:
    'Hier zit dat in één sessie per dag: grammatica, verhalen om te lezen én te luisteren, een affixtrainer, een werkplaats voor woorden die maar niet blijven plakken — en een planner die bijhoudt wanneer je iets bijna vergeet.',

  // ── The signature: two words and a relationship (spec §4)
  pairKicker: 'Het paar',
  pairTitle: 'Duolingo leert je lelah. Je schoonmoeder zegt capek.',
  pairDisarm:
    'Duolingo is een goede app, en wie via het Engels leert komt er ver mee. Alleen: Indonesisch wordt aan Nederlandstaligen helemaal niet aangeboden. Je leert de taal van je partner dan via je tweede taal — en je leert het register uit het leerboek, niet dat van de keukentafel.',
  pairAnki:
    'En Anki? Dat zou lelah prima voor je inplannen. Alleen had jij die kaart moeten maken. Die voor capek was nooit in je opgekomen.',
  pairNote:
    '66 van die paren zitten in de cursus, met een schakelaar tussen formeel en spreektaal.',
  pairFormal: 'in het boek',
  pairReal: 'aan tafel',

  // ── The loanword bridge — reframed for the partner (personas.md §1)
  bridgeKicker: 'Je kent er al ruim 170',
  bridgeTitle: 'Je spreekt meer Indonesisch dan je denkt.',
  bridgeBody:
    'Drie eeuwen gedeelde geschiedenis liet honderden Nederlandse woorden achter in het Indonesisch. Je herkent ze meteen — en dat zijn meteen je eerste woorden.',
  bridgeMore:
    'En andersom: pasar, ketjap, tahoe en nasi goreng kwamen mee terug naar het Nederlands.',
  bridgeEdge:
    'Dit is jouw voorsprong als Nederlandstalige. De grote apps leren Indonesisch via het Engels — ook prima te doen, maar daar begin je bij nul. Hier begin je bij 173.',
  bridgeLink: 'Bekijk alle 173 leenwoorden →',

  // ── How it actually works — replaces the 01/02/03 band
  howKicker: 'Hoe het werkt',
  howTitle: 'Jij kiest wat je oefent. De rest is één sessie per dag.',
  how1Title: 'Jij zet aan wat je wilt leren',
  how1Body:
    'Lessen en woordenlijsten activeer je zelf. Wat je niet aanzet, komt niet in je sessie. Dat is het stuk dat niemand verwacht — en het is met opzet zo.',
  how2Title: 'Alles komt samen in één sessie',
  how2Body:
    'Geen aparte rij per les. Eén sessie, samengesteld uit alles wat aanstaat, met wat vandaag aan de beurt is. Tien minuten is de hele afspraak.',
  how3Title: 'Woorden komen terug vlak voordat je ze vergeet',
  how3Body:
    'Dat een woord dat je “al kende” dagen later terugkomt is geen fout. Dat is precies het punt.',
  howLink: 'Lees uitgebreid hoe het werkt →',

  // ── Grounded in the science — the audit, not the citation
  sciKicker: 'Waar het op gebaseerd is',
  sciTitle: 'Gebouwd vanuit onderzoek — en verbouwd toen dat onderzoek ons ongelijk gaf.',
  sciAudit:
    'In mei 2026 hebben we 36 uur aan echte sessies nagelopen. 30,1% van alle herhalingen bleek binnen dezelfde sessie nóg een keer over hetzelfde te gaan; in het ergste geval drie toetsen op apa kabar? binnen 31 seconden. Dat is geen ophalen uit je geheugen — dat antwoord staat er dan nog. Het is veranderd.',
  sciPrinciples:
    'De principes zijn niet van ons. Eerst herkennen, dan pas zelf produceren (Nation, Krashen). En herhalingen die uit elkaar liggen werken beter dan herhalingen op een rij (Karpicke).',
  sciHonest:
    'Wat je hier niet vindt: percentages over hoeveel sneller je leert. Dat is voor dit product nooit gemeten — door ons niet en door niemand anders.',

  // ── The doors, for the three secondary personas (D11)
  doorsKicker: 'Misschien ben jij dit',
  doorsTitle: 'Niet iedereen komt hier om dezelfde reden binnen.',
  door1Title: 'Je oma kwam uit Indië',
  door1Body:
    'Ketjap op tafel, pasar malam elke zomer, en een taal die niemand vertaalde. Je begint niet bij nul — je herkent er al honderd.',
  door1Link: 'Bekijk de leenwoorden →',
  door2Title: 'Je gaat er wonen of werken',
  door2Body:
    'Dan wil je verstaan wat er echt gezegd wordt, niet wat er in het leerboek staat. Spreektaal loopt hier vanaf het begin mee.',
  door3Title: 'Je hebt al een app uitgespeeld',
  door3Body:
    'Dan hoef je niet weer bij “hallo” te beginnen. Een instaptoets bepaalt waar je staat, en de affixtrainer pakt precies de muur waar je tegenaan liep.',

  // ── Price and sign up. D9: the argument carries no price; this band does.
  //    check-cloud-config.ts asserts pricingBody quotes the declared amounts.
  pricingEyebrow: 'Abonnement',
  pricingTitle: 'Begin gratis. Ga verder als het klikt.',
  pricingBody:
    'Les 1 en de uitspraakpodcast zijn gratis — geen betaalgegevens nodig. Wil je de hele cursus, dan kost dat €9 per maand of €79 per jaar, inclusief btw. Je kunt op elk moment opzeggen; je houdt toegang tot het einde van de periode die je al betaald hebt.',

  footerMade: 'gemaakt in Nederland',
  footerPrivacy: 'Privacy',
  footerTerms: 'Voorwaarden',
  footerRefunds: 'Restitutie',
  footerHow: 'Hoe het werkt',
}

const en: typeof nl = {
  login: 'Log in',
  registerCta: 'Start free',

  heroEyebrow: 'Indonesian for Dutch speakers',
  heroTitlePre: 'At the table everyone switches to',
  heroTitleEm: 'Dutch',
  heroLede: 'Out of politeness. And you sit there not quite following.',
  heroStory:
    'I wanted to properly learn my partner’s language. I ended up with Anki, a textbook, a reader, a listening app and a grammar site all open at once — it works, but it is a second hobby. Kamoe Bisa is that stack, already assembled.',
  heroSignature: 'Albert van Duijn',
  heroCta: 'Start free',
  heroLogin: 'Already have an account? Log in →',

  specAria: 'A word card from the app: pasar means the market',
  specTag: 'Vocabulary · market',
  specNr: 'no. 412',
  specPhon: '/ˈpa.sar/ · noun',
  specGloss: 'the market',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'I am going to the market.',
  specNext: 'Next review in 3 days',

  stackKicker: 'What you would otherwise assemble yourself',
  stackTitle: 'Five things open at once. Or one.',
  stackIntro:
    'Anyone serious about this builds the stack by hand. It works, too. It just needs maintaining every week.',
  stack1Tool: 'Anki',
  stack1Body:
    'Schedules your reviews perfectly — but you build every card yourself. And you cannot build a card for a word you do not yet know exists.',
  stack2Tool: 'A textbook',
  stack2Body: 'Grammar that is correct, at a pace that is not yours.',
  stack3Tool: 'A reader',
  stack3Body: 'Texts at your level — if you can find them.',
  stack4Tool: 'A listening app',
  stack4Body: 'Listening with no text alongside, and nothing that counts towards anything.',
  stack5Tool: 'A grammar site',
  stack5Body: 'Answers to questions you could not yet ask.',
  stackClose:
    'Here that sits in one session a day: grammar, stories to read and to listen to, an affix trainer, a workshop for words that refuse to stick — and a scheduler that tracks when you are about to forget something.',

  pairKicker: 'The pair',
  pairTitle: 'Duolingo teaches you lelah. Your mother-in-law says capek.',
  pairDisarm:
    'Duolingo is a good app, and learning through English will take you a long way. Except: Indonesian is not offered to Dutch speakers at all. So you learn your partner’s language through your second language — and you learn the textbook register, not the kitchen-table one.',
  pairAnki:
    'And Anki? It would schedule lelah perfectly well. Except you would have had to build that card. The capek one would never have occurred to you.',
  pairNote:
    '66 of those pairs are in the course, with a toggle between formal and everyday speech.',
  pairFormal: 'in the book',
  pairReal: 'at the table',

  bridgeKicker: 'You already know 170+',
  bridgeTitle: 'You speak more Indonesian than you think.',
  bridgeBody:
    'Three centuries of shared history left hundreds of Dutch words behind in Indonesian. You recognise them instantly — and they become your first words.',
  bridgeMore:
    'And the other way round: pasar, ketjap, tahoe and nasi goreng travelled back into Dutch.',
  bridgeEdge:
    'This is your head start as a Dutch speaker. The big apps teach Indonesian through English — which works perfectly well, but there you start at zero. Here you start at 173.',
  bridgeLink: 'See all 173 loanwords →',

  howKicker: 'How it works',
  howTitle: 'You choose what you practise. The rest is one session a day.',
  how1Title: 'You switch on what you want to learn',
  how1Body:
    'You activate lessons and word lists yourself. What you do not switch on does not enter your session. That is the part nobody expects — and it is deliberate.',
  how2Title: 'Everything lands in one session',
  how2Body:
    'Not a queue per lesson. One session, assembled from everything active, with whatever is due today. Ten minutes is the whole commitment.',
  how3Title: 'Words come back just before you forget them',
  how3Body:
    'A word you “already knew” reappearing days later is not a fault. That is exactly the point.',
  howLink: 'Read how it works in full →',

  sciKicker: 'What it is built on',
  sciTitle: 'Built from research — and rebuilt when that research proved us wrong.',
  sciAudit:
    'In May 2026 we went through 36 hours of real sessions. 30.1% of all reviews turned out to repeat the same item within the same session; worst case, three tests on apa kabar? within 31 seconds. That is not retrieval from memory — the answer is still sitting there. It was changed.',
  sciPrinciples:
    'The principles are not ours. Recognise first, produce later (Nation, Krashen). And reviews spaced apart beat reviews back to back (Karpicke).',
  sciHonest:
    'What you will not find here: percentages about how much faster you learn. That has never been measured for this product — not by us and not by anyone else.',

  doorsKicker: 'Perhaps this is you',
  doorsTitle: 'Not everyone arrives here for the same reason.',
  door1Title: 'Your grandmother came from the Indies',
  door1Body:
    'Ketjap on the table, pasar malam every summer, and a language nobody translated. You are not starting at zero — you already recognise a hundred of them.',
  door1Link: 'See the loanwords →',
  door2Title: 'You are moving there, or working there',
  door2Body:
    'Then you want to understand what is actually said, not what the textbook says. Everyday speech runs alongside from the start.',
  door3Title: 'You have finished an app already',
  door3Body:
    'Then you do not need to start at “hello” again. A placement test works out where you are, and the affix trainer takes on exactly the wall you hit.',

  pricingEyebrow: 'Subscription',
  pricingTitle: 'Start free. Continue if it clicks.',
  pricingBody:
    'Lesson 1 and the pronunciation podcast are free — no payment details needed. For the full course it is €9 per month or €79 per year, VAT included. Cancel any time; you keep access until the end of the period you have already paid for.',

  footerMade: 'made in the Netherlands',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
  footerRefunds: 'Refunds',
  footerHow: 'How it works',
}

export const landingCopy: Record<Lang, typeof nl> = { nl, en }
