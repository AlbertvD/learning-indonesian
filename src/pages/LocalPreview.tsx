import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  EmptyState,
  ListCard,
} from '@/components/page/primitives'
import { LessonReader } from '@/components/lessons/LessonReader'
import { buildPreviewExperience, getPreviewLesson, previewLessons } from '@/lib/preview/localPreviewContent'
import { capabilityMigrationFlags } from '@/lib/featureFlags'

function PreviewDisabled() {
  return (
    <PageContainer size="sm">
      <PageBody>
        <PageHeader title="Lokale contentpreview staat uit" />
        <EmptyState
          icon={<IconAlertTriangle size={48} />}
          message="Zet VITE_LOCAL_CONTENT_PREVIEW=true in .env.local en herstart Vite om deze route te gebruiken."
          cta={<Button component={Link} to="/login">Terug naar inloggen</Button>}
        />
      </PageBody>
    </PageContainer>
  )
}

export function LocalPreviewIndex() {
  if (!capabilityMigrationFlags.localContentPreview) return <PreviewDisabled />

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader
          title="Bekijk de nieuwe leerervaring zonder Supabase."
          subtitle="Deze voorbeelden gebruiken hetzelfde LessonReader-model als de echte app, maar alle content komt lokaal uit de code. Er wordt geen auth-, bronvoortgang- of FSRS-state opgeslagen."
        />
        {previewLessons.map(lesson => (
          <ListCard
            key={lesson.slug}
            to={`/preview/lesson/${lesson.slug}`}
            icon={<Text fw={700}>{lesson.lesson.level}</Text>}
            title={lesson.lesson.title}
            subtitle={lesson.summary}
            trailing={<Text size="sm" c="dimmed">Bekijk preview</Text>}
          />
        ))}
      </PageBody>
    </PageContainer>
  )
}

export function LocalPreviewLesson() {
  const navigate = useNavigate()
  const { slug } = useParams()

  if (!capabilityMigrationFlags.localContentPreview) return <PreviewDisabled />

  const preview = getPreviewLesson(slug)
  if (!preview) {
    return (
      <PageContainer size="sm">
        <PageBody>
          <PageHeader title="Preview niet gevonden" />
          <EmptyState
            icon={<IconAlertTriangle size={48} />}
            message="Deze lokale previewles bestaat niet."
            cta={<Button onClick={() => navigate('/preview')}>Terug naar previews</Button>}
          />
        </PageBody>
      </PageContainer>
    )
  }

  const experience = buildPreviewExperience(preview)

  return (
    <LessonReader
      experience={experience}
      progressBySourceRef={new Map()}
      onBack={() => navigate('/preview')}
      onSourceProgress={() => {
        // Preview-only route: source progress is intentionally not persisted.
      }}
    />
  )
}
