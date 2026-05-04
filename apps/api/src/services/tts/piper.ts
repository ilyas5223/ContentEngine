import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import os from 'os'
import crypto from 'crypto'
import { TtsUnavailableError } from './errors'
import type { TtsOptions } from './index'

// Piper TTS — runs a downloaded ONNX voice model via the `piper` CLI binary.
// Disabled unless PIPER_BIN and PIPER_VOICE are both set. Does not auto-
// download models; admins are expected to fetch one from
// https://github.com/rhasspy/piper/releases and point env vars at it.

function resolveFfmpeg(): string {
  try {
    const ff = require('ffmpeg-static') as string | null
    if (ff && fs.existsSync(ff)) return ff
  } catch {}
  return 'ffmpeg'
}

export async function synthesize(text: string, opts: TtsOptions): Promise<Buffer> {
  const bin = process.env.PIPER_BIN
  const voice = process.env.PIPER_VOICE
  if (!bin || !voice) {
    throw new TtsUnavailableError('PIPER_BIN / PIPER_VOICE not set')
  }
  if (!fs.existsSync(bin)) throw new TtsUnavailableError(`piper binary not found: ${bin}`)
  if (!fs.existsSync(voice)) throw new TtsUnavailableError(`piper voice not found: ${voice}`)

  const id = crypto.randomBytes(6).toString('hex')
  const wavPath = path.join(opts.tmpDir, `piper_${id}.wav`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, ['--model', voice, '--output_file', wavPath])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`piper exited ${code}: ${stderr}`)))
    proc.stdin.write(text)
    proc.stdin.end()
  })

  const wav = fs.readFileSync(wavPath)
  // Convert WAV → MP3 so downstream upload/Remotion path stays MP3.
  const ff = resolveFfmpeg()
  const dir = path.join(os.tmpdir(), `ce_piper_${id}`)
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
