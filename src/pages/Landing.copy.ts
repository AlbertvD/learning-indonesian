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

  // ── Hero: the FOUNDING STORY leads, and it names the apps being replaced in
  //    the headline itself (owner steer 2026-08-17: "its more about the founding
  //    story, why the app was created, all the different apps its meant to
  //    replace as a single learner experience"). The family-table moment — the
  //    primary persona's recognition — moves down to become the WHY rather than
  //    the opener, because the page's pull should come from the story and the
  //    assembly argument, not from a pain headline.
  //    No tier claim here: D7 keeps the argument off pricing; the closing band
  //    carries the facts.
  heroEyebrow: 'Voor Nederlanders met een Indonesische band',
  heroTitlePre: 'Indonesisch leren, in het Nederlands.',
  heroTitleEm: 'Voor als je het thuis wilt spreken.',
  heroLede:
    'Eén cursus met grammatica, verhalen om te lezen én te luisteren, en dagelijkse herhaling om te zorgen dat je steeds meer woorden kent, begrijpt en kan toepassen. Met de Kamoe Bisa-methode dompel je jezelf onder in de taal — woorden leren, verhalen lezen en luisteren, op jouw tempo. Durf jij het gesprek aan te gaan?',
  heroCta: 'Gratis beginnen',
  heroLogin: 'Al een account? Inloggen →',

  // ── What the method is made of. Owner-listed 2026-08-18. This is NOT a
  //    feature list in the forbidden sense (positioning.md §1 / D4) — it is the
  //    DEFINITION of the named method, which is what keeps a method name from
  //    being an empty label. It sits directly under the hero to close the
  //    curiosity gap the hero opens ("de Kamoe Bisa-methode" — what is that?).
  //    ⚠️ Every line verified against the live DB 2026-08-18. The owner's sixth
  //    item, "culture lessons", does NOT exist as a module — there is no culture
  //    section_kind. The culture is real but it lives in the STORIES, so it is
  //    claimed by naming the actual folktales instead, which is truer and more
  //    concrete. Counts: 191 grammar patterns · 30 lessons · 13 texts (9 with
  //    audio) · 953 affix capabilities · 2,573 items on FSRS.
  methodKicker: 'Waar de methode uit bestaat',
  methodTitle: 'Uitgelegd, geoefend, gebruikt.',
  methodG1: 'Je krijgt het uitgelegd',
  methodG2: 'Je oefent tot het blijft zitten',
  methodG3: 'Je gebruikt het echt',
  method1Title: 'Van herkennen naar begrijpen naar toepassen',
  method1Body:
    'De methode leidt je door alle fasen van het leren van een taal. Elk woord en elk stuk grammatica gaat dezelfde weg: eerst herken je het, dan begrijp je het zonder hulp, uiteindelijk gebruik je het zelf. In die volgorde, nooit andersom.',
  method2Title: 'Een planner die weet wanneer je iets bijna vergeet',
  method2Body:
    'Per woord, niet per les. Je tijd gaat naar wat begint te wankelen, niet naar wat allang vastzit.',
  method3Title: 'Echte grammaticalessen',
  method3Body:
    'Dertig lessen die de logica van het Indonesisch uitleggen, met audio erbij. Zodat je patronen begrijpt in plaats van ze te raden.',
  method4Title: 'Cultuurlessen door de cursus heen',
  method4Body:
    'Borobudur, batik, de zonnevogel Garuda, dukun en jamu, Majapahit en Gajah Mada. Achttien stukken om te lezen, verspreid over de lessen — je leert het land erbij, niet alleen de taal.',
  method5Title: 'Verhalen om te lezen én te beluisteren',
  method5Body:
    'Van A1 tot B2, met de audio ernaast — Kancil en de krokodil, Timun Mas, het verhaal achter de naam Surabaya. Tik een woord aan dat je niet kent en het schuift je herhalingen in. Dertien verhalen nu, vooral op A1 en A2; de bibliotheek groeit nog.',
  method6Title: 'Een affixtrainer',
  method6Body:
    'Indonesisch bouwt woorden met voor- en achtervoegsels: ajar, belajar, pelajaran, mengajar. Snap je die machine, dan lees je woorden die je nooit geleerd hebt.',
  method7Title: 'Spreektaal naast boekentaal',
  method7Body:
    'Wat in het leerboek staat is niet wat er aan tafel gezegd wordt. 66 woordparen zitten er dubbel in — lelah én capek, uang én duit — met een schakelaar ertussen, zodat je allebei leert herkennen.',
  methodClose: 'Samen is dat de Kamoe Bisa-methode.',

  // ── Why this exists — the founder story as its own band (Miller: the guide
  //    appears AFTER the reader's problem is established). Carries the emotional
  //    core, the coverage arithmetic, and the turn back to the reader.
  storyKicker: 'Waarom dit bestaat',
  storyTitle: 'Aan tafel schakelde iedereen over op Engels. Voor mij.',
  storyP1:
    'Uit aardigheid, dat wel. Maar je partner vertaalt een grap die dan niet meer grappig is, je schoonmoeder glimlacht even naar je, en het gesprek loopt verder zonder je. Je hoort erbij en je staat er tegelijk buiten.',
  storyP2:
    'Daar wilde ik weg. Niet vloeiend worden — gewoon iets terug kunnen zeggen. Ik heb Duolingo geprobeerd en ik heb flashcards geprobeerd; daarmee kom je een eind, maar niet ver genoeg. Je leert honderden woorden en struikelt nog steeds over elke zin. Dat ligt niet aan je discipline: om een gesprek te volgen moet je zo’n 95% van de woorden al kennen, en na een beginnerscursus zit je rond de 80%.',
  storyP3:
    'Dat gat dicht je door veel te lezen op jouw niveau, en door elk woord dat je opzoekt te laten terugkomen tot het blijft zitten. Ik heb jaren geprobeerd dat zelf bij elkaar te sprokkelen, met losse apps naast elkaar. Uiteindelijk heb ik het maar gebouwd — voor het moment dat je schoonmoeder je iets vraagt en jij gewoon antwoordt.',
  storySignature: 'Albert van Duijn',

  specAria: 'Een woordkaart uit de app: pasar betekent de markt',
  specTag: 'Woordenschat · markt',
  specPhon: '/ˈpa.sar/ · zelfstandig naamwoord',
  specGloss: 'de markt',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'Ik ga naar de markt.',
  specNext: 'Volgende herhaling over 3 dagen',

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
    'Driehonderd jaar samen levert honderden Nederlandse woorden op die nog gewoon in het Indonesisch zitten. Je herkent ze meteen. Dat zijn je eerste woorden, en je kende ze al.',
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
    'Lessen en woordenlijsten activeer je zelf. Wat je niet aanzet, komt niet in je sessie. Dat is het stuk dat niemand verwacht — en dat is expres.',
  how2Title: 'Alles komt samen in één sessie',
  how2Body:
    'Geen aparte rij per les. Eén sessie, samengesteld uit alles wat aanstaat, met wat vandaag aan de beurt is. Tien minuten is de hele afspraak.',
  how3Title: 'Wat je opzoekt, komt terug',
  how3Body:
    'Tik tijdens het lezen een woord aan dat je niet kent en het schuift je herhalingen in. Daarna komt het terug vlak voordat je het weer vergeet — dat een woord dat je “al kende” dagen later langskomt is geen fout, dat is precies het punt.',
  howLink: 'Lees uitgebreid hoe het werkt →',

  // ── Grounded in the science — the audit, not the citation
  sciKicker: 'Gegrond in bewezen wetenschap',
  sciTitle: 'En altijd op zoek naar manieren om je leerervaring te verbeteren.',
  sciAudit:
    'In mei 2026 ben ik 36 uur van mijn eigen sessiedata gaan nalopen. Bij 30,1% van de herhalingen kwam hetzelfde woord binnen één sessie nog een keer langs. In het ergste geval drie keer apa kabar? in 31 seconden. Dat is geen ophalen; het antwoord staat dan nog vers in je hoofd. Dat heb ik veranderd.',
  sciPrinciples:
    'De principes zijn niet van mij. Ze komen uit taalverwervingsonderzoek dat al decennia overeind staat, en elk ervan zit ergens in de app.',
  sciQ1: 'Eerst herkennen. Pas daarna zelf produceren.',
  sciQ1Src: 'Nation · Krashen',
  sciQ2: 'Herhalingen die uit elkaar liggen beklijven; herhalingen op een rij niet.',
  sciQ2Src: 'Karpicke · Cepeda',
  sciQ3: 'Lezen gaat pas lopen als je zo’n 95% van de woorden al kent.',
  sciQ3Src: 'Laufer · Schmitt',
  sciQ4: 'Wat net te moeilijk is, onthoud je het best.',
  sciQ4Src: 'Bjork',

  // ── The doors, for the three secondary personas (D11)
  doorsKicker: 'Misschien ben jij dit',
  doorsTitle: 'Niet iedereen komt binnen via dezelfde deur.',
  door1Title: 'Je oma kwam uit Indië',
  door1Body:
    'Ketjap op tafel, pasar malam elke zomer, en een taal die niemand vertaalde. Je begint niet bij nul — je herkent er al ruim 170.',
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

  heroEyebrow: 'For Dutch speakers with an Indonesian tie',
  heroTitlePre: 'Learn Indonesian, in Dutch.',
  heroTitleEm: 'For when you want to speak it at home.',
  heroLede:
    'One course with grammar, stories to read and to listen to, and daily review, so that you know, understand and can use more and more words. The Kamoe Bisa method immerses you in the language — learning words, reading stories, listening, at your own pace. Ready to join the conversation?',
  heroCta: 'Start free',
  heroLogin: 'Already have an account? Log in →',

  methodKicker: 'What the method is made of',
  methodTitle: 'Explained, practised, used.',
  methodG1: 'It gets explained to you',
  methodG2: 'You practise until it sticks',
  methodG3: 'You actually use it',
  method1Title: 'From recognising to understanding to using',
  method1Body:
    'The method takes you through every phase of learning a language. Every word and every piece of grammar travels the same road: first you recognise it, then you understand it unaided, and finally you use it yourself. In that order, never the other way round.',
  method2Title: 'Reviews timed for when you are about to forget',
  method2Body:
    'Per word, not per lesson. Your time goes to what is starting to wobble, not to what has long since stuck.',
  method3Title: 'Real grammar lessons',
  method3Body:
    'Thirty lessons explaining the logic of Indonesian, with audio. So you understand the patterns instead of guessing them.',
  method4Title: 'Culture lessons throughout the course',
  method4Body:
    'Borobudur, batik, the sunbird Garuda, dukun and jamu, Majapahit and Gajah Mada. Eighteen pieces to read, spread across the lessons — you learn the country alongside the language.',
  method5Title: 'Stories to read and to listen to',
  method5Body:
    'A1 to B2, with the audio alongside — Kancil and the crocodile, Timun Mas, the story behind the name Surabaya. Tap a word you do not know and it slides into your reviews. Thirteen stories so far, mostly A1 and A2; the library is still growing.',
  method6Title: 'An affix trainer',
  method6Body:
    'Indonesian builds words with prefixes and suffixes: ajar, belajar, pelajaran, mengajar. Understand that machine and you can read words you never learned.',
  method7Title: 'Everyday speech alongside textbook Indonesian',
  method7Body:
    'What the textbook says is not what gets said at the table. 66 word pairs are in there twice — lelah and capek, uang and duit — with a toggle between them, so you learn to recognise both.',
  methodClose: 'Together, that is the Kamoe Bisa method.',

  storyKicker: 'Why this exists',
  storyTitle: 'At the table, everyone switched to English. For me.',
  storyP1:
    'Out of kindness, yes. But your partner translates a joke that is no longer funny by then, your mother-in-law smiles at you, and the conversation moves on without you. You belong there and you are outside it at the same time.',
  storyP2:
    'I wanted out of that. Not fluent — just able to say something back. I tried Duolingo and I tried flashcards; they get you part of the way, but not far enough. You learn hundreds of words and still trip over every sentence. That is not a discipline problem: to follow a conversation you need to know roughly 95% of the words already, and after a beginner course you are at about 80%.',
  storyP3:
    'You close that gap by reading a lot at your own level, and by having every word you look up come back until it sticks. I spent years trying to piece that together myself, with separate apps side by side. In the end I just built it — for the moment your mother-in-law asks you something and you simply answer.',
  storySignature: 'Albert van Duijn',

  specAria: 'A word card from the app: pasar means the market',
  specTag: 'Vocabulary · market',
  specPhon: '/ˈpa.sar/ · noun',
  specGloss: 'the market',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'I am going to the market.',
  specNext: 'Next review in 3 days',

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
    'Three hundred years together left hundreds of Dutch words sitting inside Indonesian. You recognise them instantly. They are your first words, and you already knew them.',
  bridgeMore:
    'And the other way round: pasar, ketjap, tahoe and nasi goreng travelled back into Dutch.',
  bridgeEdge:
    'This is your head start as a Dutch speaker. The big apps teach Indonesian through English — which works perfectly well, but there you start at zero. Here you start at 173.',
  bridgeLink: 'See all 173 loanwords →',

  howKicker: 'How it works',
  howTitle: 'You choose what you practise. The rest is one session a day.',
  how1Title: 'You switch on what you want to learn',
  how1Body:
    'You activate lessons and word lists yourself. What you do not switch on does not enter your session. That is the part nobody expects — and it is on purpose.',
  how2Title: 'Everything lands in one session',
  how2Body:
    'Not a queue per lesson. One session, assembled from everything active, with whatever is due today. Ten minutes is the whole commitment.',
  how3Title: 'What you look up comes back',
  how3Body:
    'Tap a word you do not know while reading and it slides into your reviews. After that it returns just before you would forget it again — a word you “already knew” reappearing days later is not a fault, it is exactly the point.',
  howLink: 'Read how it works in full →',

  sciKicker: 'Grounded in proven science',
  sciTitle: 'And always looking for ways to improve how you learn.',
  sciAudit:
    'In May 2026 I went back through 36 hours of my own session data. In 30.1% of reviews the same word came round again inside a single session. Worst case, apa kabar? three times in 31 seconds. That is not retrieval; the answer is still fresh in your head. So I changed it.',
  sciPrinciples:
    'The principles are not mine. They come from language-acquisition research that has held up for decades, and each one is somewhere in the app.',
  sciQ1: 'Recognise first. Only then produce.',
  sciQ1Src: 'Nation · Krashen',
  sciQ2: 'Reviews spaced apart stick; reviews back to back do not.',
  sciQ2Src: 'Karpicke · Cepeda',
  sciQ3: 'Reading only starts working once you know roughly 95% of the words.',
  sciQ3Src: 'Laufer · Schmitt',
  sciQ4: 'What is just too hard is what you remember best.',
  sciQ4Src: 'Bjork',

  doorsKicker: 'Perhaps this is you',
  doorsTitle: 'Not everyone comes in through the same door.',
  door1Title: 'Your grandmother came from the Indies',
  door1Body:
    'Ketjap on the table, pasar malam every summer, and a language nobody translated. You are not starting at zero — you already recognise over 170 of them.',
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
