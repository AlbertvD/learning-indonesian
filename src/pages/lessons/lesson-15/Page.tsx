// Lesson 15 — Wayang di Indonesia — bespoke reader page (chapter experience).
//
// Where lesson 13 BUILT a ME-form from a root and lesson 14 spread ME- across
// word classes, lesson 15 runs the prefix BACKWARDS: given a ME-form, recover
// the root word (reverse morphophonemics). The page is therefore a "decode
// machine":
//   1. the PREFIX→sound decode table is the spine — each variant of me-/mem-/
//      men-/meny-/meng- betrays which sound the root started with;
//   2. the K·P·S·T drop-sound cards are the pedagogical heart — the four sounds
//      that vanish under the prefix and must be restored (the ambiguity);
//   3. a short loanword N.B. closes the grammar.
// There is no dialogue. Instead two narratives: a Dutch CULTUUR essay on wayang
// + the dalang (opens collapsed), and the Indonesian story of Ki Dalang Sastro's
// nightlong performance — rendered as a theatrical "pertunjukan" spread, the
// shadow-puppet heart of the lesson. A warm gold-on-night palette (lamp behind
// the kelir screen) sets it apart from lesson 14's cool indigo-teal.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 15 --pretty > src/pages/lessons/lesson-15/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }
type GrammarCategory = { title: string; rules?: string[]; table?: string[][] }

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

// ─── Grammar movement 1: the prefix → root-sound decode table ────────────────
// The lesson's spine. Each prefix variant reveals which sound the root began
// with. We split the example cell ("melayang → layang; merasa → rasa") into
// styled "form → root" decode chips so the reverse direction is visible.

function DecodeExamples({ raw }: { raw: string }) {
  // raw: "melayang → layang; merasa → rasa"
  const pairs = raw.split(';').map(s => s.trim()).filter(Boolean)
  return (
    <div className={classes.decodeExamples}>
      {pairs.map((p, i) => {
        const [form, root] = p.split('→').map(s => s.trim())
        return (
          <span key={i} className={classes.decodeChip}>
            <span className={classes.decodeForm}>{form}</span>
            <span className={classes.decodeArrow}>→</span>
            <span className={classes.decodeRoot}>{root}</span>
          </span>
        )
      })}
    </div>
  )
}

function DecodeTable({ cat }: { cat: GrammarCategory }) {
  if (!cat.table) return null
  const [head, ...rows] = cat.table
  return (
    <div className={classes.decodeBlock}>
      <p className={classes.movementCaption}>{cat.title}</p>
      <table className={classes.decodeTable}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} data-col={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td data-col="0"><span className={classes.prefixTag}>{row[0]}</span></td>
              <td data-col="1">{row[1]}</td>
              <td data-col="2"><DecodeExamples raw={row[2]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Grammar movement 2: the K·P·S·T drop-sound cards (the heart) ────────────
// The four sounds that vanish under the prefix. We parse each rule line into a
// stay-form and a drop-form so the disappearing letter reads as a card.

const DROP_ACCENTS = ['amber', 'cyan', 'teal', 'purple'] as const

function DropCard({ rule, accent }: { rule: string; accent: string }) {
  // rule e.g. "Bij mem- kan het basiswoord met b of f beginnen (blijft staan),
  //            of met p (de p is weggevallen): membayar → bayar, maar memikir → pikir."
  const [body, examplesRaw] = rule.split(/:\s*/)
  const prefix = body.match(/Bij (\w+-)/)?.[1] ?? ''
  // The dropped sound is named "met p (de p is weggevallen)" for mem-/men-/meng-,
  // or "de s ... weg" / "wegvalt" for meny- (that card phrases it differently —
  // see the isDropCard comment below for why the card classification depended
  // on this same phrasing gap).
  const dropMatch =
    body.match(/met ([a-z]) \(de \1 is weggevallen\)/i) ??
    body.match(/de ([a-z]) (?:altijd )?(?:is )?weggevallen/i) ??
    body.match(/de ([a-z]) weg\b/i)
  const dropLetter = dropMatch ? dropMatch[1].toUpperCase() : '—'
  const examples = (examplesRaw ?? '')
    .split(/,\s*maar\s*/)
    .map(s => s.trim().replace(/\.$/, ''))
  return (
    <article className={classes.dropCard} data-accent={accent}>
      <header className={classes.dropHead}>
        <span className={classes.dropLetter}>{dropLetter}</span>
        <span className={classes.dropPrefix}>{prefix}</span>
      </header>
      <p className={classes.dropBody}>{body.replace(/^Bij \w+- /, '')}</p>
      {examples.length > 0 && examples[0] && (
        <div className={classes.dropExamples}>
          {examples.map((ex, i) => {
            const [form, root] = ex.split('→').map(s => s.trim())
            return (
              <span key={i} className={classes.decodeChip}>
                <span className={classes.decodeForm}>{form}</span>
                <span className={classes.decodeArrow}>→</span>
                <span className={classes.decodeRoot}>{root}</span>
              </span>
            )
          })}
        </div>
      )}
    </article>
  )
}

// ─── Grammar section composition ─────────────────────────────────────────────

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  // 0 = concept intro (the reverse method), 1 = decode table (spine),
  // 2 = K·P·S·T drop rules, 3 = loanword N.B.
  const concept = cats[0]
  const table = cats[1]
  const drop = cats[2]
  const loan = cats[3]
  // Four per-letter cards ("Bij mem- … weggevallen") vs the trailing ambiguity
  // caveat (which never names a me- prefix variant).
  //
  // CONTENT-DROP FIX (found during the chapter conversion, 2026-07-07): the
  // meny- rule phrases the drop as "valt … weg" / "wegvalt", not
  // "weggevallen" like the other three. The old `&& /weggevallen/` guard
  // therefore misclassified it as the non-card caveat, which made
  // `.find(r => !isDropCard(r))` return the meny- rule instead of the real
  // closing ambiguity sentence — silently dropping that sentence from the
  // page entirely (it appeared nowhere in the DOM). Matching on the
  // "Bij <prefix>-" shape alone is sufficient: it's exactly the four
  // per-letter rules, and restores the fourth (S) card that DROP_ACCENTS
  // was already sized for (4 accents, previously only 3 ever consumed).
  const dropRules = drop?.rules ?? []
  const isDropCard = (r: string) => /\bme\w*-/.test(r)
  const dropCards = dropRules.filter(isDropCard)
  const dropCaveat = dropRules.find(r => !isDropCard(r))

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · ME- terugdraaien</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Van de ME-vorm terug naar het basiswoord</h2>

      {/* Concept — the reverse method, stated as steps */}
      {concept && (
        <div className={classes.conceptBlock}>
          <h3 className={classes.conceptTitle}>{concept.title}</h3>
          <ol className={classes.steps}>
            {(concept.rules ?? []).map((r, j) => <li key={j}>{r}</li>)}
          </ol>
        </div>
      )}

      {/* Movement 1 — the decode table (spine) */}
      {table && <DecodeTable cat={table} />}

      {/* Movement 2 — the K·P·S·T drop-sound cards (the heart) */}
      {dropCards.length > 0 && (
        <div className={classes.dropBlock}>
          <p className={classes.movementCaption}>Let op: vier klanken vallen weg — herstel ze</p>
          <p className={classes.dropDek}>
            Bij <strong>mem-</strong>, <strong>men-</strong>, <strong>meny-</strong> en <strong>meng-</strong> kan de beginklank
            van het basiswoord zijn verdwenen. Vier letters — <strong>K · P · S · T</strong> — verraden zich niet meer in de ME-vorm.
            Dat maakt sommige vormen op het eerste gezicht dubbelzinnig.
          </p>
          <div className={classes.dropGrid}>
            {dropCards.map((r, i) => (
              <DropCard key={i} rule={r} accent={DROP_ACCENTS[i % DROP_ACCENTS.length]} />
            ))}
          </div>
          {dropCaveat && <p className={classes.dropCaveat}>{dropCaveat}</p>}
        </div>
      )}

      {/* Movement 3 — loanword note */}
      {loan && (
        <aside className={classes.loanNote}>
          <span className={classes.loanBadge}>N.B.</span>
          <div className={classes.loanBody}>
            <h3 className={classes.loanTitle}>{loan.title}</h3>
            <ul className={classes.steps} data-plain="true">
              {(loan.rules ?? []).map((r, j) => <li key={j}>{r}</li>)}
            </ul>
          </div>
        </aside>
      )}
    </section>
  )
}

// ─── The Indonesian narrative — Ki Dalang Sastro's performance ───────────────
// No dialogue section this lesson; instead the story of the nightlong wayang
// kulit. Rendered as a theatrical spread: a stage-lit band, the dalang's
// gong-strikes pulled out as a refrain, paragraphs as scenes.

function NarrativeScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-narr">
      <p className={classes.narrEyebrow}>Verhaal · Bahasa Indonesia</p>
      <h2 id="s-narr" className={classes.sectionTitle}>Wayang di Indonesia</h2>
      <p className={classes.narrDek}>
        Ki Dalang Sastro speelt de hele nacht. Lees mee terwijl het scherm oplicht, Bima de raksasa verslaat
        en de toeschouwers tussen de scènes door naar de warung lopen.
      </p>

      <div className={classes.narrStage}>
        {c.paragraphs.map((p, i) => (
          <p key={i} className={classes.narrPara} data-lead={i === 0}>{p}</p>
        ))}
      </div>
    </section>
  )
}

// ─── Vocabulary — theatre & wayang terms ─────────────────────────────────────

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · de wayang</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Vijfenveertig woorden van het schimmenspel</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip}>
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

// ─── Culture essay — wayang & the dalang (collapsible) ───────────────────────

function CultureEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [open, setOpen] = useState(false)
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <p className={classes.cultureEyebrow}>Achtergrond · Cultuur</p>
      <h2 id="s-culture" className={classes.sectionTitle}>De wayang en de dalang</h2>
      <p className={classes.cultureDek}>
        Méér dan een schimmenspel: een samenspel van literatuur, zang, gamelan, dans en theater — en één man,
        de dalang, die honderden poppen bestuurt, alle stemmen spreekt en het verhaal een hele nacht uit het hoofd draagt.
      </p>

      <div className={classes.cultureBody} data-open={open}>
        {c.paragraphs.map((p, i) => (
          <p key={i} className={classes.culturePara} data-lead={i === 0}>{p}</p>
        ))}
        {!open && <div className={classes.cultureFade} aria-hidden="true" />}
      </div>

      <button type="button" className={classes.cultureToggle} onClick={() => setOpen(o => !o)}>
        {open ? 'Inkorten' : 'Lees het hele stuk'}
      </button>
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
    /* Hero — lamp-lit gold on indigo night. Rendered ABOVE the chapter nav
       via ChapterExperience's hero slot (cover only): the nav sits under the
       hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Wayang di Indonesia</span>
            <span className={classes.heroTitleNl}>Het schimmenspel — en de prefix teruggedraaid</span>
          </h1>
          <p className={classes.heroDescription}>
            Achter het verlichte scherm bestuurt de dalang honderden poppen tot diep in de nacht. En in de
            grammatica draaien we het werkwoord terug: van <em>menyanyi</em> naar <em>nyanyi</em>, van <em>memukul</em> naar
            <em> pukul</em> — de ME-vorm uit elkaar gehaald tot het basiswoord weer zichtbaar wordt.
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
            <em>memukul</em> betekent slaan — maar wat is het basiswoord? De <em>p</em> is weggevallen onder het
            voorvoegsel. Wie de ME-vorm wil teruglezen, leest eerst het voorvoegsel: dát verraadt welke klank er ooit stond.
          </p>
          {/* meta.level, not a hardcoded string — defensive against level
              drift (recurring bug in lessons 8/10/12, flagged during the
              chapter conversion; currently matches: B1). */}
          <p className={classes.ledeMeta}>Les 15 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter (user feedback, 2026-07-07).
          NOT wrapped in Shell: the overview centers itself on --lesson-col;
          nesting would double the horizontal padding (992 vs 1024). */}
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
          Activeer de les en de ME-vormen, de woordenschat van de wayang en de zinnen verschijnen automatisch in je oefensessies.
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
//   0 = text (culture essay — wayang & the dalang, 9 paragraphs)
//   1 = text (Indonesian narrative — Ki Dalang Sastro's performance, 8 paragraphs)
//   2 = vocabulary (45 items)
//   3 = grammar (4 categories: concept, decode table, K·P·S·T drop cards, loanword N.B.)
//   4 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (user feedback 2026-07-07).
    { id: 'inhoud',     title: 'Inhoud',     node: <InhoudChapter /> },
    { id: 'grammatica', title: 'Grammatica', description: 'Van de ME-vorm terug naar het basiswoord — het prefix-decodeschema en de K·P·S·T-klanken — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (user feedback
              2026-07-07 — it sat orphaned on the cover). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[3]} /></Shell>
        </>
      ) },
    { id: 'verhaal',    title: 'Verhaal',    description: 'Ki Dalang Sastro speelt de hele nacht — het schimmenspel in het Indonesisch verteld.',
      node: <Shell><NarrativeScene section={sections[1]} /></Shell> },
    { id: 'woorden',    title: 'Woorden',    description: '45 woorden van het schimmenspel, met audio.',
      node: <Shell><Vocabulary section={sections[2]} /></Shell> },
    { id: 'cultuur',    title: 'Cultuur',    description: 'Achtergrond over de wayang en de dalang, de man die het hele verhaal een nacht lang draagt.',
      node: <Shell><CultureEssay section={sections[0]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de ME-vormen en de woordenschat.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson15Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
