import { useEffect, useState } from 'react'
import { signStoredAudioUrl } from '@/lib/signedAudioUrl'
import { LessonGrammarAudioBand } from './LessonGrammarAudioBand'

// Reader-page (content.json) variant of LessonGrammarAudioBand. The bespoke
// lesson pages' meta.lesson_audio_url(_en) are RAW stored public-bucket URLs
// baked into content.json at fetch-lesson-content.ts authoring time (audit
// item #2 — .duin.home decoupling is still pending) — NOT yet signed, unlike
// RuleCard's podcastNl/podcastEn, which RuleCard itself resolves via
// lessonService.getSignedAudioUrl before ever reaching LessonGrammarAudioBand.
//
// This wrapper resolves the raw content.json URLs through the shared signing
// helper first, so LessonGrammarAudioBand's contract (always receives an
// already-playable URL) stays unchanged for its other caller.
export function ReaderGrammarAudioBand({
  nlPath,
  enPath,
  voice,
  label,
  bandClassName,
  innerClassName,
  labelClassName,
}: {
  nlPath?: string | null
  enPath?: string | null
  voice?: string
  label?: string
  bandClassName?: string
  innerClassName?: string
  labelClassName?: string
}) {
  const [nl, setNl] = useState<string | null>(null)
  const [en, setEn] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      nlPath ? signStoredAudioUrl(nlPath) : Promise.resolve(null),
      enPath ? signStoredAudioUrl(enPath) : Promise.resolve(null),
    ]).then(([signedNl, signedEn]) => {
      if (!cancelled) {
        setNl(signedNl)
        setEn(signedEn)
      }
    })
    return () => {
      cancelled = true
    }
  }, [nlPath, enPath])

  return (
    <LessonGrammarAudioBand
      nl={nl}
      en={en}
      voice={voice}
      label={label}
      bandClassName={bandClassName}
      innerClassName={innerClassName}
      labelClassName={labelClassName}
    />
  )
}
