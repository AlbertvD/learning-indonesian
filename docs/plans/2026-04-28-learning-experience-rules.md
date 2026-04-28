# Learning Experience Rules

**Date:** 2026-04-28
**Status:** Agreed product rules from product design review
**Scope:** Learner-facing behavior for Today, sessions, lesson progression, capability introduction, Practice, Progress, and learner summaries.

This document refines the capability-based learning architecture into product rules for the Indonesian learning experience. It should guide future implementation of the session composer, pedagogy planner, lesson reader, Practice flows, and Progress language.

## 1. Product Center

`Today` owns the next best action.

The learner should be able to open the app and trust it to choose the right session. Lessons teach and expose. Practice lets the learner choose a focus. Progress explains growth. But the normal habit loop is:

```text
open app -> Today -> start recommended session -> get a useful next action
```

Today should show one primary recommended session, with smaller secondary alternatives such as quick review, continue lesson, listening focus, or concept practice.

## 2. Session Posture

The recommended session depends on recency, backlog pressure, and available good material.

Practice recency only resets after meaningful practice:

```text
at least 8 exercises
and at least 5 minutes
```

Exposure recency is separate. Lesson reading or listening can count as meaningful exposure, but it should mainly unlock or continue material from the lesson/source that was actually reviewed.

Recommended posture bands:

```text
same day or yesterday:
  balanced

2-3 days ago:
  light recovery

4-7 days ago:
  review-first

8+ days ago:
  comeback
```

Backlog severity should be relative to the learner's normal session size:

```text
light:
  due reviews fit within 50% of the normal session

medium:
  due reviews fit within one normal session

heavy:
  due reviews need 1-3 normal sessions

huge:
  due reviews need more than 3 normal sessions, or the learner has been away 8+ days
```

Today should show a small posture label and a plain reason, for example:

```text
Light recovery
You last practiced 3 days ago, so today keeps new material light.
```

## 3. Hard Maximums, Flexible Filling

Each posture should define hard maximums for risky load, while allowing the composer to fill fewer slots when good candidates run out.

Hard maximum categories:

- new reviewable capabilities
- new concepts
- production tasks
- hidden-audio assessment tasks
- unrelated source switches
- total session length

These limits protect the learner from overload. They do not require the composer to fill every quota.

Recommended first-version budgets:

```text
Balanced:
  target normal preferred session size
  max 25% new capabilities
  max 1 new concept
  max 1 hard production task for newly introduced material
  include direction balance when safe
  audio autoplay on Indonesian prompts when available
  hidden-audio tasks only when eligible

Light recovery:
  shorter or normal session
  max 1-2 new capabilities
  max 0-1 new concept, preferably none
  no hard production for brand-new material
  at most 1 hidden-audio task
  prioritize review and safe bridge tasks

Review-first:
  due review dominates
  max 0-1 new capability only if strongly lesson-linked and low-load
  no new concept by default
  no hard production for new material
  no queue padding

Comeback:
  5-8 confidence-building items when safe candidates exist
  no new capabilities by default
  no new concepts
  no hard production
  optional audio support
  no dictation by default
```

The composer should fill roughly in this order:

```text
due fragile
due normal
prerequisite repair
recent lesson continuation
small new introduction
stretch task
```

The composer may return a shorter-than-preferred session. A clean 9-item session is better than padding to 15 with unrelated or too-hard material.

A clean underfilled comeback session is acceptable when fewer than 5 safe candidates exist. Do not pad it with hard or unrelated material just to hit a minimum.

## 4. Queue-Drying Warning

Short sessions are acceptable when they are clean. But if the learning pipeline is drying up, the app should explain the next action.

Warn when:

- the composer finds fewer than about 70% good items for the preferred session size;
- due backlog is light;
- no current lesson content remains eligible to introduce;
- the next lesson is waiting for exposure/listening before it can become the normal source.

Do not warn when the session is intentionally short because it is quick, comeback, backlog-clear, or review-first with a real review backlog. Light recovery can still show the warning when the review backlog is light and the next lesson is the clear next action.

Learner-facing copy should be simple:

```text
Je bent bijna klaar met de huidige les.
Open de volgende les 2 minuten om nieuwe woorden en patronen klaar te zetten.
```

## 5. Lesson And Source Rules

A lesson becomes the current source for new vocabulary after:

```text
2 minutes in the lesson
or an explicit Start/Continue lesson action
or listening meaningfully to the lesson audio explanation
```

For new reviewable material, lesson progression should be mostly sequential. The learner may browse ahead, but Today should not silently pull new reviewable material from a later lesson if previous lessons have not been sufficiently introduced.

The next lesson becomes the normal Today source only after all authored content from the current lesson has been introduced, not mastered.

All authored lesson content counts toward progression for now. Do not split content into core/useful/optional for this first rule set.

## 6. What Introduced Means

Introduction rules differ by content type:

```text
Vocabulary:
  at least one successful recognition or choice exercise

Grammar/morphology:
  Dutch explanation exposure, from text or audio
  plus at least one recognition/noticing success

Sentence/dialogue:
  exposure is enough for lesson progression
  practice can follow later

Audio:
  heard once is enough for lesson progression
  assessed listening can follow later
```

Vocabulary should not require the learner to manually browse every word in a lesson. The Today session can introduce selected approved words from the current/unlocked lesson. The first recognition exercise can be the introduction.

Grammar and morphology do require concept exposure. The exposure can come from a text explanation block, a Dutch audio explanation, or a guided noticing block. Since the explanation audio is Dutch, it can unlock the same first recognition capability as the text grammar block.

## 7. Lesson Mix

Unlocking a lesson opens a candidate pool. It should not dump all lesson words, sentences, and grammar into the next session.

A fresh lesson's first normal session should include at least one new word before any new sentence or grammar practice. New words are the easiest foothold.

For a normal fresh-lesson session, the composer should choose a balanced slice such as:

```text
2-4 new words
0-1 new grammar or morphology concept
0-1 sentence/context practice item
1 light audio-supported item if available
no hard production for brand-new concepts
```

Grammar examples should use words from the current lesson, earlier lessons, or extremely common words the learner has already seen. If a grammar example needs too many unknown words, the learner is solving vocabulary instead of noticing the pattern.

Sentence/context practice should use a known-word coverage threshold:

```text
reading/context recognition:
  about 70-80% of key words introduced or recognizable

cloze/context recall:
  target word introduced
  surrounding sentence mostly familiar

sentence production/transformation:
  key vocabulary should be recallable, not merely seen

lesson exposure:
  no threshold
```

## 8. Capabilities And Concept Progression

A concept is the idea being taught. Capabilities are the separate measurable things the learner can do with it.

Example concept:

```text
meN- active verbs
```

Possible capabilities:

```text
recognize menulis as an active verb form
parse menulis back to tulis
produce menulis from tulis
distinguish menulis from ditulis
use menulis in a sentence
```

New concepts create understanding load. New capabilities create review load. The budgets need to control both.

Do not introduce hard production for a new grammar or morphology concept in the same first-introduction block by default. Same-session exposure plus recognition is fine. Scheduled production waits for recognition evidence.

For vocabulary, the same principle applies but can move faster:

```text
first:
  Indonesian -> Dutch recognition

soon after:
  Dutch -> Indonesian choice

later or in a later session on the same day:
  Dutch -> Indonesian typed production
```

"Later" means a later session or later block after evidence, not necessarily tomorrow.

## 9. Direction Balance

The app must train both directions:

```text
Indonesian -> Dutch
Dutch -> Indonesian
```

The current capability model should add a bridge capability for Dutch prompt -> choose Indonesian form. This should be separate from typed production and should have its own FSRS schedule once active.

Example for `rumah`:

```text
text_recognition:
  rumah -> huis

meaning_recall:
  rumah -> type/recall huis

l1_to_id_choice:
  huis -> choose rumah

form_recall:
  huis -> type rumah

audio_recognition:
  hear rumah -> huis

dictation:
  hear rumah -> type rumah
```

Direction balance should be enforced mainly at introduction time and tie-break time:

- introduce Dutch -> Indonesian choice early enough;
- introduce typed production only when ready;
- when multiple due capabilities are similarly urgent, prefer the undertrained safe direction;
- when due work exceeds capacity, FSRS urgency mostly wins;
- in balanced posture, reserve about 10-20% for neglected but safe directions/modalities;
- in recovery/comeback, FSRS urgency wins.

## 10. Audio Rules

Audio has two layers:

```text
Audio support:
  an Indonesian prompt can play audio while still showing the text

Audio capability:
  the answer depends on hearing, such as hidden-text listening or dictation
```

All session exercises that show Indonesian should autoplay Indonesian audio when an audio asset exists. Profile should include an option to turn autoplay off.

Lesson reading can remain tap-to-play except for explicit audio blocks.

Hidden-text listening tasks count against the audio-task budget. Audio playback attached to visible Indonesian prompts does not.

Audio progression:

```text
early:
  audio exposure with text visible

after text recognition or explicit listening exposure:
  audio recognition

after audio recognition and form recall are started:
  dictation
```

## 11. Practice

Practice should be goal-based, not an exercise-type browser.

Good entries:

```text
Luisteren oefenen
Indonesisch onthouden
Zwakke woorden herstellen
Patronen oefenen
Korte sessie
```

Concept practice should also be available:

```text
meN- oefenen
di- herkennen
-kan vs -i
sudah/belum
register/pronouns
```

If the learner has spent 2 minutes in a lesson or listened to the lesson audio explanation, concepts from that lesson can unlock as selectable in Practice.

Practice can focus on the learner's chosen concept, but it should still respect safety:

- unseen concept: explanation/recognition only;
- weak recognition: recognition and contrast;
- strong recognition: recall/production allowed;
- recent failures: step down difficulty;
- comeback posture: short and gentle.

Intentional practice gives control over the topic, not unlimited difficulty.

## 12. Learner-Facing Language

The app should hide internal jargon such as capability, FSRS, source progress, and activation state.

Use Dutch-first learner labels mapped from internal capabilities:

```text
Herkennen:
  understand Indonesian when seen

Kiezen:
  pick the Indonesian from a Dutch prompt

Onthouden:
  produce the Indonesian from memory

Gebruiken:
  use it in a phrase or sentence

Verstaan:
  understand it when heard

Opschrijven:
  write it from audio

Patronen:
  understand grammar or morphology patterns
```

Today should stay compact:

```text
Vandaag oefen je vooral herkennen, kiezen en luisteren.
```

Detailed per-item state belongs in Progress or a later item detail view:

```text
rumah
Herkennen: sterk
Kiezen: groeiend
Onthouden: nog niet begonnen
Verstaan: zwak
```

Avoid a top-level Words page for now. Word-level detail can live under Progress or a future searchable detail view.

## 13. Session Summary

Session summaries should use a short narrative first, with optional details later.

Example:

```text
Mooi gedaan. Je herhaling is op schema.
Je hebt nieuwe woorden uit Les 5 leren herkennen en geoefend met Indonesisch kiezen vanuit Nederlandse prompts.
Volgende stap: open Les 6 twee minuten om nieuw materiaal klaar te zetten.
```

Expandable detail can show counts:

```text
Herkennen: 6
Kiezen: 3
Onthouden: 1
Verstaan: 1
```

The main screen should feel like a tutor speaking to a learner, not a metrics export.

## 14. Implementation Notes

Current implementation already contains early pieces:

- capability types and projection;
- load budget limits for new capabilities and patterns;
- source progress gates;
- a capability session loader/composer behind flags;
- legacy session queue support for standard, backlog clear, and quick modes.

Gaps to resolve in implementation:

- add Dutch -> Indonesian choice as a separate capability type or explicit capability facet;
- add recency-based session posture selection;
- add meaningful-practice threshold tracking: 8 exercises and 5 minutes;
- add current-lesson tracking from 2 minutes in lesson or lesson audio exposure;
- add lesson progression gates based on introduced content, not mastery;
- add balanced lesson-slice selection across words, concepts, sentences, and audio;
- add known-word coverage checks for sentence/context practice;
- add queue-drying warnings;
- add learner-facing Dutch labels and narrative summaries;
- update stale architecture docs that still describe older session ratios and mode names.
