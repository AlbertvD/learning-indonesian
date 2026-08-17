// src/pages/HoeHetWerkt.copy.ts — copy for the public `/hoe-het-werkt` page.
//
// Chunk-local for the same reason as Landing.copy.ts: src/lib/i18n.ts is
// entry-chunk-resident and the entry chunk must not grow. HoeHetWerkt.tsx is
// its only runtime importer.
//
// Built from docs/plans/2026-08-06-hoe-het-werkt-page-design.md, whose two open
// questions were answered 2026-08-16/17:
//   D6 — the four mastery stages STAY, and ship with a framing sentence saying
//        they describe SCHEDULING STATE, not competence. That sentence is not
//        decoration; it is what makes displaying the stages honest, so it lives
//        in the same band and must not be cut for length.
//   D7 — this page carries NO price and NO free-tier claim. The landing page
//        states it once, where check-cloud-config.ts pins the amounts.
//
// Honesty rules are the same as the landing page's and are enforced by the
// `marketing` skill: zero customers so no invented proof, all audio is TTS,
// principles and our own decisions may be cited but never efficacy numbers,
// and never in a way that implies a researcher endorses this product.

import type { Lang } from '@/lib/i18n'

const nl = {
  back: '← Terug',
  login: 'Inloggen',
  registerCta: 'Gratis beginnen',

  eyebrow: 'Hoe het werkt',
  title: 'Jij kiest wat je leert. De app kiest wanneer.',
  intro:
    'De meeste taal-apps geven je één pad en duwen je erdoorheen. Hier werkt het anders, en dat verschil is precies het stuk dat verwarrend is als niemand het uitlegt. Daarom staat het hier, vóór je een account maakt.',

  oneKicker: 'Eén',
  oneTitle: 'Niets komt in je sessie tot jij het aanzet.',
  oneBody:
    'Lessen en woordenlijsten activeer je zelf. Dat is met opzet: jij bepaalt waar je aan werkt, niet een vast pad dat voor iedereen hetzelfde is. Het heeft één bijwerking die eruitziet als een storing — zet je niets aan, dan is je sessie leeg. Dat is geen fout, er staat alleen nog niets klaar.',

  twoKicker: 'Twee',
  twoTitle: 'Alles wat aanstaat komt samen in één sessie per dag.',
  twoBody:
    'Geen aparte rij per les. Eén sessie, samengesteld uit alles wat je hebt aangezet, waarin de app kiest wat vandaag aan de beurt is. Daardoor loopt er van alles door elkaar — een woord uit les 3, een grammaticapatroon uit les 9, een verhaal dat je gisteren las. Dat is de bedoeling: door elkaar oefenen werkt beter dan blokken afwerken.',

  threeKicker: 'Drie',
  threeTitle: 'Elk woord schuift door vier fases.',
  threeBody:
    'Op je Voortgang-pagina zie je je eigen woorden in elke fase staan. Ze schuiven op als je ze goed hebt, en terug als je ze kwijt bent.',
  stage1: 'Inprenten',
  stage1Body: 'Je hebt het net gezien. Je herkent het als je het voorgeschoteld krijgt.',
  stage2: 'Oproepen',
  stage2Body: 'Je kunt de betekenis ophalen zonder dat je hem ernaast ziet staan.',
  stage3: 'Productief',
  stage3Body: 'Je kunt de Indonesische vorm zelf produceren, vanuit het Nederlands.',
  stage4: 'Onderhoud',
  stage4Body: 'Het zit erin. Het komt nog terug, maar steeds minder vaak.',
  // D6's framing sentence. Ships with the stages, always.
  stagesHonest:
    'Belangrijk: deze fases beschrijven wat de planner van je weet, niet wat je kunt. “Productief” betekent dat je dit type oefening genoeg keren goed hebt gedaan om hem verder uit elkaar te zetten — niet dat het woord er in een gesprek altijd uit komt. Die twee lopen niet gelijk, en we doen niet alsof van wel.',

  fourKicker: 'Vier',
  fourTitle: 'Waar alles staat.',
  four1: 'Leren',
  four1Body: 'De lessen. Hier zet je aan wat je wilt oefenen.',
  four2: 'Ontdek',
  four2Body: 'Woordenlijsten en thema’s, los van de lesvolgorde.',
  four3: 'Lezen',
  four3Body: 'Verhalen op niveau, om te lezen en mee te luisteren.',
  four4: 'Voortgang',
  four4Body: 'Je eigen woorden, per fase, en wat er vandaag aan de beurt is.',

  whyKicker: 'Waarom zo',
  whyTitle: 'Gebouwd vanuit onderzoek — en verbouwd toen dat onderzoek ons ongelijk gaf.',
  whyAudit:
    'In mei 2026 hebben we 36 uur aan echte sessies nagelopen. 30,1% van alle herhalingen bleek binnen dezelfde sessie nóg een keer over hetzelfde te gaan; in het ergste geval kreeg iemand drie toetsen op apa kabar? binnen 31 seconden. Twee keer hetzelfde ophalen binnen een halve minuut is geen ophalen — het antwoord staat dan nog in je werkgeheugen. Het is veranderd.',
  whyPrinciple1Title: 'Eerst herkennen, dan pas produceren',
  whyPrinciple1Body:
    'Je wordt niet gevraagd een woord zelf te produceren een paar minuten nadat je het voor het eerst zag. De vier oefentypes komen na elkaar vrij, niet tegelijk. (Nation, Krashen.)',
  whyPrinciple2Title: 'Herhalingen die uit elkaar liggen',
  whyPrinciple2Body:
    'Tussen twee beurten op hetzelfde woord zit ander materiaal. Dat maakt het moeilijker, en juist daarom werkt het. (Karpicke, over uitdijende herhaling.)',
  whyPrinciple3Title: 'Plannen op vergeten, niet op vaste tussenpozen',
  whyPrinciple3Body:
    'De planner schat per woord in hoe waarschijnlijk het is dat je het nog weet, en zet de volgende beurt vlak vóór dat punt. Niet “over drie dagen” voor iedereen.',
  whyHonest:
    'Wat je hier niet vindt: cijfers over hoeveel sneller of beter je hiermee leert. Dat is voor dit product nooit gemeten — door ons niet en door niemand anders. Wat hierboven staat zijn principes uit de literatuur en beslissingen die wij hebben genomen. De onderzoekers die we noemen kennen dit product niet.',

  ctaTitle: 'Zin om te beginnen?',
  ctaBody: 'Je kunt het uitproberen zonder betaalgegevens.',

  footerMade: 'gemaakt in Nederland',
  footerPrivacy: 'Privacy',
  footerTerms: 'Voorwaarden',
  footerRefunds: 'Restitutie',
}

const en: typeof nl = {
  back: '← Back',
  login: 'Log in',
  registerCta: 'Start free',

  eyebrow: 'How it works',
  title: 'You choose what you learn. The app chooses when.',
  intro:
    'Most language apps give you one path and push you along it. This works differently, and that difference is exactly the part that is confusing when nobody explains it. So it is here, before you make an account.',

  oneKicker: 'One',
  oneTitle: 'Nothing enters your session until you switch it on.',
  oneBody:
    'You activate lessons and word lists yourself. That is deliberate: you decide what you are working on, rather than a fixed path that is the same for everyone. It has one side effect that looks like a malfunction — switch nothing on and your session is empty. That is not a fault; there is simply nothing queued yet.',

  twoKicker: 'Two',
  twoTitle: 'Everything active lands in one session a day.',
  twoBody:
    'Not a queue per lesson. One session, assembled from everything you switched on, in which the app picks what is due today. So things arrive mixed together — a word from lesson 3, a grammar pattern from lesson 9, a story you read yesterday. That is intended: interleaved practice beats working through blocks.',

  threeKicker: 'Three',
  threeTitle: 'Every word moves through four stages.',
  threeBody:
    'On your Voortgang page you see your own words sitting in each stage. They move up when you get them right, and back when you lose them.',
  stage1: 'Inprenten',
  stage1Body: 'You have just met it. You recognise it when it is put in front of you.',
  stage2: 'Oproepen',
  stage2Body: 'You can retrieve the meaning without seeing it alongside.',
  stage3: 'Productief',
  stage3Body: 'You can produce the Indonesian form yourself, from the Dutch.',
  stage4: 'Onderhoud',
  stage4Body: 'It has stuck. It still comes back, just less and less often.',
  stagesHonest:
    'Important: these stages describe what the scheduler knows about you, not what you can do. “Productief” means you have got this exercise type right often enough for it to space them further apart — not that the word will always arrive in conversation. Those two do not move in lockstep, and we are not going to pretend otherwise.',

  fourKicker: 'Four',
  fourTitle: 'Where everything lives.',
  four1: 'Leren',
  four1Body: 'The lessons. This is where you switch on what you want to practise.',
  four2: 'Ontdek',
  four2Body: 'Word lists and themes, independent of the lesson order.',
  four3: 'Lezen',
  four3Body: 'Stories at your level, to read and to listen along with.',
  four4: 'Voortgang',
  four4Body: 'Your own words, by stage, and what is due today.',

  whyKicker: 'Why this way',
  whyTitle: 'Built from research — and rebuilt when that research proved us wrong.',
  whyAudit:
    'In May 2026 we went through 36 hours of real sessions. 30.1% of all reviews turned out to repeat the same item within the same session; worst case, someone got three tests on apa kabar? within 31 seconds. Retrieving the same thing twice within half a minute is not retrieval — the answer is still in working memory. It was changed.',
  whyPrinciple1Title: 'Recognise first, produce later',
  whyPrinciple1Body:
    'You are not asked to produce a word yourself minutes after first seeing it. The four exercise types unlock in sequence, not all at once. (Nation, Krashen.)',
  whyPrinciple2Title: 'Reviews that are spaced apart',
  whyPrinciple2Body:
    'Other material sits between two turns on the same word. That makes it harder, which is precisely why it works. (Karpicke, on expanding retrieval.)',
  whyPrinciple3Title: 'Scheduling on forgetting, not fixed intervals',
  whyPrinciple3Body:
    'The scheduler estimates, per word, how likely you are to still know it, and puts the next turn just before that point. Not “in three days” for everybody.',
  whyHonest:
    'What you will not find here: figures on how much faster or better you learn with this. That has never been measured for this product — not by us and not by anyone else. What is above are principles from the literature and decisions we made. The researchers named do not know this product exists.',

  ctaTitle: 'Ready to start?',
  ctaBody: 'You can try it without payment details.',

  footerMade: 'made in the Netherlands',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
  footerRefunds: 'Refunds',
}

export const hoeHetWerktCopy: Record<Lang, typeof nl> = { nl, en }
