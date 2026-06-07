// JSON-file persistence for Ask conversations (data/chats.json), so chats
// survive reloads and can be browsed and resumed. Each AI message snapshots
// the source notes it cited, so history still renders if a note is deleted.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = path.resolve('data')
const DB_FILE = path.join(DATA_DIR, 'chats.json')

let chats = []
let loaded = false

export async function load() {
  if (loaded) return
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true })
  if (existsSync(DB_FILE)) {
    try {
      chats = JSON.parse(await readFile(DB_FILE, 'utf8'))
    } catch {
      chats = []
    }
  }
  loaded = true
}

async function persist() {
  await writeFile(DB_FILE, JSON.stringify(chats, null, 2))
}

// Lightweight list for the history view (no messages).
export function list() {
  return chats.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    questions: c.messages.filter((m) => m.role === 'user').length,
  }))
}

export function get(id) {
  return chats.find((c) => c.id === id) || null
}

// Append a question/answer pair, creating the chat when chatId is null.
// Returns the chat (most recently used chats float to the top).
export async function appendExchange(chatId, userMsg, aiMsg) {
  const now = new Date().toISOString()
  let chat = chatId ? chats.find((c) => c.id === chatId) : null
  if (!chat) {
    chat = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      title: (userMsg.text || 'Image question').slice(0, 80),
      messages: [],
    }
    chats.unshift(chat)
  }
  chat.messages.push({ ts: now, ...userMsg }, { ts: now, ...aiMsg })
  chat.updatedAt = now
  chats = [chat, ...chats.filter((c) => c.id !== chat.id)]
  await persist()
  return chat
}

export async function remove(id) {
  const before = chats.length
  chats = chats.filter((c) => c.id !== id)
  if (chats.length !== before) await persist()
  return chats.length !== before
}
