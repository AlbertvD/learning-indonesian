// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/stores/authStore'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },

  colors: {
    violet: [
      '#F3E8FF',
      '#E9D5FF',
      '#D8B4FE',
      '#C084FC',
      '#A855F7',
      '#9333EA',
      '#7E22CE',
      '#6B21A8',
      '#581C87',
      '#3F0F5C',
    ],
  },
})

const colorSchemeManager = localStorageColorSchemeManager({ key: 'indonesian-color-scheme' })

// Initialize auth store
useAuthStore.getState().initialize()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MantineProvider theme={theme} colorSchemeManager={colorSchemeManager} defaultColorScheme="dark">
        <Notifications position="top-right" />
        <App />
      </MantineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
