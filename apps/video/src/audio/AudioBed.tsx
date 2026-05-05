import React from 'react'
import { Audio, Loop, staticFile, useVideoConfig } from 'remotion'
import type { WordTiming } from '../shared/schema'
import { MUSIC_BY_MOOD, SFX, TEMPLATE_MOOD, type Mood } from './manifest'

// Background music + SFX layer. Mounted at the root of every composition.
//
// Behaviour:
//  - Picks one music track based on template→mood mapping. No-op when the
//    pool for that mood is empty (asset not yet bundled).
//  - Loops the track to cover the full timeline.
//  - Auto-ducks volume during narration via Remotion's function-volume API.
//    Ducks to MUSIC_DUCK while a word is being spoken (within 0.15s window),
//    rises to MUSIC_BED otherwise. Crossfades 8 frames either side.
//  - Caption-aware: derives narration-active windows from whisper word
//    timings. With no captions, music plays at MUSIC_BED throughout.

const MUSIC_BED = 0.18
const MUSIC_DUCK = 0.06
const FADE_FRAMES = 8

type Template = keyof typeof TEMPLATE_MOOD

interface AudioBedProps {
  template: Template
  captions?: WordTiming[]
  /** Override the automatic mood selection. */
  mood?: Mood
}

// Build narration-active intervals (in frames) from whisper word timings.
// Adjacent words are merged into a single span so the volume function flips
// once per phrase, not once per word.
function buildNarrationFrames(
  captions: WordTiming[] | undefined,
  fps: number,
): Array<[number, number]> {
  if (!captions?.length) return []
  const spans: Array<[number, number]> = []
  const GAP = 0.18 // sec — words within this gap belong to the same phrase
  let start = captions[0]!.start
  let end = captions[0]!.end
  for (let i = 1; i < captions.length; i++) {
    const w = captions[i]!
    if (w.start - end <= GAP) {
      end = Math.max(end, w.end)
    } else {
      spans.push([Math.floor(start * fps), Math.ceil(end * fps)])
      start = w.start
      end = w.end
    }
  }
  spans.push([Math.floor(start * fps), Math.ceil(end * fps)])
  return spans
}

export const AudioBed: React.FC<AudioBedProps> = ({
  template,
  captions,
  mood,
}) => {
  const { fps } = useVideoConfig()
  const resolvedMood: Mood = mood ?? TEMPLATE_MOOD[template]
  const pool = MUSIC_BY_MOOD[resolvedMood]
  const track = pool[0]
  if (!track) return null

  const spans = buildNarrationFrames(captions, fps)

  // Function-volume: linear ramp from MUSIC_BED → MUSIC_DUCK across FADE_FRAMES
  // at each narration-span boundary. Outside spans we sit at MUSIC_BED.
  const volume = (frame: number) => {
    if (!spans.length) return MUSIC_BED
    for (const [s, e] of spans) {
      if (frame >= s - FADE_FRAMES && frame <= e + FADE_FRAMES) {
        // Distance into the closest fade region
        if (frame < s) {
          const t = (frame - (s - FADE_FRAMES)) / FADE_FRAMES
          return MUSIC_BED + (MUSIC_DUCK - MUSIC_BED) * t
        }
        if (frame > e) {
          const t = (frame - e) / FADE_FRAMES
          return MUSIC_DUCK + (MUSIC_BED - MUSIC_DUCK) * t
        }
        return MUSIC_DUCK
      }
    }
    return MUSIC_BED
  }

  const loopDuration = Math.max(
    1,
    Math.floor((track.durationSec ?? 60) * fps),
  )

  return (
    <Loop durationInFrames={loopDuration}>
      <Audio src={staticFile(track.src)} volume={volume} />
    </Loop>
  )
}

// Convenience: trigger a one-shot SFX at a given frame from any composition.
// Returns null when the named clip isn't bundled.
export const Sfx: React.FC<{ name: keyof typeof SFX; volume?: number }> = ({
  name,
  volume = 0.6,
}) => {
  const clip = SFX[name]
  if (!clip) return null
  return <Audio src={staticFile(clip.src)} volume={volume} />
}
