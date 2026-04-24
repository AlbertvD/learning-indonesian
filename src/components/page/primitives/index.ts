// src/components/page/primitives/index.ts
// Re-exports appended as each primitive lands. Ordered by catalog order in
// the design doc (PageContainer → PageBody → PageHeader → …), not
// alphabetical — matches §3 so the reader can scan top-to-bottom.
// See docs/plans/2026-04-24-page-framework-design.md §3 for the full catalog.
export { PageContainer } from './PageContainer'
export type { PageContainerProps } from './PageContainer'
export { PageBody } from './PageBody'
export type { PageBodyProps } from './PageBody'
export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'
export { SectionHeading } from './SectionHeading'
export type { SectionHeadingProps } from './SectionHeading'
export { StatCard } from './StatCard'
export type { StatCardProps } from './StatCard'
export { ListCard } from './ListCard'
export type { ListCardProps } from './ListCard'
