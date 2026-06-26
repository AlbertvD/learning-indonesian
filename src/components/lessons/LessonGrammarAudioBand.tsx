import { useAuthStore } from '@/stores/authStore'
import { LessonAudioPlayer } from './LessonAudioPlayer'

// The grammar-audio band shown on each bespoke lesson page. Plays the
// "Kamoe Bisa" grammar podcast for the lesson in the learner's current app
// language — Dutch reader → NL episode, English reader → EN episode.
//
// Both URLs are optional: they are baked into each lesson's content.json by
// fetch-lesson-content.ts and may be absent (a lesson can have the NL episode
// before the EN one is generated). When the current language's episode is
// missing the band renders nothing — an English learner is not shown the Dutch
// audio as a fallback, and vice versa.
//
// The band markup (section / inner wrappers, optional caption) is per-page
// CSS-module styled, so the class names and label are passed in by each page
// rather than baked in here.
export function LessonGrammarAudioBand({
  nl,
  en,
  voice,
  label,
  bandClassName,
  innerClassName,
  labelClassName,
}: {
  nl?: string | null
  en?: string | null
  voice?: string
  label?: string
  bandClassName?: string
  innerClassName?: string
  labelClassName?: string
}) {
  const lang = useAuthStore((s) => s.profile?.language ?? 'nl')
  const src = lang === 'en' ? en : nl
  if (!src) return null
  return (
    <section className={bandClassName}>
      <div className={innerClassName}>
        {label && <p className={labelClassName}>{label}</p>}
        <LessonAudioPlayer src={src} voice={voice} />
      </div>
    </section>
  )
}
