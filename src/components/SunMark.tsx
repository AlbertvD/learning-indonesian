// src/components/SunMark.tsx — the Kamoe Bisa sun brand mark (desktop program).
// Colored via currentColor: tamarind on the landing page, gold on the app rail.
export function SunMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="6.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="16" y1="2.5" x2="16" y2="6" />
        <line x1="16" y1="26" x2="16" y2="29.5" />
        <line x1="2.5" y1="16" x2="6" y2="16" />
        <line x1="26" y1="16" x2="29.5" y2="16" />
        <line x1="6.4" y1="6.4" x2="8.9" y2="8.9" />
        <line x1="23.1" y1="23.1" x2="25.6" y2="25.6" />
        <line x1="6.4" y1="25.6" x2="8.9" y2="23.1" />
        <line x1="23.1" y1="8.9" x2="25.6" y2="6.4" />
      </g>
    </svg>
  )
}
