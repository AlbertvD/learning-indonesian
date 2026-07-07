// LessonChapterOverview — the "In deze les" opener block.
//
// Rendered by a lesson's OPENING chapter to turn it into a real lesson start:
// one tappable ListCard per remaining chapter (number medallion, title,
// one-line teaser from LessonChapter.description). Navigation is plain Link
// semantics — `to="?h=<id>"` IS the chapter switch (ChapterExperience reads
// the search param), so the card needs no callbacks. Shared across bespoke
// pages so the chapter rollout gets a real opening for free.

import { Text } from '@mantine/core'
import { ListCard } from '@/components/page/primitives'
import { useChapterNav } from './ChapterExperience'
import { useT } from '@/hooks/useT'
import classes from './LessonChapterOverview.module.css'

export function LessonChapterOverview() {
  const nav = useChapterNav()
  const T = useT()
  if (!nav) return null // outside ChapterExperience (e.g. isolated test render) there is nothing to navigate
  const { chapters, currentId } = nav
  const upcoming = chapters.filter(c => c.id !== currentId)
  return (
    <section className={classes.overview} aria-label={T.lessons.chapterOverviewTitle}>
      <h2 className={classes.title}>{T.lessons.chapterOverviewTitle}</h2>
      <div className={classes.stack}>
        {upcoming.map(chapter => {
          const number = chapters.findIndex(c => c.id === chapter.id) + 1
          return (
            <ListCard
              key={chapter.id}
              to={`?h=${chapter.id}`}
              icon={<Text fw={700}>{number}</Text>}
              title={chapter.title}
              subtitle={chapter.description}
              tone="teal"
            />
          )
        })}
      </div>
    </section>
  )
}
