// Lesson 21 — Bab 5: Dongeng — bespoke reader page.
//
// A folktale chapter. Two faces:
//   1. THE STORY — a Pancatantra animal fable: the foolish monkey Utun and the
//      wise turtle Uca by a river that swells in a sudden storm. The story is
//      the heart of the lesson, so it leads: a narrative spread, the fable's
//      title ("Si monyet dan si kura-kura") pulled out as a chapter heading,
//      each paragraph a scene, the opening line set as a drop-lead.
//   2. THE GRAMMAR — the verbal suffix -KAN: it makes a base word transitive and
//      adds either a CAUSATIVE ('make/let it ...') or BENEFACTIVE ('do it for
//      someone') reading; and every active meN-...-kan form has a passive
//      di-...-kan twin. Seven categories. We give the suffix its own visual
//      identity: every example is a "root → -KAN form" decode chip with the
//      arrows aligned, and the meN-/di- contrast reads as a paired transform.
//
// Palette: warm lamplit gold for the fable (a dongeng told by lamplight),
// per-tile purple/teal/amber for the grammar movements, green for the
// story's 47-word vocabulary.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 21 --pretty > src/pages/lessons/lesson-21/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }

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

// ─── The fable — Si monyet dan si kura-kura ──────────────────────────────────
// paragraphs[0] is the framing prologue ("In Indonesia there are many dongeng…").
// paragraphs[1] opens with the fable's title on its own line, then the first
// scene. The remaining paragraphs are scenes. We surface the prologue as an
// italic dek, lift the title out of paragraph 1 as a chapter heading, and lay
// the scenes out as a lamplit narrative column.

function FableScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [prologue, firstBlock, ...rest] = c.paragraphs
  // firstBlock = "Si monyet dan si kura-kura\nAda seekor monyet…"
  const [fableTitle, ...firstSceneLines] = firstBlock.split('\n')
  const firstScene = firstSceneLines.join('\n')

  return (
    <section className={classes.section} aria-labelledby="s-fable">
      <p className={classes.fableEyebrow}>Dongeng · Pancatantra</p>
      <h2 id="s-fable" className={classes.sectionTitle}>Een dierfabel uit India</h2>
      <p className={classes.fableProloog}>{prologue}</p>

      <div className={classes.fableStage}>
        <h3 className={classes.fableTitle}>{fableTitle}</h3>
        <p className={classes.fableScene} data-lead="true">{firstScene}</p>
        {rest.map((p, i) => (
          <p key={i} className={classes.fableScene}>{p}</p>
        ))}
      </div>
    </section>
  )
}

// ─── Grammar — the -KAN suffix in seven movements ────────────────────────────
// Each example renders as a "root → -KAN form" decode chip so the suffix's
// transform is visible, with arrows aligned down the column. Some examples
// already carry the arrow in the Indonesian field ("tempat → menempatkan");
// others are whole sentences (no arrow). We render both: a sentence shows as
// a single Indonesian line; an arrow pair shows as an aligned transform.

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green', 'orange', 'cyan'] as const

function ExampleRow({ ex }: { ex: GrammarExample }) {
  const arrow = ex.indonesian.includes('→')
  if (arrow) {
    const [left, right] = ex.indonesian.split('→').map(s => s.trim())
    return (
      <div className={classes.grammarPair}>
        <span className={classes.grammarPairLeft}>{left}</span>
        <span className={classes.grammarPairArrow}>→</span>
        <span className={classes.grammarPairRight}>
          {right}
          <PlayButton src={ex.audioUrl} />
        </span>
        <span className={classes.grammarPairNl}>{ex.dutch}</span>
      </div>
    )
  }
  return (
    <div className={classes.grammarSentence}>
      <div className={classes.grammarSentenceId}>
        {ex.indonesian}
        <PlayButton src={ex.audioUrl} />
      </div>
      <div className={classes.grammarSentenceNl}>{ex.dutch}</div>
    </div>
  )
}

function GrammarTile({ cat, index }: { cat: GrammarCategory; index: number }) {
  const accent = GRAMMAR_ACCENTS[index % GRAMMAR_ACCENTS.length]
  const hasPairs = cat.examples.some(e => e.indonesian.includes('→'))
  return (
    <article className={classes.grammarTile} data-accent={accent}>
      <header className={classes.grammarTileHeader}>
        <span className={classes.grammarTileNumber}>{`0${index + 1}`}</span>
        <h3 className={classes.grammarTileTitle}>{cat.title}</h3>
      </header>
      <ul className={classes.grammarRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      {cat.examples.length > 0 && (
        <div className={classes.grammarExamples} data-pairs={hasPairs}>
          {cat.examples.map((ex, j) => <ExampleRow key={j} ex={ex} />)}
        </div>
      )}
    </article>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · het achtervoegsel -KAN</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Eén suffix, twee betekenissen — en een lijdende tweeling</h2>
      <p className={classes.grammarDek}>
        <em>-KAN</em> maakt van een basiswoord een overgankelijk werkwoord: er moet een lijdend voorwerp bij.
        Daarbovenop voegt het óf een <strong>causatieve</strong> lezing toe (&lsquo;iets laten of doen gebeuren&rsquo;),
        óf een <strong>benefactieve</strong> (&lsquo;iets vóór iemand doen&rsquo;). En naast elke bedrijvende
        <em> meN-&#8230;-kan</em> staat een lijdende <em>di-&#8230;-kan</em>.
      </p>

      <div className={classes.grammarTiles}>
        {c.categories.map((cat, i) => <GrammarTile key={i} cat={cat} index={i} />)}
      </div>
    </section>
  )
}

// ─── Vocabulary — the 47 words of the fable ──────────────────────────────────

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · de fabel</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van rivier, regen en redding</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.itemId}>{item.indonesian}</span>
            <span className={classes.itemSep} />
            <span className={classes.itemNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson21Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero band — full-bleed, lamplit dongeng */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Dongeng</span>
              <span className={classes.heroTitleNl}>Een sprookje — en de kracht van één achtervoegsel</span>
            </h1>
            <p className={classes.heroDescription}>
              De domme aap Utun gaat alleen vissen, ook al waarschuwt zijn vriend de schildpad Uca voor de regen.
              Als de rivier plotseling stijgt, is het Uca die hem redt. Lees de fabel — en zie hoe het achtervoegsel
              <em> -kan</em> woorden laat <em>doen</em>, <em>laten</em> en <em>geven</em>.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the page's voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een dongeng leert je twee dingen tegelijk. Het verhaal draagt de woorden — <em>rivier, regen, redding</em> —
            en tussen de regels verschuilt zich de grammatica: <em>menjatuhkan</em>, <em>dikeringkan</em>, <em>menolong</em>.
            Eén achtervoegsel, en de aap laat zijn dobber vallen.
          </p>
          <p className={classes.ledeMeta}>Les 21 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — band between the lede and the main content */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} voice={meta.primary_voice ?? undefined} />
          </div>
        </section>
      )}

      {/* Main content — single column, aligned to lede width */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <FableScene    section={sections[0]} />
          <GrammarSection section={sections[2]} />
          <Vocabulary    section={sections[1]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA grouped as one unit */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden van de fabel en de -KAN-vormen verschijnen automatisch in je oefensessies.
          </p>
          <div className={classes.closingActivation}>
            <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} />
          </div>
          <div className={classes.closingActions}>
            <PracticeActions lessonId={meta.id} activated={activation.activated} />
          </div>
        </div>
      </section>
    </article>
  )
}
