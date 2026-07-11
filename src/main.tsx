// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, localStorageColorSchemeManager, TextInput, Select, SegmentedControl } from '@mantine/core'
import type { CSSVariablesResolver } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { AutoplayProvider } from '@/contexts/AutoplayContext'
import { ListeningProvider } from '@/contexts/ListeningContext'
import { SpreektaalProvider } from '@/contexts/SpreektaalContext'

// Layer declaration must load FIRST — before any layered stylesheet — so the
// declared order (`@layer mantine, exercises;`) governs the cascade.
import './styles/layers.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

// ─── Mantine Theme ────────────────────────────────────────────────────────────
// Single source of truth for the design system.
// Color tokens for both themes live here — never in CSS files.
// CSS modules and inline styles reference var(--token-name) defined below.

const theme = createTheme({
  // Warm-editorial retune (desktop program slice 2): tamarind is the single
  // action color; primaryShade 6 keeps filled buttons the same tamarind in
  // both themes (the mockup's dark CTA is unchanged from light).
  primaryColor: 'tamarind',
  primaryShade: 6,
  defaultRadius: 'md',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },

  colors: {
    tamarind: [
      '#FCF3ED', // 0 — lightest
      '#F5E3D7', // 1
      '#EDCDBA', // 2
      '#E3B096', // 3
      '#DA9370', // 4
      '#D0764B', // 5
      '#C64A26', // 6 ← primary fill (both themes)
      '#A63B1C', // 7 — hover / light-mode text accent
      '#8A3117', // 8
      '#6E2712', // 9 — darkest
    ],
    // Legacy scale — admin surfaces and bespoke lesson pages still reference
    // cyan explicitly; keep their exact colors until those surfaces are retuned.
    cyan: [
      '#E0FFFE', // 0 — lightest
      '#B3FBFF', // 1
      '#80F9FF', // 2
      '#4DF6FF', // 3
      '#1AF4FF', // 4
      '#00ECFF', // 5
      '#00E5FF', // 6
      '#00C4DB', // 7
      '#009DB3', // 8
      '#00778C', // 9 — darkest
    ],
  },

  // Warm the form controls to match the tamarind retune. Mantine's default
  // input border + segmented-control track are a cool neutral grey that reads
  // as flat against the warm paper/ink palette; retune them to the app's warm
  // card tokens (borders stay defined; focus border is already tamarind via
  // primaryColor). App-wide so every form (Profile, Login, Register, admin)
  // is consistent rather than grey here / warm there.
  components: {
    TextInput: TextInput.extend({
      styles: { input: { backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' } },
    }),
    Select: Select.extend({
      styles: { input: { backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' } },
    }),
    SegmentedControl: SegmentedControl.extend({
      styles: {
        root: { backgroundColor: 'var(--bg-surface)' },
        indicator: { backgroundColor: 'var(--card-bg)' },
      },
    }),
  },
})

// ─── CSS Variables Resolver ───────────────────────────────────────────────────
// Injected by MantineProvider into :root automatically.
// - `variables`  → applied in both themes
// - `dark`       → applied when data-mantine-color-scheme="dark"
// - `light`      → applied when data-mantine-color-scheme="light"

const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // Typography scale — mobile-first, 16px body baseline per exercise framework design.
    // Desktop overrides for --fs-3xl/4xl live in primitive CSS via @container queries
    // (the resolver can't emit @media rules).
    '--font-sans': "'Plus Jakarta Sans', system-ui, sans-serif",
    '--font-mono': "'Courier New', monospace",

    // Warm-editorial brand constants (desktop program, docs/plans/
    // 2026-07-03-desktop-program-design.md §Token discipline). Theme-agnostic
    // by design: the deep batik-green rail is the brand constant, identical in
    // light and dark. The display serif is a system stack — no webfont (CSP +
    // bundle discipline). Tamarind/gold are theme-VARYING and land as the
    // --accent-primary retune in slice 2; until then the landing page (light-
    // only marketing surface) carries its own scoped light values.
    '--font-display': "'Iowan Old Style', 'Palatino Linotype', Palatino, Charter, Georgia, 'Times New Roman', serif",
    '--rail-surface':        '#1F3D36',
    '--rail-surface-raised': '#274A41',
    '--rail-ink':            '#EDE7D7',
    '--rail-ink-muted':      '#91A89A',
    '--rail-hairline':       'rgba(237,231,215,0.13)',
    '--rail-gold':           '#CE9E45',   // streak/goal accent; ≥4.5:1 on the rail green
    // Home "Vandaag" panel composition-bar categories (sit on the rail green;
    // new + grammar reuse tamarind-6 / --rail-gold)
    '--today-review':        '#C6D3C7',
    '--today-listening':     '#6E9384',
    '--fs-xs':    '12px',
    '--fs-sm':    '14px',
    '--fs-md':    '16px',
    '--fs-lg':    '18px',
    '--fs-xl':    '20px',
    '--fs-2xl':   '24px',
    '--fs-3xl':   '30px',
    '--fs-4xl':   '36px',
    '--fw-normal':   '400',
    '--fw-medium':   '500',
    '--fw-semibold': '600',
    '--fw-bold':     '700',
    '--fw-black':    '900',

    // Exercise framework — semantic TYPE tier (theme-agnostic), mirroring the
    // --ex-* color tier: exercise components speak in roles, never raw --fs-*.
    // The two prompt tiers clamp() so long Indonesian sentences shrink toward
    // ~20px at 390px instead of exploding to 3-4 lines (2026-07-02 mobile
    // exercise-UI audit, docs/audits/2026-07-02-mobile-exercise-ui-audit.md).
    '--ex-fs-chrome':          '13px',                    // progress, meta/gloss, hint, pills
    '--ex-fs-instruction':     '15px',                    // instruction label — secondary to the prompt
    '--ex-fs-body':            '17px',                    // options, text input, submit
    '--ex-fs-prompt-word':     'clamp(24px, 7vw, 32px)',  // single-word hero prompt
    '--ex-fs-prompt-sentence': 'clamp(19px, 5.2vw, 24px)',// sentence / transform / pair prompt
    '--ex-fs-reveal':          'var(--ex-fs-prompt-sentence)', // post-answer transcript

    // Border radius scale
    '--r-sm': '6px',
    '--r-md': '10px',
    '--r-lg': '12px',
    '--r-xl': '24px',

    // Motion
    '--ease-smooth': 'cubic-bezier(.4, 0, .2, 1)',
    '--transition-base': 'all 0.2s ease',

    // Exercise framework — spacing tokens (mobile values; desktop via @container in primitives)
    '--ex-pad-x':      '16px',
    '--ex-pad-y':      '16px',
    '--ex-zone-gap':   '20px',
    '--ex-card-pad':   '20px',
    '--ex-opt-pad-y':  '20px',
    '--ex-opt-pad-x':  '16px',
    '--ex-opt-gap':    '12px',
    '--ex-footer-h':   '76px',

    // Page framework — layout tokens (mobile values; desktop via @container in primitives)
    '--page-pad-x':         '16px',
    '--page-pad-y-top':     '22px',
    '--page-pad-y-bottom':  '36px',
    '--page-header-gap':    '28px',
    '--page-form-max-w':    '400px',

    // Exercise framework — motion tokens (transforms zeroed under prefers-reduced-motion
    // in primitive CSS; opacity fades survive)
    '--ex-motion-fast':     '80ms',
    '--ex-motion-correct':  '180ms',
    '--ex-motion-wrong':    '200ms',
    '--ex-motion-feedback': '120ms',
    '--ex-ease':            'cubic-bezier(.4, 0, .2, 1)',

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
    '--accent-primary-border': 'rgba(198,74,38,0.25)',

    // Ring chart target marker (goal marker — yellow, same in both themes)
    '--ring-target':      '#fcc419',
    '--ring-target-glow': 'rgba(252, 196, 25, 0.70)',

    // Mix ratio bar
    '--mix-recall': '#9c36b5',

    // Layout
    '--card-compact-height':  '48px',
    '--sidebar-width':        '240px',   // fixed rail, always visible ≥769px (desktop program slice 2)

    // App chrome (consumed by PageContainer fit + MobileLayout)
    '--app-top-bar-h':        '52px',
    '--app-bottom-nav-h':     '60px',
  },

  dark: {
    // Warm green-black, never pure black (desktop program slice 2; mockup
    // screen 04). All values WCAG-AA checked against ground + card.
    // Overlays & shadows
    '--bg-scrim':   'rgba(13,18,15,0.75)',
    '--bg-overlay': 'rgba(20,26,22,0.96)',
    '--shadow-sm':  '0 4px 16px rgba(0,0,0,0.30)',
    '--shadow-md':  '0 8px 32px rgba(0,0,0,0.50)',
    '--shadow-lg':  '0 12px 48px rgba(0,0,0,0.30)',
    // Backgrounds
    '--bg-main':    '#141C18',
    '--bg-surface': '#1B2420',
    '--bg-hover':   '#242F29',

    // Brand — tamarind text-accent lightened for contrast (6.5:1 on ground)
    '--accent-primary':       '#E5865C',
    '--accent-primary-dim':   '#C96A43',
    '--accent-primary-glow':  'rgba(229,134,92,0.16)',
    '--accent-primary-subtle':'rgba(229,134,92,0.09)',

    // Text
    '--text-primary':   '#ECE7D8',
    '--text-secondary': '#849A8D',
    '--text-tertiary':  '#5E6E64',

    // Borders
    '--border':       '#2B3731',
    '--border-light': '#35433C',

    // Card system
    '--card-bg':           '#1D2822',
    '--card-border':       '#2B3731',
    '--card-hover-bg':     '#243029',
    '--card-hover-border': '#E5865C',

    // Blur
    '--blur-card':  '16px',
    '--blur-panel': '20px',
    '--blur-nav':   '24px',

    // Secondary accent
    '--teal':        '#00C7BE',
    '--teal-subtle': 'rgba(0,199,190,0.10)',

    // Hero card (gradient planning card) — deep batik-green until the slice-3
    // Home redesign replaces this card outright
    '--hero-gradient':    'linear-gradient(135deg, #274A41 0%, #1F3D36 60%, rgba(237,231,215,0.08) 100%)',
    '--hero-border':      'rgba(237, 231, 215, 0.18)',
    '--hero-text':        '#ffffff',
    '--hero-text-dim':    'rgba(255, 255, 255, 0.85)',
    '--hero-text-muted':  'rgba(255, 255, 255, 0.45)',
    '--hero-text-subtle': 'rgba(255, 255, 255, 0.35)',
    '--hero-label':       'rgba(255, 255, 255, 0.60)',

    // Exercise framework — semantic color triplets (dark)
    '--ex-correct-bg':     'rgba(50,215,75,0.10)',
    '--ex-correct-fg':     '#32D74B',
    '--ex-correct-border': 'rgba(50,215,75,0.30)',
    '--ex-wrong-bg':       'rgba(255,69,58,0.10)',
    '--ex-wrong-fg':       '#FF453A',
    '--ex-wrong-border':   'rgba(255,69,58,0.30)',
    '--ex-option-bg':        'rgba(255,255,255,0.04)',
    '--ex-option-bg-hover':  'rgba(255,255,255,0.08)',
    '--ex-option-border':    'rgba(255,255,255,0.10)',
    '--ex-card-border':      'rgba(255,255,255,0.10)',
    '--ex-focus-ring':       'rgba(255,255,255,0.55)', /* neutral — no cyan focus rings */
    '--ex-fg':               '#FFFFFF',
    '--ex-fg-muted':         '#8E8E93',
  },

  light: {
    // Warm paper & ink (desktop program slice 2; mockup screens 01-03).
    // All values WCAG-AA checked against paper + card.
    // Overlays & shadows
    '--bg-scrim':   'rgba(251,248,242,0.80)',
    '--bg-overlay': 'rgba(249,244,235,0.96)',
    '--shadow-sm':  '0 4px 16px rgba(30,42,37,0.08)',
    '--shadow-md':  '0 8px 32px rgba(30,42,37,0.10)',
    '--shadow-lg':  '0 12px 48px rgba(30,42,37,0.08)',

    // Backgrounds
    '--bg-main':    '#FBF8F2',
    '--bg-surface': '#F4EDE1',
    '--bg-hover':   '#EFE8DA',

    // Brand — deep tamarind as the text-capable accent (6.1:1 on paper)
    '--accent-primary':       '#A63B1C',
    '--accent-primary-dim':   '#8A3117',
    '--accent-primary-glow':  'rgba(166,59,28,0.16)',
    '--accent-primary-subtle':'rgba(198,74,38,0.08)',

    // Text
    '--text-primary':   '#1E2A25',
    '--text-secondary': '#5F6D64',
    '--text-tertiary':  '#77857B',

    // Borders
    '--border':       '#E7DECE',
    '--border-light': '#EFE8DA',

    // Card system
    '--card-bg':           '#FFFFFF',
    '--card-border':       '#E7DECE',
    '--card-hover-bg':     '#F4EDE1',
    '--card-hover-border': '#C64A26',

    // Blur
    '--blur-card':  '16px',
    '--blur-panel': '20px',
    '--blur-nav':   '24px',

    // Secondary accent
    '--teal':        '#00C7BE',
    '--teal-subtle': 'rgba(0,199,190,0.10)',

    // Hero card (gradient planning card)
    '--hero-gradient':    'linear-gradient(135deg, var(--accent-primary-subtle) 0%, var(--card-bg) 60%, var(--bg-main) 100%)',
    '--hero-border':      'var(--card-border)',
    '--hero-text':        'var(--text-primary)',
    '--hero-text-dim':    'var(--text-primary)',
    '--hero-text-muted':  'var(--text-secondary)',
    '--hero-text-subtle': 'var(--text-tertiary)',
    '--hero-label':       'var(--text-secondary)',

    // Exercise framework — semantic color triplets (light, WCAG-AA audited)
    // correct-fg #1B6B27 → 6.2:1 on white, 5.78:1 on rgba(34,150,50,.10) tinted bg
    // wrong-fg   #C8281F → 6.0:1 on white, 5.44:1 on rgba(200,40,31,.08) tinted bg
    '--ex-correct-bg':     'rgba(34,150,50,0.10)',
    '--ex-correct-fg':     '#1B6B27',
    '--ex-correct-border': 'rgba(27,107,39,0.25)',
    '--ex-wrong-bg':       'rgba(200,40,31,0.08)',
    '--ex-wrong-fg':       '#C8281F',
    '--ex-wrong-border':   'rgba(200,40,31,0.25)',
    '--ex-option-bg':        'rgba(0,0,0,0.03)',
    '--ex-option-bg-hover':  'rgba(0,0,0,0.06)',
    '--ex-option-border':    'rgba(0,0,0,0.08)',
    '--ex-card-border':      'rgba(0,0,0,0.08)',
    '--ex-focus-ring':       'rgba(0,0,0,0.45)', /* neutral — no cyan focus rings */
    '--ex-fg':               '#000000',
    '--ex-fg-muted':         '#86868B',
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
        <AppErrorBoundary>
          <AutoplayProvider>
            <ListeningProvider>
              <SpreektaalProvider>
                <App />
              </SpreektaalProvider>
            </ListeningProvider>
          </AutoplayProvider>
        </AppErrorBoundary>
      </MantineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
