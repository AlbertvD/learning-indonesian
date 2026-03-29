import { Menu } from '@mantine/core'
import { IconPlayerPlay, IconPlayerPause, IconVolumeOff, IconVolume, IconVolume2, IconGauge } from '@tabler/icons-react'
import classes from './MiniAudioPlayer.module.css'

const SPEEDS = [0.75, 1, 1.25, 1.5]
const VOLUMES = [0, 0.25, 0.5, 0.75, 1]
const VOLUME_LABELS: Record<number, string> = { 0: 'Mute', 0.25: '25%', 0.5: '50%', 0.75: '75%', 1: '100%' }

interface MiniAudioPlayerProps {
  isPlaying: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void
  volume: number
  onVolumeChange: (v: number) => void
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void
}

export function MiniAudioPlayer({
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  playbackRate,
  onPlaybackRateChange,
}: MiniAudioPlayerProps) {
  return (
    <div className={classes.miniPlayer}>
      <button className={classes.playBtn} onClick={onTogglePlay} aria-label="Play/Pause">
        {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
      </button>

      <div className={classes.progressContainer} onClick={onSeek}>
        <div className={classes.progressBar}>
          <div
            className={classes.progressFill}
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <Menu shadow="md" width={120}>
        <Menu.Target>
          <button className={classes.iconBtn} aria-label="Playback speed">
            <IconGauge size={16} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {SPEEDS.map((s) => (
            <Menu.Item
              key={s}
              onClick={() => onPlaybackRateChange(s)}
              style={{ fontWeight: playbackRate === s ? 700 : 400 }}
            >
              {s}x
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <Menu shadow="md" width={100}>
        <Menu.Target>
          <button className={classes.iconBtn} aria-label="Volume">
            {volume === 0 ? <IconVolumeOff size={16} /> : volume < 0.5 ? <IconVolume size={16} /> : <IconVolume2 size={16} />}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {VOLUMES.map((v) => (
            <Menu.Item
              key={v}
              onClick={() => onVolumeChange(v)}
              style={{ fontWeight: volume === v ? 700 : 400 }}
            >
              {VOLUME_LABELS[v]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
