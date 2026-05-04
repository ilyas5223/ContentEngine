import type { VideoTemplate } from '../queue'
import { normalizeLufs } from '../../lib/audio'
import { TtsUnavailableError } from './errors'
import { synthesize as elevenlabsSynthesize } from './elevenlabs'
import { synthesize as kokoroSynthesize } from './kokoro'
import { synthesize as piperSynthesize } from './piper'
import { synthesize as googleSynthesize } from './google'

export interface TtsOptions {
  template: VideoTemplate
  tmpDir: string
}

type Provider = {
  name: string
  fn: (text: string, opts: TtsOptions) => Promise<Buffer>
}

// Cascade order: best-quality first, free fallbacks behind paid. Google
// Translate TTS stays as last-ditch so renders never hard-fail.
const PROVIDERS: Provider[] = [
  { name: 'elevenlabs', fn: elevenlabsSynthesize },
  { name: 'kokoro', fn: kokoroSynthesize },
  { name: 'piper', fn: piperSynthesize },
  { name: 'google', fn: googleSynthesize },
]

export async function synthesize(text: string, opts: TtsOptions): Promise<Buffer> {
  let lastError: unknown
  for (const provider of PROVIDERS) {
    try {
      const raw = await provider.fn(text, opts)
      console.log(`[tts] synthesized via ${provider.name} (${raw.length} bytes)`)
      try {
        return await normalizeLufs(raw)
      } catch (err) {
        // LUFS norm requires ffmpeg. If it's missing, ship raw audio rather
        // than failing the render — the render will sound louder/quieter than
        // intended but still complete.
        console.warn('[tts] LUFS normalization skipped:', err instanceof Error ? err.message : err)
        return raw
      }
    } catch (err) {
      lastError = err
      if (err instanceof TtsUnavailableError) {
        // Provider not configured — try next without noise.
        continue
      }
      console.warn(`[tts] ${provider.name} failed:`, err instanceof Error ? err.message : err)
    }
  }
  throw new Error(
    `All TTS providers failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

export { TtsUnavailableError }
