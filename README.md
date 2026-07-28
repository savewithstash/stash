<p align="center">
  <img src="public/logo.svg" alt="Stash" width="120" />
</p>

<h1 align="center">Stash</h1>

<p align="center"><strong>Hoard everything. Find anything.</strong></p>

<p align="center">
  A private, self-hosted "save anything" inbox with a brain —<br/>
  every link, screenshot, snippet and thought you throw at it is understood, filed, and answerable.<br/>
  100% on your own hardware. No accounts. No API keys. No cloud.
</p>

<p align="center">
  <a href="https://youtu.be/DqD801QB88w?si=doznZENXT_Ngj1CZ"><img src="https://img.shields.io/badge/▶_watch_the_demo-ff5a6e?style=flat-square" alt="Demo"></a>
  <a href="https://hub.docker.com/r/savewithstash/stash"><img src="https://img.shields.io/docker/v/savewithstash/stash?style=flat-square&label=docker&color=38e0d4" alt="Docker"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License: AGPL-3.0"></a>
  <a href="https://docs.qvac.tether.io/"><img src="https://img.shields.io/badge/powered_by-QVAC-9b8cff?style=flat-square" alt="Powered by QVAC"></a>
  <img src="https://img.shields.io/badge/runs_on-Raspberry_Pi_%7C_Apple_Silicon-c7f464?style=flat-square" alt="Runs on Raspberry Pi and Apple Silicon">
</p>

---

You already have a place where you dump things — a Discord channel with one member, Telegram "Saved Messages", a notes file called `stuff.txt`. The problem is never saving. It's *finding*.

Stash replaces that dump with an inbox that reads everything you save. Paste anything, hit Enter, done — it's instantly stored, then a local AI classifies it, titles it, summarizes it, tags it, and indexes it for semantic search in the background. Later, switch to **Ask mode** and just talk to your stash:

> *"what was that article about ARM SVE?"*
> *"what plant do I need to water, and when?"*
> *"show me that pasta recipe with the burnt butter"*

Answers come from **your own saved items only**, with the source cards cited and highlighted.

## Features

- **Instant saves, lazy AI** — items appear the moment you hit Enter (heuristic-classified); enrichment, captioning, and indexing happen in a background queue. Nothing blocks, nothing gets lost.
- **Automatic understanding** — every item gets a type (`link` / `video` / `code` / `quote` / `reminder` / `image` / `text`), a topical category, a title, a one-line summary, and tags. Reminders get a parsed ISO due date.
- **Searchable images** — paste a screenshot and a local vision model captions it so it shows up in search and answers. The vision model loads on demand and unloads itself when idle.
- **Rich link & video cards** — oEmbed + OpenGraph metadata (title, description, thumbnail) fetched once and cached locally, so YouTube videos and articles look like cards, not URLs.
- **Ask mode with citations** — questions are embedded, the closest items retrieved by cosine similarity, and the LLM answers *using only those items*, citing each by number.
- **Chat history** — every conversation is saved and browsable; pick up where you left off or prune what you don't need.
- **Model settings** — swap the language, embedding, and vision models from curated presets in the UI, with device badges (`PI ★` / `M2 ★`), real download sizes, and live progress. Switching the embedding model re-indexes everything automatically.
- **Private by construction** — all inference runs on-device via [QVAC](https://docs.qvac.tether.io/). Notes live in a flat JSON file, uploads in a folder. Nothing ever leaves the machine.

## Quick start

### Run locally (macOS / Linux)

```bash
git clone https://github.com/savewithstash/stash.git
cd stash
npm install
npm start          # → http://localhost:5173
```

The UI is usable immediately. On first launch Stash downloads ~1.3 GB of default model weights in the background (progress bar in the UI); AI classification and Ask mode switch on automatically at **Ready**.

### Run with Docker (Raspberry Pi / arm64)

```bash
docker run -d --name stash \
  -p 5173:5173 \
  -v stash-data:/app/data \
  -v stash-models:/app/models \
  savewithstash/stash:1.0.0
```

### Run on Umbrel

Stash ships in a community app store. In umbrelOS: **App Store → ⋯ → Community App Stores**, add

```
https://github.com/savewithstash/umbrel-app-store
```

then install **Stash** from the store.

## Choosing models

Everything is configurable from the **Settings** tab — pick per role, watch it download, keep using the app while it swaps.

| Role | Default | Raspberry Pi pick | Apple Silicon pick |
|---|---|---|---|
| **Language** — classifies & answers | Qwen3 1.7B | Qwen3 0.6B / Llama 3.2 1B | Qwen3 4B |
| **Embedding** — semantic search | EmbeddingGemma Q8 | EmbeddingGemma Q4 | GTE Large |
| **Vision** — image captions | Qwen3-VL 2B | SmolVLM2 0.5B | Qwen3-VL 2B |

Rule of thumb: on a Pi, the starred Pi trio is ~1.5 GB total and keeps everything responsive; on an M-series Mac the defaults are near-instant and the 4B language model is a free quality upgrade.

**What to expect on small hardware:** a Raspberry Pi 5 produces a few tokens per second — fine for short answers, not a chat firehose. 8 GB RAM recommended (4 GB works if you skip images).

## How it works

```
┌─ public/            React UI (in-browser Babel — no build step, fully offline vendored)
├─ server.js          dependency-free Node HTTP server + JSON API
├─ lib/
│  ├─ qvac.js         model manager: presets, load/swap, classify, embed, caption, answer
│  ├─ store.js        notes persistence (data/notes.json) + cosine-similarity retrieval
│  ├─ meta.js         oEmbed / OpenGraph fetcher with local thumbnail cache
│  ├─ chats.js        saved conversations (data/chats.json)
│  └─ settings.js     model selection persistence (data/settings.json)
├─ data/              your notes, uploads, chats, settings   (git-ignored)
└─ models/            cached model weights                    (git-ignored)
```

Saving is a two-phase pipeline: the note is persisted **instantly** with a heuristic type and title, then a FIFO background queue enriches it — fetch link metadata, caption images, LLM-classify (grammar-constrained JSON), embed, update in place. If a model is still downloading or fails, Stash degrades gracefully to the heuristics instead of erroring.

Storage is honest and portable: flat JSON with embeddings inline. Good to a few thousand items; swap `lib/store.js` for a vector DB if you hoard harder than that.

### Built on QVAC

Stash is a deliberately small showcase of [`@qvac/sdk`](https://github.com/tetherto/qvac) — four SDK calls do all the AI:

| SDK API | Used for |
|---|---|
| `loadModel({ modelSrc, modelType, onProgress })` | Loads the three models from the QVAC registry with live download progress; the vision model adds `projectionModelSrc` for its mmproj and loads lazily on first image |
| `completion({ modelId, history, responseFormat })` | Classification uses `responseFormat: { type: 'json_schema' }` — the LLM's output is **grammar-constrained to a JSON schema**, so parsing never fails. Vision calls attach the saved file via `attachments: [{ path }]` |
| `embed({ modelId, text })` | Embeds every saved item and every question |
| `unloadModel` / `close` | Idle vision unload + clean shutdown |

Model weights are kept inside the project (`./models/`): on boot the server writes `qvac.config.json` with `cacheDirectory` and sets `QVAC_CONFIG_PATH` before importing the SDK.

## Building the Docker image

The `linux/arm64` image carries two hard-won fixes worth knowing about:

- **Slimming** — `@qvac/*` packages ship native prebuilds for every platform (iOS/Android/Windows/macOS/Linux). The build strips all but `linux-arm64`, cutting the image from 7.6 GB to ~3.4 GB.
- **ARM SVE workaround** — the `linux-arm64` prebuild of `@qvac/translation-nmtcpp` contains SVE instructions, which SIGILL on any CPU without SVE (every Raspberry Pi, Apple Silicon under emulation) and kill the QVAC worker at startup. Stash never uses translation, so the build replaces that one native binding with a JS stub ([`docker/nmtcpp-binding-stub.js`](docker/nmtcpp-binding-stub.js)). Remove the stub once upstream ships non-SVE (or runtime-dispatched) arm64 builds.

```bash
docker buildx build --platform linux/arm64 -t savewithstash/stash:1.0.0 .
```

## Contributing

Issues and PRs welcome. The codebase is intentionally small and dependency-free on the server side — please keep it that way. If you're adding a feature, open an issue first so we can talk shape. Humans reviewed AI PRs are welcome.

## License

[AGPL-3.0](LICENSE) © 2026 Suryaansh Singh
