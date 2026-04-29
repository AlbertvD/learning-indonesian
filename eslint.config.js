import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude/**', 'tools/**', '.claude-hooks/**', '.worktrees/**', 'test-results/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-case-declarations': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Page framework seam contract — viewport-height math belongs in
      // PageBody/PageContainer/PageFormLayout only. Inline JSX `style={{ height: '100vh' }}`
      // and variants are blocked here; CSS modules are checked separately by
      // scripts/check-viewport-math.sh. See
      // docs/plans/2026-04-24-page-framework-design.md §4.3.
      'no-restricted-syntax': ['error',
        {
          selector: "Property[key.name=/^(min|max)?[Hh]eight$/] > Literal[value=/^100(dvh|vh|svh|lvh)$/]",
          message: "Viewport-height math belongs in PageBody/PageContainer/PageFormLayout only. Wrap the surface in <PageBody variant='fit'>, or see docs/plans/2026-04-24-page-framework-design.md §4.3 for the allowlist.",
        },
      ],
    },
  },
])
