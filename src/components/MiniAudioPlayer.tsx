import { IconPlayerPlay, IconPlayerPause, IconVolume, IconVolume2, IconVolumeOff } from '@tabler/icons-react'
import classes from './MiniAudioPlayer.module.css'

interface MiniAudioPlayerProps {
  isPlaying: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void
  volume: number
  onVolumeChange: (v: number) => void
  playbackRate: number
  onPlaybackRateChange: () => void
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
  const VolumeIcon = volume === 0 ? IconVolumeOff : volume < 0.5 ? IconVolume : IconVolume2

  return (
    <div className={classes.miniPlayer}>
      <button className={classes.playBtn} onClick={onTogglePlay} aria-label="Play/Pause">
        {isPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
      </button>

      <div className={classes.progressContainer} onClick={onSeek}>
        <div className={classes.progressBar}>
          <div
            className={classes.progressFill}
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <button
        className={classes.speedBtn}
        onClick={onPlaybackRateChange}
        aria-label="Playback speed"
        title={`Speed: ${playbackRate}x`}
      >
        {playbackRate}x
      </button>

      <div className={classes.volumeGroup}>
        <button
          className={classes.volumeBtn}
          onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
          aria-label="Toggle mute"
        >
          <VolumeIcon size={14} />
        </button>
        <input
          type="range"
          className={classes.volumeSlider}
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={e => onVolumeChange(parseFloat(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  )
}
