import { Menu } from '@mantine/core'
import { IconPlayerPlay, IconPlayerPause, IconVolumeOff, IconVolume, IconGauge } from '@tabler/icons-react'
import classes from './MiniAudioPlayer.module.css'

const SPEEDS = [0.75, 1, 1.25, 1.5]

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

      <button
        className={classes.iconBtn}
        onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
        aria-label="Toggle mute"
      >
        {volume === 0 ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
      </button>
    </div>
  )
}
