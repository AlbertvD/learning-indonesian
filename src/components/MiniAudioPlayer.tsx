import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react'
import classes from './MiniAudioPlayer.module.css'

interface MiniAudioPlayerProps {
  isPlaying: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function MiniAudioPlayer({
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
}: MiniAudioPlayerProps) {
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
    </div>
  )
}
