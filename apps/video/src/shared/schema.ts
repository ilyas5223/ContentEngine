import { z } from 'zod'

export const VideoPropsSchema = z.object({
  title: z.string(),
  content: z.array(z.string()),
  images: z.array(z.string()),
  brandColor: z.string().default('#6366f1'),
  audioUrl: z.string().optional(),
  cta: z.string().default('Follow for more'),
})

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
