// Dispatcher for the /lesson/:lessonId route.
//
// Looks up the lesson UUID in the bespoke-page registry and renders the
// matching bespoke page. Every published lesson has a bespoke page (the
// authoring workflow always produces one), so an unregistered UUID is a
// not-found case — there is no generic fallback reader. The lookup is
// synchronous (no DB query): each bespoke page's content.json statically
// embeds its lesson UUID, so the registry keys are resolved at build time.

import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  EmptyState,
} from '@/components/page/primitives'
import { bespokeLessonElements } from '@/pages/lessons/registry'

export function LessonRouter() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const bespoke = lessonId ? bespokeLessonElements[lessonId] : undefined
  if (bespoke) return bespoke

  return (
    <PageContainer size="sm">
      <PageBody>
        <PageHeader title="Les niet gevonden" />
        <EmptyState
          icon={<IconAlertTriangle size={48} />}
          message="Deze les bestaat niet of is nog niet gepubliceerd."
          cta={<Button onClick={() => navigate('/lessons')}>Terug naar lessen</Button>}
        />
      </PageBody>
    </PageContainer>
  )
}
