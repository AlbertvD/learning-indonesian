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
  primaryColor: 'cyan',
  defaultRadius: 'md',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },

  colors: {
    cyan: [
      '#E0FFFE',
      '#B3FBFF',
      '#80F9FF',
      '#4DF6FF',
      '#1AF4FF',
      '#00ECFF',
      '#00E5FF',
      '#00C4DB',
      '#009DB3',
      '#00778C',
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
