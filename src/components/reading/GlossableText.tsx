import { Fragment, useState } from 'react'
import { Anchor, Box, Divider, Popover, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import type { GlossResult, MorphologyGloss, ReadableText, ReadingToken } from '@/lib/reading'
import { useT } from '@/hooks/useT'
import classes from './GlossableText.module.css'

/** /morphology?affix=… — the affix rule explanation (Affix Trainer detail). */
const ruleHref = (affix: string) => `/morphology?affix=${encodeURIComponent(affix)}`

/**
 * Exploratory morphology detail (ADR 0024): the root + its meaning, and the word family
 * — each related form is a LINK to its affix-rule explanation, shown with its exact
 * translation. The affix rule itself is not shown inline (it lives behind the link), to
 * keep the card compact. Gloss-only.
 */
function MorphologyDetail({ m }: { m: MorphologyGloss }) {
  const T = useT()
  return (
    <>
      <Divider my={8} />
      {/* The base form it derives from + its meaning (the root is not affixed → no link). */}
      <Text size="sm">
        ← <Text span fw={600}>{m.root}</Text>
        {m.rootMeaning && <Text span c="dimmed"> · {m.rootMeaning}</Text>}
      </Text>
      {/* Word family: each affixed form links to its rule; translation shown inline. */}
      {m.family.length > 0 && (
        <>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt={8} mb={2}>
            {T.reading.wordFamily}
          </Text>
          {m.family.map((f) => (
            <Text key={f.form} size="sm" mb={2}>
              <Anchor component={Link} to={ruleHref(f.affix)} fw={600}>{f.form}</Anchor>
              {f.translation && <Text span c="dimmed"> · {f.translation}</Text>}
            </Text>
          ))}
        </>
      )}
    </>
  )
}

interface GlossableTextProps {
  text: ReadableText
  glossFor: (segmentIdx: number, token: ReadingToken) => GlossResult
}

interface Active {
  seg: number
  tok: number
  gloss: GlossResult
}

/**
 * The Lezen reader's silent, tap-to-gloss text surface (PRD #299). Renders the
 * story's sentence segments; tapping a glossable word reveals its gloss in a popover
 * anchored to the word (tap-to-reveal, NL-first — Q5). Proper nouns and pure
 * punctuation are not interactive. No audio (Phase 1 is silent reading).
 */
export function GlossableText({ text, glossFor }: GlossableTextProps) {
  const T = useT()
  const [active, setActive] = useState<Active | null>(null)

  return (
    <Box className={classes.reader}>
      {text.segments.map((seg) => (
        <Text key={seg.idx} component="p" className={classes.sentence}>
          {seg.tokens.map((tok, ti) => {
            const interactive = tok.isWord && !tok.isProperNoun
            const key = `${seg.idx}-${ti}`
            if (!interactive) {
              return <Fragment key={key}>{tok.raw} </Fragment>
            }
            const isActive = active?.seg === seg.idx && active?.tok === ti
            const open = () => setActive({ seg: seg.idx, tok: ti, gloss: glossFor(seg.idx, tok) })
            const word = (
              <Text
                component="span"
                role="button"
                tabIndex={0}
                aria-label={tok.normalized}
                className={classes.word}
                onClick={() => (isActive ? setActive(null) : open())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
                }}
              >
                {tok.raw}
              </Text>
            )
            if (!isActive) return <Fragment key={key}>{word} </Fragment>
            const morph = active.gloss.morphology
            return (
              <Fragment key={key}>
                <Popover opened position="bottom" withArrow shadow="md" width={360}
                  onChange={(o) => { if (!o) setActive(null) }}>
                  <Popover.Target>{word}</Popover.Target>
                  <Popover.Dropdown className={classes.dropdown}>
                    {/* Headline: the tapped word; links to its affix rule when affixed. */}
                    {morph
                      ? (
                        <Anchor component={Link} to={ruleHref(morph.affix)} fw={700} size="md">
                          {tok.raw}
                        </Anchor>
                      )
                      : <Text fw={700} size="md">{tok.raw}</Text>}
                    {active.gloss.text
                      ? (
                        <Text size="sm" c={active.gloss.source === 'sentence' ? 'dimmed' : undefined}>
                          {active.gloss.text}
                          {active.gloss.source === 'sentence' && (
                            <Text span size="xs" c="dimmed"> · {T.reading.sentenceGloss}</Text>
                          )}
                        </Text>
                      )
                      : <Text size="sm" c="dimmed">{T.reading.noGloss}</Text>}
                    {morph && <MorphologyDetail m={morph} />}
                  </Popover.Dropdown>
                </Popover>
                {' '}
              </Fragment>
            )
          })}
        </Text>
      ))}
    </Box>
  )
}
