// Lesson 4 — Di Hotel (In het hotel) — bespoke reader page.
//
// Editorial layout: a Balinese arrival. The lesson opens not at the front
// desk but on the white sand at five in the morning — Bali nightlife,
// penginapan, losmen, guesthouse — then walks inland to the hotel reception
// where the YANG construction does most of the actual work ("kunci yang kecil
// dan kuning"). The rice culture spread sits right before the numbers, so
// "nasi kuning" reads as the menu item Ibu Dewi just ordered, and the numbers
// ladder doubles as a currency scale (the Rupiah amounts in the cultuur prose).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 4 --pretty > src/pages/lessons/lesson-4/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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

// ─── Helper: highlight "yang" inside an Indonesian example ─────────────────
//
// The whole grammar section turns on this word. Wrapping it in a coloured span
// lets it pop in the examples without us re-typing every line.

function highlightYang(text: string): React.ReactNode {
  const parts = text.split(/\b(yang)\b/i)
  return parts.map((part, i) =>
    part.toLowerCase() === 'yang'
      ? <em key={i} className={classes.yangMark}>{part}</em>
      : <span key={i}>{part}</span>
  )
}

// ─── Section: Culture opener — Bali nights & penginapan ────────────────────
//
// First paragraph is just "Les 4\nCULTUUR" — we lift CULTUUR into a kicker
// and render the rest of the prose as the actual essay. Paragraph 1 gets the
// drop cap; paragraphs 2-3 each describe one accommodation tier, which we
// extract into a three-up "tiers" panel at the bottom (with price-bands that
// rhyme forward to the numbers section).

function CultureOpener({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  // Skip the "Les 4\nCULTUUR" marker paragraph; render the rest as prose.
  const [, ...prose] = c.paragraphs
  const [lede, penginapanP, losmenP, banP, guesthouseP] = prose
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <div className={classes.cultureBand}>
        <p className={classes.cultureKicker}>Cultuur · Bali</p>
        <h2 id="s-culture" className={classes.cultureDisplay}>
          Onder de tropenhemel,
          <span className={classes.cultureDisplayLine2}>en wat ervoor in de plaats kwam</span>
        </h2>

        <p className={classes.cultureLede}>{lede}</p>

        <blockquote className={classes.culturePullQuote}>
          <span className={classes.culturePullMark}>&ldquo;</span>
          om vijf uur 's ochtends gonst het strand van de bedrijvigheid
          <span className={classes.culturePullMarkClose}>&rdquo;</span>
        </blockquote>

        <div className={classes.cultureBody}>
          {penginapanP && <p>{penginapanP}</p>}
          {losmenP && <p>{losmenP}</p>}
          {banP && <p className={classes.cultureBanLine}>{banP}</p>}
          {guesthouseP && <p>{guesthouseP}</p>}
        </div>

        <div className={classes.tiers}>
          <p className={classes.tiersHeading}>Drie keer slapen op Bali — drie prijsklassen</p>
          <div className={classes.tiersGrid}>
            <article className={classes.tier} data-tier="penginapan">
              <span className={classes.tierKicker}>penginapan</span>
              <span className={classes.tierName}>Een plaats om te overnachten</span>
              <span className={classes.tierPrice}>Rp 70.000 – 150.000</span>
              <span className={classes.tierGloss}>Slaapzaal, hurktoilet, lage prijs</span>
            </article>
            <article className={classes.tier} data-tier="losmen">
              <span className={classes.tierKicker}>losmen</span>
              <span className={classes.tierName}>Van het Nederlandse 'logement'</span>
              <span className={classes.tierPrice}>Rp 100.000 – 300.000</span>
              <span className={classes.tierGloss}>Familiebedrijf, kwaliteit wisselt</span>
            </article>
            <article className={classes.tier} data-tier="guesthouse">
              <span className={classes.tierKicker}>guesthouse</span>
              <span className={classes.tierName}>Schoner, beter — let op de kamer</span>
              <span className={classes.tierPrice}>Rp 300.000 – 600.000</span>
              <span className={classes.tierGloss}>Ventilator? AC? Probeer hem uit</span>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Section: Dialogue (hotel reception, two staff + Ibu Dewi) ─────────────

function speakerTone(speaker: string): 'dewi' | 'wawan' | 'imran' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('dewi')) return 'dewi'
  if (s.includes('wawan')) return 'wawan'
  if (s.includes('imran')) return 'imran'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: Array<{ text: string; speaker: string; translation: string; audioUrl?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Aan de receptie</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Ibu Dewi checkt in</h2>
        <p className={classes.dialogueSetup}>
          Ibu Dewi komt aan bij haar hotel. Eerst haar kamernummer en paspoort,
          dan de sleutel, daarna de kamer mandi — en als ze die heeft gezien
          komt het echte werk: wat ga ik eten? Een gesprek waarin <em>yang</em>
          om de paar zinnen voorbijkomt, zonder dat het opvalt.
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

// ─── Section: YANG grammar — five facets of one tiny word ──────────────────
//
// The grammar section has FIVE categories all about yang. We render them as
// five stacked horizontal spreads, each with its own accent + numbered kicker.
// Every example highlights the word `yang` in mono-accent to make the pattern
// pop without needing a legend.

const YANG_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green'] as const

type YangCategory = {
  title: string
  rules: string[]
  examples?: Array<{ indonesian: string; dutch: string; audioUrl?: string }>
}

function YangGrammar({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: YangCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-yang">
      <p className={classes.yangEyebrow}>Eén woord, vijf rollen</p>
      <h2 id="s-yang" className={classes.sectionTitle}>
        <em className={classes.yangMarkTitle}>yang</em> — de scharnier van de Indonesische zin
      </h2>
      <p className={classes.yangIntro}>
        Een drieletterwoord dat alles aan elkaar lijmt: bijzinnen, nadruk,
        nominaliseringen. In de dialoog hierboven zit het in &ldquo;kunci yang
        kecil dan kuning&rdquo; en in &ldquo;makanan yang enak&rdquo;. Hieronder
        de vijf manieren waarop het werkt.
      </p>

      <div className={classes.yangTiles}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.yangTile} data-accent={YANG_ACCENTS[i % YANG_ACCENTS.length]}>
            <header className={classes.yangTileHeader}>
              <span className={classes.yangTileNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.yangTileTitle}>{cat.title}</h3>
            </header>
            <div className={classes.yangTileBody}>
              <ul className={classes.yangRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples && cat.examples.length > 0 && (
                <div className={classes.yangExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.yangExample}>
                      <div className={classes.yangExampleId}>
                        {highlightYang(ex.indonesian)}
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.yangExampleNl}>{ex.dutch}</div>
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

// ─── Section: Rice culture spread — short editorial bridge ────────────────
//
// Section 1 is a four-paragraph essay about rice cultivation + the three
// nasi variants. Sits right before the numbers (no thematic tie there) but
// AFTER the grammar — it functions as the menu glossary for the dialogue's
// food order ("nasi putih", "nasi kuning", "nasi goreng" all live here).

function RiceCulture({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [p1, p2, p3, p4] = c.paragraphs
  return (
    <section className={classes.section} aria-labelledby="s-rice">
      <div className={classes.riceBand}>
        <p className={classes.riceKicker}>Cultuur · Rijst</p>
        <h2 id="s-rice" className={classes.sectionTitle}>
          <span className={classes.riceTitleId}>Nasi</span>
          <span className={classes.riceTitleNl}>het basisvoedsel — en de naam ervoor verandert per stadium</span>
        </h2>

        <div className={classes.riceProse}>
          {p1 && <p>{p1}</p>}
          {p2 && <p>{p2}</p>}
        </div>

        <div className={classes.nasiTriad}>
          <article className={classes.nasiCard} data-nasi="putih">
            <span className={classes.nasiKey}>nasi putih</span>
            <span className={classes.nasiGloss}>gekookte witte rijst</span>
          </article>
          <article className={classes.nasiCard} data-nasi="goreng">
            <span className={classes.nasiKey}>nasi goreng</span>
            <span className={classes.nasiGloss}>gebakken rijst met kruiden</span>
          </article>
          <article className={classes.nasiCard} data-nasi="kuning">
            <span className={classes.nasiKey}>nasi kuning</span>
            <span className={classes.nasiGloss}>geel gekookte rijst</span>
          </article>
        </div>

        {p3 && <p className={classes.riceCoda}>{p3}</p>}
        {p4 && <p className={classes.riceCoda}>{p4}</p>}
      </div>
    </section>
  )
}

// ─── Section: Numbers — the exponential ladder ─────────────────────────────
//
// 100 → 900 (hundreds), then 1000/2000/9000/10.000, then 1M/1B/1T.
// We split into three visual tiers to make the scale visible.

type NumberItem = { dutch: string; indonesian: string; audioUrl?: string }

function NumbersExponential({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: NumberItem[] }
  // Split by magnitude. Easier to read than 16 same-sized blocks in one grid.
  const hundreds  = c.items.filter((n) => /^\d00$/.test(n.dutch))            // 100..900
  const thousands = c.items.filter((n) => /^\d\.000$/.test(n.dutch) || n.dutch === '10.000')
  const huge      = c.items.filter((n) => n.dutch.startsWith('1.000.000'))

  return (
    <section className={classes.section} aria-labelledby="s-num">
      <p className={classes.numbersEyebrow}>Getallen · honderd en verder</p>
      <h2 id="s-num" className={classes.sectionTitle}>Van seratus naar setriliun</h2>
      <p className={classes.numbersHint}>
        De Rupiah-bedragen in het cultuurstuk hierboven (<em>Rp 70.000 – 600.000</em>)
        komen uit precies deze ladder. Een nul erbij — een woord erbij.
      </p>

      {/* Tier 1: hundreds. Tight row. */}
      <div className={classes.numbersTier} data-tier="hundreds">
        <span className={classes.numbersTierLabel}>×100</span>
        <div className={classes.numbersTierGrid}>
          {hundreds.map((n, i) => (
            <div key={i} className={classes.numbersCell}>
              <span className={classes.numbersDigit}>{n.dutch}</span>
              <span className={classes.numbersId}>
                {n.indonesian}
                <PlayButton src={n.audioUrl} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tier 2: thousands. Wider row, fewer entries. */}
      <div className={classes.numbersTier} data-tier="thousands">
        <span className={classes.numbersTierLabel}>×1.000</span>
        <div className={classes.numbersTierGrid}>
          {thousands.map((n, i) => (
            <div key={i} className={classes.numbersCell}>
              <span className={classes.numbersDigit}>{n.dutch}</span>
              <span className={classes.numbersId}>
                {n.indonesian}
                <PlayButton src={n.audioUrl} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tier 3: millions / billions / trillions — big blocks. */}
      <div className={classes.numbersTier} data-tier="huge">
        <span className={classes.numbersTierLabel}>×1.000.000+</span>
        <div className={classes.numbersHugeGrid}>
          {huge.map((n, i) => (
            <div key={i} className={classes.numbersHugeCell}>
              <span className={classes.numbersHugeDigit}>{n.dutch}</span>
              <span className={classes.numbersHugeId}>
                {n.indonesian}
                <PlayButton src={n.audioUrl} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section: Vocabulary reference (83 items) ──────────────────────────────

function VocabularyReference({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ indonesian: string; dutch: string; audioUrl?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · {c.items.length} woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Het complete register van les 4</h2>
      <p className={classes.vocabHint}>
        Rijst, hotelmeubilair, eten, het wisselgeld — alle woorden waar de
        dialoog, de yang-zinnen en de cultuurprose op draaien. Een lijst om
        naar terug te bladeren.
      </p>

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

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson4Page() {
  // Section index map (DB order):
  //   0: text — culture (Bali nights / penginapan)
  //   1: text — culture (rice / nasi variants)
  //   2: dialogue (hotel reception)
  //   3: grammar (yang — 5 categories)
  //   4: exercises (skipped)
  //   5: vocabulary (83 items)
  //   6: numbers (100..trillion)
  return (
    <article className={classes.page}>
      {/* Hero band — sunset over Pandawa Beach, Uluwatu Bali */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Di Hotel</span>
              <span className={classes.heroTitleNl}>In het hotel</span>
            </h1>
            <p className={classes.heroDescription}>
              De nacht op Bali kan veel kanten op — een witte tropenhemel boven
              het strand, een matras in een penginapan, een schone losmen of
              een echte hotelkamer. Ibu Dewi kiest het laatste, krijgt een
              gele sleutel, en bestelt sate kambing. Onderweg ontmoeten we
              <em> yang</em> — het woord dat de hele les bij elkaar houdt.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the page's contemplative tone */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een Indonesische zin krijgt zijn precisie van één klein woord:
            <em> yang</em>. Het wijst aan, benadrukt, en maakt van een
            bijvoeglijk naamwoord een zelfstandig — zonder ooit zelf op te
            vallen. Eerst de plek waar het gebeurt, dan het woord zelf.
          </p>
          <p className={classes.ledeMeta}>Les 4 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} />
          </div>
        </section>
      )}

      {/* Main content — culture-first, then encounter, grammar, food, scale, reference */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <DialogueScene        section={sections[2]} />
          <YangGrammar          section={sections[3]} />
          <RiceCulture          section={sections[1]} />
          <NumbersExponential   section={sections[6]} />
          <VocabularyReference  section={sections[5]} />
          <CultureOpener        section={sections[0]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les — en de yang-constructies, de hotelwoorden en de
            tellingen tot in de miljoenen komen vanzelf in je oefensessies langs.
          </p>
          <div className={classes.closingActivation}>
            <ActivationGate lessonId={meta.id} />
          </div>
          <div className={classes.closingActions}>
            <PracticeActions lessonId={meta.id} />
          </div>
        </div>
      </section>
    </article>
  )
}
