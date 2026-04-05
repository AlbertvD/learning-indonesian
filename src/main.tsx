// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, localStorageColorSchemeManager } from '@mantine/core'
import type { CSSVariablesResolver } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/stores/authStore'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

// ─── Mantine Theme ────────────────────────────────────────────────────────────
// Single source of truth for the design system.
// Color tokens for both themes live here — never in CSS files.
// CSS modules and inline styles reference var(--token-name) defined below.

const theme = createTheme({
  primaryColor: 'cyan',
  defaultRadius: 'md',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },

  colors: {
    cyan: [
      '#E0FFFE', // 0 — lightest
      '#B3FBFF', // 1
      '#80F9FF', // 2
      '#4DF6FF', // 3
      '#1AF4FF', // 4
      '#00ECFF', // 5
      '#00E5FF', // 6 ← primary (dark mode)
      '#00C4DB', // 7
      '#009DB3', // 8 ← primary (light mode)
      '#00778C', // 9 — darkest
    ],
  },
})

// ─── CSS Variables Resolver ───────────────────────────────────────────────────
// Injected by MantineProvider into :root automatically.
// - `variables`  → applied in both themes
// - `dark`       → applied when data-mantine-color-scheme="dark"
// - `light`      → applied when data-mantine-color-scheme="light"

const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // Typography scale
    '--font-sans': "'Plus Jakarta Sans', system-ui, sans-serif",
    '--font-mono': "'Courier New', monospace",
    '--fs-xs':    '11px',
    '--fs-sm':    '13px',
    '--fs-md':    '14px',
    '--fs-lg':    '16px',
    '--fs-xl':    '18px',
    '--fs-2xl':   '22px',
    '--fs-3xl':   '28px',
    '--fs-4xl':   '32px',
    '--fw-normal':   '400',
    '--fw-medium':   '500',
    '--fw-semibold': '600',
    '--fw-bold':     '700',
    '--fw-black':    '900',

    // Border radius scale
    '--r-sm': '6px',
    '--r-md': '10px',
    '--r-lg': '12px',
    '--r-xl': '24px',

    // Motion
    '--ease-smooth': 'cubic-bezier(.4, 0, .2, 1)',
    '--transition-base': 'all 0.2s ease',

    // Text on colored backgrounds (always white — accent is bright in both themes)
    '--text-on-accent': '#FFFFFF',

    // Status colors (same in both themes)
    '--success':        '#32D74B',
    '--success-subtle': 'rgba(50,215,75,0.10)',
    '--success-border': 'rgba(50,215,75,0.25)',
    '--success-glow':   'rgba(50,215,75,0.40)',
    '--danger':         '#FF453A',
    '--danger-subtle':  'rgba(255,69,58,0.10)',
    '--danger-border':  'rgba(255,69,58,0.25)',
    '--danger-glow':    'rgba(255,69,58,0.40)',
    '--warning':        '#FF9500',
    '--warning-subtle': 'rgba(255,149,0,0.10)',
    '--warning-border': 'rgba(255,149,0,0.25)',
    '--warning-glow':   'rgba(255,149,0,0.40)',

    // Accent border (for pills, badges)
    '--accent-primary-border': 'rgba(0,229,255,0.20)',

    // Mix ratio bar
    '--mix-recall': '#9c36b5',

    // Layout
    '--card-compact-height': '48px',
    '--sidebar-width':       '220px',
  },

  dark: {
    // Overlays & shadows
    '--bg-scrim':   'rgba(11,11,18,0.75)',
    '--bg-overlay': 'rgba(20,20,28,0.96)',
    '--shadow-sm':  '0 4px 16px rgba(0,0,0,0.30)',
    '--shadow-md':  '0 8px 32px rgba(0,0,0,0.50)',
    '--shadow-lg':  '0 12px 48px rgba(0,0,0,0.30)',
    // Backgrounds
    '--bg-main':    '#000000',
    '--bg-surface': '#0C0C0E',
    '--bg-hover':   '#2C2C2E',

    // Brand
    '--accent-primary':       '#00E5FF',
    '--accent-primary-dim':   '#00A8CC',
    '--accent-primary-glow':  'rgba(0,229,255,0.16)',
    '--accent-primary-subtle':'rgba(0,229,255,0.09)',

    // Text
    '--text-primary':   '#FFFFFF',
    '--text-secondary': '#8E8E93',
    '--text-tertiary':  '#55525C',

    // Borders
    '--border':       '#2C2C2E',
    '--border-light': '#3C3C3E',

    // Card system
    '--card-bg':           'rgba(255,255,255,0.10)',
    '--card-border':       'rgba(255,255,255,0.07)',
    '--card-hover-bg':     '#2C2C2E',
    '--card-hover-border': '#00E5FF',

    // Blur
    '--blur-card':  '16px',
    '--blur-panel': '20px',
    '--blur-nav':   '24px',

    // Secondary accent
    '--teal':        '#00C7BE',
    '--teal-subtle': 'rgba(0,199,190,0.10)',

    // ── Legacy aliases (backward compat — do not use in new code) ──
    '--bg':     '#000000',
    '--surf-1': '#0C0C0E',
    '--surf-2': '#2C2C2E',
    '--surf-3': '#2C2C2E',
    '--surf-4': '#3C3C3E',
    '--text-1': '#FFFFFF',
    '--text-2': '#8E8E93',
    '--text-3': '#55525C',
    '--display': "'Plus Jakarta Sans', system-ui, sans-serif",
    '--sans':    "'Plus Jakarta Sans', system-ui, sans-serif",
    '--purple':        '#00E5FF',
    '--purple-dim':    '#00A8CC',
    '--purple-bright': '#33F0FF',
    '--purple-glow':   'rgba(0,229,255,0.16)',
    '--purple-subtle': 'rgba(0,229,255,0.09)',
  },

  light: {
    // Overlays & shadows
    '--bg-scrim':   'rgba(255,255,255,0.80)',
    '--bg-overlay': 'rgba(248,248,252,0.96)',
    '--shadow-sm':  '0 4px 16px rgba(0,0,0,0.08)',
    '--shadow-md':  '0 8px 32px rgba(0,0,0,0.10)',
    '--shadow-lg':  '0 12px 48px rgba(0,0,0,0.08)',

    // Backgrounds
    '--bg-main':    '#FFFFFF',
    '--bg-surface': '#E1E1E3',
    '--bg-hover':   '#E8E8ED',

    // Brand
    '--accent-primary':       '#0099B8',
    '--accent-primary-dim':   '#006B88',
    '--accent-primary-glow':  'rgba(0,153,184,0.16)',
    '--accent-primary-subtle':'rgba(0,153,184,0.08)',

    // Text
    '--text-primary':   '#000000',
    '--text-secondary': '#86868B',
    '--text-tertiary':  '#A2A2A7',

    // Borders
    '--border':       '#D1D1D9',
    '--border-light': '#E5E5EA',

    // Card system
    '--card-bg':           'rgba(0,153,184,0.07)',
    '--card-border':       '#D1D1D9',
    '--card-hover-bg':     '#E8E8ED',
    '--card-hover-border': '#0099B8',

    // Blur
    '--blur-card':  '16px',
    '--blur-panel': '20px',
    '--blur-nav':   '24px',

    // Secondary accent
    '--teal':        '#00C7BE',
    '--teal-subtle': 'rgba(0,199,190,0.10)',

    // ── Legacy aliases (backward compat — do not use in new code) ──
    '--bg':     '#FFFFFF',
    '--surf-1': '#E1E1E3',
    '--surf-2': '#E8E8ED',
    '--surf-3': '#E0E0E5',
    '--surf-4': '#D1D1D9',
    '--text-1': '#000000',
    '--text-2': '#86868B',
    '--text-3': '#A2A2A7',
    '--display': "'Plus Jakarta Sans', system-ui, sans-serif",
    '--sans':    "'Plus Jakarta Sans', system-ui, sans-serif",
    '--purple':        '#0099B8',
    '--purple-dim':    '#006B88',
    '--purple-bright': '#00BFD8',
    '--purple-subtle': 'rgba(0,153,184,0.08)',
    '--purple-glow':   'rgba(0,153,184,0.16)',
  },
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const colorSchemeManager = localStorageColorSchemeManager({ key: 'indonesian-color-scheme' })

useAuthStore.getState().initialize()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="dark"
      >
        <Notifications position="top-right" />
        <App />
      </MantineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
