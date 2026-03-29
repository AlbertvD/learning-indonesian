// src/components/ShareCardSetModal.tsx
import { useState, useEffect, useCallback } from 'react'
import { Modal, Autocomplete, Button, Stack, Group, Text, ActionIcon, Loader, Center } from '@mantine/core'
import { cardService } from '@/services/cardService'
import { IconTrash, IconUserPlus, IconSearch } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

interface ShareCardSetModalProps {
  opened: boolean
  onClose: () => void
  setId: string
  setName: string
}

export function ShareCardSetModal({ opened, onClose, setId, setName }: ShareCardSetModalProps) {
  const T = useT()
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string, value: string }[]>([])
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const fetchShares = useCallback(async () => {
    setLoading(true)
    try {
      const data = await cardService.getCardSetShares(setId)
      setShares(data)
    } catch (err) {
      logError({ page: 'ShareModal', action: 'fetchShares', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
    } finally {
      setLoading(false)
    }
  }, [setId, T.common.error, T.common.somethingWentWrong])

  useEffect(() => {
    if (opened) {
      fetchShares()
    }
  }, [opened, fetchShares])

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
      notifications.show({ color: 'green', title: T.share.shared, message: T.share.sharedWith(profile.value) })
      setSearch('')
      fetchShares()
    } catch (err: any) {
      if (err.code === '23505') {
        notifications.show({ color: 'blue', title: T.share.info, message: T.share.alreadyShared })
      } else {
        logError({ page: 'ShareModal', action: 'share', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.share.failedToShare })
      }
    }
  }

  const handleUnshare = async (userId: string, name: string) => {
    try {
      await cardService.unshareCardSet(setId, userId)
      notifications.show({ color: 'blue', title: T.share.removed, message: T.share.accessRemoved(name) })
      fetchShares()
    } catch (err) {
      logError({ page: 'ShareModal', action: 'unshare', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.share.failedToRemove })
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={T.share.title(setName)} size="md">
      <Stack gap="md">
        <Autocomplete
          label={T.share.searchUsers}
          placeholder={T.share.searchPlaceholder}
          data={searchResults}
          value={search}
          onChange={setSearch}
          onOptionSubmit={(value) => {
            const profile = searchResults.find(r => r.value === value)
            if (profile) handleShare(profile)
          }}
          leftSection={searching ? <Loader size="xs" /> : <IconSearch size={16} />}
          rightSection={<IconUserPlus size={16} color="gray" />}
        />

        <Text size="sm" fw={500} mt="sm">{T.share.currentShares}</Text>
        
        {loading ? (
          <Center h={100}><Loader size="sm" /></Center>
        ) : (
          <Stack gap="xs">
            {shares.map((share) => (
              <Group key={share.shared_with_user_id} justify="space-between" p="xs" style={{ borderBottom: '1px solid #373A40' }}>
                <Text size="sm">{share.profiles?.display_name || T.share.anonymous}</Text>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => handleUnshare(share.shared_with_user_id, share.profiles?.display_name || T.share.anonymous)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            {shares.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">{T.share.notShared}</Text>
            )}
          </Stack>
        )}
        
        <Button variant="light" fullWidth onClick={onClose} mt="md">{T.share.done}</Button>
      </Stack>
    </Modal>
  )
}
