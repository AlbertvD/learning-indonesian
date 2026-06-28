/**
 * High-frequency Indonesian function words ("glue" words) that every learner
 * effectively knows but which are taught structurally (grammar), not harvested as
 * `learning_items`. The Lezen reader's coverage known-set counts these as known so
 * coverage is not deflated by `dan`/`yang`/`di` etc. (the trap that, against a
 * naive learning_items match, made A1 stories look ~64% covered when they are ~90%).
 *
 * Pure data, normalised (lowercase). Scope: pronouns, prepositions, conjunctions,
 * particles, demonstratives, quantifiers, negators, common modals/auxiliaries, and
 * question words. NOT content words. See CONTEXT.md "Reading-coverage known".
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // pronouns
  'saya', 'aku', 'ku', 'kamu', 'mu', 'kau', 'engkau', 'anda', 'dia', 'ia', 'nya',
  'beliau', 'kami', 'kita', 'mereka', 'kalian', 'sendiri',
  // demonstratives / articles
  'ini', 'itu', 'sang', 'si', 'para',
  // prepositions
  'di', 'ke', 'dari', 'pada', 'kepada', 'untuk', 'buat', 'dengan', 'oleh', 'tentang',
  'dalam', 'luar', 'atas', 'bawah', 'antara', 'hingga', 'sampai', 'sejak', 'selama',
  'tanpa', 'demi', 'akan', 'bagi',
  // conjunctions
  'dan', 'atau', 'tetapi', 'tapi', 'namun', 'melainkan', 'serta', 'karena', 'sebab',
  'sehingga', 'maka', 'jika', 'kalau', 'apabila', 'bila', 'ketika', 'saat', 'sewaktu',
  'sambil', 'sementara', 'walaupun', 'meskipun', 'meski', 'agar', 'supaya', 'bahwa',
  'yaitu', 'yakni', 'jadi', 'lalu', 'kemudian', 'selain', 'kecuali', 'seperti',
  'bagaikan', 'seolah', 'yang',
  // negators / polarity
  'tidak', 'tak', 'bukan', 'belum', 'jangan', 'tanpa',
  // aspect / modality
  'sudah', 'telah', 'sedang', 'masih', 'akan', 'pernah', 'mau', 'ingin', 'harus',
  'bisa', 'dapat', 'boleh', 'perlu', 'usah', 'hendak',
  // particles / discourse
  'lah', 'kah', 'pun', 'kok', 'dong', 'sih', 'deh', 'ya', 'toh', 'lho', 'nah',
  'ayo', 'mari', 'tolong', 'silakan',
  // quantifiers / degree
  'semua', 'segala', 'setiap', 'tiap', 'beberapa', 'banyak', 'sedikit', 'sangat',
  'sekali', 'terlalu', 'cukup', 'lebih', 'paling', 'kurang', 'hanya', 'saja', 'juga',
  'lagi', 'pula', 'hampir', 'kira', 'sekitar', 'masing',
  // question words
  'apa', 'siapa', 'mana', 'kapan', 'mengapa', 'kenapa', 'bagaimana', 'berapa',
  // common adverbs of place/time (deictic)
  'sini', 'situ', 'sana', 'begitu', 'begini', 'sekarang', 'nanti', 'tadi', 'dulu',
  'kemarin', 'besok', 'selalu', 'sering', 'kadang', 'jarang',
  // copula-ish / existential
  'adalah', 'ada', 'ialah', 'merupakan',
])

export function isFunctionWord(normalized: string): boolean {
  return FUNCTION_WORDS.has(normalized)
}
