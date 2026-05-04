import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import os from 'os'
import crypto from 'crypto'
import type { VideoTemplate } from '../queue'
import { TtsUnavailableError } from './errors'
import type { TtsOptions } from './index'

// Kokoro TTS via kokoro-js — runs the 82M ONNX model in Node through
// @huggingface/transformers. First call cold-starts a ~325MB model download
// cached under KOKORO_MODEL_DIR (defaults to HF cache). Init is expensive,
// so we keep one instance per worker process.

const VOICE_BY_TEMPLATE: Record<VideoTemplate, string> = {
  TopicExplainer: 'af_bella',
  QuickTip: 'am_michael',
  TwitterThread: 'af_nicole',
}

let ttsPromise: Promise<unknown> | null = null

async function getTts(): Promise<unknown> {
  if (ttsPromise) return ttsPromise
  ttsPromise = (async () => {
    try {
      // Dynamic import — module is optional. If absent, we throw
      // TtsUnavailableError so the cascade falls through to Piper / Google.
      const mod: any = await import('kokoro-js' as string).catch((err) => {
        throw new TtsUnavailableError(
          `kokoro-js not installed (run: pnpm add kokoro-js): ${err?.message ?? err}`,
        )
      })
      const KokoroTTS = mod.KokoroTTS ?? mod.default?.KokoroTTS
      if (!KokoroTTS) throw new TtsUnavailableError('kokoro-js: KokoroTTS export not found')

      if (process.env.KOKORO_MODEL_DIR) {
        process.env.HF_HOME = process.env.KOKORO_MODEL_DIR
      }
      const modelId = process.env.KOKORO_MODEL_ID ?? 'onnx-community/Kokoro-82M-v1.0-ONNX'
      const dtype = process.env.KOKORO_DTYPE ?? 'q8'
      console.log(`[tts/kokoro] loading model ${modelId} (dtype=${dtype})`)
      return await KokoroTTS.from_pretrained(modelId, { dtype })
    } catch (err) {
      ttsPromise = null
      throw err
    }
  })()
  return ttsPromise
}

function resolveFfmpeg(): string {
  try {
    const ff = require('ffmpeg-static') as string | null
    if (ff && fs.existsSync(ff)) return ff
  } catch {}
  return 'ffmpeg'
}

async function wavBufferToMp3(wav: Buffer): Promise<Buffer> {
  const ff = resolveFfmpeg()
  const id = crypto.randomBytes(6).toString('hex')
  const dir = path.join(os.tmpdir(), `ce_kokoro_${id}`)
  fs.mkdirSync(dir, { recursive: true })
  const inPath = path.join(dir, 'in.wav')
  const outPath = path.join(dir, 'out.mp3')
  fs.writeFileSync(inPath, wav)
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ff, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inPath,
        '-codec:a', 'libmp3lame', '-b:a', '160k',
        outPath,
      ])
      let stderr = ''
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('error', reject)
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg wav→mp3 ${code}: ${stderr}`)))
    })
    return fs.readFileSync(outPath)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

export async function synthesize(text: string, opts: TtsOptions): Promise<Buffer> {
  const tts: any = await getTts()
  const voice = VOICE_BY_TEMPLATE[opts.template] ?? VOICE_BY_TEMPLATE.TopicExplainer
  const audio: any = await tts.generate(text, { voice })

  // kokoro-js returns a RawAudio with toWav() / save(). Prefer in-memory.
  let wav: Buffer
  if (typeof audio?.toWav === 'function') {
    const arr = audio.toWav()
    wav = Buffer.isBuffer(arr) ? arr : Buffer.from(arr)
  } else if (typeof audio?.save === 'function') {
    const tmp = path.join(opts.tmpDir, 'kokoro.wav')
    await audio.save(tmp)
    wav = fs.readFileSync(tmp)
  } else {
    throw new Error('kokoro-js: unrecognized audio object (no toWav/save)')
  }

  return wavBufferToMp3(wav)
}
