// JSON-file persistence for saved notes + in-memory cosine search.
// Each note carries its embedding so semantic retrieval needs no extra service.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = path.resolve('data')
const DB_FILE = path.join(DATA_DIR, 'notes.json')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

let notes = []
let loaded = false

async function ensureDirs() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true })
  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
}

export async function load() {
  if (loaded) return
  await ensureDirs()
  if (existsSync(DB_FILE)) {
    try {
      notes = JSON.parse(await readFile(DB_FILE, 'utf8'))
    } catch {
      notes = []
    }
  }
  loaded = true
}

async function persist() {
  await ensureDirs()
  await writeFile(DB_FILE, JSON.stringify(notes, null, 2))
}

export async function addNote(note) {
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: 'text',
    category: 'General',
    title: '',
    summary: '',
    tags: [],
    content: '',
    url: null,
    image: null,
    dueDate: null,
    embedding: null,
    ...note,
  }
  notes.unshift(record)
  await persist()
  return stripEmbedding(record)
}

// Patch an existing note in place (used by background image enrichment).
export async function updateNote(id, patch) {
  const note = notes.find((n) => n.id === id)
  if (!note) return null
  Object.assign(note, patch)
  await persist()
  return stripEmbedding(note)
}

export async function deleteNote(id) {
  const before = notes.length
  notes = notes.filter((n) => n.id !== id)
  if (notes.length !== before) await persist()
  return notes.length !== before
}

export function allNotes() {
  return notes.map(stripEmbedding)
}

export function count() {
  return notes.length
}

// Top-K notes by cosine similarity to a query embedding.
export function search(queryEmbedding, k = 6) {
  const scored = notes
    .filter((n) => Array.isArray(n.embedding))
    .map((n) => ({ note: n, score: cosine(queryEmbedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
  return scored.map((s) => ({ ...stripEmbedding(s.note), score: s.score }))
}

function stripEmbedding(n) {
  const { embedding, ...rest } = n
  return rest
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom ? dot / denom : 0
}
