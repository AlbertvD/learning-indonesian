// src/pages/Terms.tsx
//
// Public /voorwaarden route (docs/plans/2026-07-12-oauth-stripe-entitlement-
// design.md §3.4 — "ToS + refund/cancellation policy pages... EU consumer
// law requires the 14-day withdrawal disclosure at checkout; Stripe
// Checkout's consent-collection option points at our ToS URL"). Reachable
// pre-auth (a logged-out browser can land here via Stripe Checkout's consent
// link) and post-auth (linked from PaywallPanel), so — mirroring Privacy.tsx
// exactly — this cannot depend on the profile-driven useT() hook. A local
// nl/en toggle (NL default) reads copy from the `terms` block in
// src/lib/i18n.ts.
//
// Copy approved and wired 2026-08-03 from
// docs/plans/2026-07-30-tos-refunds-draft-copy.md; the yellow PLACEHOLDER
// alert this page used to carry is gone with it. The section structure
// (title + body pairs, one SectionHeading per clause) means any future
// revision is a one-line-per-section edit in i18n.ts, nothing structural.

import { useState } from 'react'
import { Text, SegmentedControl, Stack } from '@mantine/core'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
} from '@/components/page/primitives'
import { translations, type Lang } from '@/lib/i18n'

export function Terms() {
  const [lang, setLang] = useState<Lang>('nl')
  const T = translations[lang].terms

  return (
    <PageContainer size="md">
      <PageBody>
        <PageHeader
          title={T.title}
          subtitle={T.lastUpdated}
          action={
            <SegmentedControl
              value={lang}
              onChange={(val) => setLang(val as Lang)}
              data={[
                { label: T.languageNl, value: 'nl' },
                { label: T.languageEn, value: 'en' },
              ]}
            />
          }
        />

        <Stack gap="xl">
          <div>
            <SectionHeading>{T.section1Title}</SectionHeading>
            <Text>{T.section1Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section2Title}</SectionHeading>
            <Text>{T.section2Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section3Title}</SectionHeading>
            <Text>{T.section3Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section4Title}</SectionHeading>
            <Text>{T.section4Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section5Title}</SectionHeading>
            <Text>{T.section5Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section6Title}</SectionHeading>
            <Text>{T.section6Body}</Text>
          </div>
          <div>
            <SectionHeading>{T.section7Title}</SectionHeading>
            <Text>{T.section7Body}</Text>
          </div>
        </Stack>
      </PageBody>
    </PageContainer>
  )
}
