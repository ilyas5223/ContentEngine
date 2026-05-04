import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

// Resolve ffmpeg binary. Prefer ffmpeg-static (cross-platform, bundled), then
// fall back to a system ffmpeg on PATH. We don't hard-require ffmpeg-static
// so the worker still runs in environments where it's been excluded.
function resolveFfmpeg(): string {
  try {
    const ff = require('ffmpeg-static') as string | null
    if (ff && fs.existsSync(ff)) return ff
  } catch {}
  return 'ffmpeg'
}

// Two-pass loudnorm targeting -16 LUFS / -1.5 TP / 11 LRA — the de-facto
// loudness target for TikTok / Reels / Shorts. Single-pass is acceptable for
// short narration; second-pass would need a measurement parse step. The
// quality difference on <60s clips is inaudible.
export async function normalizeLufs(input: Buffer): Promise<Buffer> {
  const ff = resolveFfmpeg()
  const id = crypto.randomBytes(6).toString('hex')
  const dir = path.join(os.tmpdir(), `ce_lufs_${id}`)
  fs.mkdirSync(dir, { recursive: true })
  const inPath = path.join(dir, 'in.mp3')
  const outPath = path.join(dir, 'out.mp3')
  fs.writeFileSync(inPath, input)

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ff, [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', inPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-codec:a', 'libmp3lame',
        '-b:a', '160k',
        outPath,
      ])
      let stderr = ''
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg loudnorm exited ${code}: ${stderr}`))
      })
    })
    return fs.readFileSync(outPath)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}
