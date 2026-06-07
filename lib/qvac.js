// QVAC model manager: loads a local LLM + embedding model and exposes
// classify / embed / answer helpers used by the notes app.
//
// Everything runs locally / on-device via @qvac/sdk — no data leaves the machine.
import { loadModel, completion, embed, unloadModel, close } from '@qvac/sdk'
import * as MODELS from '@qvac/sdk'

// ---- model selection ---------------------------------------------------
// Curated presets per role. `best` marks the sweet spot per device class
// (Raspberry Pi / Apple Silicon); sizes come from the SDK's registry data.
export const PRESETS = {
  llm: [
    { key: 'QWEN3_600M_INST_Q4', label: 'Qwen3 0.6B', desc: 'Tiny and quick — answers in seconds even on a Raspberry Pi 4.', best: ['pi'] },
    { key: 'LLAMA_3_2_1B_INST_Q4_0', label: 'Llama 3.2 1B', desc: 'Light with solid quality — a good Raspberry Pi 5 pick.', best: ['pi'] },
    { key: 'QWEN3_1_7B_INST_Q4', label: 'Qwen3 1.7B', desc: 'Balanced default — usable on a Pi 5, snappy on Apple Silicon.', best: ['pi', 'm2'] },
    { key: 'QWEN3_4B_INST_Q4_K_M', label: 'Qwen3 4B', desc: 'Noticeably smarter classification and answers — recommended on M-series Macs.', best: ['m2'] },
    { key: 'QWEN3_8B_INST_Q4_K_M', label: 'Qwen3 8B', desc: 'Highest quality — wants 16 GB RAM; not for the Pi.', best: [] },
  ],
  embed: [
    { key: 'EMBEDDINGGEMMA_300M_Q4_0', label: 'EmbeddingGemma Q4', desc: 'Smallest footprint for semantic search — Raspberry Pi pick.', best: ['pi'] },
    { key: 'EMBEDDINGGEMMA_300M_Q8_0', label: 'EmbeddingGemma Q8', desc: 'Balanced default — excellent quality for its size.', best: ['pi', 'm2'] },
    { key: 'GTE_LARGE_FP16', label: 'GTE Large', desc: 'Strongest retrieval quality — heavier per-note indexing.', best: ['m2'] },
  ],
  vision: [
    { key: 'SMOLVLM2_500M_MULTIMODAL_Q8_0', proj: 'MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0', label: 'SmolVLM2 0.5B', desc: 'Tiny image captioner — keeps the Raspberry Pi responsive.', best: ['pi'] },
    { key: 'QWEN3VL_2B_MULTIMODAL_Q4_K', proj: 'MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K', label: 'Qwen3-VL 2B', desc: 'Balanced default for image understanding.', best: ['m2'] },
    { key: 'GEMMA4_4B_MULTIMODAL_Q4_K_M', proj: 'MMPROJ_GEMMA4_4B_MULTIMODAL_F16', label: 'Gemma 4B Vision', desc: 'Richest image descriptions — Apple Silicon with 16 GB RAM.', best: [] },
  ],
}

export const DEFAULTS = { llm: 'QWEN3_1_7B_INST_Q4', embed: 'EMBEDDINGGEMMA_300M_Q8_0', vision: 'QWEN3VL_2B_MULTIMODAL_Q4_K' }

function presetFor(role, key) {
  return PRESETS[role].find((p) => p.key === key) || PRESETS[role].find((p) => p.key === DEFAULTS[role])
}

// Preset list with sizes resolved from the SDK registry, for the settings UI.
export function presetInfo() {
  const withSize = (p) => ({
    ...p,
    sizeBytes: (MODELS[p.key]?.expectedSize || 0) + (p.proj ? MODELS[p.proj]?.expectedSize || 0 : 0),
  })
  return { llm: PRESETS.llm.map(withSize), embed: PRESETS.embed.map(withSize), vision: PRESETS.vision.map(withSize) }
}

// Active selection — mutable so settings can switch models at runtime.
let LLM_MODEL = MODELS[DEFAULTS.llm]
let EMBED_MODEL = MODELS[DEFAULTS.embed]
let VISION_MODEL = MODELS[DEFAULTS.vision]
let VISION_PROJ = MODELS[presetFor('vision', DEFAULTS.vision).proj]

// Apply a saved selection. Call before boot(); use applyModels() after.
export function configureModels({ llm, embed: emb, vision } = {}) {
  if (llm && MODELS[llm]) LLM_MODEL = MODELS[llm]
  if (emb && MODELS[emb]) EMBED_MODEL = MODELS[emb]
  if (vision && MODELS[vision]) {
    VISION_MODEL = MODELS[vision]
    VISION_PROJ = MODELS[presetFor('vision', vision).proj]
  }
  status.llm = LLM_MODEL.name
  status.embed = EMBED_MODEL.name
  status.vision = VISION_MODEL.name
}

const NOTE_TYPES = ['link', 'image', 'video', 'code', 'quote', 'reminder', 'text']

// Shared, mutable status object the HTTP layer can poll via /api/status.
export const status = {
  state: 'idle', // idle | loading | ready | error
  progress: 0,
  message: 'Not started',
  llm: LLM_MODEL.name,
  embed: EMBED_MODEL.name,
  vision: VISION_MODEL.name,
  visionState: 'idle', // idle | loading | ready | error
  visionMessage: '',
  error: null,
}

let llmId = null
let embedId = null
let visionId = null
let bootPromise = null
let visionPromise = null

// Kick off model loading. Safe to call multiple times — returns the same
// in-flight promise. Resolves once both models are ready.
export function boot() {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    try {
      status.state = 'loading'

      status.message = `Loading embedding model (${EMBED_MODEL.name})…`
      embedId = await loadModel({
        modelSrc: EMBED_MODEL,
        modelType: 'llamacpp-embedding',
        onProgress: (p) => {
          status.progress = Math.round((p.percentage ?? 0) * 0.4)
          status.message = `Embedding model: ${(p.percentage ?? 0).toFixed(0)}%`
        },
      })

      status.message = `Loading language model (${LLM_MODEL.name})…`
      llmId = await loadModel({
        modelSrc: LLM_MODEL,
        modelType: 'llm',
        modelConfig: { ctx_size: 8192 },
        onProgress: (p) => {
          status.progress = 40 + Math.round((p.percentage ?? 0) * 0.6)
          status.message = `Language model: ${(p.percentage ?? 0).toFixed(0)}%`
        },
      })

      status.state = 'ready'
      status.progress = 100
      status.message = 'Models ready'
      console.log('[qvac] models ready:', { llm: LLM_MODEL.name, embed: EMBED_MODEL.name })
    } catch (err) {
      status.state = 'error'
      status.error = err?.message || String(err)
      status.message = `Failed to load models: ${status.error}`
      console.error('[qvac] model load failed:', err)
      throw err
    }
  })()
  return bootPromise
}

export function isReady() {
  return status.state === 'ready'
}

// Hot-swap models at runtime (from the settings tab). Unloads the old model,
// loads the new one with progress reported via /api/status. The vision model
// is just unloaded — the next image lazily loads the new selection.
export async function applyModels({ llm, embed: emb, vision } = {}) {
  await bootPromise?.catch(() => {})
  try {
    if (vision && MODELS[vision] && MODELS[vision] !== VISION_MODEL) {
      clearTimeout(visionIdleTimer)
      const oldId = visionId
      visionId = null
      visionPromise = null
      VISION_MODEL = MODELS[vision]
      VISION_PROJ = MODELS[presetFor('vision', vision).proj]
      status.vision = VISION_MODEL.name
      status.visionState = 'idle'
      status.visionMessage = ''
      if (oldId) await unloadModel({ modelId: oldId }).catch(() => {})
    }
    if (emb && MODELS[emb] && MODELS[emb] !== EMBED_MODEL) {
      status.state = 'loading'
      status.message = `Switching embedding model to ${emb}…`
      const oldId = embedId
      embedId = null
      EMBED_MODEL = MODELS[emb]
      status.embed = EMBED_MODEL.name
      if (oldId) await unloadModel({ modelId: oldId }).catch(() => {})
      embedId = await loadModel({
        modelSrc: EMBED_MODEL,
        modelType: 'llamacpp-embedding',
        onProgress: (p) => {
          status.progress = Math.round(p.percentage ?? 0)
          status.message = `Embedding model: ${(p.percentage ?? 0).toFixed(0)}%`
        },
      })
    }
    if (llm && MODELS[llm] && MODELS[llm] !== LLM_MODEL) {
      status.state = 'loading'
      status.message = `Switching language model to ${llm}…`
      const oldId = llmId
      llmId = null
      LLM_MODEL = MODELS[llm]
      status.llm = LLM_MODEL.name
      if (oldId) await unloadModel({ modelId: oldId }).catch(() => {})
      llmId = await loadModel({
        modelSrc: LLM_MODEL,
        modelType: 'llm',
        modelConfig: { ctx_size: 8192 },
        onProgress: (p) => {
          status.progress = Math.round(p.percentage ?? 0)
          status.message = `Language model: ${(p.percentage ?? 0).toFixed(0)}%`
        },
      })
    }
    status.state = 'ready'
    status.progress = 100
    status.message = 'Models ready'
    status.error = null
    console.log('[qvac] models switched:', { llm: LLM_MODEL.name, embed: EMBED_MODEL.name, vision: VISION_MODEL.name })
  } catch (err) {
    status.state = 'error'
    status.error = err?.message || String(err)
    status.message = `Model switch failed: ${status.error}`
    console.error('[qvac] model switch failed:', err)
    throw err
  }
}

export function isVisionReady() {
  return status.visionState === 'ready'
}

// Lazily load the multimodal vision model on first image use. It's larger than
// the text models, so we only pay the cost (and RAM) when an image arrives.
export function ensureVision() {
  if (visionPromise) return visionPromise
  visionPromise = (async () => {
    try {
      status.visionState = 'loading'
      status.visionMessage = `Loading vision model (${VISION_MODEL.name})…`
      visionId = await loadModel({
        modelSrc: VISION_MODEL,
        modelType: 'llm',
        modelConfig: { ctx_size: 4096, projectionModelSrc: VISION_PROJ },
        onProgress: (p) => {
          status.visionMessage = `Vision model: ${(p.percentage ?? 0).toFixed(0)}%`
        },
      })
      status.visionState = 'ready'
      status.visionMessage = 'Vision model ready'
      console.log('[qvac] vision model ready:', VISION_MODEL.name)
    } catch (err) {
      status.visionState = 'error'
      status.visionMessage = `Vision load failed: ${err?.message || err}`
      console.error('[qvac] vision load failed:', err)
      throw err
    }
  })()
  return visionPromise
}

// The vision model is heavy (~2 GB resident). Keeping it loaded after a
// single image save slows the *text* models for the rest of the session
// (RAM pressure / swap on small machines), so unload it after a few idle
// minutes — reloading from the local cache only takes a few seconds.
const VISION_IDLE_MS = 3 * 60 * 1000
let visionBusy = 0
let visionIdleTimer = null

async function unloadVisionIfIdle() {
  if (visionBusy > 0 || !visionId) return
  const id = visionId
  visionId = null
  visionPromise = null
  status.visionState = 'idle'
  status.visionMessage = ''
  try {
    await unloadModel({ modelId: id })
    console.log('[qvac] vision model unloaded after idle — RAM freed')
  } catch (e) {
    console.error('[qvac] vision unload failed:', e.message)
  }
}

// Describe an image file (absolute path) using the vision model. Used both to
// caption images on save (so they become searchable) and to answer questions
// about an attached image directly.
export async function describeImage({ absPath, prompt }) {
  await ensureVision()
  visionBusy++
  clearTimeout(visionIdleTimer)
  try {
    const run = completion({
      modelId: visionId,
      history: [
        {
          role: 'user',
          content:
            prompt ||
            'Describe this image in 2-3 sentences for search: visible text, people, objects, UI elements, overall context.',
          attachments: [{ path: absPath }],
        },
      ],
      stream: false,
    })
    const final = await run.final
    return final.contentText.trim()
  } finally {
    visionBusy--
    if (visionBusy === 0) visionIdleTimer = setTimeout(unloadVisionIfIdle, VISION_IDLE_MS)
  }
}

// ---- embeddings --------------------------------------------------------
export async function embedText(text) {
  if (!embedId) throw new Error('embedding model not loaded')
  const clean = (text || '').slice(0, 4000)
  const { embedding } = await embed({ modelId: embedId, text: clean || ' ' })
  return embedding
}

// ---- classification ----------------------------------------------------
// Ask the LLM to categorise a pasted item into a structured record. Output
// is grammar-constrained to JSON via responseFormat, so parsing is reliable.
const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: NOTE_TYPES },
    category: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    dueDate: { type: 'string' },
  },
  required: ['type', 'category', 'title', 'summary', 'tags'],
}

export async function classify({ text, hasImage, isUrl, now }) {
  const hints = []
  if (hasImage) hints.push('An image is attached to this item.')
  if (isUrl) hints.push('The text is (or contains) a URL.')

  const sys = [
    'You organise items a user saves to a personal knowledge base.',
    'Classify the item and return JSON only.',
    `Choose "type" from: ${NOTE_TYPES.join(', ')}.`,
    '- link: a web URL/bookmark. video: a link to a video (YouTube, Vimeo, etc).',
    '- code: a code snippet. quote: a quotation or saying. reminder: a task/todo/something to do later.',
    '- image: an attached picture. text: a general note that fits none of the above.',
    '"category" is a short topical label (1-2 words, Title Case) like "Tech", "Recipes", "Work", "Finance", "Health".',
    '"title" is a concise human title (max ~8 words).',
    '"summary" is one sentence describing the item for later search.',
    '"tags" is 1-5 lowercase keywords.',
    'If type is "reminder" and a date/time is implied, put an ISO-8601 datetime in "dueDate"; otherwise omit dueDate.',
    `Current date/time is ${now}.`,
  ].join('\n')

  const user = `${hints.length ? hints.join(' ') + '\n\n' : ''}ITEM:\n${(text || '(no text — image only)').slice(0, 3000)}`

  const run = completion({
    modelId: llmId,
    history: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    stream: false,
    responseFormat: { type: 'json_schema', json_schema: { name: 'classification', schema: CLASSIFY_SCHEMA } },
  })
  const final = await run.final
  let parsed
  try {
    parsed = JSON.parse(final.contentText.trim())
  } catch {
    parsed = {}
  }
  return normaliseClassification(parsed, { hasImage, isUrl, text })
}

function normaliseClassification(p, { hasImage, isUrl, text }) {
  let type = NOTE_TYPES.includes(p.type) ? p.type : null
  if (!type) type = heuristicType({ hasImage, isUrl, text })
  return {
    type,
    category: (p.category || 'General').toString().slice(0, 40),
    title: (p.title || deriveTitle(text) || 'Untitled').toString().slice(0, 120),
    summary: (p.summary || '').toString().slice(0, 400),
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase()).slice(0, 6) : [],
    dueDate: p.dueDate ? String(p.dueDate) : null,
  }
}

// ---- answering (RAG) ---------------------------------------------------
// Given the user's question and the retrieved notes, produce an answer that
// is grounded in the saved items and cites them by number.
export async function answer({ question, contextNotes }) {
  const context = contextNotes
    .map((n, i) => {
      const date = new Date(n.createdAt).toLocaleDateString()
      const body = n.url ? `${n.content}\nURL: ${n.url}` : n.content
      return `[${i + 1}] (${n.type}, ${n.category}, saved ${date}) ${n.title}\n${body}`.slice(0, 1200)
    })
    .join('\n\n')

  const sys = [
    'You are the assistant for a personal notes app.',
    "Answer the user's question using ONLY the saved notes provided as context.",
    'Describe the actual content of the relevant note(s) — for an image, say what it depicts; for a link, what it is; for a quote/code, the gist. Do NOT just say "see note [2]"; the note is shown to the user as a card, so summarise what they will find there.',
    'Cite each note you use with its bracket number, e.g. [2], so the matching card is highlighted.',
    "If the notes don't contain the answer, say so plainly and suggest what to save.",
    'Be concise and direct.',
  ].join('\n')

  const user = `SAVED NOTES:\n${context || '(no saved notes yet)'}\n\nQUESTION: ${question}`

  const run = completion({
    modelId: llmId,
    history: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    stream: false,
    captureThinking: true,
  })
  const final = await run.final
  return final.contentText.trim()
}

// ---- helpers / fallbacks ----------------------------------------------
export function heuristicType({ hasImage, isUrl, text }) {
  if (hasImage) return 'image'
  const t = (text || '').trim()
  if (isUrl || /^https?:\/\/\S+$/i.test(t)) {
    if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|\.mp4(\?|$)/i.test(t)) return 'video'
    return 'link'
  }
  if (/```/.test(t) || /^(function|const|let|var|import|class|def |public |#include|<\?php|SELECT )/m.test(t)) return 'code'
  if (/\bremind|remember to|todo|to-do|don'?t forget|by (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) return 'reminder'
  if (/^["“].+["”]\s*[—-]/.test(t)) return 'quote'
  return 'text'
}

export function deriveTitle(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ')
  return t.slice(0, 60)
}

export function isLikelyUrl(text) {
  return /^https?:\/\/\S+$/i.test((text || '').trim())
}

// Pull the first URL out of free text (e.g. "check this out www.foo.com/bar").
// Used when classification decides a note is a link/video but the text wasn't
// purely a URL, so the card still gets something to open.
export function extractUrl(text) {
  const t = text || ''
  const m = /https?:\/\/[^\s<>"')\]]+/i.exec(t)
  if (m) return m[0].replace(/[.,;:!?]+$/, '')
  const w = /\bwww\.[^\s<>"')\]]+/i.exec(t)
  if (w) return 'https://' + w[0].replace(/[.,;:!?]+$/, '')
  // bare domain with a well-known TLD, e.g. "google.com" or "foo.dev/bar"
  const d = /\b[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|ai|co|me|tv|gg|sh|xyz)(\/[^\s<>"')\]]*)?/i.exec(t)
  if (d) return 'https://' + d[0].replace(/[.,;:!?]+$/, '')
  return null
}

export async function shutdown() {
  try {
    if (llmId) await unloadModel({ modelId: llmId })
    if (embedId) await unloadModel({ modelId: embedId })
    if (visionId) await unloadModel({ modelId: visionId })
  } catch (e) {
    /* ignore */
  }
  try {
    await close()
  } catch (e) {
    /* ignore */
  }
}
