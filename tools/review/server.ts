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
const PORT = 3001

app.use(express.json({ limit: '10mb' }))

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

// GET /api/lessons — List available lessons (from content/raw/)
app.get('/api/lessons', (_req, res) => {
  const rawDir = path.join(getRepoRoot(), 'content', 'raw')
  if (!fs.existsSync(rawDir)) return res.json([])

  const lessons = fs.readdirSync(rawDir)
    .filter(f => f.startsWith('lesson-') && fs.statSync(path.join(rawDir, f)).isDirectory())
    .map(f => parseInt(f.replace('lesson-', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)

  res.json(lessons)
})

// GET /api/pages/:lesson — List pages with OCR text and image paths
app.get('/api/pages/:lesson', (req, res) => {
  const { lesson } = req.params
  const root = getRepoRoot()
  const rawDir = path.join(root, 'content', 'raw', `lesson-${lesson}`)
  const extractedDir = path.join(root, 'content', 'extracted', `lesson-${lesson}`)

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
      image_url: `/api/images/${lesson}/${encodeURIComponent(img)}`,
      ocr_text: ocrText,
      has_ocr: fs.existsSync(ocrPath),
    }
  })

  res.json(pages)
})

// GET /api/images/:lesson/:filename — Serve page images
app.get('/api/images/:lesson/:filename', (req, res) => {
  const { lesson, filename } = req.params
  const imagePath = path.join(getRepoRoot(), 'content', 'raw', `lesson-${lesson}`, decodeURIComponent(filename))

  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Image not found' })

  res.sendFile(imagePath)
})

// POST /api/pages/:lesson/:page — Save corrected OCR text
app.post('/api/pages/:lesson/:page', (req, res) => {
  const { lesson, page } = req.params
  const { text } = req.body
  if (typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const extractedDir = path.join(getRepoRoot(), 'content', 'extracted', `lesson-${lesson}`)
  fs.mkdirSync(extractedDir, { recursive: true })
  fs.writeFileSync(path.join(extractedDir, `page-${page}.txt`), text)

  res.json({ success: true })
})

// POST /api/pages/:lesson/reparse — Re-run parser after OCR corrections
app.post('/api/pages/:lesson/reparse', (req, res) => {
  const { lesson } = req.params
  try {
    execSync(`bun scripts/parse-lesson-content.ts ${lesson}`, {
      cwd: getRepoRoot(),
      stdio: 'pipe',
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Parser failed', details: err instanceof Error ? err.message : String(err) })
  }
})

// GET /api/staging/:lesson — Load all staging files
app.get('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lesson}`)

  if (!fs.existsSync(stagingDir)) return res.json({ lesson: null, learningItems: [], grammarPatterns: [], candidates: [] })

  const readJson = (filename: string): any => {
    const filePath = path.join(stagingDir, filename)
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    // Extract the JSON/object from the TS file (after the = sign)
    const match = content.match(/=\s*([\s\S]*?)(?:\nexport|$)/)
    if (!match) return null
    try {
      const jsonStr = match[1].trim().replace(/;$/, '')
      return JSON.parse(jsonStr)
    } catch {
      // Try evaluating as JS object literal
      try {
        const jsStr = match[1].trim().replace(/;$/, '')
        return new Function(`return ${jsStr}`)()
      } catch {
        return null
      }
    }
  }

  res.json({
    lesson: readJson('lesson.ts'),
    learningItems: readJson('learning-items.ts') || [],
    grammarPatterns: readJson('grammar-patterns.ts') || [],
    candidates: readJson('candidates.ts') || [],
  })
})

// POST /api/staging/:lesson — Save staging data
app.post('/api/staging/:lesson', (req, res) => {
  const { lesson } = req.params
  const { lesson: lessonData, learningItems, grammarPatterns, candidates } = req.body
  const stagingDir = path.join(getRepoRoot(), 'scripts', 'data', 'staging', `lesson-${lesson}`)
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
  console.log(`Frontend: http://localhost:5173`)
})
