import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'

// nodejs-whisper word-level transcription. Returns per-word timings used by
// the Captions Remotion component to render TikTok-style chunks. Always
// runs — even on known-good scripts — because TTS pacing varies mid-
// sentence and naive duration-splitting feels off.

export interface WordTiming {
  word: string
  start: number
  end: number
}

const MODEL = process.env.WHISPER_MODEL ?? 'base.en'

function resolveFfmpeg(): string {
  try {
    const ff = require('ffmpeg-static') as string | null
    if (ff && fs.existsSync(ff)) return ff
  } catch {}
  return 'ffmpeg'
}

// nodejs-whisper / whisper.cpp wants 16kHz mono WAV. Convert MP3 → WAV first.
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

// nodejs-whisper writes a sidecar .json (with --output_json + --word_timestamps)
// formatted as { transcription: [{ from, to, text, words?: [...] }] }.
// The exact shape varies by version, so we walk both common layouts.
function parseWhisperJson(json: any): WordTiming[] {
  const out: WordTiming[] = []
  const segments = Array.isArray(json?.transcription)
    ? json.transcription
    : Array.isArray(json?.segments)
    ? json.segments
    : []
  for (const seg of segments) {
    const words = seg?.words ?? seg?.word_timestamps
    if (Array.isArray(words) && words.length) {
      for (const w of words) {
        const word = (w.word ?? w.text ?? '').toString().trim()
        const start = typeof w.start === 'number' ? w.start
          : typeof w.from === 'number' ? w.from / 1000
          : null
        const end = typeof w.end === 'number' ? w.end
          : typeof w.to === 'number' ? w.to / 1000
          : null
        if (word && start !== null && end !== null) out.push({ word, start, end })
      }
    } else if (seg?.text) {
      // Fallback: split segment text evenly across [from, to] in ms.
      const text = String(seg.text).trim()
      const tokens = text.split(/\s+/).filter(Boolean)
      const start = typeof seg.from === 'number' ? seg.from / 1000 : seg.start ?? 0
      const end = typeof seg.to === 'number' ? seg.to / 1000 : seg.end ?? start
      const dur = Math.max(0.1, end - start)
      const step = dur / tokens.length
      tokens.forEach((tok: string, i: number) => {
        out.push({ word: tok, start: start + i * step, end: start + (i + 1) * step })
      })
    }
  }
  return out
}

// Cache the whisper module + model-download bootstrap once per process.
let whisperReady: Promise<any> | null = null
function getWhisper(): Promise<any> {
  if (whisperReady) return whisperReady
  whisperReady = (async () => {
    const mod: any = await import('nodejs-whisper' as string)
    return mod
  })()
  return whisperReady
}

export async function transcribeWords(audio: Buffer): Promise<WordTiming[]> {
  const id = crypto.randomBytes(6).toString('hex')
  const dir = path.join(os.tmpdir(), `ce_whisper_${id}`)
  fs.mkdirSync(dir, { recursive: true })

  try {
    const wavPath = await mp3ToWav16k(audio, dir)
    const mod = await getWhisper()
    const nodewhisper = mod.nodewhisper ?? mod.default?.nodewhisper ?? mod.default

    // First call downloads the model into nodejs-whisper's bundled cache.
    // Subsequent calls reuse it. autoDownloadModelName triggers the download
    // if missing without throwing.
    await nodewhisper(wavPath, {
      modelName: MODEL,
      autoDownloadModelName: MODEL,
      removeWavFileAfterTranscription: false,
      withCuda: false,
      whisperOptions: {
        outputInJson: true,
        wordTimestamps: true,
        language: 'en',
        translateToEnglish: false,
        timestamps_length: 1,
        splitOnWord: true,
      },
    })

    // nodejs-whisper writes <wav>.json next to the input.
    const jsonPath = wavPath + '.json'
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`whisper output JSON missing: ${jsonPath}`)
    }
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    return parseWhisperJson(json)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}
