// src/components/Layout.tsx
import { AppShell, Burger, Group, Button, Text, Menu, UnstyledButton, Avatar } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { IconChevronDown, IconLogout, IconUser, IconTrophy, IconBook, IconCards, IconHeadphones } from '@tabler/icons-react'

export function Layout() {
  const [opened, { toggle }] = useDisclosure()
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const navLinks = [
    { label: 'Lessons', icon: <IconBook size={18} />, path: '/lessons' },
    { label: 'Podcasts', icon: <IconHeadphones size={18} />, path: '/podcasts' },
    { label: 'Flashcards', icon: <IconCards size={18} />, path: '/cards' },
    { label: 'Leaderboard', icon: <IconTrophy size={18} />, path: '/leaderboard' },
  ]

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { desktop: true, mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
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

          <Group visibleFrom="sm" gap="xs">
            {navLinks.map((link) => (
              <Button
                key={link.path}
                component={Link}
                to={link.path}
                variant="subtle"
                leftSection={link.icon}
              >
                {link.label}
              </Button>
            ))}
          </Group>

          <Group>
            {profile ? (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={7}>
                      <Avatar color="blue" radius="xl" size={30}>
                        {profile.fullName?.[0] || profile.email[0].toUpperCase()}
                      </Avatar>
                      <Text fw={500} size="sm" mr={3} visibleFrom="xs">
                        {profile.fullName || profile.email}
                      </Text>
                      <IconChevronDown size={12} stroke={1.5} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Settings</Menu.Label>
                  <Menu.Item
                    component={Link}
                    to="/profile"
                    leftSection={<IconUser size={14} stroke={1.5} />}
                  >
                    Profile
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={14} stroke={1.5} />}
                    onClick={handleLogout}
                  >
                    Logout
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
        {navLinks.map((link) => (
          <Button
            key={link.path}
            component={Link}
            to={link.path}
            variant="subtle"
            leftSection={link.icon}
            onClick={toggle}
            fullWidth
            justify="flex-start"
            mb="xs"
          >
            {link.label}
          </Button>
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
