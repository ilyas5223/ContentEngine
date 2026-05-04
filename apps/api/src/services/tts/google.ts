import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import type { TtsOptions } from './index'

// Google Translate TTS — last-ditch fallback. Unmistakably synthetic but
// always-on and zero-config. Chunked at 190 chars (Translate's per-call limit)
// and concatenated at the byte level (MP3 frames are safe to concat for
// Chromium's media decoder).

function downloadUrl(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    proto
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ContentEngine/1.0)',
          },
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close()
            downloadUrl(res.headers.location!, destPath).then(resolve).catch(reject)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
          file.on('error', reject)
        },
      )
      .on('error', reject)
  })
}

export async function synthesize(text: string, opts: TtsOptions): Promise<Buffer> {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const s of sentences) {
    const candidate = current ? current + ' ' + s : s
    if (candidate.length > 190) {
      if (current) chunks.push(current.trim())
      current = s.length > 190 ? s.slice(0, 190) : s
    } else {
      current = candidate
    }
  }
  if (current.trim()) chunks.push(current.trim())
  if (chunks.length === 0) chunks.push(text.slice(0, 190))

  const buffers: Buffer[] = []
  for (let i = 0; i < chunks.length; i++) {
    const dest = path.join(opts.tmpDir, `tts_google_${i}.mp3`)
    const url =
      `https://translate.google.com/translate_tts` +
      `?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=en&client=tw-ob&ttsspeed=0.9`
    await downloadUrl(url, dest)
    buffers.push(fs.readFileSync(dest))
  }
  return Buffer.concat(buffers)
}
