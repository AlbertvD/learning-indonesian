// src/components/page/primitives/useSeamContract.ts
// Dev-only runtime guardrail for the seam contract. PageBody calls this on
// mount/update; it walks the DOM and shouts when either rule is violated:
//   1) <PageBody variant="fit"> without a <PageContainer fit> ancestor.
//   2) <PageBody> nested inside another <PageBody>.
// Production builds short-circuit the whole useEffect via a NODE_ENV guard so
// there's zero cost for end users.
// See docs/plans/2026-04-24-page-framework-design.md §4.1 and §8.

import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useSeamContract(
  variant: 'auto' | 'fit',
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    // Vite exposes PROD as the build-time-replaced dev/prod flag (equivalent
    // to `process.env.NODE_ENV === 'production'`); tsconfig.app.json only
    // includes `vite/client` types, so avoid referencing `process` directly.
    if (import.meta.env.PROD) return
    const el = ref.current
    if (!el) return

    // Rule 1: variant="fit" requires a PageContainer fit ancestor.
    if (variant === 'fit') {
      const hasFitParent = !!el.closest('[data-page-container-fit]')
      if (!hasFitParent) {
        console.error(
          '[PageBody] variant="fit" requires a <PageContainer fit> ancestor. ' +
            'Wrap the surface in <PageContainer fit> to use fit mode.',
        )
      }
    }

    // Rule 2: no nested PageBody — walk from parentElement to exclude self.
    const nestedParent = el.parentElement?.closest('[data-page-body]')
    if (nestedParent) {
      console.error(
        '[PageBody] PageBody cannot be nested inside another PageBody. ' +
          'Compose variants side-by-side, not nested.',
      )
    }
  }, [variant, ref])
}
