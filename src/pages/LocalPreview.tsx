import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Text } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  EmptyState,
  ListCard,
} from '@/components/page/primitives'
import { bespokeLessonElements, bespokeLessonPreviews } from '@/pages/lessons/registry'
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
          title="Bekijk de leslayout zonder Supabase."
          subtitle="Deze previews tonen de echte bespoke lespagina's uit content.json. Er wordt geen auth-, activatie- of FSRS-state opgeslagen; de oefenknoppen onderaan zijn inactief zonder login."
        />
        {bespokeLessonPreviews.map(lesson => (
          <ListCard
            key={lesson.id}
            to={`/preview/lesson/${lesson.orderIndex}`}
            icon={<Text fw={700}>{lesson.level}</Text>}
            title={lesson.title}
            subtitle={lesson.description ?? undefined}
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

  const orderIndex = Number(slug)
  const preview = Number.isFinite(orderIndex)
    ? bespokeLessonPreviews.find(l => l.orderIndex === orderIndex)
    : undefined
  const element = preview ? bespokeLessonElements[preview.id] : undefined

  if (!preview || !element) {
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

  return (
    <>
      <Button
        component={Link}
        to="/preview"
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        m="md"
      >
        Terug naar previews
      </Button>
      {element}
    </>
  )
}
