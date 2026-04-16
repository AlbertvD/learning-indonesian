export function normalizeTtsText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}
