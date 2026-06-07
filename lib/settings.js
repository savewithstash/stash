// Tiny JSON persistence for user settings (data/settings.json) — currently
// just the model selection per role (llm / embed / vision).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DEFAULTS } from './qvac.js'

const DATA_DIR = path.resolve('data')
const DB_FILE = path.join(DATA_DIR, 'settings.json')

let settings = { ...DEFAULTS }
let loaded = false

export async function load() {
  if (loaded) return
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true })
  if (existsSync(DB_FILE)) {
    try {
      settings = { ...DEFAULTS, ...JSON.parse(await readFile(DB_FILE, 'utf8')) }
    } catch {
      /* keep defaults */
    }
  }
  loaded = true
}

export function get() {
  return { ...settings }
}

export async function save(patch) {
  settings = { ...settings, ...patch }
  await writeFile(DB_FILE, JSON.stringify(settings, null, 2))
  return get()
}
