import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Container, Text, Title } from '@mantine/core'
import { LessonReader } from '@/components/lessons/LessonReader'
import { buildPreviewExperience, getPreviewLesson, previewLessons } from '@/lib/preview/localPreviewContent'
import { capabilityMigrationFlags } from '@/lib/featureFlags'
import classes from './LocalPreview.module.css'

function PreviewDisabled() {
  return (
    <Container size="sm" className={classes.disabled}>
      <Title order={2}>Lokale contentpreview staat uit</Title>
      <Text c="dimmed" mt="sm">
        Zet VITE_LOCAL_CONTENT_PREVIEW=true in .env.local en herstart Vite om deze route te gebruiken.
      </Text>
      <Button component={Link} to="/login" mt="lg">Terug naar inloggen</Button>
    </Container>
  )
}

export function LocalPreviewIndex() {
  if (!capabilityMigrationFlags.localContentPreview) return <PreviewDisabled />

  return (
    <main className={classes.root}>
      <div className={classes.shell}>
        <section className={classes.hero}>
          <div>
            <p className={classes.eyebrow}>Lokale contentpreview</p>
            <h1>Bekijk de nieuwe leerervaring zonder Supabase.</h1>
            <p>
              Deze voorbeelden gebruiken hetzelfde LessonReader-model als de echte app, maar alle content komt lokaal uit de code.
              Er wordt geen auth-, bronvoortgang- of FSRS-state opgeslagen.
            </p>
          </div>
          <aside className={classes.note}>
            <p>
              Dit is bewust een preview: handig om de ervaring te beoordelen, niet als vervanging voor het publiceren
              van goedgekeurde content naar de database.
            </p>
          </aside>
        </section>

        <section className={classes.grid} aria-label="Previewlessen">
          {previewLessons.map(lesson => (
            <Link key={lesson.slug} to={`/preview/lesson/${lesson.slug}`} className={classes.card}>
              <div>
                <p className={classes.eyebrow}>{lesson.lesson.level}</p>
                <h2>{lesson.lesson.title}</h2>
                <p>{lesson.summary}</p>
                <div className={classes.tags}>
                  {lesson.tags.map(tag => <span key={tag} className={classes.tag}>{tag}</span>)}
                </div>
              </div>
              <span className={classes.open}>Bekijk preview</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}

export function LocalPreviewLesson() {
  const navigate = useNavigate()
  const { slug } = useParams()

  if (!capabilityMigrationFlags.localContentPreview) return <PreviewDisabled />

  const preview = getPreviewLesson(slug)
  if (!preview) {
    return (
      <Container size="sm" className={classes.disabled}>
        <Title order={2}>Preview niet gevonden</Title>
        <Text c="dimmed" mt="sm">Deze lokale previewles bestaat niet.</Text>
        <Button onClick={() => navigate('/preview')} mt="lg">Terug naar previews</Button>
      </Container>
    )
  }

  const experience = buildPreviewExperience(preview)

  return (
    <LessonReader
      experience={experience}
      progressBySourceRef={new Map()}
      onBack={() => navigate('/preview')}
      onPractice={() => navigate('/preview')}
      onSourceProgress={() => {
        // Preview-only route: source progress is intentionally not persisted.
      }}
    />
  )
}
