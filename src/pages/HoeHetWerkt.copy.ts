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
    'In mei 2026 ben ik 36 uur van mijn eigen sessiedata gaan nalopen. 30,1% van alle herhalingen bleek binnen dezelfde sessie nóg een keer over hetzelfde te gaan; in het ergste geval kreeg iemand drie toetsen op apa kabar? binnen 31 seconden. Twee keer hetzelfde ophalen binnen een halve minuut is geen ophalen — het antwoord staat dan nog in je werkgeheugen. Het is veranderd.',
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

export const hoeHetWerktCopy = nl
