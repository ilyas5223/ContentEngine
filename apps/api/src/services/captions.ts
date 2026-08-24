import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'

// Word-level transcription via a prebuilt whisper.cpp CLI. Returns per-word
// timings used by the Captions Remotion component to render TikTok-style
// chunks. Always runs — even on known-good scripts — because TTS pacing
// varies mid-sentence and naive duration-splitting feels off.
//
// We shell out to a prebuilt binary rather than using nodejs-whisper, which
// compiles whisper.cpp from source on first use and therefore needs cmake +
// a C++ toolchain. See vendor/whisper/README.md for the two files to drop in.

export interface WordTiming {
  word: string
  start: number
  end: number
}

// || not ?? — an empty WHISPER_MODEL= line in .env is a string, not undefined.
const MODEL = process.env.WHISPER_MODEL || 'base.en'

// apps/api/src/services → apps/api/vendor/whisper
const VENDOR_DIR = path.resolve(__dirname, '../../vendor/whisper')

function resolveFfmpeg(): string {
  try {
    const ff = require('ffmpeg-static') as string | null
    if (ff && fs.existsSync(ff)) return ff
  } catch {}
  return 'ffmpeg'
}

// Every upstream archive extracts its binaries into a subdirectory, and the
// name differs per platform — `Release/` in the Windows zip and
// `whisper-bin-ubuntu-x64/` in the Linux tarball. Scan one level down instead
// of hardcoding either, so any extraction layout resolves.
function candidateBinDirs(): string[] {
  const dirs = [VENDOR_DIR]
  try {
    for (const entry of fs.readdirSync(VENDOR_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(VENDOR_DIR, entry.name))
    }
  } catch {}
  // Where a cmake build from source puts them.
  dirs.push(path.join(VENDOR_DIR, 'build', 'bin'))
  return dirs
}

function resolveWhisperBin(): string | null {
  const override = process.env.WHISPER_BIN
  if (override && fs.existsSync(override)) return override
  const exe = process.platform === 'win32' ? '.exe' : ''
  const dirs = candidateBinDirs()
  // Upstream renamed the CLI from `main` to `whisper-cli`; release archives in
  // circulation ship one or the other, sometimes both. Prefer the current name
  // everywhere before falling back to the legacy one.
  for (const name of ['whisper-cli', 'main']) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name + exe)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

function resolveModelPath(): string | null {
  const override = process.env.WHISPER_MODEL_PATH
  if (override && fs.existsSync(override)) return override
  const candidate = path.join(VENDOR_DIR, `ggml-${MODEL}.bin`)
  return fs.existsSync(candidate) ? candidate : null
}

// whisper.cpp wants 16kHz mono WAV. Convert MP3 → WAV first.
async function mp3ToWav16k(mp3: Buffer, dir: string): Promise<string> {
  const ff = resolveFfmpeg()
  const inPath = path.join(dir, 'in.mp3')
  const outPath = path.join(dir, 'in.wav')
  fs.writeFileSync(inPath, mp3)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ff, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      outPath,
    ])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg mp3→wav ${code}: ${stderr}`)))
  })
  return outPath
}

// "00:00:01,440" → 1.44
function parseTimestamp(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/)
  if (!m) return null
  const [, h, mn, s, ms] = m
  return Number(h) * 3600 + Number(mn) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

// whisper.cpp --output-json writes:
//   { "transcription": [ { "timestamps": {from,to}, "offsets": {from,to}, "text" } ] }
// With --max-len 1 --split-on-word each entry is a single word. `offsets` are
// milliseconds — read them as such rather than guessing from magnitude.
function parseWhisperJson(json: any): WordTiming[] {
  const segments = Array.isArray(json?.transcription) ? json.transcription : []
  const out: WordTiming[] = []
  for (const seg of segments) {
    const word = String(seg?.text ?? '').trim()
    if (!word) continue
    const fromMs = seg?.offsets?.from
    const toMs = seg?.offsets?.to
    if (typeof fromMs === 'number' && typeof toMs === 'number') {
      out.push({ word, start: fromMs / 1000, end: toMs / 1000 })
      continue
    }
    const start = parseTimestamp(seg?.timestamps?.from)
    const end = parseTimestamp(seg?.timestamps?.to)
    if (start !== null && end !== null) out.push({ word, start, end })
  }
  return out
}

// Once whisper is known missing, stop retrying — every attempt otherwise
// re-pays the ffmpeg conversion for a call that cannot succeed.
let whisperUnavailable = false

export async function transcribeWords(audio: Buffer): Promise<WordTiming[]> {
  if (process.env.DISABLE_WHISPER === '1') return []
  if (whisperUnavailable) return []

  const bin = resolveWhisperBin()
  const model = resolveModelPath()
  if (!bin || !model) {
    whisperUnavailable = true
    console.warn(
      `[captions] whisper disabled — missing ${!bin ? 'binary' : `model ggml-${MODEL}.bin`} ` +
        `in ${VENDOR_DIR}. See vendor/whisper/README.md.`,
    )
    return []
  }

  const id = crypto.randomBytes(6).toString('hex')
  const dir = path.join(os.tmpdir(), `ce_whisper_${id}`)
  fs.mkdirSync(dir, { recursive: true })

  try {
    const wavPath = await mp3ToWav16k(audio, dir)
    const outBase = path.join(dir, 'out')

    // The Linux tarball ships libwhisper/libggml as plain siblings of the
    // binary, so the loader needs that directory on its search path.
    const env = { ...process.env }
    if (process.platform !== 'win32') {
      const binDir = path.dirname(bin)
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${binDir}:${env.LD_LIBRARY_PATH}` : binDir
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, [
        '-m', model,
        '-f', wavPath,
        '--output-json',
        '--output-file', outBase,
        // One word per segment, split on word boundaries — that is what makes
        // the output word-level rather than phrase-level.
        '--max-len', '1',
        '--split-on-word',
        '--language', 'en',
        '--no-prints',
      ], { env })
      let stderr = ''
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('error', reject)
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`whisper exited ${code}: ${stderr.slice(-500)}`)),
      )
    })

    const jsonPath = `${outBase}.json`
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`whisper output JSON missing: ${jsonPath}`)
    }
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    const words = parseWhisperJson(json)
    if (words.length === 0) {
      console.warn(
        '[captions] parser returned 0 words. sample:',
        JSON.stringify(json?.transcription?.[0] ?? json).slice(0, 400),
      )
    }
    return words
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}
