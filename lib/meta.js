// Link/video metadata: fetched once when a note is enriched (oEmbed for
// YouTube/Vimeo, OpenGraph tags for everything else), with the thumbnail
// downloaded into data/uploads — so cards show real titles/previews without
// ever hitting the network again.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from './store.js'

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML = 1024 * 1024 // only scan the first 1 MB for meta tags
const MAX_THUMB = 5 * 1024 * 1024
const UA = 'Mozilla/5.0 (compatible; Stash/1.0; local notes app)'

async function get(url, accept) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: accept },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
}

// <meta property="og:title" content="..."> (handles either attribute order)
function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i')
  const m = re.exec(html)
  if (!m) return null
  const c = /content=["']([^"']*)["']/i.exec(m[0])
  return c?.[1] ? decodeEntities(c[1]).trim() : null
}

function titleTag(html) {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  return m?.[1] ? decodeEntities(m[1]).trim() : null
}

// oEmbed gives clean JSON (title, author, thumbnail) without scraping.
const OEMBED = [
  { match: /(?:youtube\.com|youtu\.be)/i, endpoint: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json` },
  { match: /vimeo\.com/i, endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
]

// Returns { siteTitle, siteDesc, siteName, thumb } (thumb = local /uploads
// path). Throws on total failure; partial results are fine.
export async function fetchLinkMeta(url, noteId) {
  const meta = { siteTitle: null, siteDesc: null, siteName: null, thumb: null }
  let thumbUrl = null

  const oe = OEMBED.find((o) => o.match.test(url))
  if (oe) {
    try {
      const d = await (await get(oe.endpoint(url), 'application/json')).json()
      meta.siteTitle = d.title || null
      meta.siteName = d.provider_name || null
      meta.siteDesc = d.author_name ? `by ${d.author_name}` : null
      thumbUrl = d.thumbnail_url || null
    } catch {
      /* fall through to HTML scrape */
    }
  }

  if (!meta.siteTitle) {
    const html = (await (await get(url, 'text/html,*/*')).text()).slice(0, MAX_HTML)
    meta.siteTitle = metaTag(html, 'og:title') || metaTag(html, 'twitter:title') || titleTag(html)
    meta.siteDesc = metaTag(html, 'og:description') || metaTag(html, 'description')
    meta.siteName = metaTag(html, 'og:site_name')
    thumbUrl = thumbUrl || metaTag(html, 'og:image') || metaTag(html, 'twitter:image')
  }

  if (thumbUrl) {
    try {
      meta.thumb = await saveThumb(new URL(thumbUrl, url).href, noteId)
    } catch (e) {
      /* no thumbnail is fine */
    }
  }
  return meta
}

async function saveThumb(url, noteId) {
  const res = await get(url, 'image/*')
  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length || buf.length > MAX_THUMB) return null
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg'
  const name = `meta-${noteId}.${ext}`
  await writeFile(path.join(UPLOAD_DIR, name), buf)
  return `/uploads/${name}`
}
