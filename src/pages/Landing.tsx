// src/pages/Landing.tsx — public marketing landing page at `/` for logged-out
// visitors (desktop program slice 1, docs/plans/2026-07-03-desktop-program-design.md).
//
// Deliberately outside the page framework and Mantine components: a light-only
// marketing surface with its own layout, shipped as an isolated lazy chunk so
// the app entry bundle does not grow. Copy is NL-primary with EN, chunk-local
// in Landing.copy.ts (i18n.ts is entry-resident — see that file's header); the
// visitor has no profile yet, so the language choice lives in localStorage
// instead of the profile like everywhere else in the app.
//
// Rewritten 2026-08-17 per docs/plans/2026-08-16-landing-page-redesign.md.
// The structural move is D8, "invert the ground": the batik green #1F3D36 is a
// documented brand constant (--rail-* in main.tsx) that this page previously
// used ONCE, in the closing band — so the brand arrived after four bands of
// cream, once the visitor had already decided what the page looked like. It now
// carries the hero, the science band and the close, and cream is the reading
// ground between them. That alternation is also the fix for "every band has the
// same rhythm", which was the diagnosed cause of the page reading as clunky.
//
// All copy rules live in Landing.copy.ts's header and in the `marketing` skill
// (.claude/skills/marketing). The one that most often bites: all audio is TTS,
// so nothing here may imply human narration.

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Lang } from '@/lib/i18n'
import { SunMark } from '@/components/SunMark'
import { LOANWORD_REVEAL_PAIRS } from '@/lib/loanwords/revealPairs'
import { landingCopy } from './Landing.copy'
import classes from './Landing.module.css'

const LANDING_LANG_KEY = 'landing-lang'

// The register pairs shown in the signature band. Verified against the live DB
// 2026-08-16: 66 items carry register='informal' with a register_counterpart.
// Static rather than queried because anon has no read grant on the `indonesian`
// schema — public pages get committed exports, never live reads.
const REGISTER_PAIRS = [
  { formal: 'lelah', real: 'capek', nl: 'moe', en: 'tired' },
  { formal: 'uang', real: 'duit', nl: 'geld', en: 'money' },
  { formal: 'sebentar', real: 'bentar', nl: 'even', en: 'a moment' },
  { formal: 'sedikit', real: 'dikit', nl: 'een beetje', en: 'a little' },
] as const

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANDING_LANG_KEY)
    return stored === 'en' ? 'en' : 'nl'
  } catch {
    return 'nl'
  }
}

export function Landing() {
  const [lang, setLang] = useState<Lang>(readStoredLang)
  const [searchParams] = useSearchParams()
  const T = landingCopy[lang]

  // ProtectedRoute bounces logged-out visits here carrying `?next=`; forward it
  // to /login so the learner still lands where they were headed after signing in.
  const next = searchParams.get('next')
  const loginTo =
    next && next.startsWith('/') && !next.startsWith('//')
      ? `/login?next=${encodeURIComponent(next)}`
      : '/login'

  const switchLang = (value: Lang) => {
    setLang(value)
    try {
      localStorage.setItem(LANDING_LANG_KEY, value)
    } catch {
      // private-mode storage failures just lose the preference
    }
  }

  const stack = [
    [T.stack1Tool, T.stack1Body],
    [T.stack2Tool, T.stack2Body],
    [T.stack3Tool, T.stack3Body],
    [T.stack4Tool, T.stack4Body],
    [T.stack5Tool, T.stack5Body],
  ] as const

  return (
    <div className={classes.landing}>
      {/* The header sits ON the hero's dark ground, so it carries the dark
          treatment rather than the page's default cream one. */}
      <div className={classes.bandDark}>
        <header className={`${classes.head} ${classes.headOnDark}`}>
          <span className={`${classes.wordmark} ${classes.serif}`}>
            <span className={classes.mark}>
              <SunMark />
            </span>
            <span className={classes.name}>Kamoe Bisa</span>
          </span>
          <span className={classes.headActions}>
            <Link className={classes.linkQuiet} to={loginTo}>
              {T.login}
            </Link>
            <Link className={`${classes.btn} ${classes.btnFill}`} to="/register">
              {T.registerCta}
            </Link>
          </span>
        </header>

        {/* The hero is the owner's own story, in the first person (design D2).
            It replaces a retention claim ("Leer Indonesisch dat blijft hangen")
            that was aimed at a lapsed app-hopper — not at the primary persona,
            who is the partner of an Indonesian speaker (personas.md §1). The
            story also does the job social proof would normally do, which this
            product cannot use: there are zero customers, and inventing any is
            forbidden. */}
        <section className={classes.hero}>
          <div>
            <span className={classes.heroEyebrow}>{T.heroEyebrow}</span>
            <h1 className={classes.serif}>
              {T.heroTitlePre} <em>{T.heroTitleEm}</em>.
            </h1>
            <p className={classes.heroLede}>{T.heroLede}</p>
            <p className={classes.heroStory}>{T.heroStory}</p>
            <p className={`${classes.heroSignature} ${classes.serif}`}>{T.heroSignature}</p>
            <div className={classes.heroCtas}>
              <Link className={`${classes.btn} ${classes.btnFill} ${classes.btnLg}`} to="/register">
                {T.heroCta}
              </Link>
              <Link className={classes.linkQuiet} to={loginTo}>
                {T.heroLogin}
              </Link>
            </div>
          </div>

          <div className={classes.deck} role="img" aria-label={T.specAria}>
            <div className={`${classes.deckBack} ${classes.deckBack2}`} />
            <div className={`${classes.deckBack} ${classes.deckBack1}`} />
            <div className={classes.spec} aria-hidden="true">
              <div className={classes.specTop}>
                <span className={classes.specTag}>
                  <i /> {T.specTag}
                </span>
                <span className={classes.specCount}>{T.specNr}</span>
              </div>
              <div className={`${classes.specWord} ${classes.serif}`}>pasar</div>
              <div className={classes.specPhon}>{T.specPhon}</div>
              <div className={classes.specRule} />
              <div className={`${classes.specGloss} ${classes.serif}`}>{T.specGloss}</div>
              <div className={classes.specEx}>
                <span className={classes.id}>{T.specExample}</span>
                <span className={classes.tr}>{T.specExampleTr}</span>
              </div>
              <div className={classes.specFoot}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v4h4" />
                </svg>
                {T.specNext}
              </div>
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* Completeness sold as ASSEMBLY, never as a feature list (design D4,
            positioning.md §1). A feature list invites comparison on every axis
            against a specialist who wins on that axis, and says nothing about
            who it is for. Naming what each tool COSTS in upkeep is what makes
            "already assembled" land as work the reader does not have to do. */}
        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.stackKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.stackTitle}</h2>
            <p className={classes.leadBody}>{T.stackIntro}</p>
          </div>
          <ul className={classes.stack}>
            {stack.map(([tool, body]) => (
              <li key={tool} className={classes.stackRow}>
                <span className={`${classes.stackTool} ${classes.serif}`}>{tool}</span>
                <span className={classes.stackBody}>{body}</span>
              </li>
            ))}
          </ul>
          <p className={classes.stackClose}>{T.stackClose}</p>
        </section>

        {/* "The pair" — the page's signature. Both uncopyable assets have the
            same shape: two words and a relationship between them. It lets the
            Duolingo argument be SHOWN rather than claimed, and answers Anki in
            the same breath. Both paragraphs disarm before they compare
            (Sheridan's technique, see .claude/skills/marketing) because
            positioning.md §5 requires the contrast be stated as a gain, never
            as a dismissal — plenty of Dutch speakers learn happily in English.
            ⚠️ The register limit binds this band: it may promise the register
            they actually use, never conversational fluency by a given week. */}
        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.pairKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.pairTitle}</h2>
          </div>
          <ul className={classes.pairWall}>
            {REGISTER_PAIRS.map(pair => (
              <li key={pair.formal} className={classes.pairRow}>
                <span className={classes.pairCol}>
                  <span className={classes.pairLabel}>{T.pairFormal}</span>
                  <span className={`${classes.pairFormal} ${classes.serif}`}>{pair.formal}</span>
                </span>
                <span className={classes.pairArrow} aria-hidden="true">→</span>
                <span className={classes.pairCol}>
                  <span className={classes.pairLabel}>{T.pairReal}</span>
                  <span className={`${classes.pairReal} ${classes.serif}`}>{pair.real}</span>
                </span>
                <span className={classes.pairGloss}>{lang === 'nl' ? pair.nl : pair.en}</span>
              </li>
            ))}
          </ul>
          <p className={classes.pairDisarm}>{T.pairDisarm}</p>
          <p className={classes.pairAnki}>{T.pairAnki}</p>
          <p className={classes.pairNote}>{T.pairNote}</p>
        </section>

        {/* The loanword bridge. Recognition, not instruction — and the one
            advantage no competitor can copy into another language pair, since
            the loanwords are Dutch and every large app routes through English.
            Pairs are shared with the Welkom onboarding so the promise here and
            the first screen inside the app are literally the same list. */}
        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.bridgeKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.bridgeTitle}</h2>
            <p className={classes.leadBody}>{T.bridgeBody}</p>
          </div>
          <ul className={classes.bridgeWall}>
            {LOANWORD_REVEAL_PAIRS.map(pair => (
              <li key={pair.id} className={classes.bridgePair}>
                <span className={classes.bridgeNl}>{pair.nl}</span>
                <span className={classes.bridgeArrow} aria-hidden="true">→</span>
                <span className={classes.bridgeId}>{pair.id}</span>
              </li>
            ))}
          </ul>
          <p className={classes.bridgeMore}>{T.bridgeMore}</p>
          <p className={classes.bridgeEdge}>{T.bridgeEdge}</p>
          <Link className={classes.bridgeLink} to="/leenwoorden">{T.bridgeLink}</Link>
        </section>

        {/* The activation model, which is the likeliest source of "this app is
            broken": nothing is practised until the learner activates it, so a
            new learner who activates nothing opens an empty session and reads
            it as a fault. This band replaces a decorative 01/02/03 sequence
            that numbered three things nobody does in order. */}
        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.howKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.howTitle}</h2>
          </div>
          <div className={classes.flow}>
            {(
              [
                [T.how1Title, T.how1Body],
                [T.how2Title, T.how2Body],
                [T.how3Title, T.how3Body],
              ] as const
            ).map(([title, body]) => (
              <div key={title} className={classes.flowCol}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <Link className={classes.bridgeLink} to="/hoe-het-werkt">{T.howLink}</Link>
        </section>
      </main>

      {/* The research grounding, on the dark ground because it is the second
          heaviest argument on the page. The lead item is deliberately an AUDIT
          rather than a citation: anyone can cite Karpicke, almost nobody can
          show what they changed because of him. Quoted from ADR 0007 —
          simplifying `source_ref` to "hetzelfde" is permitted, inflating the
          number or dropping the 36-hour window is not.
          The closing line refuses efficacy numbers ON the page, which turns an
          honesty constraint into the most trustworthy sentence in the band. */}
      <div className={classes.bandDark}>
        <section className={`${classes.section} ${classes.sectionAiry} ${classes.sci}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.sciKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.sciTitle}</h2>
          </div>
          <div className={classes.sciGrid}>
            <p className={classes.sciAudit}>{T.sciAudit}</p>
            <div>
              <p className={classes.sciPrinciples}>{T.sciPrinciples}</p>
              <p className={classes.sciHonest}>{T.sciHonest}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Doors for the three secondary personas (design D11). Recognition copy,
          not a link menu — only /leenwoorden is a public route, so the other
          two would bounce a logged-out visitor straight back here via
          ProtectedRoute, and Register.tsx ignores ?next= outright. Making all
          three clickable would mean two real features in service of a marketing
          affordance; if door click-through ever proves to matter, that is the
          moment to build them. */}
      <main>
        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.doorsKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.doorsTitle}</h2>
          </div>
          <div className={classes.doors}>
            <div className={classes.door}>
              <h3>{T.door1Title}</h3>
              <p>{T.door1Body}</p>
              <Link className={classes.doorLink} to="/leenwoorden">{T.door1Link}</Link>
            </div>
            <div className={classes.door}>
              <h3>{T.door2Title}</h3>
              <p>{T.door2Body}</p>
            </div>
            <div className={classes.door}>
              <h3>{T.door3Title}</h3>
              <p>{T.door3Body}</p>
            </div>
          </div>
        </section>

        {/* D7 keeps the ARGUMENT off pricing; this band still states the facts a
            buyer is entitled to before signing up. check-cloud-config.ts asserts
            pricingBody quotes the declared price, and Landing.test.tsx asserts
            €9/€79 reach the page — EU distance selling expects terms and the
            refund policy to be reachable pre-purchase. */}
        <section className={classes.pricing}>
          <div className={classes.pricingTxt}>
            <div className={classes.pricingEyebrow}>{T.pricingEyebrow}</div>
            <h2 className={classes.serif}>{T.pricingTitle}</h2>
            <p>{T.pricingBody}</p>
          </div>
          <Link className={`${classes.btn} ${classes.btnFill} ${classes.btnLg}`} to="/register">
            {T.heroCta}
          </Link>
        </section>
      </main>

      <footer className={classes.foot}>
        <span>
          © {new Date().getFullYear()} Kamoe Bisa · {T.footerMade}
        </span>
        <span className={classes.footLinks}>
          <Link to="/hoe-het-werkt">{T.footerHow}</Link>
          <Link to="/privacy">{T.footerPrivacy}</Link>
          <Link to="/voorwaarden">{T.footerTerms}</Link>
          <Link to="/restitutie">{T.footerRefunds}</Link>
          <span className={classes.langSwitch}>
            <button type="button" aria-pressed={lang === 'nl'} onClick={() => switchLang('nl')}>
              NL
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => switchLang('en')}>
              EN
            </button>
          </span>
        </span>
      </footer>
    </div>
  )
}
