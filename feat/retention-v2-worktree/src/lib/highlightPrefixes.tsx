/**
 * Highlights Indonesian morphological prefixes in text
 * Common prefixes: me-, ber-, di-, ter-, per-, se-, ke-
 */

const INDONESIAN_PREFIXES = [
  'menyem', 'meny', 'meng', 'mem', 'me',
  'ber', 'be',
  'dik', 'di',
  'ter',
  'per', 'pe',
  'se',
  'ke',
]

export function highlightPrefixes(text: string) {
  if (!text) return text

  // Extract the word (before any parentheses or punctuation)
  const match = text.match(/^([a-zA-Z]+)(.*)$/)
  if (!match) return text

  const word = match[1]
  const rest = match[2]

  // Find the longest matching prefix
  let foundPrefix = ''
  for (const prefix of INDONESIAN_PREFIXES) {
    if (word.toLowerCase().startsWith(prefix.toLowerCase())) {
      if (prefix.length > foundPrefix.length) {
        foundPrefix = prefix
      }
    }
  }

  if (!foundPrefix) return text

  const prefixEnd = foundPrefix.length
  const prefix = word.substring(0, prefixEnd)
  const stem = word.substring(prefixEnd)

  return (
    <>
      <span style={{ color: 'var(--purple)', fontWeight: 'bold' }}>{prefix}</span>
      <span>{stem}{rest}</span>
    </>
  )
}
