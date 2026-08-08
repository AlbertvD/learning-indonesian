// Dispatcher for the /lesson/:lessonId route.
//
// Looks up the lesson UUID in the bespoke-page registry and renders the
// matching bespoke page. Every published lesson has a bespoke page (the
// authoring workflow always produces one), so an unregistered UUID is a
// not-found case — there is no generic fallback reader. The lookup is
// synchronous (no DB query): each bespoke page's content.json statically
// embeds its lesson UUID, so the registry keys are resolved at build time.

import { useParams, useNavigate } from 'react-router'
import { Button } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  EmptyState,
} from '@/components/page/primitives'
import { bespokeLessonElements } from '@/pages/lessons/registry'
import { bespokeLessonMetas } from '@/pages/lessons/meta'
import { FIRST_LESSON_OPENED_KEY, setFirstRunFlag } from '@/lib/firstRun'
import { useAuthStore } from '@/stores/authStore'
import { FREE_TIER_MAX_LESSON } from '@/services/entitlementService'
import { PaywallPanel } from '@/components/paywall/PaywallPanel'
import { useT } from '@/hooks/useT'

export function LessonRouter() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const isEntitled = useAuthStore(s => s.profile?.isEntitled ?? false)
  const bespoke = lessonId ? bespokeLessonElements[lessonId] : undefined

  // READ gate (2026-08-08). Until now the reader was open to everyone and only
  // PRACTICE and AUDIO were paid, so a free account could open lesson 30 and
  // read it end to end. `orderIndex` comes from meta.ts, which deliberately
  // imports no content.json — so this check costs nothing and, because the
  // bespoke element is a lazily-loaded Suspense element, DECLINING to render it
  // means that lesson's content chunk is never requested at all.
  //
  // Deliberately NOT a redirect: landing on the lesson you tried to open, with
  // the price on it, is the moment the paywall is worth showing. A bounce to
  // /leren would just look broken.
  //
  // ⚠ This is a CLIENT gate over content baked into the JS bundle, so it stops
  // people using the app, not someone fetching the chunk URL directly. The
  // service worker also precaches lesson chunks, so the bytes still reach the
  // device. Genuinely withholding the text needs the content moved out of the
  // bundle and behind RLS — tracked separately; see the issue linked from
  // docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §5.
  const meta = lessonId ? bespokeLessonMetas.find(m => m.id === lessonId) : undefined
  const isPaidLesson = meta !== undefined && meta.orderIndex > FREE_TIER_MAX_LESSON
  if (bespoke && isPaidLesson && !isEntitled) {
    return (
      <PageContainer size="sm">
        <PageBody>
          <PageHeader title={meta.title} subtitle={T.lessons.lessonLockedHint} />
          <PaywallPanel />
          <Button variant="default" mt="md" onClick={() => navigate('/leren')}>
            {T.lessons.backToLessons}
          </Button>
        </PageBody>
      </PageContainer>
    )
  }

  if (bespoke) {
    // First-run checklist step ① (desktop program slice 3): the reader is
    // passive (ADR 0005), so opening a lesson page is the only signal there is.
    setFirstRunFlag(FIRST_LESSON_OPENED_KEY)
    return bespoke
  }

  return (
    <PageContainer size="sm">
      <PageBody>
        <PageHeader title={T.lessons.notFoundTitle} />
        <EmptyState
          icon={<IconAlertTriangle size={48} />}
          message={T.lessons.notFoundMessage}
          cta={<Button onClick={() => navigate('/leren')}>{T.lessons.backToLessons}</Button>}
        />
      </PageBody>
    </PageContainer>
  )
}
