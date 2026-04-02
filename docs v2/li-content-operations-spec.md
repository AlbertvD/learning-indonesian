# Learning Indonesian Content Operations Specification

## Purpose

This document defines how content for the retention-first learning system should be created, enriched, validated, and maintained.

It focuses on:

- canonical learning items
- lesson and podcast extraction
- contexts and examples
- audio coverage
- answer variants
- content quality controls

## Core Principle

The app should not rely on raw flashcards alone.

Content should be organized so one important item can support:

- anchoring
- recall
- listening
- contextual use
- production
- transfer

That means content operations must produce richer item records over time.

## Content Types

### 1. Canonical Learning Items

These are the main teachable units.

Recommended item types:

- `word`
- `phrase`
- `sentence`
- `dialogue_chunk`

### 2. Meanings

Each item may have:

- primary translation
- secondary translations
- sense notes
- usage notes

### 3. Contexts

Each item should eventually have:

- one anchor context
- multiple varied contexts

### 4. Media

Useful media types:

- pronunciation audio
- sentence audio
- optional image support

### 5. Relationships

Important relationships:

- collocations
- confusables
- synonym-like neighbors
- topic links

## Minimum Content Standard Per Core Item

For an item to be considered ready for the new system, it should ideally have:

- one canonical Indonesian form
- one primary translation
- one anchor context
- one source/provenance reference

For stronger learning quality, aim for:

- one or more audio assets
- two to five varied contexts
- accepted answer variants
- confusable group links where relevant
- phrase-level or chunk-level usage if appropriate

## Content Sources

Primary sources already present in the app:

- flashcards
- vocabulary table
- lessons
- lesson sections
- podcasts
- podcast transcripts

## Content Pipeline

## Stage 1: Ingest

Sources are imported from:

- lesson content
- vocabulary rows
- flashcards
- podcast material

At ingest time:

- preserve provenance
- normalize text
- avoid duplicate creation when obvious match exists

## Stage 2: Canonicalize

Decide whether a source entry should become:

- a new canonical learning item
- an alternate form of an existing item
- a context attached to an existing item
- a personal/user-owned item rather than global content

## Stage 3: Enrich

Add:

- translations
- anchor examples
- varied examples
- audio
- relationship metadata
- answer variants

## Stage 4: Validate

Run quality checks before content is considered production-ready.

## Stage 5: Publish

Expose the content to:

- lessons
- daily sessions
- practice modes
- transfer tasks

## Canonicalization Rules

These rules should be written into the actual content tooling later.

### Rule 1: Do not assume one flashcard equals one canonical item

Some flashcards are:

- personal
- mnemonic
- duplicate
- too ambiguous

### Rule 2: Distinguish word vs phrase carefully

Examples:

- a single verb may be one item
- a fixed expression may deserve its own phrase item

### Rule 3: Preserve multiple meanings when needed

Do not collapse genuinely different senses into one flat translation field.

### Rule 4: Preserve provenance

Each item and context should retain source references such as:

- lesson id
- podcast id
- card set id
- manual import

## Context Strategy

## Anchor Context

Every important item should have one simple, clear context used first.

Anchor context should be:

- short
- unambiguous
- easy enough for the learner's level
- good for first recall and explanation

## Varied Contexts

After anchoring, the system should draw from additional contexts with:

- different sentences
- different topics
- different nearby vocabulary
- different speakers if audio exists

## Context Coverage Targets

Recommended targets:

- MVP: 1 anchor context for top-priority items
- v2: 2 to 3 contexts for high-frequency items
- long-term: 3 to 5 contexts for important items used in transfer tasks

## Audio Strategy

Audio becomes increasingly important once the app expands into listening and speaking.

### Priority Order

1. audio for high-frequency core items
2. audio for anchor sentences
3. audio for varied contexts
4. multiple speakers for mature listening practice

### Audio Metadata To Track

- speaker
- style/register
- duration
- source

## Answer Variant Policy

To support productive tasks, the system should explicitly manage acceptable answer variants.

Track:

- punctuation-insensitive matches
- capitalization-insensitive matches
- parenthetical variants
- acceptable synonyms
- alternate translations
- spelling variants if allowed

Without this policy, production exercises will feel unfair.

## Confusable Item Policy

Some items should be marked as confusable:

- orthographically similar
- semantically similar
- commonly mixed by learners

Uses:

- queue balancing
- feedback
- targeted practice
- scheduler penalties

## Content Roles

Even for a solo project, it helps to think in roles.

### Author

Creates or imports items, contexts, and meanings.

### Curator

Resolves duplicates, senses, and context quality issues.

### Reviewer

Checks item quality, audio coverage, and answer variants.

### Operator

Runs validation scripts and content backfills.

One person can play all of these roles, but the workflow should still separate the responsibilities conceptually.

## Content Quality Checks

Recommended automated checks:

- missing primary translation
- missing anchor context
- duplicate normalized text
- contexts with identical source text
- items without provenance
- items missing audio where audio is expected
- broken media paths
- empty or low-quality translations

## Recommended Admin and Tooling Features

Not all of these need to exist immediately, but they should be planned for.

### Content Dashboard

Shows:

- number of items
- coverage by level
- anchor context coverage
- varied context coverage
- audio coverage
- items missing metadata

### Item Editor

Allows editing:

- canonical text
- meanings
- notes
- variants
- contexts
- relationships

### Context Manager

Allows:

- attaching lesson snippets
- attaching podcast snippets
- editing context difficulty
- marking anchor context

### Validation Tools

Scripts or screens for:

- duplicates
- broken references
- missing required fields

## Recommended Workflow For New Lesson Content

1. Create or import lesson
2. Extract candidate items
3. Match candidates to existing canonical items
4. Create new items where needed
5. attach one anchor context
6. attach lesson provenance
7. add or queue audio needs
8. validate content package
9. publish lesson and reinforcement links

## Recommended Workflow For Podcast Content

1. import transcript and metadata
2. identify reusable item contexts
3. select short excerpts, not entire transcript blocks
4. attach excerpts to existing items
5. create new items only when needed
6. validate snippet quality and alignment

## Priority Recommendations

If content resources are limited, add depth in this order:

1. anchor contexts
2. answer variants
3. audio for important items
4. varied contexts
5. confusable metadata
6. dialogue and production prompts

## Risks To Avoid

- treating every flashcard as clean canonical content
- creating too many contexts without quality control
- adding productive exercises without answer variant support
- expanding speaking before audio and context coverage are good enough
- failing to preserve provenance

## Final Recommendation

The content system should gradually evolve from "cards and lessons" into a reusable language knowledge base.

That knowledge base should make it possible for one vocabulary item to power:

- lesson introduction
- daily review
- listening practice
- context reinforcement
- production tasks
- future transfer exercises
