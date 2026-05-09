// Manifest of bundled royalty-free assets in /public/music and /public/sfx.
// AudioBed reads this — empty arrays mean "no asset of that kind present"
// and the component renders nothing for that slot. Add entries here AFTER
// dropping the file into the matching public/ subdir and recording the
// source + license in apps/video/public/music/LICENSES.md.
//
// File paths are relative to /public, e.g. 'music/upbeat-pulse.mp3'.

export type Mood = 'upbeat' | 'chill' | 'dramatic'

export interface MusicTrack {
  /** path relative to /public, e.g. 'music/upbeat-pulse.mp3' */
  src: string
  /** seconds; used to clamp Loop duration. Optional. */
  durationSec?: number
}

export interface SfxClip {
  src: string
}

// Per-mood music pool. AudioBed picks the first track for the requested
// mood (deterministic across renders). Add 3–5 per mood for variety once
// you start randomising selection.
export const MUSIC_BY_MOOD: Record<Mood, MusicTrack[]> = {
  upbeat: [
    { src: 'music/upbeat-pulse.mp3' },
    { src: 'music/upbeat-drive.mp3' },
    { src: 'music/upbeat-motivation.mp3' },
    { src: 'music/upbeat-action.mp3' },
    { src: 'music/upbeat-abstract.mp3' },
    { src: 'music/corporate-happy.mp3' },
    { src: 'music/corporate-positive.mp3' },
    { src: 'music/corporate-success.mp3' },
    { src: 'music/chill-pop.mp3' },
  ],
  chill: [
    { src: 'music/lofi-chill.mp3' },
    { src: 'music/lofi-romance.mp3' },
    { src: 'music/lofi-romantic.mp3' },
    { src: 'music/ambient-inspiring.mp3' },
  ],
  dramatic: [
    { src: 'music/ambient-suspense.mp3' },
  ],
}

// SFX library. Trigger via name from compositions when needed.
export const SFX: Partial<Record<'whoosh' | 'pop' | 'ding', SfxClip>> = {}

// Template → mood mapping. Compositions pass their template name to AudioBed
// and the right pool gets pulled.
export const TEMPLATE_MOOD: Record<'TopicExplainer' | 'TwitterThread' | 'QuickTip', Mood> = {
  TopicExplainer: 'chill',
  TwitterThread: 'upbeat',
  QuickTip: 'upbeat',
}
