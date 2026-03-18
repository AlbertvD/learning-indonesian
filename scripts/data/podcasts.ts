export interface PodcastData {
  title: string
  description: string | null
  level: string
  duration_seconds: number
  audio_filename: string // local file name for upload (e.g. "lesson-1.mp3")
  transcript_dutch: string | null
  transcript_indonesian: string | null
  transcript_english: string | null
}

export const podcasts: PodcastData[] = []
