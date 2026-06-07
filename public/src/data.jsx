// data.jsx — categories, icons, type-detection, seed data, formatters, mock AI.
// Exported to window at the end for cross-script access.

// ─────────────────────────────────────────────────────────────────────────────
// Icon set — minimal line glyphs, stroke = currentColor.
const Icon = ({ name, size = 18, stroke = 1.6 }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "core": return (<svg {...p}><circle cx="12" cy="12" r="7"/><path d="M12 5a7 9 0 0 0 0 14M12 5a7 9 0 0 1 0 14M5 12h14"/></svg>);
    case "all": return (<svg {...p}><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/></svg>);
    case "link": return (<svg {...p}><path d="M9.5 14.5l5-5"/><path d="M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2"/><path d="M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2"/></svg>);
    case "image": return (<svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l4.5-4.5 3 3L17 12l3 3"/></svg>);
    case "video": return (<svg {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.5 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>);
    case "note": return (<svg {...p}><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V8h4.5M8.5 13h7M8.5 16.5h5"/></svg>);
    case "quote": return (<svg {...p}><path d="M9 7c-2 .8-3 2.6-3 5v5h5v-5H7.5c0-2 .6-3 2-3.6zM18 7c-2 .8-3 2.6-3 5v5h5v-5h-2.5c0-2 .6-3 2-3.6z"/></svg>);
    case "code": return (<svg {...p}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></svg>);
    case "reminder": return (<svg {...p}><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9 3.5l-2.5 2M15 3.5l2.5 2"/></svg>);
    case "file": return (<svg {...p}><path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M12.5 3.5V9H18"/></svg>);
    case "ask": return (<svg {...p}><path d="M5 18l-1.5 3 3.2-1.4A8.5 7.5 0 1 0 4 13.5"/><circle cx="9" cy="13" r=".9" fill="currentColor" stroke="none"/><circle cx="12.5" cy="13" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="13" r=".9" fill="currentColor" stroke="none"/></svg>);
    case "grid": return (<svg {...p}><rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/></svg>);
    case "list": return (<svg {...p}><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>);
    case "send": return (<svg {...p}><path d="M4 12l16-7-7 16-2.5-6.5L4 12z"/></svg>);
    case "play": return (<svg {...p}><path d="M8 6l11 6-11 6z" fill="currentColor" stroke="none"/></svg>);
    case "external": return (<svg {...p}><path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg>);
    case "copy": return (<svg {...p}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg>);
    case "search": return (<svg {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>);
    case "spark": return (<svg {...p}><path d="M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6z"/></svg>);
    case "trash": return (<svg {...p}><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>);
    case "settings": return (<svg {...p}><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>);
    default: return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Category registry. `core` and `ask` are modes, not storable types.
const CATEGORIES = [
  { id: "link",     label: "Links",     glyph: "link" },
  { id: "image",    label: "Images",    glyph: "image" },
  { id: "video",    label: "Videos",    glyph: "video" },
  { id: "note",     label: "Notes",     glyph: "note" },
  { id: "quote",    label: "Quotes",    glyph: "quote" },
  { id: "code",     label: "Code",      glyph: "code" },
  { id: "reminder", label: "Reminders", glyph: "reminder" },
  { id: "file",     label: "Files",     glyph: "file" },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// ─────────────────────────────────────────────────────────────────────────────
// Type detection — the heart of "paste anything, it figures it out".
function detectType(raw) {
  const t = (raw || "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  // explicit fenced code
  if (/^```/.test(t)) return { type: "code", lang: (t.match(/^```(\w+)/) || [])[1] || "text" };

  // data: image
  if (/^data:image\//.test(t)) return { type: "image" };

  // url detection
  const urlMatch = t.match(/\bhttps?:\/\/[^\s]+/i) || t.match(/^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i);
  if (urlMatch && t.split(/\s+/).length <= 4) {
    const url = urlMatch[0].startsWith("http") ? urlMatch[0] : "https://" + urlMatch[0];
    let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { host = url; }
    if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return { type: "image", url, host };
    if (/(youtube\.com|youtu\.be|vimeo\.com|\.mp4|\.mov|\.webm)/i.test(url)) return { type: "video", url, host };
    if (/\.(pdf|zip|fig|sketch|key|docx?|xlsx?|csv|psd)(\?|$)/i.test(url)) return { type: "file", url, host };
    return { type: "link", url, host };
  }

  // reminder cues
  if (/\b(remind me|remember to|don'?t forget|todo|to-do|deadline|due|by (mon|tue|wed|thu|fri|sat|sun)|tomorrow|tonight|next week|at \d{1,2}(:\d{2})?\s?(am|pm)?)\b/i.test(lower))
    return { type: "reminder" };

  // code heuristics
  const codeSignals = [/[;{}]\s*$/m, /\b(function|const|let|var|=>|import|export|def|class|return|public|void|SELECT|FROM)\b/, /^\s{2,}\S/m, /<\/?[a-z][\s\S]*>/i];
  const codeScore = codeSignals.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  if (codeScore >= 2 && t.length < 1200) return { type: "code", lang: guessLang(t) };

  // quote: wrapped in quotes, or ends with an attribution dash
  if ((/^["“'].+["”']$/.test(t) || /[—\-–]\s*[A-Z][a-zA-Z.\s]{2,30}$/.test(t)) && t.length < 280)
    return { type: "quote" };

  return { type: "note" };
}
function guessLang(t) {
  if (/SELECT|FROM|WHERE/i.test(t)) return "sql";
  if (/def |import |print\(|:\s*$/m.test(t)) return "python";
  if (/<\/?[a-z]/i.test(t) && /class=|<div|<span/.test(t)) return "html";
  if (/\{[^}]*:[^}]*\}/.test(t) && /(color|margin|padding|flex|grid)/.test(t)) return "css";
  if (/\$|echo |cd |npm |git /.test(t)) return "bash";
  return "js";
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
const DAY = 86400000;
const now = Date.now();
const ago = (d, h = 0) => now - d * DAY - h * 3600000;
function relTime(ts) {
  const diff = now - ts;
  if (diff < 0) return "scheduled";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + "d ago";
  const wks = Math.floor(days / 7);
  if (days < 30) return wks + "w ago";
  return Math.floor(days / 30) + "mo ago";
}
function dateGroup(ts) {
  const d = new Date(ts), t = new Date(now);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, t)) return "TODAY";
  if (same(d, new Date(now - DAY))) return "YESTERDAY";
  if (now - ts < 7 * DAY) return "THIS WEEK";
  if (now - ts < 30 * DAY) return "THIS MONTH";
  return "ARCHIVE";
}
function fullDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function dueLabel(ts) {
  const diff = ts - now;
  if (diff < 0) return { txt: "OVERDUE", state: "overdue" };
  const days = Math.ceil(diff / DAY);
  if (days === 0) return { txt: "DUE TODAY", state: "soon" };
  if (days === 1) return { txt: "DUE TOMORROW", state: "soon" };
  if (days < 7) return { txt: "IN " + days + " DAYS", state: "ok" };
  return { txt: fullDate(ts).toUpperCase(), state: "ok" };
}

// deterministic gradient for image placeholders
function imgGradient(seed) {
  const h = (seed * 47) % 360, h2 = (h + 50) % 360;
  return `linear-gradient(135deg, hsl(${h} 40% 22%), hsl(${h2} 45% 10%))`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live backend bridge — maps a server note (QVAC) into the UI item shape and
// exposes the real /api endpoints. Server types: link/image/video/code/quote/
// reminder/text ("text" becomes "note" in the UI).
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function mapNote(n) {
  const ts = Date.parse(n.createdAt) || Date.now();
  const type = n.type === "text" ? "note" : n.type;
  const base = { id: n.id, ts, type, tags: n.tags || [], category: n.category, summary: n.summary, pending: !!n.pending };
  switch (type) {
    case "link":     return { ...base, url: n.url, host: hostOf(n.url || ""), title: n.siteTitle || n.title, note: n.siteDesc || "", thumb: n.thumb || null, siteName: n.siteName || null };
    case "video":    return { ...base, url: n.url, host: hostOf(n.url || "") || "video", title: n.siteTitle || n.title, note: n.siteDesc || "", thumb: n.thumb || null, siteName: n.siteName || null };
    case "image":    return { ...base, img: n.image, name: n.title || "image", note: n.pending ? "analyzing…" : (n.summary || n.description || "") };
    case "code":     return { ...base, lang: "text", text: n.content, title: n.title };
    case "quote":    return { ...base, text: n.content, author: null, title: n.title };
    case "reminder": return { ...base, text: n.content, title: n.title, due: n.dueDate ? Date.parse(n.dueDate) : null };
    default:         return { ...base, text: n.content, title: n.title };
  }
}
async function _json(r) { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.statusText); return d; }
const API = {
  async list() { const d = await _json(await fetch("/api/notes")); return (d.notes || []).map(mapNote); },
  async save(payload) {
    const d = await _json(await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
    return { note: mapNote(d.note), aiClassified: d.aiClassified };
  },
  async ask(payload) {
    const d = await _json(await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
    return { answer: d.answer, cited: (d.sources || []).map(mapNote), chatId: d.chatId };
  },
  async del(id) { await fetch("/api/notes/" + id, { method: "DELETE" }); },
  // chat history: list, load one (sources mapped into UI items), delete
  async chats() { const d = await _json(await fetch("/api/chats")); return d.chats || []; },
  async chat(id) {
    const d = await _json(await fetch("/api/chats/" + id));
    const messages = (d.chat.messages || []).map(m =>
      m.role === "ai" ? { ...m, cited: (m.sources || []).map(mapNote) } : m);
    return { ...d.chat, messages };
  },
  async delChat(id) { await fetch("/api/chats/" + id, { method: "DELETE" }); },
  // model settings
  async settings() { return await _json(await fetch("/api/settings")); },
  async saveSettings(patch) { return await _json(await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })); },
  async status() { return await _json(await fetch("/api/status")); },
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed data — a plausible second brain across every category.
let _id = 480;
const qid = () => "QV-" + String(_id++).padStart(4, "0");

const SEED = [];

// ─────────────────────────────────────────────────────────────────────────────
// Mock AI — searches the store and composes a grounded-feeling reply.
function mockAnswer(query, items) {
  const q = query.toLowerCase().replace(/[?.!,]/g, "");
  const words = q.split(/\s+/).filter(w => w.length > 2 &&
    !["the","and","what","when","where","which","about","that","this","have","with","from","did","for","you","i","my","me","do","is","are","was","tell","show","find","any","all"].includes(w));

  const scored = items.map(it => {
    const hay = [it.text, it.title, it.author, it.note, it.name, (it.tags || []).join(" "), it.host, it.type]
      .filter(Boolean).join(" ").toLowerCase();
    let s = 0;
    words.forEach(w => { if (hay.includes(w)) s += 2; });
    (it.tags || []).forEach(tag => { if (q.includes(tag)) s += 1; });
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.it.ts - a.it.ts);

  // category-intent
  let catIntent = CATEGORIES.find(c => q.includes(c.id) || q.includes(c.label.toLowerCase().replace(/s$/, "")));

  let hits = scored.map(x => x.it);
  if (catIntent && hits.length === 0) hits = items.filter(i => i.type === catIntent.id);

  const cited = hits.slice(0, 4);

  let lead;
  if (cited.length === 0) {
    lead = `Nothing in the vault matches “${query.trim()}” yet. Once you capture something on the topic, I'll surface it here.`;
    return { lead, cited, empty: true };
  }

  const summarize = (it) => {
    if (it.type === "link") return `the link to ${it.host} (“${it.title}”)`;
    if (it.type === "quote") return `a quote from ${it.author || "an unknown source"}`;
    if (it.type === "reminder") return `a reminder — “${it.text.slice(0, 48)}…”`;
    if (it.type === "code") return `a ${it.lang} snippet`;
    if (it.type === "note") return `a note: “${it.text.slice(0, 60)}…”`;
    if (it.type === "image") return `the image ${it.name}`;
    if (it.type === "video") return `the video “${it.title}”`;
    if (it.type === "file") return `the file ${it.name}`;
    return "an item";
  };

  if (catIntent) {
    lead = `You've stored ${hits.filter(h => h.type === catIntent.id).length || hits.length} ${catIntent.label.toLowerCase()} so far. The most relevant to “${query.trim()}”:`;
  } else if (cited.length === 1) {
    lead = `Found one thing — ${summarize(cited[0])}, captured ${relTime(cited[0].ts)}.`;
  } else {
    lead = `I found ${hits.length} related ${hits.length === 1 ? "item" : "items"} in the vault. The strongest matches — including ${summarize(cited[0])} and ${summarize(cited[1])} — are pulled below.`;
  }
  return { lead, cited, empty: false };
}

Object.assign(window, {
  Icon, CATEGORIES, CAT, detectType, relTime, dateGroup, fullDate, dueLabel,
  imgGradient, SEED, mockAnswer, qid, mapNote, API,
});
