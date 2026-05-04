import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion'
import type { WordTiming } from '../shared/schema'

// Group whisper word timings into 2–3 word chunks. Splits aggressively on
// sentence punctuation so a chunk never spans a sentence boundary, which
// would feel unnatural on screen.
function chunkWords(words: WordTiming[], maxPerChunk = 3): WordTiming[][] {
  const chunks: WordTiming[][] = []
  let current: WordTiming[] = []
  for (const w of words) {
    current.push(w)
    const endsSentence = /[.!?]$/.test(w.word.trim())
    if (current.length >= maxPerChunk || endsSentence) {
      chunks.push(current)
      current = []
    }
  }
  if (current.length) chunks.push(current)
  return chunks
}

interface ChunkProps {
  chunk: WordTiming[]
  brandColor: string
  fps: number
}

const Chunk: React.FC<ChunkProps> = ({ chunk, brandColor, fps }) => {
  const frame = useCurrentFrame()
  const startFrame = chunk[0]!.start * fps
  const localFrame = frame - startFrame

  // Spring scale-in: 1.0 → 1.08 → 1.0, peaks ~10 frames in.
  const popFrac = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.6 },
  })
  const scale = 1 + 0.08 * popFrac * (1 - popFrac) * 4 // peaks at popFrac=0.5

  const currentTime = frame / fps
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        justifyContent: 'center',
        transform: `scale(${scale})`,
      }}
    >
      {chunk.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end + 0.05
        return (
          <span
            key={i}
            style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 84,
              fontWeight: 900,
              letterSpacing: -1,
              lineHeight: 1.05,
              color: isActive ? brandColor : '#ffffff',
              textTransform: 'uppercase',
              // Black stroke + soft shadow keep text legible on any B-roll.
              WebkitTextStroke: '6px #000',
              paintOrder: 'stroke fill',
              textShadow: '0 6px 24px rgba(0,0,0,0.65)',
              transition: 'color 60ms linear',
            }}
          >
            {w.word.trim()}
          </span>
        )
      })}
    </div>
  )
}

interface CaptionsProps {
  captions?: WordTiming[]
  brandColor?: string
}

export const Captions: React.FC<CaptionsProps> = ({
  captions,
  brandColor = '#6366f1',
}) => {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const chunks = React.useMemo(
    () => (captions?.length ? chunkWords(captions, 3) : []),
    [captions],
  )

  if (chunks.length === 0) return null

  const currentTime = frame / fps

  // Show the chunk whose time range covers `now`. Falls back to the most
  // recent chunk during gaps so captions never blink off mid-sentence.
  let activeChunk: WordTiming[] | undefined
  for (const c of chunks) {
    const start = c[0]!.start
    const end = c[c.length - 1]!.end
    if (currentTime >= start && currentTime <= end + 0.15) {
      activeChunk = c
      break
    }
    if (currentTime > end) activeChunk = c // most-recent fallback
  }
  if (!activeChunk) return null

  return (
    <AbsoluteFill
      style={{
        // ~70% down the frame — the TikTok safe zone, above platform UI.
        justifyContent: 'flex-end',
        paddingBottom: '28%',
        paddingLeft: 60,
        paddingRight: 60,
        pointerEvents: 'none',
      }}
    >
      <Chunk chunk={activeChunk} brandColor={brandColor} fps={fps} />
    </AbsoluteFill>
  )
}
