// src/components/page/primitives/PageFormLayout.tsx
// Vertical-centered narrow Paper wrapper for full-page forms (Login, Register).
// Collapses the identical outer shell at src/pages/Login.tsx:34-66 and
// src/pages/Register.tsx:40-80:
//
//   <Container size="xs" style={{ display:'flex', alignItems:'center',
//                                  justifyContent:'center', minHeight:'100vh' }}>
//     <Paper p="lg" radius="md" shadow="md" style={{ width:'100%' }}>
//       ...
//     </Paper>
//   </Container>
//
// PageFormLayout owns the viewport-centering math and the card chrome so auth
// pages can render as:
//
//   <PageFormLayout title="Login">
//     <form>...</form>
//   </PageFormLayout>
//
// Seam contract: PageFormLayout is ONE of five files permitted to use viewport
// math (`min-height: 100vh`) under spec §4.3. It's allowed because it IS the
// page — auth pages mount it directly without an app chrome (no top bar,
// sidebar, or bottom nav), so it must fill the viewport itself to vertically
// center the card. See PageFormLayout.module.css for the allowlist comment
// and the other four allowlisted files.
//
// Semantics: the title renders as `<h1>` because PageFormLayout IS the page
// on auth routes — there's no PageHeader above it owning the page-level
// heading. Everywhere else the document-outline rungs are <h1> (PageHeader)
// → <h2> (SectionHeading) → <h3> (SettingsCard); on auth pages rung 1 lives
// here.
//
// No @container / @layer / @media / !important in the module CSS — the card
// maxes at --page-form-max-w (400px), which fits comfortably inside every
// supported mobile width, so no responsive branching is needed.
//
// See docs/plans/2026-04-24-page-framework-design.md §3 (item 13) and §4.3.

import type { ReactNode } from 'react'
import { cx } from './cx'
import classes from './PageFormLayout.module.css'

export interface PageFormLayoutProps {
  /**
   * Form content — typically a `<form>` plus auxiliary text (e.g. "Don't have
   * an account? Sign up"). PageFormLayout renders this inside the card below
   * the optional title, with no extra styling — the caller owns inner layout.
   */
  children: ReactNode
  /**
   * Optional page title rendered as an `<h1>` at the top of the card. Used on
   * auth pages (Login, Register) where PageFormLayout IS the page — there's
   * no PageHeader above owning rung 1 of the document outline, so the title
   * lives here. Omit for form pages that supply their own heading.
   */
  title?: string
}

export function PageFormLayout({ children, title }: PageFormLayoutProps) {
  return (
    <div className={cx(classes.viewport)}>
      <div className={cx(classes.card)}>
        {title && <h1 className={cx(classes.title)}>{title}</h1>}
        {children}
      </div>
    </div>
  )
}
