import type { Beats, WordTiming } from './schema'

export interface BeatTiming {
  startSec: number
  endSec: number
  startFrame: number
  endFrame: number
}

export interface BeatTimings {
  hook: BeatTiming
  points: BeatTiming[]
  payoff: BeatTiming
  cta: BeatTiming
}

// Map narration beats → time ranges by walking the whisper word stream.
// Whisper transcribed the concatenated narration in order, so consuming N
// words per beat (where N = beat.narration's word count) yields the beat's
// time slice. Soft-fails to null when captions/beats missing — callers fall
// back to fixed frame counts.
export function deriveBeatTimings(
  beats: Beats | undefined,
  captions: WordTiming[] | undefined,
  fps: number,
  totalFrames: number,
): BeatTimings | null {
  if (!beats || !captions?.length) return null

  const tokenize = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const counts = {
    hook: tokenize(beats.hook.narration),
    points: beats.points.map((p) => tokenize(p.narration)),
    payoff: tokenize(beats.payoff.narration),
    cta: tokenize(beats.cta.narration),
  }
  const expectedTotal =
    counts.hook + counts.points.reduce((a, b) => a + b, 0) + counts.payoff + counts.cta

  // Bail if word counts diverge wildly (>30%) from whisper output — the script
  // was edited mid-pipeline or whisper hallucinated.
  const drift = Math.abs(captions.length - expectedTotal) / Math.max(expectedTotal, 1)
  if (drift > 0.3) return null

  // Scale word indices proportionally to caption length so small drift doesn't
  // accumulate at the end.
  const scale = captions.length / expectedTotal
  let cursor = 0
  const take = (n: number): BeatTiming => {
    const startIdx = Math.min(captions.length - 1, Math.round(cursor))
    cursor += n * scale
    const endIdx = Math.min(captions.length - 1, Math.max(startIdx, Math.round(cursor) - 1))
    const startSec = captions[startIdx]!.start
    const endSec = captions[endIdx]!.end
    return {
      startSec,
      endSec,
      startFrame: Math.max(0, Math.floor(startSec * fps)),
      endFrame: Math.min(totalFrames, Math.ceil(endSec * fps)),
    }
  }

  return {
    hook: take(counts.hook),
    points: counts.points.map((n) => take(n)),
    payoff: take(counts.payoff),
    cta: take(counts.cta),
  }
}
