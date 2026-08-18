// src/pages/HoeHetWerkt.tsx — public page at `/hoe-het-werkt` explaining the
// activation model, the single daily session, and the four mastery stages.
//
// Built from docs/plans/2026-08-06-hoe-het-werkt-page-design.md. It exists
// because the activation model is genuinely non-obvious and is the likeliest
// source of "this app is broken": nothing is practised until the learner
// activates it, so a new learner who activates nothing opens an empty session
// and reads it as a fault. Answering that BEFORE signup is deliberate — gating
// an explanation of how the product works behind the product is backwards.
//
// It is also marketing, not only support (that spec §3b): every competitor
// hides the scheduler behind a streak counter, so "we bring a word back just
// before you forget it" is a claim anyone can make, while a learner watching
// their own words move through named stages is evidence.
//
// Chrome is shared with the landing page rather than invented a third time —
// both are the sanctioned exception to the page framework, and a second
// bespoke marketing idiom would be exactly the drift that exception is
// narrowly scoped to avoid.

import { Link } from 'react-router'
import { SunMark } from '@/components/SunMark'
import { hoeHetWerktCopy } from './HoeHetWerkt.copy'
import landing from './Landing.module.css'
import classes from './HoeHetWerkt.module.css'

export function HoeHetWerkt() {
  const T = hoeHetWerktCopy

  const stages = [
    [T.stage1, T.stage1Body],
    [T.stage2, T.stage2Body],
    [T.stage3, T.stage3Body],
    [T.stage4, T.stage4Body],
  ] as const

  const places = [
    [T.four1, T.four1Body],
    [T.four2, T.four2Body],
    [T.four3, T.four3Body],
    [T.four4, T.four4Body],
  ] as const

  const principles = [
    [T.whyPrinciple1Title, T.whyPrinciple1Body],
    [T.whyPrinciple2Title, T.whyPrinciple2Body],
    [T.whyPrinciple3Title, T.whyPrinciple3Body],
  ] as const

  return (
    <div className={landing.landing}>
      <div className={landing.bandDark}>
        <header className={`${landing.head} ${landing.headOnDark}`}>
          <Link className={`${landing.wordmark} ${landing.serif}`} to="/">
            <span className={landing.mark}>
              <SunMark />
            </span>
            <span className={landing.name}>Kamoe Bisa</span>
          </Link>
          <span className={landing.headActions}>
            <Link className={landing.linkQuiet} to="/login">
              {T.login}
            </Link>
            <Link className={`${landing.btn} ${landing.btnFill}`} to="/register">
              {T.registerCta}
            </Link>
          </span>
        </header>

        <section className={`${landing.section} ${classes.head2}`}>
          <span className={landing.heroEyebrow}>{T.eyebrow}</span>
          <h1 className={`${classes.h1} ${landing.serif}`}>{T.title}</h1>
          <p className={classes.intro}>{T.intro}</p>
        </section>
      </div>

      <main>
        <section className={`${landing.section} ${landing.sectionAiry}`}>
          <ol className={classes.steps}>
            {(
              [
                [T.oneKicker, T.oneTitle, T.oneBody],
                [T.twoKicker, T.twoTitle, T.twoBody],
              ] as const
            ).map(([kicker, title, body]) => (
              <li key={kicker} className={classes.step}>
                <span className={landing.leadKicker}>{kicker}</span>
                <h2 className={`${classes.h2} ${landing.serif}`}>{title}</h2>
                <p className={classes.body}>{body}</p>
              </li>
            ))}

            {/* The stages, and the sentence that makes showing them honest.
                The stages describe SCHEDULING STATE, not competence — marketed
                carelessly, "Productief" reads as a promise that the learner can
                produce the word on demand, and the first person who finds they
                cannot will trust nothing else on the page. Design D6 requires
                the framing sentence ship in this band, not as a footnote. */}
            <li className={classes.step}>
              <span className={landing.leadKicker}>{T.threeKicker}</span>
              <h2 className={`${classes.h2} ${landing.serif}`}>{T.threeTitle}</h2>
              <p className={classes.body}>{T.threeBody}</p>
              <ol className={classes.stages}>
                {stages.map(([name, body], i) => (
                  <li key={name} className={classes.stage}>
                    <span className={classes.stageNr} aria-hidden="true">{i + 1}</span>
                    <span className={`${classes.stageName} ${landing.serif}`}>{name}</span>
                    <span className={classes.stageBody}>{body}</span>
                  </li>
                ))}
              </ol>
              <p className={classes.honest}>{T.stagesHonest}</p>
            </li>

            <li className={classes.step}>
              <span className={landing.leadKicker}>{T.fourKicker}</span>
              <h2 className={`${classes.h2} ${landing.serif}`}>{T.fourTitle}</h2>
              <dl className={classes.places}>
                {places.map(([name, body]) => (
                  <div key={name} className={classes.place}>
                    <dt className={landing.serif}>{name}</dt>
                    <dd>{body}</dd>
                  </div>
                ))}
              </dl>
            </li>
          </ol>
        </section>
      </main>

      {/* The research grounding. The lead item is an audit rather than a
          citation, quoted from ADR 0007: anyone can cite Karpicke, almost
          nobody can show what they changed because of him. The closing
          paragraph refuses efficacy numbers and disclaims endorsement — both
          are hard requirements of that spec's §3c honesty rule, and both make
          everything above them more believable rather than less. */}
      <div className={landing.bandDark}>
        <section className={`${landing.section} ${landing.sectionAiry}`}>
          <div className={landing.lead}>
            <span className={landing.leadKicker}>{T.whyKicker}</span>
            <h2 className={`${landing.leadTitle} ${landing.serif}`}>{T.whyTitle}</h2>
          </div>
          <p className={landing.sciAudit}>{T.whyAudit}</p>
          <div className={classes.principles}>
            {principles.map(([title, body]) => (
              <div key={title} className={classes.principle}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <p className={classes.whyHonest}>{T.whyHonest}</p>
        </section>
      </div>

      <main>
        {/* No price and no free-tier claim here (design D7). The landing page
            states both once, in the band that check-cloud-config.ts pins —
            repeating a price on a second unpinned surface is how the €7→€9
            change went stale in four places. */}
        <section className={`${landing.section} ${classes.cta}`}>
          <h2 className={`${classes.h2} ${landing.serif}`}>{T.ctaTitle}</h2>
          <p className={classes.body}>{T.ctaBody}</p>
          <Link className={`${landing.btn} ${landing.btnFill} ${landing.btnLg}`} to="/register">
            {T.registerCta}
          </Link>
        </section>
      </main>

      <footer className={landing.foot}>
        <span>
          © {new Date().getFullYear()} Kamoe Bisa · {T.footerMade}
        </span>
        <span className={landing.footLinks}>
          <Link to="/">{T.back}</Link>
          <Link to="/privacy">{T.footerPrivacy}</Link>
          <Link to="/voorwaarden">{T.footerTerms}</Link>
          <Link to="/restitutie">{T.footerRefunds}</Link>
        </span>
      </footer>
    </div>
  )
}
