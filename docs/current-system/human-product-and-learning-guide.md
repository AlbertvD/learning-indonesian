# Human Product and Learning Guide

Audience: a human who wants to understand the app, the learning experience, the learning engine, exercise types, and how everything ties together.

This guide explains the functionality in product language first, then maps it to the implementation.

For the refined learner-experience rules agreed on 2026-04-28, including Today posture, lesson unlocks, introduction gates, direction balance, audio behavior, and learner-facing wording, see [Learning Experience Rules](../plans/2026-04-28-learning-experience-rules.md).

## 1. Product Goal

The app is a Dutch-first Indonesian learning system. Its goal is not only to show flashcards, but to guide a learner toward mastery through:

```text
reading
listening
noticing patterns
retrieving words and forms
controlled production
reviewing at the right time
building confidence over time
```

FSRS remains important, but FSRS should schedule memory traces, not decide the whole curriculum by itself. The app now has a richer model that can represent exactly what the learner can do.

Example:

```text
The learner may recognize makan in text.
The learner may not yet recall makan from Dutch.
The learner may not yet recognize makan in audio.
The learner may be able to use makan in a cloze sentence.
```

Those are separate capabilities. The app should not collapse them into one vague "word known" state.

## 2. The Main Learning Model

The app now distinguishes these concepts:

```text
Content source:
  a lesson, podcast, dialogue, morphology unit, or other input source

Content unit:
  a teachable object extracted from a source, such as a word, phrase, sentence, pattern, podcast segment, or affixed form pair

Capability:
  a concrete thing the learner can do with that unit

Exercise:
  a UI task used to assess or strengthen a capability

Mastery:
  a learner-facing summary derived from evidence across capabilities
```

A content source is not automatically reviewable. A lesson page can expose the learner to language, but review debt is created only when the planner and review processor decide a capability is eligible and ready.

## 3. Learning Progression

The intended learner progression is:

```text
exposure
  -> noticing
    -> recognition
      -> cued recall
        -> form recall
          -> constrained production
            -> contextual use
              -> maintenance
```

This means the app should not jump directly from "a lesson contains this form" to "the learner must now type it under FSRS".

Examples:

```text
Vocabulary:
  see/hear the word in a lesson
  recognize it from Indonesian to Dutch
  recall it from Dutch to Indonesian
  use it in a sentence or cloze
  recognize it in audio
  type it from audio

Grammar pattern:
  notice examples
  recognize the pattern
  distinguish it from a nearby contrast
  use it in constrained translation or transformation
  later use it in wider context

Morphology:
  notice baca -> membaca
  recognize membaca as derived from baca
  choose or explain the allomorph
  produce membaca from baca
  use the form in a sentence
```

Stages shown to the learner should be summaries of evidence, not scheduling authority.

## 4. How New Things Enter the Queue

A new capability enters practice only when several checks agree:

```text
1. The content pipeline says the capability exists.
2. The capability contract says required artifacts are present and approved.
3. Source progress says the learner has reached the relevant lesson/listening/pattern point.
4. Prerequisite capability evidence is sufficient.
5. Load budgets allow another new item or concept.
6. The session composer has room for it.
7. The review processor activates it when the learner performs the first review.
```

This avoids a brittle global rule like "lesson completed means all lesson content is reviewable".

The app can be lesson-led without being lesson-locked. Old reviews, remediation, exposure-only listening, and learner-selected exploration can still happen, but productive review should respect readiness.

## 5. Current Learner-Facing Surfaces

### Today / Dashboard

The dashboard remains the normal starting point for review and practice. Today is the guided path: it summarizes progress, goals, due work, and the global session entry point.

### Lessons

Lessons are side quests that prepare and support Today. The lessons overview helps the learner choose and open a lesson; it does not start practice directly and does not compete with the dashboard.

The individual lesson reader is designed for book-derived content that feels like a modern web lesson rather than a PDF dump. It introduces grammar, words, sentences, dialogue, and culture through reading and listening; retrieval practice still happens on the exercise/session surface.

It supports a flow like:

```text
lesson hero
reading section
vocabulary strip
pattern callout
noticing prompt
practice bridge
recap
```

The lesson reader records source progress, such as opening a lesson, listening to grammar audio, reading the grammar section, or meaningfully consuming dialogue. It does not directly create FSRS review state.

Once lesson content is ready, the individual lesson page can show `Practice this lesson`. If the learner already has active practiced content from that lesson, it can show `Review this lesson`. Both actions launch selected-lesson capability sessions, count toward FSRS through the review processor, respect the learner's profile session size, and underfill cleanly rather than pulling unrelated material.

Culture and pronunciation sections are useful reading/listening content, but they do not gate lesson status or unlock practice by themselves.

The overview preserves scroll position when the learner returns from a lesson. Lesson audio resumes from the last local position for the same lesson audio and does not autoplay.

Desktop and mobile are both intended. On desktop, the reader can use a left progress rail and right companion panel. On mobile, it collapses into a one-column reading flow.

### Sessions

The legacy session remains the safe production path for legacy item sessions. It builds exercises from existing items, meanings, contexts, grammar variants, and learner skill state.

The new capability session path is feature-flagged. It renders a `SessionPlan` through the Experience Player and now owns standard capability sessions plus selected-lesson practice/review modes. This supports a future tutor-like session flow:

```text
warm input
due reviews
new introductions
focused practice
recap
```

### Progress

The direction is to show mastery by capability and modality:

```text
text recognition
audio recognition
form recall
meaning recall
dictation
pattern recognition
pattern production
morphology recognition
morphology production
```

This prevents overclaiming. A learner can be strong at recognizing a word but weak at hearing it or producing it.

## 6. Exercise Types

The app has existing exercise types and the new capability layer maps capabilities onto them.

### Recognition MCQ

The learner sees Indonesian and chooses the Dutch meaning.

Best for:

```text
first recognition
low-friction review
beginner confidence
```

### Typed Recall

The learner sees a Dutch prompt and types the Indonesian form.

Best for:

```text
active vocabulary recall
spelling/form retrieval
productive control
```

### Meaning Recall

The learner sees Indonesian and types the meaning.

Best for:

```text
active meaning retrieval
reducing passive guessing
```

### Cloze

The learner fills a blank inside an Indonesian sentence.

Best for:

```text
contextual vocabulary
sentence patterns
forms that need surrounding context
```

### Cloze MCQ

The learner chooses the missing word from options.

Best for:

```text
pattern recognition
early grammar contrast
lower-pressure contextual practice
```

### Cued Recall

The learner receives a meaning cue and chooses or recalls the Indonesian form.

Best for:

```text
bridging recognition and typed recall
short productive steps
```

### Contrast Pair

The learner chooses between two similar options or meanings.

Best for:

```text
grammar distinctions
confusion groups
particles and negation
forms with nearby contrasts
```

### Sentence Transformation

The learner transforms a sentence according to an instruction.

Best for:

```text
controlled grammar production
word order
voice changes
morphology or tense/aspect-like pattern work
```

### Constrained Translation

The learner translates a Dutch sentence into Indonesian while using a required pattern.

Best for:

```text
controlled production
preventing shortcut answers
pattern-specific output
```

### Listening MCQ

The learner hears Indonesian and chooses the meaning.

Best for:

```text
audio recognition
sound-to-meaning mapping
low-friction listening review
```

### Dictation

The learner hears Indonesian and types what they heard.

Best for:

```text
sound-to-form mapping
spelling from audio
listening precision
```

### Speaking

Speaking exists as a disabled or future-facing exercise family. It should not commit FSRS state until reliable scoring or self-rating policy is explicitly implemented.

## 7. Audio in the Learning Experience

Audio is treated as a modality, not decoration.

A written word and an audio word can share source content but produce different capabilities:

```text
text_recognition:
  see makan -> know eten

audio_recognition:
  hear makan -> know eten

dictation:
  hear makan -> type makan
```

Future podcast and listening work should add:

```text
gist listening
phrase spotting
timecoded phrase mining
shadowing
slow/normal/natural speed ladders
transcript reveal
```

Not every audio source should create FSRS review debt. Full podcast segments can be exposure-only, while selected useful phrases become reviewable capabilities.

## 8. Grammar and Pattern Mastery

Patterns should be tracked as patterns, not hidden inside a single vocabulary stage.

Example pattern mastery dimensions:

```text
recognize pattern
understand meaning/function
distinguish from contrast pattern
produce in controlled prompt
use in sentence context
```

The app should allow targeted practice like:

```text
Practice meN- recognition
Practice root-to-derived forms
Practice di- passive recognition
Practice -kan vs -i
Practice sudah vs belum
Practice formal vs informal pronouns
```

A learner can be marked strong in one facet and weak in another. This is healthier than saying "meN- mastered" after only recognition tasks.

## 9. Morphology Experience

Indonesian prefixes and suffixes should become a structured learning capability system.

The first morphology pilot focuses on affixed form pairs such as:

```text
baca -> membaca
tulis -> menulis
```

The app can track:

```text
derived-to-root recognition
root-to-derived recall
allomorph choice
contrast with passive/other forms
sentence-level use
```

This matters because Indonesian morphology is both high-value and easy to overclaim. The app should under-claim mastery until production evidence exists.

## 10. Podcasts and Rich Input

Podcasts can enrich the app without overwhelming the review system.

A podcast session can include:

```text
free listen
guided transcript
gist question
detail question
phrase mining
optional post-listening review
```

The key rule is conservative activation:

```text
segment exposure can remain exposure-only
only selected short phrases or prompts become capabilities
mined phrases need source/timecode and reviewable artifacts
```

This lets learners enjoy Indonesian input without turning every word in a podcast into homework.

## 11. Dutch-First Experience

The app should default to Dutch learner-facing copy and Dutch meanings. English can remain supported, but Dutch is the first-class learner language.

Dutch-first affects:

```text
navigation and UI copy
exercise instructions
feedback
lesson explanations
content meanings
pattern explanations
```

The underlying capability model stays language-parameterized (`nl`, `en`, or `none`) so English support does not require an architecture rewrite later.

## 12. How It Ties Together

A typical future flow looks like this:

```text
1. A lesson page introduces market language.
2. The learner reads a section and marks it seen.
3. Source progress records section_exposed.
4. The planner sees that text recognition for selected words is eligible.
5. The session composer includes a small number of new capabilities.
6. The exercise resolver maps them to recognition MCQ or cloze.
7. The learner answers.
8. The review processor commits the review and activates FSRS state.
9. Later sessions schedule due capabilities.
10. The mastery model summarizes what is strong, fragile, or unassessed.
```

The learner experiences this as a coherent tutor path. The implementation experiences it as separate modules with clear ownership.

## 13. Current Release Reality

The new system is not yet the default production learning path. It is built behind flags so it can be released safely with current exercises.

Current safe posture:

```text
legacy exercises continue to work
capability diagnostics can be enabled carefully
new lesson reader and experience player remain gated
local preview remains development-only
```

Before making the new capability path default, the app needs a real Supabase publish and smoke test with approved content, lesson page blocks, capabilities, artifacts, and review commits.
