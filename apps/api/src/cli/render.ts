// Standalone video renderer — no Supabase, no Redis, no web app.
//
//   pnpm --filter api render --topic "why most diets fail" --template QuickTip
//
// Runs the same pipeline as the BullMQ worker (script → TTS → captions →
// stock footage → Remotion) and drops the .mp4 in ./out. The only required
// env vars are OPENROUTER_API_KEY and PEXELS_API_KEY; TTS falls back to a
// local model when no ElevenLabs key is present.

import 'dotenv/config'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'

import { synthesize as synthesizeTts } from '../services/tts'
import { transcribeWords, type WordTiming } from '../services/captions'
import { generateVideoScript } from '../services/script'
import { fetchPexelsMedia } from '../services/pexels'
import { closeRenderer, renderVideo, warmupRenderer } from '../services/render'
import type { VideoTemplate } from '../services/queue'

const TEMPLATES: VideoTemplate[] = ['TopicExplainer', 'TwitterThread', 'QuickTip']

interface Args {
  topic: string
  template: VideoTemplate
  outDir: string
  notes: string
  keep: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    // Support both `--key value` and `--key=value`.
    const eq = key.indexOf('=')
    if (eq !== -1) {
      flags.set(key.slice(0, eq), key.slice(eq + 1))
    } else {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags.set(key, next)
        i++
      } else {
        flags.set(key, 'true')
      }
    }
  }

  const topic = flags.get('topic')?.trim()
  if (!topic) {
    console.error(
      [
        'Usage: render --topic "<topic>" [options]',
        '',
        '  --topic     <string>   what the video is about (required)',
        `  --template  <name>     one of ${TEMPLATES.join(' | ')} (default: QuickTip)`,
        '  --out       <dir>      output directory (default: ./out)',
        '  --notes     <string>   extra research notes to steer the script',
        '  --keep                 keep narration.mp3 / script.json alongside the mp4',
      ].join('\n'),
    )
    process.exit(1)
  }

  const template = (flags.get('template') ?? 'QuickTip') as VideoTemplate
  if (!TEMPLATES.includes(template)) {
    console.error(`Unknown template "${template}". Expected one of: ${TEMPLATES.join(', ')}`)
    process.exit(1)
  }

  return {
    topic,
    template,
    outDir: path.resolve(flags.get('out') ?? 'out'),
    notes: flags.get('notes') ?? '',
    keep: flags.get('keep') === 'true',
  }
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'video'
  )
}

// Remotion's headless Chromium fetches <Audio src> over the network — a bare
// file:// path won't load. Serve the temp dir over loopback for the render's
// lifetime instead of round-tripping the mp3 through cloud storage.
function serveDir(dir: string): Promise<{ origin: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const name = path.basename(decodeURIComponent((req.url ?? '/').split('?')[0]!))
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': name.endsWith('.json') ? 'application/json' : 'audio/mpeg',
      'Content-Length': fs.statSync(file).size,
    })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      })
    })
  })
}

function step(n: number, total: number, label: string) {
  console.log(`\n[${n}/${total}] ${label}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set. Put it in apps/api/.env')
    process.exit(1)
  }
  if (!process.env.PEXELS_API_KEY) {
    console.warn('PEXELS_API_KEY is not set — rendering without stock footage.')
  }

  const startedAt = Date.now()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce_cli_'))
  fs.mkdirSync(args.outDir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const basename = `${slugify(args.topic)}_${args.template}_${stamp}`
  const outputPath = path.join(args.outDir, `${basename}.mp4`)

  let audioServer: { origin: string; close: () => void } | null = null
  const TOTAL = 5

  console.log(`Topic:    ${args.topic}`)
  console.log(`Template: ${args.template}`)
  console.log(`Output:   ${outputPath}`)

  try {
    // ── 1. Script ────────────────────────────────────────────────────────
    step(1, TOTAL, 'Writing script (OpenRouter)…')
    const script = await generateVideoScript(args.topic, args.notes, args.template)
    console.log(`      hook: "${script.beats.hook.narration}"`)
    console.log(
      `      ${script.beats.points.length} points · keywords: ${script.keywords.join(', ')}`,
    )

    // ── 2. Voiceover ─────────────────────────────────────────────────────
    step(2, TOTAL, 'Recording voiceover (TTS cascade)…')
    const audioBuffer = await synthesizeTts(script.narration, {
      template: args.template,
      tmpDir,
    })
    const audioName = 'narration.mp3'
    fs.writeFileSync(path.join(tmpDir, audioName), audioBuffer)
    audioServer = await serveDir(tmpDir)
    const audioUrl = `${audioServer.origin}/${audioName}`
    console.log(`      ${(audioBuffer.length / 1024).toFixed(0)} KB`)

    // ── 3. Captions ──────────────────────────────────────────────────────
    // Soft-fail: whisper missing or a failed model download shouldn't sink
    // the whole render, it just costs us word-level captions.
    step(3, TOTAL, 'Transcribing for captions (whisper)…')
    let captions: WordTiming[] = []
    try {
      captions = await transcribeWords(audioBuffer)
      console.log(`      ${captions.length} words`)
    } catch (err) {
      console.warn(`      skipped: ${err instanceof Error ? err.message : err}`)
    }

    // ── 4. Stock footage ─────────────────────────────────────────────────
    step(4, TOTAL, 'Fetching stock footage (Pexels)…')
    const mediaItems = await fetchPexelsMedia(script.keywords)
    const images = mediaItems.filter((m) => m.type === 'image').map((m) => m.url)
    const videoCount = mediaItems.filter((m) => m.type === 'video').length
    console.log(`      ${mediaItems.length} clips (${videoCount} video, ${images.length} image)`)

    // ── 5. Render ────────────────────────────────────────────────────────
    step(5, TOTAL, 'Rendering (Remotion)… first run downloads Chromium')
    await warmupRenderer()

    let lastPct = -1
    await renderVideo({
      template: args.template,
      inputProps: {
        title: script.title,
        content: script.bullets,
        images,
        brandColor: '#6366f1',
        audioUrl,
        cta: script.cta || 'Follow for more',
        beats: script.beats,
        captions: captions.length ? captions : undefined,
        mediaItems: mediaItems.length ? mediaItems : undefined,
      },
      outputPath,
      onProgress: (progress) => {
        const pct = Math.floor(progress * 100)
        if (pct >= lastPct + 10) {
          lastPct = pct
          console.log(`      ${pct}%`)
        }
      },
    })

    if (args.keep) {
      fs.copyFileSync(path.join(tmpDir, audioName), path.join(args.outDir, `${basename}.mp3`))
      fs.writeFileSync(
        path.join(args.outDir, `${basename}.json`),
        JSON.stringify({ topic: args.topic, template: args.template, script, captions }, null, 2),
      )
    }

    const secs = ((Date.now() - startedAt) / 1000).toFixed(0)
    const mb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)
    console.log(`\nDone in ${secs}s — ${outputPath} (${mb} MB)`)
  } finally {
    audioServer?.close()
    await closeRenderer()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((err) => {
  console.error('\nRender failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
