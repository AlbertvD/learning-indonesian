// Lesson 13 — Tukar Uang (Geld wisselen) — bespoke reader page.
//
// The spine of this lesson is the ME- active-verb prefix and its nasalisation
// allomorphy (me-/mem-/men-/meny-/meng-; K/P/S/T drop). The grammar section is
// therefore the page's centrepiece, given a dedicated "transformation map"
// layout. The money-changer dialogue (Ibu Barends ↔ Pak Rachmat) is the warm
// scene; a long Dutch economic-history essay opens as a collapsible culture
// spread so it sets context without dominating.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 13 --pretty > src/pages/lessons/lesson-13/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { AffixTrainerLink } from '@/components/lessons/AffixTrainerLink'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

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

// ─── Section: Culture essay (collapsible) ──────────────────────────────────
// Section 0 is a long Dutch economic-history piece. Renders editorially with a
// drop cap and a narrower measure; collapsed behind a toggle so it frames the
// lesson without swamping the language content that follows.

function paragraphHeading(p: string): { heading: string | null; body: string } {
  // A few paragraphs lead with a single-word heading on its own line
  // ("Protectionisme\n…", "Diversificatie\n…").
  const nl = p.indexOf('\n')
  if (nl > 0 && nl < 28 && !p.slice(0, nl).includes(' ')) {
    return { heading: p.slice(0, nl), body: p.slice(nl + 1) }
  }
  return { heading: null, body: p }
}

function CultureEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [open, setOpen] = useState(false)
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <p className={classes.cultureEyebrow}>Achtergrond · Economie</p>
      <h2 id="s-culture" className={classes.sectionTitle}>Olie, rupiah en de economie van Indonesië</h2>
      <p className={classes.cultureDek}>
        Waarom de waarde van geld in Indonesië een verhaal op zich is — van de oliecrisis tot de devaluatie van de rupiah.
      </p>

      <div className={classes.cultureBody} data-open={open}>
        {c.paragraphs.map((p, i) => {
          const { heading, body } = paragraphHeading(p)
          return (
            <div key={i} className={classes.cultureBlock}>
              {heading && <h3 className={classes.cultureSubhead}>{heading}</h3>}
              <p className={classes.culturePara} data-lead={i === 0}>{body}</p>
            </div>
          )
        })}
        {!open && <div className={classes.cultureFade} aria-hidden="true" />}
      </div>

      <button type="button" className={classes.cultureToggle} onClick={() => setOpen(o => !o)}>
        {open ? 'Inkorten' : 'Lees het hele stuk'}
      </button>
    </section>
  )
}

// ─── Section: Money primer ─────────────────────────────────────────────────
// Section 1 is an Indonesian-primary reading about money types, with embedded
// coin/note lists. We pull the denominations out as chips, keep the prose as
// the lead paragraph with its Dutch footnote beneath.

const COINS = ['100', '200', '500', '1.000']
const NOTES = ['1.000', '2.000', '5.000', '10.000', '20.000', '50.000', '100.000']

function MoneyPrimer({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  // paragraphs: [0] = intro + the embedded list, [1] = money changers, [2] = footnote
  const intro = c.paragraphs[0]?.split('\n')[0] ?? ''
  const changers = c.paragraphs[1] ?? ''
  const footnote = c.paragraphs[2] ?? ''
  return (
    <section className={classes.section} aria-labelledby="s-money">
      <p className={classes.moneyEyebrow}>Bacaan · Uang Rupiah</p>
      <h2 id="s-money" className={classes.sectionTitle}>Vreemdeling met euro's, niemand met rupiah</h2>

      <p className={classes.moneyIntro}>{intro}</p>

      <div className={classes.moneyDenoms}>
        <div className={classes.denomGroup}>
          <span className={classes.denomLabel}>uang logam · munten</span>
          <div className={classes.denomChips}>
            {COINS.map(v => <span key={v} className={classes.denomChip} data-kind="coin">Rp {v}</span>)}
          </div>
        </div>
        <div className={classes.denomGroup}>
          <span className={classes.denomLabel}>uang kertas · biljetten</span>
          <div className={classes.denomChips}>
            {NOTES.map(v => <span key={v} className={classes.denomChip} data-kind="note">Rp {v}</span>)}
          </div>
        </div>
      </div>

      <p className={classes.moneyChangers}>{changers}</p>
      <p className={classes.moneyFootnote}>{footnote}</p>
    </section>
  )
}

// ─── Section: Dialogue ─────────────────────────────────────────────────────

function speakerTone(speaker: string): 'ibu' | 'pak' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('ibu') || s.includes('barends')) return 'ibu'
  if (s.includes('pak') || s.includes('rachmat')) return 'pak'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { setup?: string; lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Bij de money changer</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Tukar Uang</h2>

        <p className={classes.dialogueSetup}>
          Mevrouw Barends is net in Indonesië aangekomen en wil 200 euro en een dollarcheque wisselen. Pak Rachmat helpt haar — en geeft haar een waarschuwing mee de straat op.
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

// ─── Section: Grammar — the ME- prefix (the lesson's spine) ─────────────────
// Six categories. We split them: the two prose categories (concept + "action
// central") frame the section; the three allomorphy rules (A1/A2/B) render as
// the nasalisation map; the final long nota-bene renders as a wrapped chip wall.

const NASAL_ACCENTS = ['cyan', 'purple', 'teal'] as const

function GrammarConcept({ cat }: { cat: GrammarCategory }) {
  return (
    <article className={classes.conceptBlock}>
      <h3 className={classes.conceptTitle}>{cat.title}</h3>
      <ul className={classes.conceptRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      {cat.examples && cat.examples.length > 0 && (
        <div className={classes.conceptExamples}>
          {cat.examples.map((ex, j) => (
            <div key={j} className={classes.conceptExample}>
              <div className={classes.conceptExampleId}>
                {ex.indonesian}
                <PlayButton src={ex.audioUrl} />
              </div>
              <div className={classes.conceptExampleNl}>{ex.dutch}</div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function NasalRule({ cat, accent, index }: { cat: GrammarCategory; accent: string; index: number }) {
  return (
    <article className={classes.nasalTile} data-accent={accent}>
      <header className={classes.nasalHeader}>
        <span className={classes.nasalNumber}>{`0${index + 1}`}</span>
        <h3 className={classes.nasalTitle}>{cat.title}</h3>
      </header>
      <div className={classes.nasalBody}>
        <ul className={classes.nasalRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
        {cat.examples && cat.examples.length > 0 && (
          <div className={classes.nasalExamples}>
            {cat.examples.map((ex, j) => {
              const [base, derived] = ex.indonesian.split('→').map(s => s.trim())
              return (
                <div key={j} className={classes.transform}>
                  <span className={classes.transformBase}>{base}</span>
                  <span className={classes.transformArrow}>→</span>
                  <span className={classes.transformDerived}>{derived}</span>
                  <PlayButton src={ex.audioUrl} />
                  <span className={classes.transformNl}>{ex.dutch}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  // 0 = concept intro, 1 = A1 (me-), 2 = A2 (mem/men/meng), 3 = B (K/P/S/T drop),
  // 4 = "handeling staat centraal", 5 = nota bene (verbs without ME-)
  const concept = cats[0]
  const nasal = [cats[1], cats[2], cats[3]].filter(Boolean)
  const central = cats[4]
  const notaBene = cats[5]

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · De ME-vorm</p>
      <h2 id="s-gram" className={classes.sectionTitle}>De bedrijvende werkwoordsvorm</h2>

      {/* Concept — what ME- does */}
      {concept && <GrammarConcept cat={concept} />}

      {/* The nasalisation map — three allomorphy rules */}
      <p className={classes.nasalCaption}>De neusklank past zich aan de beginklank aan — soms verdwijnt die klank zelfs.</p>
      <div className={classes.nasalGrid}>
        {nasal.map((cat, i) => (
          <NasalRule key={i} cat={cat} accent={NASAL_ACCENTS[i % NASAL_ACCENTS.length]} index={i} />
        ))}
      </div>

      {/* The verb in a sentence — action central */}
      {central && (
        <div className={classes.centralBlock}>
          <GrammarConcept cat={central} />
        </div>
      )}

      {/* Nota bene — verbs that resist ME- */}
      {notaBene && (
        <aside className={classes.notaBene}>
          <p className={classes.notaBeneEyebrow}>Let op</p>
          <h3 className={classes.notaBeneTitle}>{notaBene.title}</h3>
          {(() => {
            // Split the single rule on its "maar" pivot into a scannable ✓/✗ contrast.
            const [yes, no] = notaBene.rules[0].split(/,\s*maar\s+/i)
            return (
              <div className={classes.notaContrast}>
                <p className={classes.notaContrastRow} data-polarity="yes">
                  <span className={classes.notaMark} aria-hidden>✓</span>
                  <span>{yes.replace(/\.$/, '')}.</span>
                </p>
                {no && (
                  <p className={classes.notaContrastRow} data-polarity="no">
                    <span className={classes.notaMark} aria-hidden>✗</span>
                    <span>Maar {no}</span>
                  </p>
                )}
              </div>
            )
          })()}
          {notaBene.rules[1] && (
            <div className={classes.notaBeneList}>
              {notaBene.rules[1]
                .replace(/^[^:]*:\s*/, '')
                .split(/,\s*(?=[a-z])/)
                .map((entry, i) => {
                  const m = entry.match(/^([a-z']+)\s*\(([^)]+)\)/i)
                  if (!m) return <span key={i} className={classes.notaChip}>{entry.replace(/\.$/, '')}</span>
                  return (
                    <span key={i} className={classes.notaChip}>
                      <span className={classes.notaChipId}>{m[1]}</span>
                      <span className={classes.notaChipNl}>{m[2]}</span>
                    </span>
                  )
                })}
            </div>
          )}
        </aside>
      )}
    </section>
  )
}

// ─── Section: Item list (vocabulary, expressions) ──────────────────────────

function ItemList({
  section,
  eyebrowClass,
  eyebrow,
  title,
  tone,
}: {
  section: typeof sections[number]
  eyebrowClass: string
  eyebrow: string
  title: string
  tone: 'lush' | 'warm'
}) {
  const c = section.content as { items: Item[] }
  const id = `s-${tone}`
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip} data-tone={tone}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.itemId}>{item.indonesian}</span>
            {item.register === 'informal' && <span className={classes.spreektaalTag}>spreektaal</span>}
            <span className={classes.itemSep} />
            <span className={classes.itemNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps ONE scene in the shell band the old single
// scroll page shared. Same components, same CSS — re-grouped, not rewritten
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className={classes.shellBand}>
      <main className={classes.shell}>{children}</main>
    </section>
  )
}

function Hero() {
  return (
    /* Hero band — full-bleed, decorated. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only). */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Tukar Uang</span>
            <span className={classes.heroTitleNl}>Geld wisselen</span>
          </h1>
          <p className={classes.heroDescription}>
            Met euro's koop je in Indonesië niets — vroeg of laat moet elke vreemdeling naar de money changer. Mevrouw Barends wisselt haar geld bij Pak Rachmat, en ondertussen leer je het werkwoord dat dit alles aandrijft: de ME-vorm.
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
            <em>menukar</em> — wisselen. Eén woord, en je ziet de hele les: een basiswoord (<em>tukar</em>), een voorvoegsel (me-), en een t die spoorloos verdwijnt. Dit is hoe Indonesische werkwoorden gaan leven.
          </p>
          {/* meta.level, not a hardcoded string — the old copy said A1 while
              content.json's meta.level is B1 (flagged during the chapter
              conversion — same established fix as lessons 8/10/12). */}
          <p className={classes.ledeMeta}>Les {meta.order_index} · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter (user feedback, 2026-07-07).
          NOT wrapped in Shell: the overview centers itself on --lesson-col;
          nesting would double the horizontal padding. */}
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
          Activeer de les en de woorden, de ME-vormen en de zinnen verschijnen automatisch in je oefensessies.
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
//   0 = text (economic-history essay, collapsible culture spread)
//   1 = text (money primer — coin/note types)
//   2 = dialogue (Ibu Barends + Pak Rachmat at the money changer)
//   3 = vocabulary
//   4 = expressions (one fixed phrase)
//   5 = grammar (the ME- prefix — the lesson's spine)
//   6 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (user feedback 2026-07-07).
    { id: 'inhoud',      title: 'Inhoud',      node: <InhoudChapter /> },
    { id: 'geld',        title: 'Geld',        description: "Een leesstuk over rupiah: munten, biljetten en de money changer.",
      node: <Shell><MoneyPrimer section={sections[1]} /></Shell> },
    { id: 'dialoog',     title: 'Dialoog',     description: "Ibu Barends wisselt haar euro's bij Pak Rachmat — en krijgt een waarschuwing mee de straat op.",
      node: <Shell><DialogueScene section={sections[2]} /></Shell> },
    { id: 'grammatica',  title: 'Grammatica',  description: 'De ME-vorm en haar neusklank-allomorfie — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (established
              pattern, see lesson 5) — it belongs at the top of the
              grammar-most chapter, not orphaned on the cover. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[5]} /></Shell>
          <AffixTrainerLink affixes={['meN-']} />
        </>
      ) },
    { id: 'woorden',     title: 'Woorden',     description: 'Woordenschat rond geld en straat, plus één vaste uitdrukking.',
      node: (
        <Shell>
          <ItemList
            section={sections[3]}
            eyebrowClass={classes.vocabEyebrow}
            eyebrow="Woordenschat"
            title="Geld, wisselen en de straat"
            tone="lush"
          />
          <ItemList
            section={sections[4]}
            eyebrowClass={classes.expressionsEyebrow}
            eyebrow="Uitdrukking"
            title="Eén vaste wending"
            tone="warm"
          />
        </Shell>
      ) },
    { id: 'achtergrond', title: 'Achtergrond', description: 'Van oliecrisis tot devaluatie: hoe de rupiah zijn waarde kreeg.',
      node: <Shell><CultureEssay section={sections[0]} /></Shell> },
    { id: 'oefenen',     title: 'Oefenen',     description: 'Activeer de les en oefen de woorden en de ME-vormen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson13Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
