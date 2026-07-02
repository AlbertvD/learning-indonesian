// src/components/AppErrorBoundary.tsx
// Top-level render-crash boundary. Before this existed, a crash on any page
// OUTSIDE an exercise (Dashboard, Lessons, Progress, …) was a white screen
// that never reached error_logs — invisible to both the learner and the
// operator (2026-07-02 backups/observability audit §3.2.4). The per-exercise
// ExerciseErrorBoundary keeps owning in-session isolation; this one owns
// everything else.
//
// Copy is static NL+EN (no i18n hook: class component, and the crash may
// happen before any profile/language exists — the boundary must depend on
// as little of the app as possible).

import { Component } from 'react'
import type { ReactNode } from 'react'
import { Button, Center, Stack, Text, Title } from '@mantine/core'
import { IconMoodConfuzed } from '@tabler/icons-react'
import { logError } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    // logError is fire-and-forget and never throws — safe in error handling.
    logError({ page: 'app-shell', action: 'render', error })
  }

  private handleReload = () => {
    // Full reload from the app root: clears whatever state caused the crash
    // and re-enters through the normal boot path.
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <Center h="100vh" p="md">
        <Stack align="center" gap="sm" maw={420}>
          <IconMoodConfuzed size={40} />
          <Title order={3} ta="center">Er ging iets mis</Title>
          <Text ta="center" c="dimmed" size="sm">
            De app is tegen een onverwachte fout aangelopen. Herlaad de app om
            verder te gaan — je voortgang is veilig opgeslagen.
          </Text>
          <Text ta="center" c="dimmed" size="xs">
            Something went wrong. Reload the app to continue — your progress is
            safely stored.
          </Text>
          <Button onClick={this.handleReload} mt="xs" data-testid="app-error-reload">
            Herlaad de app / Reload
          </Button>
        </Stack>
      </Center>
    )
  }
}
