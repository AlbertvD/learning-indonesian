// Top-level crash boundary: a render crash anywhere under the boundary shows
// the bilingual reload screen and reaches error_logs via logError — never a
// silent white screen (observability audit §3.2.4).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { logError } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

function Bomb(): never {
  throw new Error('kaboom')
}

describe('AppErrorBoundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders children when nothing throws', () => {
    render(
      <MantineProvider>
        <AppErrorBoundary><div>alive</div></AppErrorBoundary>
      </MantineProvider>,
    )
    expect(screen.getByText('alive')).toBeInTheDocument()
  })

  it('catches a render crash: shows the bilingual fallback and logs to error_logs', () => {
    // React logs caught errors to console.error — silence for a clean test run.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MantineProvider>
        <AppErrorBoundary><Bomb /></AppErrorBoundary>
      </MantineProvider>,
    )
    expect(screen.getByText('Er ging iets mis')).toBeInTheDocument()
    expect(screen.getByTestId('app-error-reload')).toBeInTheDocument()
    expect(vi.mocked(logError)).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'app-shell', action: 'render' }),
    )
    consoleSpy.mockRestore()
  })
})
