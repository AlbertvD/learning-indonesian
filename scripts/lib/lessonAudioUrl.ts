// Pure helper: resolve a lesson-audio storage path to its public bucket URL in
// the `indonesian-lessons` bucket. Shared by the NL (`audio_path`) and EN
// (`audio_path_en`) grammar-podcast paths so both build identical URLs.
// Returns null when the path is absent (a lesson without that language's episode).
export function lessonAudioUrl(baseUrl: string, path: string | null | undefined): string | null {
  return path ? `${baseUrl}/storage/v1/object/public/indonesian-lessons/${path}` : null
}
