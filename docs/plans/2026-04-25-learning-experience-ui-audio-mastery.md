# Learning Experience, UI, Audio, and Mastery Spec

**Date:** 2026-04-25
**Status:** Draft v1
**Scope:** Product and UI design for a capability-based Indonesian mastery app, including daily learning, podcast listening, morphology workshops, dialogue rehearsal, exercise design, audio, and mastery tracking.
**Companions:**
- `2026-04-25-capability-based-learning-architecture.md`
- `2026-04-25-capability-content-pipeline-and-exercises.md`

---

## 1. Product Goal

The app should feel like a personal Indonesian tutor, not a random review queue. It should guide the learner through exposure, noticing, comprehension, retrieval, production, listening, and fluency.

The learning experience should combine:

- FSRS-backed memory scheduling
- contextual input
- controlled output
- listening practice
- pattern mastery
- dialogue rehearsal
- explicit morphology work
- progress that explains what is strong and what is fragile

---

## 2. Pedagogic Principles

### 2.1 Capability before exercise type

The app tracks what the learner can do, not just which exercise they answered.

Example:

```text
Capability: derive meN- form from root
Possible exercises: root-to-derived drill, sentence transformation, cloze, constrained translation
```

### 2.2 Input and output both matter

A strong app must include:

- meaning-focused input: listening/reading for meaning
- meaning-focused output: producing phrases and sentences
- language-focused learning: vocabulary, grammar, morphology, pronunciation
- fluency development: speed, repetition, automaticity

### 2.3 Audio is a modality, not decoration

Audio is not just a play button attached to text. Audio creates distinct capabilities:

- audio recognition
- phrase spotting
- dictation
- shadowing
- gist comprehension
- natural-speed comprehension

### 2.4 Stages are summaries

Stages such as `recognized`, `retrievable`, `guided_use`, and `maintenance` are derived from capability states. They should not drive scheduling directly.

### 2.5 Exposure-only content is allowed

Not every useful input should become FSRS homework. Podcasts, stories, and natural speech can be valuable as exposure-only content until targeted capabilities are mined from them.

### 2.6 Safe progression before intensity

The app should not unlock hard production just because a content unit exists. It should move through a safe path:

```text
exposure -> noticing -> recognition -> cued recall -> constrained production -> contextual use -> maintenance
```

Unlock rules:

- Do not introduce core lesson content before the learner has reached or been exposed to the relevant lesson section.
- Do not introduce dictation before the learner has at least light audio recognition for the same form or phrase family.
- Do not introduce productive morphology before the learner can recognize the pattern in several examples.
- Do not introduce contrast drills until both contrasted forms have been noticed.
- Do not mark a podcast segment reviewable unless known-word coverage and transcript support make it suitable for the learner.
- Do not infer grammar production mastery from recognition-only answers.

### 2.6.1 Lesson and Source Progress Gates

The app should feel lesson-led without turning `lesson_completed` into a blunt global gate. Use granular source progress:

```text
not_started
opened
section_exposed
intro_completed
guided_practice_completed
lesson_completed
```

Core lesson content normally becomes eligible only after the learner has reached the relevant section:

```text
text recognition:
  after section_exposed

form recall:
  after intro_completed or text recognition evidence

audio recognition:
  after heard_once and text recognition introduced

pattern recognition:
  after pattern noticing or section exposure

pattern production:
  after guided practice plus recognition evidence
```

This should not block all learning outside lessons. Remediation, old reviews, exposure-only listening, and learner-selected exploration can bypass lesson completion, but they should still respect readiness, difficulty, and load budgets. Exploration may create exposure; it should not automatically create FSRS review debt.

### 2.7 Cognitive load budgets

Each experience type should carry a load budget.

```text
Quick session:
  0 heavy concepts, at most 1 audio item, at most 5 review items

Daily tutor:
  at most 1 new grammar or morphology idea
  at most 2-4 new lexical items
  at most 1 production task
  audio present but not dominant unless listening is selected

Backlog clear:
  0 new items, 0 workshops, due review only

Pattern workshop:
  1 target pattern, 1 contrast pattern, 6-12 focused steps

Podcast session:
  1 short segment, 1-3 mined phrases, gist before detail
```

The Session Composer should enforce these budgets so the UI does not become an enthusiastic avalanche.

### 2.8 Register is a capability dimension

Indonesian register should be tracked as part of the capability model, not hidden in examples. The learner needs to know whether a phrase is formal, neutral, intimate, colloquial, Jakarta-flavored, respectful, or risky in a given setting.

Register examples that deserve explicit capability tags:

- `saya`, `aku`, `gue`
- `Anda`, `kamu`, `Bapak`, `Ibu`
- address avoidance when a pronoun would feel too direct
- `tidak`, `nggak`, `enggak`
- `sudah`, `udah`
- particles such as `ya`, `kan`, `dong`, `sih`, `kok`
- polite requests with `boleh`, `bisa`, `tolong`, and softened phrasing

Register mastery should be task-specific: recognizing `gue` is not the same as safely using it with the right person.

### 2.9 Dutch-native learner support

The default learner profile is Dutch-first. The app should use that when it improves explanation or feedback.

Examples:

- contrast Indonesian word order with Dutch word order when it prevents literal transfer
- distinguish Indonesian aspect markers such as `sudah`, `sedang`, and `akan` from Dutch tense habits
- warn that Indonesian often omits pronouns or uses address terms where Dutch would use `jij`, `u`, or a name
- explain that affixes often change voice, transitivity, or derivational meaning rather than simply matching Dutch prefixes
- support pronunciation and listening transfer for Indonesian `c`, `ng`, `ny`, `e` as schwa/pepet versus /e/, final stops, consistent vowels, and stress/rhythm patterns
- keep the artifact model language-parameterized so English support can exist without rewriting capabilities

---

## 3. Information Architecture

Primary navigation should move from implementation categories to learner goals.

Recommended top-level areas:

```text
Today
Lessons
Listen
Patterns
Words
Dialogues
Progress
Admin
```

### 3.1 Today

The main daily tutor surface.

Purpose:

- show what matters today
- start the recommended session
- explain why the session is recommended
- surface one or two targeted alternatives

### 3.2 Lessons

Modern web-native lesson reader for book-derived content.

Purpose:

- make textbook-derived lessons feel like polished guided web lessons, not imported book fragments
- expose the learner to sections before capabilities enter review
- record source progress such as `section_exposed`, `intro_completed`, `heard_once`, and `guided_practice_completed`
- connect reading, listening, noticing, and practice bridges
- preserve source page references in metadata without making the UI feel like a PDF viewer

Lesson pages should feel editorial and interactive:

```text
lesson hero
learning goals
short readable sections
inline Indonesian examples
tap-to-reveal meanings
audio snippets
dialogue cards
pattern callouts
noticing prompts
micro-checks
practice bridges
progress rail
```

The lesson reader should create exposure and source progress. It should not directly create FSRS debt. Reviewable capabilities enter later through the Pedagogy Planner.

### 3.3 Listen

Podcast and story listening.

Purpose:

- free listening
- guided transcript mode
- slow/normal/natural audio tracks
- phrase mining
- listening checkpoints
- shadowing

### 3.4 Patterns

Grammar and morphology mastery map.

Purpose:

- browse affixes, sentence patterns, voice, particles, register, word order
- show mastery by capability
- start targeted pattern practice

### 3.5 Words

Vocabulary mastery map.

Purpose:

- search words and phrases
- view text/audio/form recall mastery
- filter by weak, new, lesson, topic, modality

### 3.6 Dialogues

Roleplay and conversational rehearsal.

Purpose:

- listen/read dialogues
- practice cloze lines
- choose responses
- type responses
- shadow lines

### 3.7 Progress

Mastery and planning.

Purpose:

- show skill balance
- show pattern readiness
- show listening growth
- show weak capabilities
- show weekly goals
- explain next recommendations

---

## 4. Experience Types

### 4.1 Daily Tutor Session

Default session shape:

```text
1. Warm input
2. Due review
3. New discovery
4. Retrieval ladder
5. Use task
6. Recap
```

Example:

```text
Warm input:
  Hear two familiar sentences from the current lesson.

Due review:
  Review due text, audio, and pattern capabilities.

New discovery:
  Introduce two new words in a short context.

Retrieval ladder:
  Recognition -> cued recall -> typed recall/cloze.

Use task:
  Produce one short sentence or dialogue response.

Recap:
  Show what strengthened and what remains fragile.
```

### 4.2 Quick Session

Short session for low-friction practice.

Rules:

- 5 items or 3 minutes
- no new heavy concepts
- prioritize due capabilities
- include at most one audio item
- no long podcast or morphology workshop

### 4.3 Backlog Clear

Recovery mode.

Rules:

- due capabilities only
- no new introductions
- no exposure-only content
- group by weakest modality to avoid context switching overload

### 4.4 Listening Focus

Audio-first session.

Blocks:

```text
1. Audio warm-up
2. Listening MCQ
3. Hear-and-match
4. Phrase dictation
5. Shadowing
6. Recap
```

### 4.5 Podcast Session

Designed for extensive and intensive listening.

Blocks:

```text
1. Preview key phrases
2. Free listen
3. Guided transcript listen
4. Gist checkpoint
5. Detail checkpoint
6. Phrase mining
7. Optional post-listening review
```

Podcast session rules:

- full segments can remain exposure-only
- mine at most 1-3 reviewable phrase capabilities per session
- prefer high-utility phrases over rare words
- respect known-word coverage
- provide slow/normal/natural audio where available

### 4.6 Morphology Workshop

Designed for affixes, suffixes, circumfixes, and root transformations.

Blocks:

```text
1. Notice examples
2. Infer the pattern
3. See concise explanation
4. Parse derived forms
5. Produce derived forms
6. Contrast with related pattern
7. Use in sentence
8. Schedule follow-up capabilities
```

Example for `meN-`:

```text
Notice:
  tulis -> menulis
  baca -> membaca
  lihat -> melihat

Infer:
  What happens to the prefix before roots beginning with b, t, and l?

Practice:
  root -> derived
  derived -> root
  meN- vs di-
  sentence production
```

#### 4.6.1 Indonesian Morphology Syllabus

Morphology should be introduced as a sequenced syllabus, not as one generic "affixes" feature.

Early recognition and parsing:

- `ber-` common intransitive and activity verbs
- `meN-` active verbs as recognizable forms before production
- `di-` passive voice recognition
- `ter-` accidental, stative, and superlative uses where common
- simple reduplication for plurality, variety, or intensity

Controlled production after recognition is stable:

- `meN-` allomorphs before roots beginning with `b`, `p`, `t`, `d`, `s`, `k`, `c`, `j`, `g`, `h`, `f/v`, `w/y`, vowels, and liquids
- root-initial deletion such as `tulis -> menulis`, `pilih -> memilih`, `sapu -> menyapu`, `kirim -> mengirim`
- `menge-` with some monosyllabic bases, such as `cat -> mengecat`, `bor -> mengebor`, and `tik -> mengetik`
- nasal-initial roots where the initial consonant is retained, such as `minum -> meminum`, `mulai -> memulai`, and `nyanyi -> menyanyi`
- exception-prone and lexicalized patterns such as `memper-`, `mempelajari`, and forms that should be learned as high-frequency chunks first
- `-kan` vs `-i` with transitivity and semantic role differences
- `peN-` agent/instrument nouns
- `per-` and related causative/intensifying patterns when content supports it
- `ke-...-an` states, accidents, and abstract nouns
- `peN-...-an` process/place/result nouns

Register and spoken variants:

- colloquial reductions where relevant: many formal `meN-` forms are reduced, dropped, or replaced depending on word and register, such as `mengambil -> ngambil` and `melihat -> lihat/ngeliat`
- spoken alternatives that are common but not the formal written target
- explicit warnings where a form is written/formal rather than everyday spoken Indonesian

Every morphology capability should declare which facet it assesses:

```text
recognize_affixed_form
parse_affixed_form
choose_allomorph
derive_form
contrast_voice_or_transitivity
use_in_sentence
```

The app should prefer under-claiming. If the learner only recognizes `menulis`, the UI should not say they have mastered `meN-` production.

### 4.7 Pattern Practice

Targeted practice for a weak pattern.

Examples:

```text
Practice meN- production
Practice di- passive recognition
Practice -kan vs -i
Practice ke-...-an abstract nouns
Practice question particles
```

Rules:

- start from the weakest capability in the pattern
- include at least one contrast if confusion is high
- end with contextual use when production is active

### 4.8 Dialogue Rehearsal

Designed for conversational competence.

Blocks:

```text
1. Listen/read dialogue
2. Cloze key lines
3. Choose response
4. Type response
5. Shadow one line
6. Optional roleplay pass
```

Rules:

- preserve speaker roles
- preserve register
- avoid turning every short phrase into a cloze
- use dialogue lines that carry discourse meaning

---

## 5. Audio Design

### 5.1 Audio Artifact Types

```text
word_clip
phrase_clip
sentence_clip
dialogue_line_clip
podcast_segment
slow_track
normal_track
natural_track
shadowing_clip
```

Each audio artifact stores:

```text
source text
normalized text
speaker/voice
speed
duration
storage URL
transcript alignment
quality status
license/source
```

### 5.2 Audio Capabilities

```text
audio_recognition:
  hear Indonesian -> know meaning

hear_and_match:
  hear Indonesian -> choose written Indonesian

dictation:
  hear Indonesian -> type Indonesian

audio_cloze:
  hear sentence -> fill missing word

phrase_spotting:
  hear segment -> identify target phrase

shadowing:
  hear line -> repeat aloud

segment_gist:
  hear segment -> understand global meaning
```

Listening mastery should be split into separate tracks:

```text
sound_form_recognition:
  hear a familiar word or phrase and identify the Indonesian form

audio_meaning_comprehension:
  hear a word, phrase, or sentence and understand the meaning

dictation_transcription:
  hear and write the Indonesian form

speed_tolerance:
  understand the same material at slow, normal, and natural speed

discourse_comprehension:
  understand gist, speaker intent, and simple details across a segment

pronunciation_shadowing:
  repeat rhythm and phrase shape with enough confidence for practice
```

These tracks may share audio artifacts, but they should not share mastery claims.

### 5.3 Audio UI Patterns

The audio UI should be richer than a play button.

Recommended primitives:

- sound rail with progress
- slow/normal/natural toggle
- replay phrase button
- transcript reveal toggle
- loop segment button
- shadowing card
- known/unknown word highlighting
- waveform or rhythm bars when useful

### 5.4 Audio in Daily Session

Daily session should include audio gently:

```text
- one warm audio sentence
- one due audio recognition or dictation if due
- one optional shadowing moment when low-friction
```

Avoid making every session audio-heavy; audio should be present but not exhausting.

---

## 6. Exercise Families

### 6.1 Recognition

- text recognition MCQ
- audio recognition MCQ
- hear-and-match Indonesian form
- pattern recognition
- phrase spotting

### 6.2 Recall

- typed recall
- meaning recall
- cloze
- cloze MCQ
- phrase dictation
- sentence reconstruction

### 6.3 Morphology

- root to derived form
- derived form to root
- choose correct allomorph
- affix contrast
- voice transformation
- error correction

### 6.4 Grammar and Patterns

- contrast pair
- sentence transformation
- constrained translation
- pattern cloze
- guided production

### 6.5 Listening

- free listen
- guided transcript
- gist question
- detail question
- audio cloze
- shadowing
- speed ladder

### 6.6 Dialogue and Production

- dialogue cloze
- choose response
- typed response
- roleplay rehearsal
- shadow line
- free production prompt

---

## 6.7 Feedback and Error Taxonomy

The app should record why an answer failed when it can do so safely. This supports targeted practice without pretending every wrong answer is the same problem.

Initial error categories:

```text
meaning_confusion
form_spelling
audio_perception
word_order
missing_affix
wrong_affix
wrong_allomorph
voice_confusion
transitivity_confusion
register_mismatch
particle_misuse
overliteral_translation
too_slow_or_hesitant
unknown_or_unclassified
```

Feedback rules:

- Give one primary correction, not a lecture, during fast review.
- Route repeated error categories to targeted practice.
- Keep low-confidence automatic classification as `unknown_or_unclassified`.
- Let reviewers/admin correct error classifications for authored exercises.
- Store error category on the review event, not just in UI text.

Examples:

```text
Wrong: "aku mau Anda bantu"
Feedback: Register mismatch. `aku` and `Anda` usually do not belong together.
Targeted practice: pronoun/register contrast.

Wrong: "metulis"
Feedback: Wrong allomorph. With `tulis`, the `t` drops: `menulis`.
Targeted practice: meN- allomorph drill for t-initial roots.
```

---

## 7. Lesson Reader Module

Book-derived lessons should render through a dedicated lesson reader, not through ad hoc textbook fragments or the review queue.

Deep interface:

```ts
renderLessonExperience(plan: LessonExperiencePlan): ReactNode
```

The lesson reader hides:

- page layout and editorial flow
- block-specific rendering
- source progress event dispatch
- inline reveal state
- audio snippet playback
- lesson progress rail
- transitions from exposure to practice

Supported lesson blocks:

```text
LessonHeroBlock
LessonGoalsBlock
ReadingSectionBlock
InlineExampleBlock
VocabStripBlock
DialogueCardBlock
AudioMomentBlock
PatternCalloutBlock
NoticingPromptBlock
MicroCheckBlock
PracticeBridgeBlock
LessonRecapBlock
```

The lesson reader does not know FSRS. It emits source progress events such as:

```text
lesson_opened
section_exposed
intro_completed
heard_once
pattern_noticing_seen
guided_practice_completed
lesson_completed
```

Visual direction:

```text
modern editorial lesson
```

Traits:

- long-form readability with generous rhythm
- sticky progress rail for sections and goals
- inline Indonesian phrases that can reveal meaning without disrupting flow
- audio moments that feel embedded, not bolted on
- pattern callouts that feel like marginalia or field notes
- practice bridges that invite review without turning every paragraph into a quiz
- mobile-first layout that works comfortably one-handed
- desktop layout that uses width intentionally with side rails, margin notes, or companion panels instead of stretching text lines

Avoid:

- PDF-like page dumps
- table-heavy textbook imports
- generic card grids for every lesson section
- forcing every source paragraph into an exercise
- desktop pages that are just oversized mobile cards
- mobile pages that require hover, tiny targets, or horizontal scrolling

Responsive behavior:

```text
mobile:
  single-column reading flow
  bottom or inline audio controls
  collapsible progress and vocabulary
  large tap targets
  practice bridge appears inline

tablet:
  reading column plus optional sticky section rail
  audio and vocabulary panels can dock below or beside content

desktop:
  centered readable text column
  left progress rail
  right companion panel for vocabulary, notes, audio, or source references
  keyboard shortcuts for audio/reveal/next section
```

---

## 8. Experience Player Module

The UI should render `SessionPlan`, not hand-code every mode.

Deep interface:

```ts
renderSessionPlan(plan: SessionPlan): ReactNode
```

This module hides:

- block-specific layout
- transitions
- progress state
- recap handling
- answer dispatch
- audio playback coordination

Supported block renderers:

```text
WarmInputBlock
DueReviewBlock
NewIntroductionBlock
PodcastListeningBlock
PatternWorkshopBlock
DialogueRehearsalBlock
ProductionTaskBlock
RecapBlock
```

The player should not know how FSRS works. It receives render plans and reports answer outcomes.

---

## 9. Exercise Frame Module

The exercise frame from the existing exercise UI framework remains valuable, but its input should become `ExerciseRenderPlan`.

Deep interface:

```ts
renderExercise(plan: ExerciseRenderPlan): ReactNode
```

The frame should standardize:

- instruction
- prompt
- audio control
- answer area
- feedback
- continue action
- admin flagging
- accessibility

Exercise implementations become thin adapters behind this seam.

---

## 10. Mastery Model

### 9.1 Capability Mastery

Each capability has learner-specific state:

```text
dormant
active
learning
stable
fragile
suspended
retired
```

Derived from:

- FSRS stability
- retrievability
- success count
- lapse count
- recent failures
- artifact version compatibility
- sample size
- assessed modality
- learner-language direction
- error categories

Mastery claims should include confidence:

```text
not_assessed
low_confidence
medium_confidence
high_confidence
```

The UI should prefer "not assessed" over a false low score when the learner simply has no evidence yet.

### 9.2 Content Unit Mastery

A content unit aggregates capabilities.

Example for `makan`:

```text
Text recognition: strong
Audio recognition: good
Form recall: good
Dictation: weak
Contextual use: not active
```

Derived label:

```text
Usable, listening fragile
```

### 9.3 Pattern Mastery

Pattern mastery should be weakest-link aware.

Example:

```text
meN- active verbs
Recognition: 95%
Parsing: 82%
Production: 47%
Contrast with di-: 51%

Overall: Usable in guided tasks, not yet controlled production
Recommended: root-to-derived drills and active/passive contrast
```

Labels:

```text
Unseen
Noticed
Recognized
Retrievable
Usable in Guided Tasks
Productive in Controlled Tasks
Automatic in Reviewed Tasks
```

Avoid global labels such as "fluent" unless the app has broad, multi-skill evidence. A learner can be automatic at one reviewed task without being fluent in conversation.

### 9.4 Listening Mastery

Listening mastery should be separate from text mastery.

Dimensions:

```text
word audio recognition
phrase audio recognition
sentence gist
natural-speed comprehension
dictation
shadowing confidence
discourse comprehension
```

### 9.5 Progress UI

Progress page should show:

- skill balance by modality
- pattern map
- weakest capabilities
- upcoming due load
- listening growth
- controlled-production vocabulary
- exposure volume
- recommendations with reasons

---

## 11. Visual Direction

The current app has a dark, refined, cyan-accented style. The redesign should stay within that world but become more learning-specific.

Recommended design language:

```text
Sound and memory studio
```

Traits:

- dark-first but excellent light mode
- cyan/teal signal accents
- warm amber for attention/review
- deep green for stable mastery
- waveform and transcript motifs
- mastery maps that feel like constellations or circuits, not generic progress bars
- high contrast, mobile-first touch targets
- calm motion, not gamified chaos

Avoid:

- generic Duolingo clone
- purple SaaS dashboard look
- too many flat cards
- progress UI that only shows counts

---

## 12. Admin and Review UI

Add a `Content Workshop` admin area.

Views:

```text
Sources
Content Units
Capabilities
Artifacts
Contract Health
Exercise Preview
Audio QA
Publish Report
```

Most important admin view: capability health.

Example card:

```text
Capability: phrase_dictation / mau pesan
Status: blocked
Missing: clean_audio_span
Source: podcast warung-breakfast-01, segment 03
Action: regenerate audio or mark exposure-only
```

This makes content quality visible before it breaks sessions.

---

## 13. Recommendation Engine

Today page should explain recommendations.

Examples:

```text
Recommended today:
- 8 due reviews
- 2 new lesson phrases
- 1 meN- production drill
- 1 short listening warm-up

Why:
Your text recall is stable, but audio recognition is slipping.
The meN- pattern is recognized, but controlled production evidence is still weak.
```

Recommendation inputs:

- due capabilities
- weak pattern mastery
- listening gaps
- current lesson progress
- new capability budget
- learner goals
- recent session fatigue signals

---

## 14. Can-Do Tasks

Capability mastery should roll up into meaningful learner-facing outcomes.

Beginner can-do examples:

```text
I can recognize common food and drink words when written.
I can hear and identify familiar classroom phrases at slow speed.
I can order a simple drink politely using neutral register.
I can recognize common active/passive markers such as `meN-` and `di-` in short familiar sentences.
I can type familiar words from audio when spoken slowly.
```

Intermediate can-do examples:

```text
I can follow the gist of a short podcast segment with transcript support.
I can choose between `-kan` and `-i` in controlled sentence tasks.
I can recognize when `aku`, `saya`, `kamu`, `Anda`, `Bapak`, or `Ibu` fits the situation.
I can parse common affixed verbs back to their roots.
I can shadow short dialogue lines at normal speed with transcript support.
```

Can-do claims should state evidence:

```text
Evidence: 18 reviews, 3 contexts, last assessed 2026-04-25, confidence medium
```

This keeps motivation high without overclaiming.

---

## 15. Non-Goals

Not required for first implementation:

- AI pronunciation scoring
- fully open-ended conversation grading
- external podcast subscriptions
- social/community features
- native mobile app
- gamified streak economy

---

## 16. Open Questions

1. Should the app start daily sessions with audio every time, or only when audio capabilities are due?
2. Should podcast phrase mining be automatic, suggested, or learner-approved?
3. Should shadowing be self-rated only at first?
4. What mastery labels feel motivating in Dutch?
5. Should pattern mastery appear as a map, table, or guided path?
6. How much admin UI is needed before capability publishing becomes hard to operate from files alone?
