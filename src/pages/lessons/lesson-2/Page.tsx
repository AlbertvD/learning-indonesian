// Lesson 2 — Di Indonesia (In Indonesie) — bespoke reader page.
//
// Editorial layout: a traveller's arrival scene. The dialogue is the page's
// centrepiece (a 13-line meeting between three speakers); grammar fans out
// from the woordgroep insight; the closing band ties back to Borobudur,
// which the hero image already names.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 2 --pretty > src/pages/lessons/lesson-2/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }
type Item = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarExample = { indonesian: string; dutch: string; note?: string; audioUrl?: string }
type GrammarCategory = {
  title: string
  rules?: string[]
  examples?: GrammarExample[]
  pairs?: Array<{ neg: string; pos: string; neg_dutch: string; pos_dutch: string; notes?: string }>
  notes?: string
}
type GrammarSection = { intro?: string; categories: GrammarCategory[]; examples?: GrammarExample[] }
type CultureContent = {
  intro: string
  paragraphs: string[]
  borobudur_levels?: Array<{ code: string; name: string; dutch: string }>
}

const meta = content.meta
const sections = content.sections

// ─── Inline play button ────────────────────────────────────────────────────

function PlayButton({ src }: { src?: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  if (!src) return null
  return (
    <>
      <button
        type="button"
        className={classes.playButton}
        data-playing={playing}
        aria-label={playing ? 'Stop' : 'Speel uit'}
        onClick={() => {
          if (!ref.current) return
          if (playing) { ref.current.pause(); ref.current.currentTime = 0; setPlaying(false); return }
          void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        }}
      >
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {playing ? <><rect x="2" y="2" width="3" height="8" /><rect x="7" y="2" width="3" height="8" /></> : <polygon points="3,1 11,6 3,11" />}
        </svg>
      </button>
      <audio ref={ref} src={src} preload="none" onEnded={() => setPlaying(false)} />
    </>
  )
}

// Strip slashes/spaces around the woordgroep markers so the page can render
// them inline (the editor uses /Saya/ /guru/ in the DB; we render that as
// "Saya · guru" with the slot dot visible).
function renderWoordgroep(raw: string): React.ReactNode {
  const parts = raw.split('/').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 1) return raw
  return (
    <span className={classes.woordgroepLine}>
      {parts.map((p, i) => (
        <span key={i} className={classes.woordgroep}>{p}</span>
      ))}
    </span>
  )
}

// ─── Section: Dialogue (3 speakers) ────────────────────────────────────────

function speakerTone(speaker: string): 'mulyono' | 'barends-m' | 'barends-f' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('mulyono')) return 'mulyono'
  if (s.includes('ibu') && s.includes('barends')) return 'barends-f'
  if (s.includes('barends')) return 'barends-m'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Een eerste ontmoeting</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Bapak Mulyono ontmoet de Belanden</h2>
        <p className={classes.dialogueSetup}>
          Bapak Barends en zijn vrouw zijn net in Indonesie aangekomen. Op het vliegveld raken ze in gesprek met Bapak Mulyono. Ze stellen zich voor, wisselen wat informatie uit, en wachten samen op een taxi naar het hotel.
        </p>

        <div className={classes.dialogueLines}>
          {c.lines.map((line, i) => (
            <div key={i} className={classes.dialogueLine} data-speaker-tone={speakerTone(line.speaker)}>
              <div className={classes.dialogueSpeaker}>{line.speaker}</div>
              <div className={classes.dialogueBody}>
                <div className={classes.dialogueIdRow}>
                  <span className={classes.dialogueId}>{line.text}</span>
                  <PlayButton src={line.audioUrl} />
                </div>
                <div className={classes.dialogueNl}>{line.translation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section: Expressions — leave-taking phrases ───────────────────────────

function ExpressionsBand({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.expressionsEyebrow}>Beleefdheid</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Drie zinnetjes om afscheid te nemen</h2>

      <div className={classes.expressionStack}>
        {c.items.map((item, i) => (
          <article key={i} className={classes.expressionRow}>
            <div className={classes.expressionMark}>0{i + 1}</div>
            <div className={classes.expressionBody}>
              <div className={classes.expressionId}>
                {item.indonesian}
                <PlayButton src={item.audioUrl} />
              </div>
              <div className={classes.expressionNl}>{item.dutch}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Woordgroepen (grammar - the lesson's key idea) ───────────────

function WoordgroepenSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as GrammarSection & { examples?: GrammarExample[] }
  const cat = c.categories[0]
  const examples = c.examples ?? []
  const groups: { note: string; items: GrammarExample[] }[] = []
  for (const ex of examples) {
    if (ex.note) groups.push({ note: ex.note, items: [{ ...ex, note: undefined }] })
    else if (groups.length > 0) groups[groups.length - 1].items.push(ex)
    else groups.push({ note: '', items: [ex] })
  }
  return (
    <section className={classes.section} aria-labelledby="s-wg">
      <p className={classes.woordgroepEyebrow}>Het hart van de zin</p>
      <h2 id="s-wg" className={classes.sectionTitle}>Indonesisch komt in groepjes</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.woordgroepCard}>
        <div className={classes.woordgroepRules}>
          {cat.rules?.map((r, i) => <p key={i}>{r}</p>)}
        </div>
        {groups.length > 0 && (
          <div className={classes.woordgroepExamples}>
            {groups.map((g, gi) => (
              <div key={gi} className={classes.woordgroepGroup}>
                {g.note && <div className={classes.woordgroepNote}>{g.note}</div>}
                {g.items.map((ex, i) => (
                  <div key={i} className={classes.woordgroepExample}>
                    <div className={classes.woordgroepId}>{renderWoordgroep(ex.indonesian)}</div>
                    <div className={classes.woordgroepNl}>{ex.dutch}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Section: ini / itu (grammar — 3 sub-categories) ───────────────────────

const INIITU_ACCENTS = ['cyan', 'amber', 'teal'] as const

function IniItuSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as GrammarSection
  return (
    <section className={classes.section} aria-labelledby="s-ini">
      <p className={classes.iniEyebrow}>Aanwijzers</p>
      <h2 id="s-ini" className={classes.sectionTitle}>ini en itu — drie rollen</h2>
      {c.intro && <p className={classes.iniIntro}>{c.intro}</p>}

      <div className={classes.iniTiles}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.iniTile} data-accent={INIITU_ACCENTS[i % INIITU_ACCENTS.length]}>
            <header className={classes.iniTileHeader}>
              <span className={classes.iniTileNumber}>0{i + 1}</span>
              <h3 className={classes.iniTileTitle}>{cat.title.replace(/^\d+\.\s*/, '')}</h3>
            </header>
            <div className={classes.iniTileBody}>
              <ul className={classes.iniRules}>
                {cat.rules?.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples && cat.examples.length > 0 && (
                <div className={classes.iniExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.iniExample}>
                      <div className={classes.iniExampleId}>{renderWoordgroep(ex.indonesian)}</div>
                      <div className={classes.iniExampleNl}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: SE- / classifiers (grammar) ──────────────────────────────────

function ClassifiersSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as GrammarSection & { word_order?: string }
  const cat = c.categories[0]
  return (
    <section className={classes.section} aria-labelledby="s-cls">
      <p className={classes.classifiersEyebrow}>Het prefix SE-</p>
      <h2 id="s-cls" className={classes.sectionTitle}>Een ('n) — en wat erbij hoort</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.classifierGrid}>
        {cat.rules?.map((rule, i) => {
          // Rules in this section follow "voor X: Y -> Z -- meaning" pattern.
          const [head, ...rest] = rule.split(': ')
          const tail = rest.join(': ')
          // Keep EVERYTHING after the first " -- " as the gloss: a rule can
          // itself contain " -- " ("seorang Belanda -- een Nederlander"),
          // and the old two-way destructure silently dropped that tail — a
          // content loss the chapter parity test caught (fixed 2026-07-07).
          const [pattern, ...glossParts] = tail.split(' -- ')
          const gloss = glossParts.join(' — ')
          return (
            <article key={i} className={classes.classifierCard}>
              <div className={classes.classifierTag}>{head}</div>
              <div className={classes.classifierPattern}>{pattern}</div>
              {gloss && <div className={classes.classifierGloss}>{gloss}</div>}
            </article>
          )
        })}
      </div>

      {c.word_order && (
        <div className={classes.wordOrderStrip}>
          <span className={classes.wordOrderLabel}>Volgorde</span>
          <span className={classes.wordOrderValue}>{c.word_order}</span>
        </div>
      )}
    </section>
  )
}

// ─── Section: Adjectives (grammar — placement + opposite pairs) ────────────

function AdjectivesSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as GrammarSection
  const placement = c.categories.find((cat) => cat.title === 'Plaatsing')
  const opposites = c.categories.find((cat) => cat.pairs)
  return (
    <section className={classes.section} aria-labelledby="s-adj">
      <p className={classes.adjEyebrow}>Bijvoeglijke naamwoorden</p>
      <h2 id="s-adj" className={classes.sectionTitle}>Wat erbij staat, kleurt wat ervoor staat</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      {placement && (
        <div className={classes.placementCard}>
          {placement.rules?.map((r, i) => {
            const [lhs, ...restParts] = r.split(' -- ')
            const rhs = restParts.join(' -- ')
            if (!rhs) return <p key={i} className={classes.placementNote}>{r}</p>
            return (
              <div key={i} className={classes.placementRow}>
                <div className={classes.placementId}>{renderWoordgroep(lhs)}</div>
                <div className={classes.placementNl}>{rhs}</div>
              </div>
            )
          })}
        </div>
      )}

      {opposites?.pairs && (
        <>
          <p className={classes.subheading}>Tegengestelde paren</p>
          {opposites.notes && <p className={classes.subheadingNote}>{opposites.notes}</p>}
          <div className={classes.oppositesGrid}>
            {opposites.pairs.map((p, i) => (
              <div key={i} className={classes.oppositePair}>
                <div className={classes.oppositeNeg}>
                  <span className={classes.oppositeWord}>{p.neg || '—'}</span>
                  <span className={classes.oppositeGloss}>{p.neg_dutch || ' '}</span>
                </div>
                <span className={classes.oppositeBridge}>↔</span>
                <div className={classes.oppositePos}>
                  <span className={classes.oppositeWord}>{p.pos || '—'}</span>
                  <span className={classes.oppositeGloss}>{p.pos_dutch || ' '}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ─── Section: Negation tidak (grammar) ─────────────────────────────────────

function NegationSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as GrammarSection
  const cat = c.categories[0]
  return (
    <section className={classes.section} aria-labelledby="s-neg">
      <p className={classes.negEyebrow}>Ontkenning</p>
      <h2 id="s-neg" className={classes.sectionTitle}>tidak — niet</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.negList}>
        {cat.rules?.map((rule, i) => {
          // Each rule is "POSITIVE -> NEGATIVE (gloss)"
          const parenIdx = rule.lastIndexOf('(')
          const body = parenIdx > -1 ? rule.slice(0, parenIdx).trim() : rule
          const gloss = parenIdx > -1 ? rule.slice(parenIdx + 1, rule.length - 1) : ''
          const [pos, neg] = body.split(' -> ')
          return (
            <div key={i} className={classes.negRow}>
              <div className={classes.negPair}>
                <span className={classes.negPositive}>{pos?.trim()}</span>
                <span className={classes.negArrow}>→</span>
                <span className={classes.negNegative}>
                  {neg?.split(/\b(tidak)\b/).map((part, k) =>
                    part === 'tidak'
                      ? <em key={k} className={classes.negMark}>{part}</em>
                      : <span key={k}>{part}</span>
                  )}
                </span>
              </div>
              {gloss && <div className={classes.negGloss}>{gloss}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Section: Numbers 11-20 (horizontal counting strip) ────────────────────

function NumbersStrip({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-num">
      <p className={classes.numbersEyebrow}>Getallen · elf tot twintig</p>
      <h2 id="s-num" className={classes.sectionTitle}>Sebelas naar dua puluh</h2>

      <div className={classes.numbersStrip}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.numberCell}>
            <span className={classes.numberDigit}>{item.dutch}</span>
            <span className={classes.numberId}>
              {item.indonesian}
              <PlayButton src={item.audioUrl} />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Vocabulary (52 items — reference grid) ───────────────────────

function VocabularyReference({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · 52 woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Alles wat in deze les voorbijkomt</h2>
      <p className={classes.vocabHint}>Een lijst om naar terug te bladeren. De woorden komen al in de dialoog en de voorbeelden voorbij.</p>

      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabEntry}>
            <PlayButton src={item.audioUrl} />
            <div className={classes.vocabId}>{item.indonesian}</div>
            <div className={classes.vocabNl}>{item.dutch}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Culture (Borobudur) — editorial spread ───────────────────────

function CultureSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as CultureContent
  return (
    <section className={classes.section} aria-labelledby="s-cult">
      <div className={classes.cultureBand}>
        <p className={classes.cultureEyebrow}>Cultuur · Borobudur</p>
        <h2 id="s-cult" className={classes.sectionTitle}>Het grote wiel van Java</h2>
        <p className={classes.cultureIntro}>{c.intro}</p>
        <div className={classes.cultureBody}>
          {c.paragraphs.map((p, i) => (
            <p key={i} className={classes.cultureParagraph}>{p}</p>
          ))}
        </div>

        {c.borobudur_levels && c.borobudur_levels.length > 0 && (
          <div className={classes.borobudurLevels}>
            <p className={classes.borobudurHeading}>De drie sferen van Borobudur</p>
            <div className={classes.borobudurGrid}>
              {c.borobudur_levels.map((lvl) => (
                <article key={lvl.code} className={classes.borobudurLevel}>
                  <div className={classes.borobudurCode}>{lvl.code}</div>
                  <div className={classes.borobudurName}>{lvl.name}</div>
                  <div className={classes.borobudurDutch}>{lvl.dutch}</div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps ONE OR MORE scenes in the shell band the old
// single scroll page shared. Same components, same CSS — re-grouped, not
// rewritten (docs/plans/2026-07-06-lesson-chapter-experience-program.md).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className={classes.shellBand}>
      <main className={classes.shell}>{children}</main>
    </section>
  )
}

function Hero() {
  return (
    /* Hero — Borobudur sunset. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only): the nav sits under the
       hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Di Indonesia</span>
            <span className={classes.heroTitleNl}>In Indonesie</span>
          </h1>
          <p className={classes.heroDescription}>
            Een echtpaar uit Nederland landt op Java, maakt kennis met een onbekende reisgenoot en wacht op de taxi naar het hotel. Een eerste gesprek — vol kleine bouwstenen waarmee elke Indonesische zin in elkaar zit.
          </p>
        </div>
      </div>
    </header>
  )
}

function InhoudChapter() {
  return (
    <>
      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een Indonesische zin spreek je <em>in groepjes</em> — kleine adempauzes tussen wat bij elkaar hoort. Wie die ritmes leert herkennen, hoort vanzelf wie wie ontmoet, wat van wie is, en wat waar gebeurt.
          </p>
          <p className={classes.ledeMeta}>Les 2 · Beginner · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding (see lesson 5). */}
      <LessonChapterOverview />
    </>
  )
}

function OefenenChapter({ activation }: { activation: ReturnType<typeof useLessonActivation> }) {
  return (
    <section className={classes.closingBand}>
      <div className={classes.closingInner}>
        <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
        <p className={classes.closingLede}>
          Activeer de les en deze woordgroepen, getallen en patronen verschijnen automatisch in je oefensessies.
        </p>
        <div className={classes.closingActivation}>
          <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} />
        </div>
        <div className={classes.closingActions}>
          <PracticeActions lessonId={meta.id} activated={activation.activated} />
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────
// Section indices in DB order:
//   0 = dialogue (Bapak Mulyono + de Barends)
//   1 = vocabulary (52 items)
//   2 = expressions (leave-taking phrases)
//   3 = numbers (11-20)
//   4 = grammar — SE- / classifiers
//   5 = grammar — woordgroepen (the lesson's key insight)
//   6 = grammar — ini/itu (also functions as a woordgroep marker)
//   7 = grammar — negation tidak
//   8 = grammar — adjectives
//   9 = exercises (skipped — practice surface)
//  10 = culture text (Borobudur)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (matches lesson 5).
    { id: 'inhoud',      title: 'Inhoud',      node: <InhoudChapter /> },
    { id: 'ontmoeting',  title: 'Ontmoeting',  description: 'Bapak Mulyono ontmoet de Barends op het vliegveld — en drie zinnetjes om weer afscheid te nemen.',
      node: <Shell><DialogueScene section={sections[0]} /><ExpressionsBand section={sections[2]} /></Shell> },
    { id: 'woordgroepen', title: 'Woordgroepen', description: 'Het hart van de zin: hoe Indonesisch in groepjes klinkt, en hoe ini/itu die groepjes markeert — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the lesson's headline
              grammar insight (word groups), matching the lesson-5 pattern. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell>
            <WoordgroepenSection section={sections[5]} />
            <IniItuSection section={sections[6]} />
          </Shell>
        </>
      ) },
    { id: 'bouwstenen',  title: 'Bouwstenen',  description: 'Drie kleinere bouwstenen erbij: het prefix SE-, bijvoeglijke naamwoorden en ontkenning met tidak.',
      node: <Shell><ClassifiersSection section={sections[4]} /><AdjectivesSection section={sections[8]} /><NegationSection section={sections[7]} /></Shell> },
    { id: 'naslag',      title: 'Naslag',      description: 'De getallen 11 tot 20 en 52 woorden uit deze les, als naslagwerk.',
      node: <Shell><NumbersStrip section={sections[3]} /><VocabularyReference section={sections[1]} /></Shell> },
    { id: 'cultuur',     title: 'Cultuur',     description: 'Het grote wiel van Java — Borobudur, de tempel uit de hero-foto.',
      node: <Shell><CultureSpread section={sections[10]} /></Shell> },
    { id: 'oefenen',     title: 'Oefenen',     description: 'Activeer de les en oefen de woordgroepen, getallen en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson2Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
