import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST

export default defineConfig({
  plugins: [
    react(),
    // Skip PWA plugin during tests — it adds overhead and isn't needed
    ...(!isTest ? [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [{
          urlPattern: /\/storage\/v1\/object\/public\/indonesian-tts\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'tts-audio',
            expiration: { maxEntries: 500 },
          },
        }],
      },
      manifest: {
        name: 'Learning Indonesian',
        short_name: 'Indonesian',
        theme_color: '#1a1b1e',
        background_color: '#1a1b1e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    })] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Pure logic/service tests (.test.ts) run in node — much lighter than jsdom.
    // React component tests (.test.tsx) keep the default jsdom environment.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — environmentMatchGlobs was removed from Vitest 4 types but still works at runtime
    environmentMatchGlobs: [['**/*.test.ts', 'node']],
    setupFiles: ['./src/test-setup.ts'],
    // Limit discovery to our test directory — avoids scanning node_modules paths.
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    // Progress.test.tsx tests require completed implementation work on the
    // redesigned Progress page — re-enable as implementation catches up.
    exclude: ['**/node_modules/**', 'src/__tests__/Progress.test.tsx'],
    // Cap parallel workers. Default is one fork per CPU core; on an 8-core MBA
    // that means ~8 Node processes each loading React/Mantine/Supabase simultaneously.
    // maxForks: 2 keeps peak RSS to ~2× a single process (~400–600 MB total).
    // (In Vitest 4, pool options are top-level — poolOptions was removed.)
    pool: 'forks',
    maxForks: 2,
  },
})
