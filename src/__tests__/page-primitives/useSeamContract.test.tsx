// Seam contract runtime warning — integration tests.
// Verifies PageBody's useSeamContract hook detects the two dev-time misuses
// described in docs/plans/2026-04-24-page-framework-design.md §4.1 + §8:
//   1) <PageBody variant="fit"> without a <PageContainer fit> ancestor
//   2) <PageBody> nested inside another <PageBody>
// Both paths must log via console.error; legal compositions must stay silent.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { PageContainer, PageBody } from '@/components/page/primitives'

describe('seam contract runtime warning', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('warns when PageBody fit is used without PageContainer fit ancestor', () => {
    render(<PageBody variant="fit">x</PageBody>)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('variant="fit" requires'))
  })

  it('does NOT warn when PageBody fit is inside PageContainer fit', () => {
    render(
      <PageContainer fit>
        <PageBody variant="fit">x</PageBody>
      </PageContainer>,
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('warns when PageBody is nested inside another PageBody', () => {
    render(
      <PageContainer fit>
        <PageBody variant="fit">
          <PageBody variant="auto">x</PageBody>
        </PageBody>
      </PageContainer>,
    )
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cannot be nested'))
  })

  it('does NOT warn for auto variant without PageContainer fit (legal composition)', () => {
    render(<PageBody variant="auto">x</PageBody>)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
