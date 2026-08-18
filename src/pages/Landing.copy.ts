// src/pages/Landing.copy.ts — landing-page copy. Dutch only.
//
// Deliberately NOT in src/lib/i18n.ts: that module is entry-chunk-resident,
// and the slice-1 bundle rule is "the app entry chunk must not grow"
// (docs/plans/2026-07-03-desktop-program-design.md §Slice 1). Landing.tsx is its
// only RUNTIME importer, so the copy ships inside the lazy landing chunk.
//
// ⚠️ NO ENGLISH. The EN half was removed 2026-08-18: the profile's bilingual
// toggle was already gone, so the public pages were the last surface offering a
// language this product cannot serve — it teaches Indonesian THROUGH Dutch, so
// an English reader cannot use what the page sells. It also cost the copy: every
// line had to be written twice, in parallel, which is precisely the machine that
// turns Dutch into a translation of an English thought (see the `marketing-copy`
// skill, "Writing in a language that is not the default"). Do not reintroduce a
// second locale here; an EN audience is a separate front door with its own brand
// (docs/roadmap.md, Bet 5), not a toggle on this one.
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
    'Dat gat dicht je door veel te lezen op jouw niveau, en door elk woord dat je opzoekt te laten terugkomen tot het blijft zitten. Ik heb geprobeerd dat zelf bij elkaar te sprokkelen, met losse apps naast elkaar. Uiteindelijk heb ik het maar gebouwd — voor het moment dat je schoonmoeder je iets vraagt en jij gewoon antwoordt.',
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
    'Duolingo is een goede app, en wie via het Engels leert komt er ver mee. Alleen: Indonesisch wordt aan Nederlandstaligen helemaal niet aangeboden. Je leert de taal van je partner dan via je tweede taal, en je leert bahasa baku — de nette versie die in het boek staat. Aan tafel praat niemand zo.',
  pairFlashcards:
    'En flashcards dan? Die plannen lelah keurig voor je in. Alleen moest jij de woorden zelf vinden en de kaarten zelf maken. Die voor capek was nooit in je opgekomen.',
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

export const landingCopy = nl
