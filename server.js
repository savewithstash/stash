// Stash — a local, private "save anything" inbox with a chat UI.
// Paste text / links / images / code / quotes / reminders; each item is
// auto-classified, embedded, and stored. Ask questions and the local QVAC
// LLM answers using your saved items (retrieval-augmented).
//
// Pure Node http server (no web framework) + static files in ./public.
import http from 'node:http'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = process.env.PORT || 5173

// --- keep model downloads inside THIS project (not the user's home dir) ---
// QVAC stores models in `cacheDirectory` (default: ~/.qvac/models, which can
// grow to many GB). We point it at <project>/models and write the SDK's
// config file so every loadModel() downloads/caches here instead. Done before
// importing the SDK so config resolution picks it up.
const MODELS_DIR = path.join(__dirname, 'models')
const CONFIG_PATH = path.join(__dirname, 'qvac.config.json')
mkdirSync(MODELS_DIR, { recursive: true })
writeFileSync(CONFIG_PATH, JSON.stringify({ cacheDirectory: MODELS_DIR }, null, 2) + '\n')
process.env.QVAC_CONFIG_PATH = CONFIG_PATH

const qvac = await import('./lib/qvac.js')
const store = await import('./lib/store.js')
const chats = await import('./lib/chats.js')
const settings = await import('./lib/settings.js')
const { fetchLinkMeta } = await import('./lib/meta.js')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'application/javascript; charset=utf-8', // transformed in-browser by Babel
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

// ---- tiny helpers ------------------------------------------------------
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// Persist a pasted (base64 data-URL) image to disk.
// Returns { webPath, absPath } or null.
async function saveImage(dataUrl) {
  const m = /^data:(image\/(png|jpe?g|gif|webp));base64,(.+)$/i.exec(dataUrl || '')
  if (!m) return null
  const ext = m[2].toLowerCase().replace('jpeg', 'jpg')
  const name = `${randomUUID()}.${ext}`
  const absPath = path.join(store.UPLOAD_DIR, name)
  await writeFile(absPath, Buffer.from(m[3], 'base64'))
  return { webPath: `/uploads/${name}`, absPath }
}

// ---- API handlers ------------------------------------------------------
// Every save returns instantly with heuristic metadata (regex type, derived
// title) — the AI pipeline (vision caption for images, then LLM classify +
// embed) runs in the background and patches the note when done (`pending`
// flags the card). A failure anywhere just leaves the heuristic version; the
// note itself is never lost.
async function handleSave(req, res) {
  const body = await readBody(req)
  const text = (body.text || '').toString().trim()
  const imageData = body.image // optional data URL
  if (!text && !imageData) return json(res, 400, { error: 'Provide text and/or an image.' })

  const img = imageData ? await saveImage(imageData) : null
  const isUrl = qvac.isLikelyUrl(text)

  const note = await store.addNote({
    type: img ? 'image' : qvac.heuristicType({ hasImage: false, isUrl, text }),
    title: qvac.deriveTitle(text) || (img ? 'Image' : 'Untitled'),
    content: text,
    url: isUrl ? text : null,
    image: img?.webPath || null,
    pending: true,
  })
  json(res, 200, { note, aiClassified: false })
  queueEnrich(note.id, { absPath: img?.absPath, text, isUrl, hasImage: !!img })
}

// ---- background enrichment ----------------------------------------------
// Jobs run one at a time (FIFO) so rapid saves don't contend for the model,
// and each waits for boot() — notes saved while models are still loading get
// enriched as soon as they're ready instead of staying heuristic forever.
let enrichChain = Promise.resolve()
function queueJob(fn) {
  enrichChain = enrichChain.then(fn).catch((e) => console.error('[enrich] failed:', e.message))
}
function queueEnrich(noteId, job) {
  queueJob(() => enrichNote(noteId, job))
}

// One-shot backfill for link/video notes saved before metadata support (or
// while offline): fetch their oEmbed/OpenGraph data on boot.
function queueMetaBackfill() {
  for (const n of store.allNotes()) {
    if ((n.type === 'link' || n.type === 'video') && n.url && !n.siteTitle && !n.metaFetched) {
      queueJob(async () => {
        const patch = { metaFetched: true }
        try {
          const m = await fetchLinkMeta(n.url, n.id)
          for (const k of ['siteTitle', 'siteDesc', 'siteName', 'thumb']) {
            if (m[k]) patch[k] = m[k]
          }
        } catch (e) {
          console.error('[enrich] meta backfill failed for', n.url, '-', e.message)
        }
        await store.updateNote(n.id, patch)
      })
    }
  }
}

async function enrichNote(id, { absPath, text, isUrl, hasImage }) {
  try {
    await qvac.boot()
  } catch {
    // models never loaded — clear pending so the card doesn't spin forever
    await store.updateNote(id, { pending: false })
    return
  }

  let visionDescription = ''
  if (hasImage && absPath) {
    try {
      visionDescription = await qvac.describeImage({ absPath })
    } catch (e) {
      console.error('[enrich] vision describe failed:', e.message)
    }
  }

  // Link/video metadata (oEmbed / OpenGraph), fetched once and cached locally.
  // Done before classification so the page title/description inform the LLM
  // and the embedding — "QWEN3 docs" beats "https://docs.qvac…" for search.
  const url = isUrl ? text : qvac.extractUrl(text)
  let linkMeta = null
  if (url && !hasImage) {
    try {
      linkMeta = await fetchLinkMeta(url, id)
    } catch (e) {
      console.error('[enrich] meta fetch failed:', e.message)
    }
  }

  const richText = [text, visionDescription, linkMeta?.siteTitle, linkMeta?.siteDesc]
    .filter(Boolean)
    .join('\n\n')

  const patch = { pending: false, metaFetched: !!url }
  if (visionDescription) {
    patch.description = visionDescription
    patch.content = [text, visionDescription].filter(Boolean).join('\n\n')
    patch.summary = visionDescription
  }
  const applyLinkMeta = () => {
    if (!linkMeta) return
    for (const k of ['siteTitle', 'siteDesc', 'siteName', 'thumb']) {
      if (linkMeta[k]) patch[k] = linkMeta[k]
    }
  }
  if (isUrl) applyLinkMeta()

  if (richText) {
    try {
      const meta = await qvac.classify({
        text: richText,
        hasImage,
        isUrl,
        now: new Date().toISOString(),
      })
      if (hasImage) meta.type = 'image' // an attached image is always an image note
      // The LLM may upgrade plain text to link/video (e.g. "check out
      // www.foo.com") — make sure the card has a URL to open, or demote it
      // back to text so it doesn't render as a dead link.
      if (!isUrl && (meta.type === 'link' || meta.type === 'video')) {
        if (url) {
          patch.url = url
          applyLinkMeta()
        } else meta.type = 'text'
      }
      const toEmbed = [meta.title, meta.summary, richText, meta.tags.join(' ')].filter(Boolean).join('\n')
      Object.assign(patch, meta)
      patch.embedding = await qvac.embedText(toEmbed || meta.title)
    } catch (e) {
      console.error('[enrich] AI classify failed, keeping heuristics:', e.message)
    }
  }
  await store.updateNote(id, patch)
}

async function handleAsk(req, res) {
  const body = await readBody(req)
  const question = (body.question || '').toString().trim()
  const imageData = body.image
  const chatId = body.chatId || null
  if (!question && !imageData) return json(res, 400, { error: 'Ask a question.' })
  if (!qvac.isReady()) return json(res, 503, { error: 'Models are still loading — try again in a moment.' })

  // Persist the exchange so chats survive reloads and can be browsed/resumed.
  const record = async (answer, sources, image = null) => {
    const chat = await chats.appendExchange(
      chatId,
      { role: 'user', text: question, image },
      { role: 'ai', text: answer, sources }
    )
    json(res, 200, { answer, sources, chatId: chat.id })
  }

  // Image attached to the question → answer about it directly with the vision model.
  if (imageData) {
    const img = await saveImage(imageData)
    if (!img) return json(res, 400, { error: 'Could not read the attached image.' })
    try {
      const answer = await qvac.describeImage({
        absPath: img.absPath,
        prompt: question || 'What is in this image? Describe it in detail.',
      })
      return await record(answer, [], img.webPath)
    } catch (e) {
      return json(res, 500, { error: 'Vision model error: ' + e.message })
    }
  }

  if (store.count() === 0) {
    return await record("You haven't saved anything yet. Paste a link, note, or image first!", [])
  }

  const qEmbedding = await qvac.embedText(question)
  const sources = store.search(qEmbedding, 6)
  const answer = await qvac.answer({ question, contextNotes: sources })
  await record(answer, sources)
}

function handleNotes(res) {
  json(res, 200, { notes: store.allNotes() })
}

function handleStatus(res) {
  json(res, 200, { ...qvac.status, count: store.count() })
}

// ---- settings: model selection ------------------------------------------
function handleGetSettings(res) {
  json(res, 200, { current: settings.get(), presets: qvac.presetInfo() })
}

async function handleSaveSettings(req, res) {
  const body = await readBody(req)
  const patch = {}
  for (const role of ['llm', 'embed', 'vision']) {
    if (!body[role]) continue
    if (!qvac.PRESETS[role].some((p) => p.key === body[role])) {
      return json(res, 400, { error: `unknown ${role} model: ${body[role]}` })
    }
    patch[role] = body[role]
  }
  if (!Object.keys(patch).length) return json(res, 400, { error: 'nothing to change' })

  const prev = settings.get()
  const current = await settings.save(patch)
  const embedChanged = patch.embed && patch.embed !== prev.embed

  // Apply through the job queue so it can't race in-flight enrichment.
  // A new embedding model speaks a different vector space, so every note is
  // re-embedded in the background (search degrades gracefully meanwhile).
  queueJob(async () => {
    await qvac.applyModels(patch)
    if (embedChanged) {
      const notes = store.allNotes()
      console.log(`[settings] re-embedding ${notes.length} notes for ${patch.embed}…`)
      for (const n of notes) {
        try {
          const toEmbed = [n.title, n.summary, n.content, (n.tags || []).join(' ')].filter(Boolean).join('\n')
          if (toEmbed) await store.updateNote(n.id, { embedding: await qvac.embedText(toEmbed) })
        } catch (e) {
          console.error('[settings] re-embed failed for', n.id, '-', e.message)
        }
      }
      console.log('[settings] re-embedding done')
    }
  })
  json(res, 200, { ok: true, current })
}

// ---- static files ------------------------------------------------------
async function serveStatic(req, res, urlPath) {
  // uploaded images live in ./data/uploads, everything else in ./public
  let filePath
  if (urlPath.startsWith('/uploads/')) {
    filePath = path.join(store.UPLOAD_DIR, path.basename(urlPath))
  } else {
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
    filePath = path.join(PUBLIC_DIR, rel)
    if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' })
  }
  if (!existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const data = await readFile(filePath)
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
  res.end(data)
}

// ---- router ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname
  try {
    if (req.method === 'POST' && p === '/api/save') return await handleSave(req, res)
    if (req.method === 'POST' && p === '/api/ask') return await handleAsk(req, res)
    if (req.method === 'GET' && p === '/api/notes') return handleNotes(res)
    if (req.method === 'GET' && p === '/api/chats') return json(res, 200, { chats: chats.list() })
    if (req.method === 'GET' && p.startsWith('/api/chats/')) {
      const chat = chats.get(p.split('/').pop())
      return chat ? json(res, 200, { chat }) : json(res, 404, { error: 'chat not found' })
    }
    if (req.method === 'DELETE' && p.startsWith('/api/chats/')) {
      const ok = await chats.remove(p.split('/').pop())
      return json(res, ok ? 200 : 404, { ok })
    }
    if (req.method === 'GET' && p === '/api/status') return handleStatus(res)
    if (req.method === 'GET' && p === '/api/settings') return handleGetSettings(res)
    if (req.method === 'POST' && p === '/api/settings') return await handleSaveSettings(req, res)
    if (req.method === 'DELETE' && p.startsWith('/api/notes/')) {
      const id = p.split('/').pop()
      const note = store.allNotes().find((n) => n.id === id)
      const ok = await store.deleteNote(id)
      // also remove the note's cached files (uploaded image, metadata thumb)
      if (ok && note) {
        for (const f of [note.image, note.thumb]) {
          if (f && f.startsWith('/uploads/')) {
            unlink(path.join(store.UPLOAD_DIR, path.basename(f))).catch(() => {})
          }
        }
      }
      return json(res, ok ? 200 : 404, { ok })
    }
    if (req.method === 'GET') return await serveStatic(req, res, p)
    json(res, 405, { error: 'method not allowed' })
  } catch (err) {
    console.error('[server] error:', err)
    json(res, 500, { error: err.message || 'internal error' })
  }
})

// ---- boot --------------------------------------------------------------
await store.load()
await chats.load()
await settings.load()
qvac.configureModels(settings.get()) // saved model selection, before boot()
queueMetaBackfill()
server.listen(PORT, () => {
  console.log(`\n  📒 Stash running at  http://localhost:${PORT}\n`)
  console.log('  Loading local QVAC models in the background (first run downloads them)…\n')
})
qvac.boot().catch(() => {
  /* status object already records the error; UI surfaces it */
})

process.on('SIGINT', async () => {
  console.log('\nShutting down…')
  await qvac.shutdown()
  process.exit(0)
})
