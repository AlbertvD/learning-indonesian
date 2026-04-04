#!/usr/bin/env bun
/**
 * ocr-pages.ts — Step 2 of content pipeline
 *
 * Local OCR using Tesseract. No API calls.
 *
 * Usage:
 *   bun scripts/ocr-pages.ts <lesson-number>
 *
 * Reads:   content/raw/lesson-<N>/*.{jpg,jpeg,png}
 * Writes:  content/extracted/lesson-<N>/page-<N>.txt
 *
 * Idempotent — skips pages where .txt already exists.
 * To force re-extraction, delete the specific .txt file.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function getPageImages(lessonDir: string): string[] {
  if (!fs.existsSync(lessonDir)) {
    console.error(`Error: Directory not found: ${lessonDir}`)
    process.exit(1)
  }

  return fs.readdirSync(lessonDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()
    .map(f => path.join(lessonDir, f))
}

async function main() {
  const lessonNumber = parseInt(process.argv[2], 10)
  if (isNaN(lessonNumber)) {
    console.error('Usage: bun scripts/ocr-pages.ts <lesson-number>')
    process.exit(1)
  }

  const lessonDir = path.join(process.cwd(), 'content', 'raw', `lesson-${lessonNumber}`)
  const outputDir = path.join(process.cwd(), 'content', 'extracted', `lesson-${lessonNumber}`)
  fs.mkdirSync(outputDir, { recursive: true })

  const pageImages = getPageImages(lessonDir)
  console.log(`\nOCR extracting ${pageImages.length} page(s) for lesson ${lessonNumber}...`)

  let extracted = 0
  let skipped = 0

  for (let i = 0; i < pageImages.length; i++) {
    const imagePath = pageImages[i]
    const pageNum = i + 1
    const outputPath = path.join(outputDir, `page-${pageNum}.txt`)

    if (fs.existsSync(outputPath)) {
      console.log(`[${pageNum}/${pageImages.length}] Skipping ${path.basename(imagePath)} — already extracted`)
      skipped++
      continue
    }

    console.log(`[${pageNum}/${pageImages.length}] OCR ${path.basename(imagePath)}...`)

    try {
      // Tesseract writes to <output>.txt, so strip .txt from path
      const outputBase = outputPath.replace(/\.txt$/, '')
      execSync(`tesseract "${imagePath}" "${outputBase}" -l nld+ind`, { stdio: 'pipe' })

      const text = fs.readFileSync(outputPath, 'utf-8').trim()
      console.log(`✓ Page ${pageNum}: ${text.length} chars`)
      extracted++
    } catch (err) {
      console.error(`✗ Page ${pageNum}: OCR failed`)
      console.error(err)
    }
  }

  console.log(`\nDone. ${extracted} extracted, ${skipped} skipped.`)
  console.log(`Output: ${outputDir}/`)
  console.log(`\nNext step: bun scripts/parse-lesson-content.ts ${lessonNumber}`)
}

main()
