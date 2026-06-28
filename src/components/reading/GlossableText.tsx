import { Fragment, useState } from 'react'
import { Box, Popover, Text } from '@mantine/core'
import type { GlossResult, ReadableText, ReadingToken } from '@/lib/reading'
import { useT } from '@/hooks/useT'
import classes from './GlossableText.module.css'

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
            return (
              <Fragment key={key}>
                <Popover opened position="bottom" withArrow shadow="md" width={220}
                  onChange={(o) => { if (!o) setActive(null) }}>
                  <Popover.Target>{word}</Popover.Target>
                  <Popover.Dropdown className={classes.dropdown}>
                    <Text fw={600} size="sm">{tok.raw}</Text>
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
