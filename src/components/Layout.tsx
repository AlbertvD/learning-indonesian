// src/components/Layout.tsx
import { AppShell, Burger, Group, Button, Text, Menu, UnstyledButton, Avatar, ActionIcon, useMantineColorScheme, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { 
  IconChevronDown, 
  IconLogout, 
  IconUser, 
  IconTrophy, 
  IconBook, 
  IconCards, 
  IconHeadphones,
  IconSun,
  IconMoon
} from '@tabler/icons-react'

export function Layout() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false)
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true)
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { profile, signOut } = useAuthStore()
  const T = useT()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const navLinks = [
    { label: T.nav.lessons, icon: <IconBook size={18} />, path: '/lessons' },
    { label: T.nav.podcasts, icon: <IconHeadphones size={18} />, path: '/podcasts' },
    { label: T.nav.flashcards, icon: <IconCards size={18} />, path: '/cards' },
    { label: T.nav.leaderboard, icon: <IconTrophy size={18} />, path: '/leaderboard' },
  ]

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            {/* Mobile burger */}
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            {/* Desktop burger */}
            <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="sm" />
            <Text
              component={Link}
              to="/"
              size="xl"
              fw={700}
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
              style={{ textDecoration: 'none' }}
            >
              Indonesian
            </Text>
          </Group>

          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
              size="lg"
            >
              {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>

            {profile ? (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={7}>
                      <Avatar color="blue" radius="xl" size={30}>
                        {profile.fullName?.[0]?.toUpperCase() ?? profile.email[0].toUpperCase()}
                      </Avatar>
                      <Text fw={500} size="sm" mr={3} visibleFrom="xs">
                        {profile.fullName?.split(' ')[0] ?? profile.email}
                      </Text>
                      <IconChevronDown size={12} stroke={1.5} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>{T.nav.settings}</Menu.Label>
                  <Menu.Item
                    component={Link}
                    to="/profile"
                    leftSection={<IconUser size={14} stroke={1.5} />}
                  >
                    {T.nav.profile}
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={14} stroke={1.5} />}
                    onClick={handleLogout}
                  >
                    {T.nav.logout}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <Button component={Link} to="/login" variant="light">
                Log in
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          {navLinks.map((link) => (
            <Button
              key={link.path}
              component={Link}
              to={link.path}
              variant="subtle"
              leftSection={link.icon}
              onClick={() => {
                if (mobileOpened) toggleMobile()
              }}
              fullWidth
              justify="flex-start"
            >
              {link.label}
            </Button>
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
