// Lesson 3 — Di Bandar Udara (Op het vliegveld) — bespoke reader page.
//
// Editorial layout: an arrival sequence, now told as chapters. Ibu Yulia
// lands, finds her bagage, haggles a porter, clears douane, and walks out
// toward a taxi — that's the "Dialoog" chapter. The dari/di/ke triptych (the
// spatial machine that powers the dialogue's "waar?"s) plus the vraagwoorden
// toolkit form the lesson's grammar hinge, so they share the "Grammatica"
// chapter — and carry the lesson audio (docs/current-system/modules/chapter-
// experience.md: audio belongs with the grammar-most chapter, not the
// cover). Two small focused callouts (sekali, ada) get their own chapter.
// Numbers, vocabulary and expressions close as one reference chapter.
//
// Chapter conversion: docs/plans/2026-07-06-lesson-chapter-experience-program.md
// (lesson 5 is the pilot/reference; this mirrors its patterns exactly).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 3 --pretty > src/pages/lessons/lesson-3/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

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

// ─── Section: Dialogue (4 speakers, a 4-stage journey) ─────────────────────

function speakerTone(speaker: string): 'ibu' | 'pekerja' | 'pengangkut' | 'pabean' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('ibu')) return 'ibu'
  if (s.includes('pekerja')) return 'pekerja'
  if (s.includes('pengangkut')) return 'pengangkut'
  if (s.includes('pabean')) return 'pabean'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: Array<{ text: string; speaker: string; translation: string; audioUrl?: string }>; closing?: string }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Aankomst in Jakarta</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Ibu Yulia op Soekarno-Hatta</h2>
        <p className={classes.dialogueSetup}>
          Ibu Yulia is net geland. Eerst zoekt ze haar koffers, dan vraagt ze een kruier om hulp, daarna nog langs de douane, en ten slotte naar de taxistandplaats bij de uitgang. Vier korte gesprekken, elk met een ander gezicht.
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

        {c.closing && <p className={classes.dialogueClosing}>{c.closing}</p>}
      </div>
    </section>
  )
}

// ─── Section: dari / di / ke — the spatial triptych ────────────────────────
//
// The first grammar section has two categories:
//   [0] rules listing dari/di/ke meanings + example sentences + warnings
//   [1] a 12-row table of body-words (atas, bawah, kiri, ...) with their
//       dari/di/ke combinations
//
// Lesson 3's centrepiece. Renders as: three "movement" cards across the top
// (dari = van, di = in, ke = naar), then the body-word table below where each
// row's three combinations sit inline as small movement chips.

type PlaceRow = { word: string; dutch: string; combinations: string[] }

function parseRule(rule: string): { lhs: string; rhs: string } {
  const [lhs, ...rest] = rule.split(' -- ')
  return { lhs: lhs.trim(), rhs: rest.join(' -- ').trim() }
}

const TRIPTYCH = [
  { key: 'dari', dutch: 'van, vanuit', dir: '↤', accent: 'amber' },
  { key: 'di',   dutch: 'in, op, te', dir: '⌂', accent: 'cyan' },
  { key: 'ke',   dutch: 'naar', dir: '↦', accent: 'teal' },
] as const

function combinationKind(combo: string): 'dari' | 'di' | 'ke' | 'other' {
  if (combo.startsWith('dari')) return 'dari'
  if (combo.startsWith('di '))  return 'di'
  if (combo.startsWith('ke '))  return 'ke'
  return 'other'
}

function PlaceWordsSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: Array<{ title: string; rules?: string[]; table?: PlaceRow[] }> }
  const triptychCat = c.categories.find((cat) => cat.rules) ?? c.categories[0]
  const tableCat = c.categories.find((cat) => cat.table)

  // Pull the headline rules (the meaning lines) and the warnings (the "NIET" lines)
  // out of the freeform `rules` array.
  const ruleLines = triptychCat.rules ?? []
  const warnings = ruleLines.filter((r) => r.includes('->') || r.toLowerCase().includes('niet') || r.toLowerCase().includes('vergelijk') || r.toLowerCase().includes('worden altijd'))
  const headlineLine = ruleLines.find((r) => r.toLowerCase().includes('vergelijk'))

  return (
    <section className={classes.section} aria-labelledby="s-place">
      <p className={classes.placeEyebrow}>Plaats &amp; richting</p>
      <h2 id="s-place" className={classes.sectionTitle}>dari · di · ke — drie woorden voor waar het over gaat</h2>

      <div className={classes.triptych}>
        {TRIPTYCH.map((t) => (
          <article key={t.key} className={classes.triptychTile} data-accent={t.accent}>
            <span className={classes.triptychGlyph} aria-hidden="true">{t.dir}</span>
            <h3 className={classes.triptychWord}>{t.key}</h3>
            <p className={classes.triptychDutch}>{t.dutch}</p>
          </article>
        ))}
      </div>

      {headlineLine && (
        <p className={classes.placeHeadline}>{headlineLine.replace('Vergelijk: ', '')}</p>
      )}

      {tableCat?.table && (
        <div className={classes.placeTable}>
          {tableCat.table.map((row) => (
            <article key={row.word} className={classes.placeRow}>
              <div className={classes.placeRowLeft}>
                <div className={classes.placeWord}>{row.word}</div>
                <div className={classes.placeWordNl}>{row.dutch}</div>
              </div>
              <div className={classes.placeRowChips}>
                {row.combinations.length === 0 ? (
                  <span className={classes.placeRowNone}>— (geen vaste combinaties)</span>
                ) : (
                  row.combinations.map((combo, i) => {
                    const { lhs, rhs } = parseRule(combo)
                    const kind = combinationKind(combo)
                    return (
                      <div key={i} className={classes.placeChip} data-kind={kind}>
                        <span className={classes.placeChipId}>{lhs}</span>
                        <span className={classes.placeChipNl}>{rhs}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {warnings.filter((w) => w.includes('->')).length > 0 && (
        <div className={classes.placeWarnings}>
          <p className={classes.placeWarningHead}>Let op — niet overdrachtelijk gebruiken</p>
          {warnings.filter((w) => w.includes('->')).map((w, i) => {
            // shape: "'Ik kom van huis' -> Saya dari rumah (correct)"
            const arrow = w.indexOf(' -> ')
            const nl = w.slice(0, arrow).replace(/^'|'$/g, '').trim()
            const rest = w.slice(arrow + 4)
            const isCorrect = rest.toLowerCase().includes('(correct)')
            const id = rest.replace(/\(correct\)|\(fout\)/gi, '').replace(/^NIET\s+/i, '').trim()
            return (
              <div key={i} className={classes.placeWarning} data-correct={isCorrect}>
                <div className={classes.placeWarningNl}>"{nl}"</div>
                <div className={classes.placeWarningId}>{id}</div>
                <div className={classes.placeWarningTag}>{isCorrect ? 'wel' : 'niet'}</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Section: Vraagwoorden — the toolkit table ─────────────────────────────

type QuestionWord = { word: string; asks: string; example: string }

function QuestionWordsSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    intro?: string
    note?: string
    categories: Array<{ title: string; table?: QuestionWord[] }>
    examples?: Array<{ indonesian: string; dutch: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }>
  }
  const cat = c.categories[0]
  const rows = cat?.table ?? []
  return (
    <section className={classes.section} aria-labelledby="s-vraag">
      <p className={classes.vraagEyebrow}>De vraagwoorden</p>
      <h2 id="s-vraag" className={classes.sectionTitle}>Elf manieren om "waar?", "wat?", "wie?" te vragen</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.vraagGrid}>
        {rows.map((row, i) => (
          <article key={i} className={classes.vraagRow}>
            <div className={classes.vraagWord}>{row.word}</div>
            <div className={classes.vraagBody}>
              <div className={classes.vraagAsks}>{row.asks}</div>
              <div className={classes.vraagExample}>{row.example}</div>
            </div>
          </article>
        ))}
      </div>

      {c.note && <p className={classes.vraagNote}>{c.note}</p>}

      {c.examples && c.examples.length > 0 && (
        <>
          <p className={classes.vraagExamplesHead}>Vraag &amp; antwoord — een rondje door de praktijk</p>
          <div className={classes.vraagExamples}>
            {c.examples.map((ex, i) => (
              <div key={i} className={classes.vraagExampleRow}>
                <div className={classes.vraagExampleQ}>
                  <span className={classes.vraagExampleQTag}>vraag</span>
                  <span className={classes.vraagExampleQId}>
                    {ex.indonesian}
                    <PlayButton src={ex.audioUrl} />
                  </span>
                </div>
                <div className={classes.vraagExampleA}>
                  <span className={classes.vraagExampleATag}>antw.</span>
                  <span className={classes.vraagExampleAId}>{ex.dutch}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ─── Section: sekali — a tiny formula callout ──────────────────────────────

function SekaliCallout({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    intro?: string
    categories: Array<{ title: string; rules?: string[] }>
  }
  const examples = c.categories[0]?.rules ?? []
  return (
    <section className={classes.section} aria-labelledby="s-sekali">
      <p className={classes.sekaliEyebrow}>Erg, heel, zeer</p>
      <h2 id="s-sekali" className={classes.sectionTitle}>sekali — de versterker die erachter komt</h2>

      <div className={classes.sekaliCard}>
        <div className={classes.sekaliFormula}>
          <span className={classes.sekaliFormulaTag}>vorm</span>
          <span className={classes.sekaliFormulaBody}>
            <span className={classes.sekaliSlot}>[bijv. nw.]</span>
            <span className={classes.sekaliPlus}>+</span>
            <span className={classes.sekaliFormulaWord}>sekali</span>
          </span>
        </div>
        <p className={classes.sekaliGloss}>{c.intro}</p>
        <div className={classes.sekaliExamples}>
          {examples.map((rule, i) => {
            const { lhs, rhs } = parseRule(rule)
            return (
              <div key={i} className={classes.sekaliExample}>
                <div className={classes.sekaliExampleId}>{lhs}</div>
                <div className={classes.sekaliExampleNl}>{rhs}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Section: ada — the existential verb ───────────────────────────────────

function AdaSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    intro?: string
    categories: Array<{ title: string; rules?: string[] }>
  }
  const rules = c.categories[0]?.rules ?? []

  // Split rules into examples (have ` -- `) and the doctrinal warnings (don't).
  const examples: Array<{ id: string; nl: string }> = []
  const warnings: string[] = []
  const wrongRight: Array<{ wrong: string; right: string; gloss: string }> = []
  let note: string | undefined

  for (const rule of rules) {
    if (rule.startsWith('Opmerking:')) {
      note = rule.replace(/^Opmerking:\s*/, '')
      continue
    }
    if (rule.includes(' -> ')) {
      // shape: "Dit huis is mooi -> Rumah ini bagus (NIET: ada bagus)"
      const arrow = rule.indexOf(' -> ')
      const gloss = rule.slice(0, arrow).trim()
      const tail = rule.slice(arrow + 4).trim()
      const paren = tail.lastIndexOf('(')
      const right = paren > -1 ? tail.slice(0, paren).trim() : tail
      const wrong = paren > -1 ? tail.slice(paren + 1, tail.length - 1).replace(/^NIET:\s*/i, '').trim() : ''
      wrongRight.push({ gloss, right, wrong })
      continue
    }
    if (rule.includes(' -- ')) {
      const { lhs, rhs } = parseRule(rule)
      examples.push({ id: lhs, nl: rhs })
      continue
    }
    warnings.push(rule)
  }

  return (
    <section className={classes.section} aria-labelledby="s-ada">
      <p className={classes.adaEyebrow}>Er is, er zijn</p>
      <h2 id="s-ada" className={classes.sectionTitle}>ada — het werkwoord dat geen koppelwerkwoord is</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.adaExamples}>
        {examples.map((ex, i) => (
          <div key={i} className={classes.adaExample}>
            <div className={classes.adaExampleId}>{ex.id}</div>
            <div className={classes.adaExampleNl}>{ex.nl}</div>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <p className={classes.adaWarning}>{warnings.join(' ')}</p>
      )}

      {wrongRight.length > 0 && (
        <div className={classes.adaConfusion}>
          {wrongRight.map((wr, i) => (
            <article key={i} className={classes.adaConfusionRow}>
              <div className={classes.adaConfusionGloss}>{wr.gloss}</div>
              <div className={classes.adaConfusionPair}>
                <span className={classes.adaConfusionRight}>{wr.right}</span>
                <span className={classes.adaConfusionWrong}>{wr.wrong}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {note && <p className={classes.adaNote}><em>Opmerking</em> — {note}</p>}
    </section>
  )
}

// ─── Section: Numbers 10–100 — the puluh ladder ────────────────────────────

function NumbersLadder({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ indonesian: string; dutch: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-num">
      <p className={classes.numbersEyebrow}>Tien naar honderd</p>
      <h2 id="s-num" className={classes.sectionTitle}>De -puluh ladder, en twee samenstellingen</h2>
      <p className={classes.numbersHint}>Vanaf 10 telt het Indonesisch in tientallen — <em>sepuluh</em> (10), <em>dua puluh</em> (20), <em>tiga puluh</em> (30). Voor 21 en 32 plak je het eenheidscijfer er gewoon achteraan.</p>

      <div className={classes.numbersLadder}>
        {c.items.map((item, i) => {
          const isComposite = /\s\w+\s\w+$/.test(item.indonesian) // e.g. "dua puluh satu"
          return (
            <div key={i} className={classes.numbersRung} data-composite={isComposite}>
              <span className={classes.numbersDigit}>{item.dutch}</span>
              <span className={classes.numbersId}>
                {item.indonesian}
                <PlayButton src={item.audioUrl} />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Section: Vocabulary — dense reference grid ────────────────────────────

function VocabularyReference({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ indonesian: string; dutch: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · {c.items.length} woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van het vliegveld</h2>
      <p className={classes.vocabHint}>De dialoog en de plaatsbepalingen putten allemaal uit deze lijst — een plek om naar terug te bladeren.</p>

      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabEntry}>
            <PlayButton src={item.audioUrl} />
            <div className={classes.vocabId}>{item.indonesian}</div>
            {item.register === 'informal' && <span className={classes.spreektaalTag}>spreektaal</span>}
            <div className={classes.vocabNl}>{item.dutch}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Expressions — six polite phrases ─────────────────────────────

function ExpressionsBand({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ indonesian: string; dutch: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.expressionsEyebrow}>Beleefdheid op het vliegveld</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Zes zinnetjes die je vandaag al kunt gebruiken</h2>

      <div className={classes.expressionsGrid}>
        {c.items.map((item, i) => (
          <article key={i} className={classes.expressionTile}>
            <div className={classes.expressionId}>
              {item.indonesian}
              <PlayButton src={item.audioUrl} />
            </div>
            <div className={classes.expressionNl}>{item.dutch}</div>
          </article>
        ))}
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
    /* Hero — twilight-airport palette. Rendered ABOVE the chapter nav via
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
            <span className={classes.heroTitleId}>Di Bandar Udara</span>
            <span className={classes.heroTitleNl}>Op het vliegveld</span>
          </h1>
          <p className={classes.heroDescription}>
            Ibu Yulia stapt uit het vliegtuig en heeft twee koffers, een grote tas en geen idee waar de douane is. Een aankomst in vier korte gesprekken — en daarmee de bouwstenen waarmee je in het Indonesisch leert vragen waar iets is, vanwaar het komt, en waar het naar toe gaat.
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
            Drie woordjes dragen deze hele les: <em>dari</em>, <em>di</em>, <em>ke</em>. Van waar je komt, waar je bent, waar je heen gaat. Wie ze beheerst, kan op een vliegveld al overweg.
          </p>
          <p className={classes.ledeMeta}>Les 3 · Beginner · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding (matches lesson 5's convention). */}
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
          Activeer de les — en de vraagwoorden, plaatsbepalingen en getallen tot honderd komen vanzelf in je oefensessies langs.
        </p>
        <div className={classes.closingActivation}>
          <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} loadFailed={activation.loadFailed} onRetryLoad={activation.retryLoad} />
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
//   0 = dialogue (Ibu Yulia's arrival)
//   1 = vocabulary
//   2 = expressions
//   3 = numbers
//   4 = grammar — dari/di/ke + body-word table
//   5 = grammar — vraagwoorden
//   6 = grammar — sekali
//   7 = grammar — ada
//   8 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (matches lesson 5).
    { id: 'inhoud',              title: 'Inhoud',              node: <InhoudChapter /> },
    { id: 'dialoog',             title: 'Dialoog',             description: 'Ibu Yulia arriveert op Soekarno-Hatta — bagage, een kruier en de douane in vier korte gesprekken.',
      node: <Shell><DialogueScene section={sections[0]} /></Shell> },
    { id: 'grammatica',          title: 'Grammatica',          description: 'dari, di en ke — de plaatswoorden die de hele les dragen — plus de elf vraagwoorden, met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the headline grammar
              (dari/di/ke is the lesson's centerpiece), not on the cover —
              matches lesson 5's convention. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell>
            <PlaceWordsSection section={sections[4]} />
            <QuestionWordsSection section={sections[5]} />
          </Shell>
        </>
      ) },
    { id: 'sekali-en-ada',       title: 'Sekali & ada',        description: 'Twee kleine bouwstenen: de versterker sekali en het werkwoord ada dat geen koppelwerkwoord is.',
      node: (
        <Shell>
          <SekaliCallout section={sections[6]} />
          <AdaSection section={sections[7]} />
        </Shell>
      ) },
    { id: 'cijfers-en-woorden',  title: 'Cijfers & woorden',   description: 'De -puluh ladder naar honderd, de woorden van het vliegveld en zes beleefde uitdrukkingen.',
      node: (
        <Shell>
          <NumbersLadder section={sections[3]} />
          <ExpressionsBand section={sections[2]} />
          <VocabularyReference section={sections[1]} />
        </Shell>
      ) },
    { id: 'oefenen',             title: 'Oefenen',             description: 'Activeer de les en oefen de woorden en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson3Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
