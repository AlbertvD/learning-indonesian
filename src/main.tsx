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
  fontFamily: "'Open Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Poppins', system-ui, sans-serif" },
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
