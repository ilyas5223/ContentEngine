import { z } from 'zod'

export const BeatSchema = z.object({
  narration: z.string(),
  onScreen: z.string(),
})

export const BeatsSchema = z.object({
  hook: BeatSchema,
  points: z.array(BeatSchema),
  payoff: BeatSchema,
  cta: BeatSchema,
})

export const WordTimingSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
})

export const MediaItemSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string(),
  duration: z.number().optional(),
})

export const VideoPropsSchema = z.object({
  title: z.string(),
  content: z.array(z.string()),
  images: z.array(z.string()),
  brandColor: z.string().default('#6366f1'),
  audioUrl: z.string().optional(),
  cta: z.string().default('Follow for more'),
  // Phase A+: structured beats. Optional during transition; populated for new
  // renders, absent for legacy job replays.
  beats: BeatsSchema.optional(),
  // Phase B: word-level timings from whisper for caption sync.
  captions: z.array(WordTimingSchema).optional(),
  // Phase C: typed media (image|video) so compositions can choose <Img> vs
  // <OffthreadVideo>. Falls back to `images` when absent.
  mediaItems: z.array(MediaItemSchema).optional(),
})

export type Beat = z.infer<typeof BeatSchema>
export type Beats = z.infer<typeof BeatsSchema>
export type WordTiming = z.infer<typeof WordTimingSchema>
export type MediaItem = z.infer<typeof MediaItemSchema>
export type VideoProps = z.infer<typeof VideoPropsSchema>

export const DEFAULT_PROPS: VideoProps = {
  title: 'Sample Topic',
  content: [
    'First key insight about the topic',
    'Second compelling point to share',
    'Third actionable takeaway',
  ],
  images: [],
  brandColor: '#6366f1',
  cta: 'Follow for more',
}
