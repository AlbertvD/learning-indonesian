// Lesson 14 — Werkwoordsvorm met ME-: Vervolg (De islam in Indonesië) — bespoke
// reader page, CHAPTER-EXPERIENCE conversion (docs/plans/2026-07-06-lesson-chapter-experience-program.md).
//
// This is the *continuation* of lesson 13's ME- prefix: where 13 taught ME- on
// verbs and its nasalisation, 14 spreads ME- across five more word classes
// (noun, pronoun, adjective, numeral, locative) and then contrasts it with BER-
// (state vs. action). The grammar is the overwhelming centrepiece — there is no
// dialogue — so the page is built around three grammar movements:
//   1. a word-class INDEX table (the lesson's own overview), the spine
//   2. the seven word-class transform groups (aku → mengaku, dua → mendua, …)
//   3. a dedicated BER-/ME- "state | action" contrast track — the theatrical heart
// The Islam-in-Indonesië reading opens as a collapsed culture spread.
//
// FIX (2026-07-07, chapter conversion): GrammarSection's category-index slice
// was off by one from cats[8] onward — cats.slice(2, 8) took only 6 of the 7
// word-class groups (dropping "6. ME- + woord van plaats"'s examples), then
// relationIntro/contrastVerb/contrastAdj each read one category EARLY. Net
// effect: the BER-/ME- relationship intro's 4 rules were never shown, the
// locative-word examples were dropped, and the entire "Relatie BER-/ME- bij
// bijvoeglijk naamwoord en telwoord" category (title + 1 rule + 6 examples)
// never rendered at all. The file's OWN comment ("2..8 = six word-class
// groups, 9 = BER/ME relation intro, 10 = BER/ME verb+noun, 11 = BER/ME
// adj+numeral") documents the intended mapping the code didn't implement —
// fixed here to match it. CLASS_LABELS gained a 7th entry (the adjective
// label split into with/without-object variants, mirroring the existing
// zelfstandig-naamwoord split) since `groups` now has 7 members, not 6.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 14 --pretty > src/pages/lessons/lesson-14/content.json

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
type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules?: string[]; examples?: Example[]; table?: string[][] }

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

// ─── A transform example: split "base → derived" + a separate sentence example ─
// The grammar examples interleave (a) base→derived pairs and (b) full sentences.
// Pairs contain "→"; sentences don't. We render them differently.

function isPair(ex: Example) {
  return ex.indonesian.includes('→')
}

function TransformPair({ ex }: { ex: Example }) {
  const [base, derived] = ex.indonesian.split('→').map(s => s.trim())
  return (
    <div className={classes.transform}>
      <span className={classes.transformBase}>{base}</span>
      <span className={classes.transformArrow}>→</span>
      <span className={classes.transformDerived}>{derived}</span>
      <PlayButton src={ex.audioUrl} />
      <span className={classes.transformNl}>{ex.dutch}</span>
    </div>
  )
}

function SentenceExample({ ex }: { ex: Example }) {
  return (
    <div className={classes.sentenceExample}>
      <div className={classes.sentenceExampleId}>
        <span>{ex.indonesian}</span>
        <PlayButton src={ex.audioUrl} />
      </div>
      <div className={classes.sentenceExampleNl}>{ex.dutch}</div>
    </div>
  )
}

// ─── Grammar movement 1: the word-class index table (the lesson's spine) ─────

function WordClassIndex({ cat }: { cat: GrammarCategory }) {
  if (!cat.table) return null
  const [head, ...rows] = cat.table
  return (
    <div className={classes.indexBlock}>
      <p className={classes.indexCaption}>Eén voorvoegsel, zes woordklassen — dit is de kaart van de hele les.</p>
      <table className={classes.indexTable}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} data-col={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} data-active={row[1]?.includes('14')}>
              {row.map((cell, j) => (
                <td key={j} data-col={j}>
                  {j === 2 ? <span className={classes.indexTag} data-use={cell}>{cell}</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Grammar movement 2: a word-class transform group ────────────────────────

function WordClassGroup({ cat, accent, label }: { cat: GrammarCategory; accent: string; label: string }) {
  const pairs = (cat.examples ?? []).filter(isPair)
  const sentences = (cat.examples ?? []).filter(ex => !isPair(ex))
  return (
    <article className={classes.classTile} data-accent={accent}>
      <header className={classes.classHeader}>
        <span className={classes.classLabel}>{label}</span>
        <h3 className={classes.classTitle}>{cat.title}</h3>
      </header>
      {cat.rules && cat.rules.length > 0 && (
        <ul className={classes.classRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      )}
      {(pairs.length > 0 || sentences.length > 0) && (
        <div className={classes.classExamples}>
          {pairs.length > 0 && (
            <div className={classes.transformGrid}>
              {pairs.map((ex, j) => <TransformPair key={j} ex={ex} />)}
            </div>
          )}
          {sentences.length > 0 && (
            <div className={classes.sentenceGrid}>
              {sentences.map((ex, j) => <SentenceExample key={j} ex={ex} />)}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Grammar movement 3: the BER-/ME- contrast track ─────────────────────────
// The lesson's pedagogical climax: BER- = state, ME- = action. We pair the
// example sentences into a left (BER-, static) / right (ME-, dynamic) split so
// the contrast is *visible*, not just stated. The pairs ride down the section.

function classifyForm(indonesian: string): 'ber' | 'me' | null {
  // Find the first ber-/me- prefixed token in the sentence.
  const m = indonesian.match(/\b(ber\w+|me\w+)\b/i)
  if (!m) return null
  return m[1].toLowerCase().startsWith('ber') ? 'ber' : 'me'
}

function ContrastTrack({ cat }: { cat: GrammarCategory }) {
  // Walk the sentence examples and pair consecutive BER-/ME- sentences.
  const sentences = (cat.examples ?? []).filter(ex => !isPair(ex))
  const pairs: Array<{ ber?: Example; me?: Example }> = []
  let current: { ber?: Example; me?: Example } = {}
  for (const ex of sentences) {
    const form = classifyForm(ex.indonesian)
    if (form === 'ber') {
      if (current.ber || current.me) { pairs.push(current); current = {} }
      current.ber = ex
    } else if (form === 'me') {
      current.me = ex
      pairs.push(current)
      current = {}
    } else {
      if (current.ber || current.me) { pairs.push(current); current = {} }
      current.ber = ex // unclassifiable → park on the left
    }
  }
  if (current.ber || current.me) pairs.push(current)

  const headPairs = (cat.examples ?? []).filter(isPair)

  return (
    <article className={classes.contrastTile}>
      <h3 className={classes.contrastTitle}>{cat.title}</h3>
      {cat.rules && (
        <ul className={classes.classRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      )}

      {headPairs.length > 0 && (
        <div className={classes.transformGrid} data-contrast="true">
          {headPairs.map((ex, j) => {
            // These pairs read "dekat → berdekat / mendekat" — keep both meng-forms.
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

      <div className={classes.contrastLegend}>
        <span className={classes.contrastChip} data-form="ber">BER- · toestand</span>
        <span className={classes.contrastChip} data-form="me">ME- · handeling</span>
      </div>
      <div className={classes.contrastGrid}>
        {pairs.map((p, j) => (
          <div key={j} className={classes.contrastRow}>
            <div className={classes.contrastCell} data-form="ber">
              {p.ber ? (
                <>
                  <div className={classes.contrastId}><span>{p.ber.indonesian}</span><PlayButton src={p.ber.audioUrl} /></div>
                  <div className={classes.contrastNl}>{p.ber.dutch}</div>
                </>
              ) : <span className={classes.contrastEmpty} aria-hidden>—</span>}
            </div>
            <div className={classes.contrastVs} aria-hidden>↔</div>
            <div className={classes.contrastCell} data-form="me">
              {p.me ? (
                <>
                  <div className={classes.contrastId}><span>{p.me.indonesian}</span><PlayButton src={p.me.audioUrl} /></div>
                  <div className={classes.contrastNl}>{p.me.dutch}</div>
                </>
              ) : <span className={classes.contrastEmpty} aria-hidden>—</span>}
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

// ─── Grammar section composition ─────────────────────────────────────────────

const CLASS_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green', 'rose'] as const
// The seven word-class transform groups, with a short editorial label each.
// (Zelfstandig naamwoord and bijvoeglijk naamwoord each split into a
// met-/zonder-lijdend-voorwerp pair in the source data — 4 + 3 = 7 groups,
// not 6; see the FIX note at the top of this file.)
const CLASS_LABELS = [
  'Zelfst. nw · met lijdend voorwerp',
  'Zelfst. nw · zonder lijdend voorwerp',
  'Persoonlijk voornaamwoord',
  'Bijvoeglijk naamwoord · zonder lijdend voorwerp',
  'Bijvoeglijk naamwoord · met lijdend voorwerp',
  'Telwoord',
  'Woord van plaats',
]

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  // 0 = concept intro, 1 = index table, 2..8 = seven word-class groups,
  // 9 = BER/ME relation intro, 10 = BER/ME verb+noun, 11 = BER/ME adj+numeral.
  const concept = cats[0]
  const index = cats[1]
  const groups = cats.slice(2, 9)
  const relationIntro = cats[9]
  const contrastVerb = cats[10]
  const contrastAdj = cats[11]

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · ME- vervolg</p>
      <h2 id="s-gram" className={classes.sectionTitle}>ME- buiten het werkwoord</h2>

      {/* Concept — what ME- does beyond verbs */}
      {concept && (
        <div className={classes.conceptBlock}>
          <h3 className={classes.conceptTitle}>{concept.title}</h3>
          <ul className={classes.classRules}>
            {(concept.rules ?? []).map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Movement 1 — the word-class index */}
      {index && <WordClassIndex cat={index} />}

      {/* Movement 2 — seven word-class transform groups */}
      <p className={classes.movementCaption}>Per woordklasse: het basiswoord, en wat ME- ervan maakt.</p>
      <div className={classes.classGrid}>
        {groups.map((cat, i) => (
          <WordClassGroup
            key={i}
            cat={cat}
            accent={CLASS_ACCENTS[i % CLASS_ACCENTS.length]}
            label={CLASS_LABELS[i] ?? `${i + 1}`}
          />
        ))}
      </div>

      {/* Movement 3 — the BER-/ME- contrast */}
      <div className={classes.contrastIntro}>
        <p className={classes.contrastEyebrow}>BER- ↔ ME-</p>
        <h3 className={classes.contrastSectionTitle}>Toestand tegenover handeling</h3>
        {relationIntro?.rules && (
          <ul className={classes.classRules}>
            {relationIntro.rules.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        )}
      </div>
      <div className={classes.contrastStack}>
        {contrastVerb && <ContrastTrack cat={contrastVerb} />}
        {contrastAdj && <ContrastTrack cat={contrastAdj} />}
      </div>
    </section>
  )
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Zesenveertig nieuwe woorden</h2>

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

// ─── Culture essay — Islam in Indonesië (collapsible) ────────────────────────

function CultureEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [open, setOpen] = useState(false)
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <p className={classes.cultureEyebrow}>Achtergrond · Geloof</p>
      <h2 id="s-culture" className={classes.sectionTitle}>De islam in Indonesië</h2>
      <p className={classes.cultureDek}>
        Van natuurgeloof en hindoeïsme naar de grootste islamitische gemeenschap ter wereld — en hoe beter onderwijs het denken over geloof veranderde.
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
    /* Hero — cooler indigo→teal tones, distinguishing this from lesson 13's
       green-amber money scene. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only). */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>ME-, vervolg</span>
            <span className={classes.heroTitleNl}>Het voorvoegsel buiten het werkwoord</span>
          </h1>
          <p className={classes.heroDescription}>
            Les 13 zette ME- op werkwoorden. Nu gaat hetzelfde voorvoegsel los op vijf andere woordklassen — een zelfstandig naamwoord, een telwoord, zelfs <em>aku</em> — en komt het tegenover BER- te staan: toestand tegenover handeling.
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
            <em>dua</em> is twee. <em>mendua</em> is uiteenvallen in tweeën. Hetzelfde voorvoegsel dat een werkwoord maakt, maakt nu een telwoord, een kleur en een plaats tot een handeling. En naast ME- staat altijd BER- — de stille tegenpool.
          </p>
          {/* ESTABLISHED FIX (lessons 8/10/12): render {meta.level} instead of
              a hardcoded CEFR literal — content.json's level (B1) can differ
              from what was typed here by hand ("A1", stale). */}
          <p className={classes.ledeMeta}>Les 14 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding. */}
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
          Activeer de les en de ME-vormen, de woorden en de BER-/ME-contrasten verschijnen automatisch in je oefensessies.
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
//   0 = text (Islam in Indonesië culture essay)
//   1 = vocabulary (46 items)
//   2 = grammar (12 categories — concept, index table, 7 word-class groups,
//       relation intro, 2 BER-/ME- contrast tracks)
//   3 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (user feedback 2026-07-07).
    { id: 'inhoud', title: 'Inhoud', node: <InhoudChapter /> },
    { id: 'grammatica', title: 'Grammatica', description: 'ME- op vijf nieuwe woordklassen, en het contrast met BER- — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (it's the
              grammar-most chapter — user feedback 2026-07-07). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[2]} /></Shell>
        </>
      ) },
    { id: 'woorden', title: 'Woorden', description: 'Zesenveertig nieuwe woorden, met audio.',
      node: <Shell><Vocabulary section={sections[1]} /></Shell> },
    { id: 'islam-in-indonesie', title: 'Islam in Indonesië', description: 'Achtergrondlezing over de geschiedenis van de islam in Indonesië.',
      node: <Shell><CultureEssay section={sections[0]} /></Shell> },
    { id: 'oefenen', title: 'Oefenen', description: 'Activeer de les en oefen de ME-vormen en woorden.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson14Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
