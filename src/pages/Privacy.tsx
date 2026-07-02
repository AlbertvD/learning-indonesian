// src/pages/Privacy.tsx
//
// Public /privacy route (docs/plans/2026-07-02-gdpr-erasure-retention.md §4).
// Reachable pre-auth (linked from Register) and post-auth (linked from
// Profile), so it cannot depend on the profile-driven useT() hook — a local
// nl/en toggle (NL default) reads copy from the `privacy` block in
// src/lib/i18n.ts, matching Profile's existing translations[lang] idiom
// (Profile.tsx:102, i18n.ts §4.2).
//
// DRAFT COPY — the prose in src/lib/i18n.ts's `privacy` blocks is
// engineering-authored placeholder derived from the audit's facts and MUST
// receive the user's own legal review before public launch (see the spec's
// `privacy_copy_status` frontmatter flag). The <<USER TO FILL>> contact
// placeholders are intentional and must stay verbatim until filled in.

import { useState } from 'react'
import { Text, List, SegmentedControl, Stack } from '@mantine/core'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
} from '@/components/page/primitives'
import { translations, type Lang } from '@/lib/i18n'

export function Privacy() {
  const [lang, setLang] = useState<Lang>('nl')
  const T = translations[lang].privacy

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
            <Text mb="sm">{T.section2Intro}</Text>
            <List spacing="xs">
              <List.Item>{T.section2Row1}</List.Item>
              <List.Item>{T.section2Row2}</List.Item>
              <List.Item>{T.section2Row3}</List.Item>
              <List.Item>{T.section2Row4}</List.Item>
              <List.Item>{T.section2Row5}</List.Item>
              <List.Item>{T.section2Row6}</List.Item>
            </List>
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
            <Text fw={600} mb={4}>{T.section6ErasureTitle}</Text>
            <Text mb="md">{T.section6ErasureBody}</Text>
            <Text fw={600} mb={4}>{T.section6AccessTitle}</Text>
            <Text>{T.section6AccessBody}</Text>
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
