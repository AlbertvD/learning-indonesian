import { describe, it, expect } from 'vitest'
import { curateSourceText } from '../curate-source'

// Mimics `pdftotext -nopgbrk` output of a StoryWeaver PDF: cover header, story
// pages with N/M markers, a glossary/facts appendix, then the credits block.
const RAW = [
  'Judul Cerita',
  'Author: Penulis',
  'Illustrator: Pelukis',
  'Translator: Penerjemah',
  'Kalimat pertama cerita ini',
  'menyambung ke baris kedua.',
  '2/10',
  'Paragraf kedua ada di sini.',
  '3/10',
  'Glosarium: kata-kata sulit dijelaskan di sini.',
  'This book was made possible by Pratham Books’ StoryWeaver platform.',
  'Story Attribution: ... lots of credits ...',
].join('\n')

describe('curateSourceText', () => {
  const out = curateSourceText(RAW)

  it('drops the cover header (title + author/illustrator/translator lines)', () => {
    expect(out).not.toContain('Judul Cerita')
    expect(out).not.toContain('Author:')
    expect(out).not.toContain('Penerjemah')
  })

  it('strips N/M page-number markers and joins wrapped lines into paragraphs', () => {
    expect(out).not.toMatch(/\d+\/\d+/)
    expect(out).toContain('Kalimat pertama cerita ini menyambung ke baris kedua.')
    // page boundary becomes a paragraph break
    expect(out).toContain('Kalimat pertama cerita ini menyambung ke baris kedua.\n\nParagraf kedua ada di sini.')
  })

  it('cuts the credits block and the glossary/facts appendix', () => {
    expect(out).not.toContain('This book was made possible')
    expect(out).not.toContain('Story Attribution')
    expect(out).not.toContain('Glosarium')
  })

  it('also stops at a bulleted facts appendix', () => {
    const withBullets = 'Cerita selesai di sini.\n\n• Fakta satu.\n• Fakta dua.'
    expect(curateSourceText(withBullets)).toBe('Cerita selesai di sini.\n')
  })
})
