#!/usr/bin/env bun
/**
 * convert-heic-to-jpg.ts
 *
 * Converts HEIC/HEIF images to JPEG format.
 *
 * Usage:
 *   bun scripts/convert-heic-to-jpg.ts <lesson-number>
 *   e.g.: bun scripts/convert-heic-to-jpg.ts 4
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const lessonNumber = process.argv[2] || '4'
const lessonDir = path.join(process.cwd(), 'content/raw', `lesson-${lessonNumber}`)

function convertHeicToJpg() {
  if (!fs.existsSync(lessonDir)) {
    console.error(`✗ Error: ${lessonDir} not found`)
    process.exit(1)
  }

  const files = fs.readdirSync(lessonDir)
  const heicFiles = files.filter(f => /\.heic$/i.test(f))

  if (heicFiles.length === 0) {
    console.log(`ℹ No HEIC files found in ${lessonDir}`)
    return
  }

  console.log(`Converting ${heicFiles.length} HEIC file(s) to JPEG...\n`)

  let converted = 0
  let failed = 0

  for (const file of heicFiles) {
    const inputPath = path.join(lessonDir, file)
    const outputPath = path.join(lessonDir, file.replace(/\.heic$/i, '.jpg'))

    try {
      // Try ImageMagick first (usually available)
      execSync(`magick "${inputPath}" -quality 95 "${outputPath}"`, {
        stdio: 'pipe',
      })
      console.log(`✓ ${file} → ${path.basename(outputPath)}`)
      converted++
    } catch {
      console.error(`✗ Failed to convert ${file}`)
      failed++
    }
  }

  console.log(`\n${converted} converted, ${failed} failed`)

  if (converted > 0) {
    const jpgCount = fs
      .readdirSync(lessonDir)
      .filter(f => /\.jpg$/i.test(f)).length
    console.log(`\nTotal JPG files in lesson-${lessonNumber}: ${jpgCount}`)
  }
}

convertHeicToJpg()
