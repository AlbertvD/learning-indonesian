#!/usr/bin/env tsx
/**
 * Review UI server — reads/writes OCR text and staging files.
 * Also serves page images from content/raw/.
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(express.json({ limit: '10mb' }))

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
  next()
})

// CORS for local Vite dev server
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT')
  next()
})

function getRepoRoot(): string {
  if (process.cwd().includes('tools/review')) {
    return path.join(process.cwd(), '..', '..')
  }
  return process.cwd()
}

// Validate lesson parameter is a positive integer
function validateLesson(lesson: string): number | null {
  const num = parseInt(lesson, 10)
  return !isNaN(num) && num > 0 ? num : null
}

// Validate page parameter is a positive integer
function validatePage(page: string): number | null {
  const num = parseInt(page, 10)
  return !isNaN(num) && num > 0 ? num : null
}

// GET /api/lessons — List available lessons (from content/raw/ OR scripts/data/staging/)
app.get('/api/lessons', (_req, res) => {
  const root = getRepoRoot()
  const seen = new Set<number>()

  const rawDir = path.join(root, 'content', 'raw')
  if (fs.existsSync(rawDir)) {
    fs.readdirSync(rawDir)
      .filter(f => f.startsWith('lesson-') && fs.statSync(path.join(rawDir, f)).isDirectory())
      .map(f => parseInt(f.replace('lesson-', ''), 10))
      .filter(n => !isNaN(n))
      .forEach(n => seen.add(n))
  }

  const stagingDir = path.join(root, 'scripts', 'data', 'staging')
  if (fs.existsSync(stagingDir)) {
    fs.readdirSync(stagingDir)
      .filter(f => f.startsWith('lesson-') && fs.statSync(path.join(stagingDir, f)).isDirectory())
      .map(f => parseInt(f.replace('lesson-', ''), 10))
      .filter(n => !isNaN(n))
      .forEach(n => seen.add(n))
  }

  res.json([...seen].sort((a, b) => a - b))
})

// GET /api/pages/:lesson — List pages with OCR text and image paths
app.get('/api/pages/:lesson', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) {
    return res.status(400).json({ error: 'Invalid lesson parameter. Must be a positive integer.' })
  }

  const root = getRepoRoot()
  const rawDir = path.join(root, 'content', 'raw', `lesson-${lessonNum}`)
  const extractedDir = path.join(root, 'content', 'extracted', `lesson-${lessonNum}`)

  if (!fs.existsSync(rawDir)) return res.status(404).json({ error: 'Lesson not found' })

  const images = fs.readdirSync(rawDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort()

  const pages = images.map((img, i) => {
    const pageNum = i + 1
    const ocrPath = path.join(extractedDir, `page-${pageNum}.txt`)
    const ocrText = fs.existsSync(ocrPath) ? fs.readFileSync(ocrPath, 'utf-8') : ''

    return {
      page_number: pageNum,
      image_filename: img,
      image_url: `/api/images/${lessonNum}/${encodeURIComponent(img)}`,
      ocr_text: ocrText,
      has_ocr: fs.existsSync(ocrPath),
    }
  })

  res.json(pages)
})

// GET /api/images/:lesson/:filename — Serve page images
app.get('/api/images/:lesson/:filename', (req, res) => {
  const { lesson, filename } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) {
    return res.status(400).json({ error: 'Invalid lesson parameter. Must be a positive integer.' })
  }

  // Validate filename doesn't contain path traversal attempts
  const decodedFilename = decodeURIComponent(filename)
  if (decodedFilename.includes('..') || decodedFilename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename.' })
  }

  const imagePath = path.join(getRepoRoot(), 'content', 'raw', `lesson-${lessonNum}`, decodedFilename)

  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Image not found' })

  res.sendFile(imagePath)
})

// POST /api/pages/:lesson/reparse — Re-run parser after OCR corrections
app.post('/api/pages/:lesson/reparse', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) {
    return res.status(400).json({ error: 'Invalid lesson parameter. Must be a positive integer.' })
  }

  try {
    execSync(`bun scripts/parse-lesson-content.ts ${lessonNum}`, {
      cwd: getRepoRoot(),
      stdio: 'pipe',
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Parser failed', details: err instanceof Error ? err.message : String(err) })
  }
})

// POST /api/pages/:lesson/:page — Save corrected OCR text
app.post('/api/pages/:lesson/:page', (req, res) => {
  const { lesson, page } = req.params
  const { text } = req.body
  if (typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const lessonNum = validateLesson(lesson)
  const pageNum = validatePage(page)
  if (lessonNum === null || pageNum === null) {
    return res.status(400).json({ error: 'Invalid lesson or page parameter. Must be positive integers.' })
  }

  const extractedDir = path.join(getRepoRoot(), 'content', 'extracted', `lesson-${lessonNum}`)
  fs.mkdirSync(extractedDir, { recursive: true })
  fs.writeFileSync(path.join(extractedDir, `page-${pageNum}.txt`), text)

  res.json({ success: true })
})

// Helper: load a staging file via tsx (handles TypeScript syntax like `as const`)
function loadStagingFile(lessonNum: number, type: 'candidates' | 'grammarPatterns'): any[] {
  const helperPath = path.join(getRepoRoot(), 'tools', 'review', 'read-staging.ts')
  try {
    const result = execSync(`tsx ${helperPath} ${lessonNum} ${type}`, {
      cwd: getRepoRoot(),
      stdio: 'pipe',
      timeout: 10000,
    })
    return JSON.parse(result.toString())
  } catch {
    return []
  }
}

// GET /api/candidates/:lesson — Load candidates from staging
app.get('/api/candidates/:lesson', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) return res.status(400).json({ error: 'Invalid lesson parameter.' })

  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
  if (!fs.existsSync(stagingDir)) return res.json([])

  res.json(loadStagingFile(lessonNum, 'candidates'))
})

// POST /api/candidates/:lesson — Save updated candidates array
app.post('/api/candidates/:lesson', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) return res.status(400).json({ error: 'Invalid lesson parameter.' })

  const { candidates } = req.body
  if (!Array.isArray(candidates)) return res.status(400).json({ error: 'candidates array required' })

  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
  fs.mkdirSync(stagingDir, { recursive: true })

  // Serialize candidates as TypeScript — review_status gets `as const`
  const serialized = candidates.map((c: any) => {
    const { review_status, ...rest } = c
    return { ...rest, review_status }
  })

  const tsContent = `// Edited via review UI\nexport const candidates = ${JSON.stringify(serialized, null, 2)
    .replace(/"review_status": "([^"]+)"/g, 'review_status: \'$1\' as const')
    .replace(/"([a-zA-Z_][a-zA-Z0-9_]*)": /g, '$1: ')
  }\n`

  fs.writeFileSync(path.join(stagingDir, 'candidates.ts'), tsContent)
  res.json({ success: true })
})

// GET /api/staging/:lesson — Load all staging files
app.get('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) {
    return res.status(400).json({ error: 'Invalid lesson parameter. Must be a positive integer.' })
  }

  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
  if (!fs.existsSync(stagingDir)) return res.json({ lesson: null, learningItems: [], grammarPatterns: [], candidates: [] })

  res.json({
    lesson: null,
    learningItems: [],
    grammarPatterns: loadStagingFile(lessonNum, 'grammarPatterns'),
    candidates: loadStagingFile(lessonNum, 'candidates'),
  })
})

// POST /api/staging/:lesson — Save staging data
app.post('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const lessonNum = validateLesson(lesson)
  if (lessonNum === null) {
    return res.status(400).json({ error: 'Invalid lesson parameter. Must be a positive integer.' })
  }

  const { lesson: lessonData, learningItems, grammarPatterns, candidates } = req.body
  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
  fs.mkdirSync(stagingDir, { recursive: true })

  if (lessonData) {
    fs.writeFileSync(
      path.join(stagingDir, 'lesson.ts'),
      `// Edited via review UI\nexport const lesson = ${JSON.stringify(lessonData, null, 2)}\n`
    )
  }
  if (learningItems) {
    fs.writeFileSync(
      path.join(stagingDir, 'learning-items.ts'),
      `// Edited via review UI\nexport const learningItems = ${JSON.stringify(learningItems, null, 2)}\n`
    )
  }
  if (grammarPatterns) {
    fs.writeFileSync(
      path.join(stagingDir, 'grammar-patterns.ts'),
      `// Edited via review UI\nexport const grammarPatterns = ${JSON.stringify(grammarPatterns, null, 2)}\n`
    )
  }
  if (candidates) {
    fs.writeFileSync(
      path.join(stagingDir, 'candidates.ts'),
      `// Edited via review UI\nexport const candidates = ${JSON.stringify(candidates, null, 2)}\n`
    )
  }

  res.json({ success: true })
})

app.listen(PORT, () => {
  console.log(`Review server running on http://localhost:${PORT}`)
  console.log(`Frontend: http://localhost:5174`)
})
