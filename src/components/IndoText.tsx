interface IndoTextProps {
  text: string
  className?: string
}

/**
 * Highlights Indonesian morphological prefixes and suffixes in text.
 * Prefixes are shown in bold with accent color, root word in primary color.
 *
 * Common Indonesian prefixes: me-, ber-, di-, ter-, per-, se-, ke-, peng-, pem-, pen-, peny-
 * Common suffixes: -kan, -an, -i, -lah, -nya, -mu, -ku, -tah
 */

const INDONESIAN_PREFIXES = [
  'menyem', 'meny', 'meng', 'mem', 'me',
  'ber', 'be',
  'dik', 'di',
  'ter',
  'per', 'pe',
  'se',
  'ke',
  'peng', 'pem', 'pen',
]

export function IndoText({ text, className = '' }: IndoTextProps) {
  if (!text) return <span className={className}>{text}</span>

  // Extract the word (before any parentheses or punctuation)
  const match = text.match(/^([a-zA-Z]+)(.*)$/)
  if (!match) return <span className={className}>{text}</span>

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

  return (
    <span className={className}>
      {foundPrefix && (
        <span
          style={{
            color: 'var(--accent-primary)',
            fontWeight: 'bold',
            letterSpacing: 'inherit',
          }}
        >
          {word.substring(0, foundPrefix.length)}
        </span>
      )}
      <span
        style={{
          color: 'var(--text-primary)',
        }}
      >
        {foundPrefix ? word.substring(foundPrefix.length) : word}
      </span>
      {rest}
    </span>
  )
}

export default IndoText
