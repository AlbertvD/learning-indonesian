import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key')

// jsdom does not implement ResizeObserver — used by Mantine's ScrollArea
;(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement window.matchMedia — Mantine v8's MantineProvider calls it on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
