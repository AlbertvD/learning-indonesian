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

  // ── Why this exists — the founder story as its own band (Miller: the guide
  //    appears AFTER the reader's problem is established). Carries the emotional
  //    core, the coverage arithmetic, and the turn back to the reader.
  storyKicker: 'Waarom dit bestaat',
  storyTitle: 'Aan tafel schakelde iedereen over op Engels. Voor mij.',
  storyP1:
    'Uit aardigheid, dat wel. Maar je partner vertaalt een grap die dan niet meer grappig is, je schoonmoeder glimlacht even naar je, en het gesprek loopt verder zonder je. Je hoort erbij en je staat er tegelijk buiten.',
  storyP2:
    'Daar wilde ik weg. Niet vloeiend worden — gewoon iets terug kunnen zeggen. Maar je leert honderden woorden en struikelt nog steeds over elke zin, en dat ligt niet aan je discipline: om een gesprek te volgen moet je zo’n 95% van de woorden al kennen, en na een beginnerscursus zit je rond de 80%.',
  storyP3:
    'Dat gat dicht je door veel te lezen op jouw niveau, en door elk woord dat je opzoekt te laten terugkomen tot het blijft zitten. Ik heb jaren geprobeerd dat zelf in elkaar te zetten, met losse apps op een eigen server. Uiteindelijk heb ik het maar gebouwd — voor het moment dat je schoonmoeder je iets vraagt en jij gewoon antwoordt.',
  storySignature: 'Albert van Duijn',

  specAria: 'Een woordkaart uit de app: pasar betekent de markt',
  specTag: 'Woordenschat · markt',
  specPhon: '/ˈpa.sar/ · zelfstandig naamwoord',
  specGloss: 'de markt',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'Ik ga naar de markt.',
  specNext: 'Volgende herhaling over 3 dagen',

  // ── The stack you would otherwise assemble (D4 — assembly, not features)
  stackKicker: 'Wat “meer doen” in de praktijk betekent',
  stackTitle: 'Stuk voor stuk goed gereedschap. Samen een project.',
  stackIntro:
    'Zodra je verder wilt dan losse woorden heb je dit nodig: iets om op niveau te lezen, iets om te luisteren, iets dat je herhalingen plant. Het bestaat allemaal en het is grotendeels gratis — ik heb het zelf draaien gehad. Alleen zijn ze leeg tot jij ze vult, en niet met wat dan ook: met iets dat net boven je zit.',
  stack1Tool: 'Anki',
  stack1Body:
    'De beste planner die er is, en gratis. Alleen maak je elke kaart zelf — en je maakt geen kaart voor een woord waarvan je niet weet dat het bestaat.',
  stack2Tool: 'Lute & LinguaCafe',
  stack2Body:
    'Uitstekend lezen-met-woordregistratie. Werkt zodra je teksten hebt die op jouw niveau liggen. Die had ik niet, en ze zoeken kostte meer avonden dan het lezen zelf.',
  stack3Tool: 'Audiobookshelf',
  stack3Body:
    'Klaar voor de luisteruren. Er is alleen nooit Indonesische audio in gekomen waar ik al genoeg van verstond om er iets aan te hebben.',
  stack4Tool: 'LibreTranslate',
  stack4Body:
    'Vertaalt alles, meteen, zonder internet. Een vertaling is alleen geen uitleg — je weet daarna wát het betekent, niet waaróm.',
  stack5Tool: 'Duolingo',
  stack5Body: 'Prima app, en makkelijk vol te houden. Alleen niet in het Nederlands voor deze taal — en niet met de woorden die je thuis hoort.',
  stackClose:
    'Hier is het één ding, en het komt gevuld. Dertig lessen met grammatica en audio. Dertien verhalen op niveau, negen ervan met audio. En een planner die per woord bijhoudt wat je bijna vergeet. Niets zoeken, niets opzetten — vanavond beginnen. (Eerlijk: de verhalenbibliotheek is nog klein en ligt vooral op A1 en A2. Daar wordt aan gewerkt.)',

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
  sciKicker: 'Waar het op gebaseerd is',
  sciTitle: 'Gebouwd op onderzoek — en verbouwd toen dat onderzoek mij ongelijk gaf.',
  sciAudit:
    'In mei 2026 ben ik 36 uur van mijn eigen sessiedata gaan nalopen. 30,1% van alle herhalingen bleek binnen dezelfde sessie nóg een keer over hetzelfde woord te gaan; in het ergste geval drie toetsen op apa kabar? binnen 31 seconden. Dat is geen ophalen — het antwoord staat dan nog in je werkgeheugen. Ik heb het veranderd.',
  sciPrinciples:
    'De principes zijn niet van mij. Eerst herkennen, dan pas zelf produceren (Nation, Krashen). En herhalingen die uit elkaar liggen werken beter dan herhalingen op een rij (Karpicke). De onderzoekers die ik noem kennen dit product niet.',
  sciHonest:
    'Wat je hier niet vindt: percentages over hoeveel sneller je leert. Dat is voor dit product nooit gemeten — door mij niet en door niemand anders.',

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

  storyKicker: 'Why this exists',
  storyTitle: 'At the table, everyone switched to English. For me.',
  storyP1:
    'Out of kindness, yes. But your partner translates a joke that is no longer funny by then, your mother-in-law smiles at you, and the conversation moves on without you. You belong there and you are outside it at the same time.',
  storyP2:
    'I wanted out of that. Not fluent — just able to say something back. But you learn hundreds of words and still trip over every sentence, and that is not a discipline problem: to follow a conversation you need to know roughly 95% of the words already, and after a beginner course you are at about 80%.',
  storyP3:
    'You close that gap by reading a lot at your own level, and by having every word you look up come back until it sticks. I spent years trying to assemble that myself, with separate apps on my own server. In the end I just built it — for the moment your mother-in-law asks you something and you simply answer.',
  storySignature: 'Albert van Duijn',

  specAria: 'A word card from the app: pasar means the market',
  specTag: 'Vocabulary · market',
  specPhon: '/ˈpa.sar/ · noun',
  specGloss: 'the market',
  specExample: '“Saya pergi ke pasar.”',
  specExampleTr: 'I am going to the market.',
  specNext: 'Next review in 3 days',

  stackKicker: 'What “doing more” actually takes',
  stackTitle: 'Good tools, every one. Together, a project.',
  stackIntro:
    'The moment you want more than loose words, this is what you need: something to read at your level, something to listen to, something to schedule the reviews. It all exists and most of it is free — I ran it myself. They are just empty until you fill them, and not with anything: with something pitched a little above where you are.',
  stack1Tool: 'Anki',
  stack1Body:
    'The best scheduler there is, and free. You just build every card yourself — and you cannot build a card for a word you do not yet know exists.',
  stack2Tool: 'Lute & LinguaCafe',
  stack2Body: 'Reading with word tracking attached. Works beautifully — once you have found texts that sit at your level.',
  stack3Tool: 'Audiobookshelf',
  stack3Body: 'For the listening hours. If you can find Indonesian audio you already understand enough of to benefit from.',
  stack4Tool: 'LibreTranslate',
  stack4Body: 'For when you got stuck. A translation is not an explanation though — afterwards you know what it meant, not why.',
  stack5Tool: 'Duolingo',
  stack5Body: 'A good app, and easy to keep up. Just not in Dutch for this language — and not with the words you hear at home.',
  stackClose:
    'Here it is one thing, and it arrives filled. Thirty lessons with grammar and audio. Thirteen levelled stories, nine of them with audio. And a scheduler that tracks, word by word, what you are about to forget. Nothing to source, nothing to set up — start tonight. (Honestly: the story library is still small and sits mostly at A1 and A2. That one is being worked on.)',

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

  sciKicker: 'What it is built on',
  sciTitle: 'Built on research — and rebuilt when that research proved me wrong.',
  sciAudit:
    'In May 2026 I went back through 36 hours of my own session data. 30.1% of all reviews turned out to test the same word twice inside one session; worst case, three tests on apa kabar? within 31 seconds. That is not retrieval — the answer is still in working memory. I changed it.',
  sciPrinciples:
    'The principles are not mine. Recognise first, produce later (Nation, Krashen). And reviews spaced apart beat reviews back to back (Karpicke). The researchers I name do not know this product exists.',
  sciHonest:
    'What you will not find here: percentages about how much faster you learn. That has never been measured for this product — not by me and not by anyone else.',

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
