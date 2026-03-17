// src/components/ShareCardSetModal.tsx
import { useState, useEffect } from 'react'
import { Modal, Autocomplete, Button, Stack, Group, Text, ActionIcon, Loader, Center } from '@mantine/core'
import { cardService } from '@/services/cardService'
import { IconTrash, IconUserPlus, IconSearch } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'

interface ShareCardSetModalProps {
  opened: boolean
  onClose: () => void
  setId: string
  setName: string
}

export function ShareCardSetModal({ opened, onClose, setId, setName }: ShareCardSetModalProps) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string, value: string }[]>([])
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const fetchShares = async () => {
    setLoading(true)
    try {
      const data = await cardService.getCardSetShares(setId)
      setShares(data)
    } catch (err) {
      logError({ page: 'ShareModal', action: 'fetchShares', error: err })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (opened) {
      fetchShares()
    }
  }, [opened, setId])

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (search.length >= 2) {
        setSearching(true)
        try {
          const profiles = await cardService.searchProfiles(search)
          setSearchResults(profiles.map(p => ({ id: p.id, value: p.display_name || 'Anonymous' })))
        } catch (err) {
          logError({ page: 'ShareModal', action: 'search', error: err })
        } finally {
          setSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [search])

  const handleShare = async (profile: { id: string, value: string }) => {
    try {
      await cardService.shareCardSet(setId, profile.id)
      notifications.show({ color: 'green', title: 'Shared', message: `Card set shared with ${profile.value}` })
      setSearch('')
      fetchShares()
    } catch (err: any) {
      if (err.code === '23505') {
        notifications.show({ color: 'blue', title: 'Info', message: 'Already shared with this user' })
      } else {
        logError({ page: 'ShareModal', action: 'share', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to share card set' })
      }
    }
  }

  const handleUnshare = async (userId: string, name: string) => {
    try {
      await cardService.unshareCardSet(setId, userId)
      notifications.show({ color: 'blue', title: 'Removed', message: `Access removed for ${name}` })
      fetchShares()
    } catch (err) {
      logError({ page: 'ShareModal', action: 'unshare', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to remove access' })
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Share "${setName}"`} size="md">
      <Stack gap="md">
        <Autocomplete
          label="Search users by display name"
          placeholder="Type to search..."
          data={searchResults}
          value={search}
          onChange={setSearch}
          onOptionSubmit={(item) => handleShare(item as any)}
          leftSection={searching ? <Loader size="xs" /> : <IconSearch size={16} />}
          rightSection={<IconUserPlus size={16} color="gray" />}
        />

        <Text size="sm" fw={500} mt="sm">Current shares:</Text>
        
        {loading ? (
          <Center h={100}><Loader size="sm" /></Center>
        ) : (
          <Stack gap="xs">
            {shares.map((share) => (
              <Group key={share.shared_with_user_id} justify="space-between" p="xs" style={{ borderBottom: '1px solid #373A40' }}>
                <Text size="sm">{share.profiles?.display_name || 'Anonymous'}</Text>
                <ActionIcon 
                  color="red" 
                  variant="subtle" 
                  onClick={() => handleUnshare(share.shared_with_user_id, share.profiles?.display_name || 'Anonymous')}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            {shares.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">This set isn't shared with anyone yet.</Text>
            )}
          </Stack>
        )}
        
        <Button variant="light" fullWidth onClick={onClose} mt="md">Done</Button>
      </Stack>
    </Modal>
  )
}
