// src/pages/Refunds.tsx
//
// Public /restitutie route (docs/plans/2026-07-12-oauth-stripe-entitlement-
// design.md §3.4). Mirrors Terms.tsx/Privacy.tsx exactly: pre-auth
// reachable, local nl/en toggle (NL default), copy from the `refunds` block
// in src/lib/i18n.ts.
//
// Copy approved and wired 2026-08-03 from
// docs/plans/2026-07-30-tos-refunds-draft-copy.md.
//
// Section 3 is the EU 14-day withdrawal-right disclosure required at
// checkout (spec §3.4) — load-bearing, do not remove. ⚠ Its waiver only
// holds if Stripe Checkout actually COLLECTS the consent per purchase
// (consent_collection on the session). Verified null on live sessions
// 2026-08-03; until that is enabled the clause is disclosure, not a waiver.

import { useState } from 'react'
import { Text, SegmentedControl, Stack } from '@mantine/core'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
} from '@/components/page/primitives'
import { translations, type Lang } from '@/lib/i18n'

export function Refunds() {
  const [lang, setLang] = useState<Lang>('nl')
  const T = translations[lang].refunds

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
        </Stack>
      </PageBody>
    </PageContainer>
  )
}
