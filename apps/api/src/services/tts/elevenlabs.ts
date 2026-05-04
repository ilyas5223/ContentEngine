import fs from 'fs'
import path from 'path'
import type { VideoTemplate } from '../queue'
import { TtsUnavailableError } from './errors'
import type { TtsOptions } from './index'

// Per-template voice mapping. ElevenLabs voice IDs (not display names) are
// stable; the strings below are the public preset IDs. Lock voice per video
// so a single render is never spliced across speakers.
const VOICE_BY_TEMPLATE: Record<VideoTemplate, string> = {
  TopicExplainer: '21m00Tcm4TlvDq8ikWAM', // Rachel
  QuickTip: 'pNInz6obpgDQGcFmaJgB',        // Adam
  TwitterThread: '9BWtsMINqrJLrRacOk9x',   // Aria
}

const MODEL_ID = 'eleven_turbo_v2_5'

const VOICE_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.75,
  style: 0.55,
  use_speaker_boost: true,
}

export async function synthesize(text: string, opts: TtsOptions): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new TtsUnavailableError('ELEVENLABS_API_KEY not set')

  const voiceId = VOICE_BY_TEMPLATE[opts.template] ?? VOICE_BY_TEMPLATE.TopicExplainer

  // Streaming endpoint: lower first-byte latency than the non-streaming one,
  // and we're buffering anyway so there's no downside.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs ${res.status}: ${errText}`)
  }
  if (!res.body) throw new Error('ElevenLabs returned empty body')

  const outPath = path.join(opts.tmpDir, 'narration_eleven.mp3')
  const writeStream = fs.createWriteStream(outPath)

  const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) writeStream.write(value)
  }
  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
  })

  return fs.readFileSync(outPath)
}
