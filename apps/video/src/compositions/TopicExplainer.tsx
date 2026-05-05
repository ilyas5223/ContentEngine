import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import type { MediaItem, VideoProps } from '../shared/schema'
import { Captions } from '../components/Captions'
import { VideoChrome } from '../components/VideoChrome'
import { deriveBeatTimings } from '../shared/beatTimings'

const FPS = 30
// Halved from Phase A: cuts now 1.5–2.5s instead of 3–4s.
const TITLE_FRAMES = 45
const BULLET_FRAMES = 60
const CTA_FRAMES = 45
const PAD_FRAMES = 30 // padding after last beat for CTA tail

// ── B-roll backdrop ─────────────────────────────────────────────────────────
// Picks the right element type per media item. Loops video to fill the
// segment; images get a slow Ken-Burns scale.

const Backdrop: React.FC<{ media?: MediaItem; durationFrames: number }> = ({
  media,
  durationFrames,
}) => {
  const frame = useCurrentFrame()
  if (!media) {
    return (
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #14141c 0%, #1f1f2b 100%)',
        }}
      />
    )
  }
  if (media.type === 'video') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <Loop durationInFrames={Math.max(1, Math.floor((media.duration ?? 5) * FPS))}>
          <OffthreadVideo
            src={media.url}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
          />
        </Loop>
        <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </AbsoluteFill>
    )
  }
  const scale = 1.05 + (frame / Math.max(1, durationFrames)) * 0.1
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img
          src={media.url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
    </AbsoluteFill>
  )
}

// ── Cards ───────────────────────────────────────────────────────────────────

const TitleCard: React.FC<{
  title: string
  brandColor: string
  media?: MediaItem
  durationFrames: number
}> = ({ title, brandColor, media, durationFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  return (
    <AbsoluteFill>
      <Backdrop media={media} durationFrames={durationFrames} />
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', padding: 80 }}
      >
        <div
          style={{
            opacity: pop,
            transform: `translateY(${(1 - pop) * 40}px) scale(${0.94 + pop * 0.06})`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 80,
              height: 8,
              backgroundColor: brandColor,
              margin: '0 auto 40px',
              borderRadius: 4,
            }}
          />
          <h1
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 110,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.1,
              letterSpacing: -2,
              textShadow: '0 4px 32px rgba(0,0,0,0.6)',
            }}
          >
            {title}
          </h1>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const BulletCard: React.FC<{
  text: string
  index: number
  brandColor: string
  media?: MediaItem
  durationFrames: number
}> = ({ text, index, brandColor, media, durationFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  return (
    <AbsoluteFill>
      <Backdrop media={media} durationFrames={durationFrames} />
      <AbsoluteFill
        style={{ padding: 80, justifyContent: 'center', alignItems: 'flex-start' }}
      >
        <div
          style={{
            opacity: pop,
            transform: `translateX(${(1 - pop) * -60}px)`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 32,
            maxWidth: 920,
          }}
        >
          <div
            style={{
              minWidth: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: brandColor,
              color: '#fff',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 40,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {index + 1}
          </div>
          <p
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 64,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.2,
              letterSpacing: -1,
              textShadow: '0 4px 16px rgba(0,0,0,0.7)',
            }}
          >
            {text}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const CTACard: React.FC<{ cta: string; brandColor: string }> = ({
  cta,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 140 } })
  return (
    <AbsoluteFill
      style={{
        backgroundColor: brandColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          opacity: pop,
          transform: `scale(${0.8 + pop * 0.2})`,
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 120,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -3,
          }}
        >
          {cta}
        </h2>
      </div>
    </AbsoluteFill>
  )
}

// ── Main composition ────────────────────────────────────────────────────────

export const TopicExplainer: React.FC<VideoProps> = ({
  title,
  content,
  images,
  brandColor,
  audioUrl,
  cta,
  beats,
  captions,
  mediaItems,
}) => {
  const { fps, durationInFrames } = useVideoConfig()
  const timings = deriveBeatTimings(beats, captions, fps, durationInFrames)

  // Build a unified media pool: prefer typed mediaItems (videos+images),
  // fallback to legacy images-only prop.
  const pool: MediaItem[] =
    mediaItems && mediaItems.length
      ? mediaItems
      : images.map((url) => ({ type: 'image' as const, url }))

  // Bullet text source: prefer beats[].onScreen (kinetic chyrons), fallback to
  // legacy `content` array.
  const bulletTexts = beats?.points.map((p) => p.onScreen) ?? content
  const titleText = beats?.hook.onScreen ?? title
  const ctaText = beats?.cta.onScreen ?? cta

  // Compute per-segment durations. With beat timings, each segment's frames
  // come from whisper-derived spans, snapping cuts to actual narration. Without
  // timings, fall back to fixed frame counts.
  const titleFrames = timings
    ? Math.max(15, timings.hook.endFrame - timings.hook.startFrame)
    : TITLE_FRAMES
  const bulletFrames = bulletTexts.map((_, i) => {
    if (timings && timings.points[i]) {
      const t = timings.points[i]!
      return Math.max(20, t.endFrame - t.startFrame)
    }
    return BULLET_FRAMES
  })
  const ctaFrames = timings
    ? Math.max(30, timings.cta.endFrame - timings.cta.startFrame + PAD_FRAMES)
    : CTA_FRAMES

  let cursor = 0
  const titleStart = cursor
  cursor += titleFrames
  const bulletStarts: number[] = []
  for (const f of bulletFrames) {
    bulletStarts.push(cursor)
    cursor += f
  }
  const ctaStart = cursor

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={titleStart} durationInFrames={titleFrames}>
        <TitleCard
          title={titleText}
          brandColor={brandColor}
          media={pool[0]}
          durationFrames={titleFrames}
        />
      </Sequence>

      {bulletTexts.map((text, i) => (
        <Sequence
          key={i}
          from={bulletStarts[i]!}
          durationInFrames={bulletFrames[i]!}
        >
          <BulletCard
            text={text}
            index={i}
            brandColor={brandColor}
            media={pool[(i + 1) % Math.max(1, pool.length)]}
            durationFrames={bulletFrames[i]!}
          />
        </Sequence>
      ))}

      <Sequence from={ctaStart} durationInFrames={ctaFrames}>
        <CTACard cta={ctaText} brandColor={brandColor} />
      </Sequence>

      {audioUrl ? (
        <Sequence from={0}>
          <Audio src={audioUrl} volume={1} />
        </Sequence>
      ) : null}

      <VideoChrome brandColor={brandColor} />
      <Captions captions={captions} brandColor={brandColor} />
    </AbsoluteFill>
  )
}

export const calculateTopicExplainerMetadata = ({
  props,
}: {
  props: VideoProps
}) => {
  const fps = FPS
  // If captions are present, total duration = last caption end + CTA pad.
  if (props.captions?.length) {
    const last = props.captions[props.captions.length - 1]!
    return {
      durationInFrames: Math.ceil(last.end * fps) + CTA_FRAMES + PAD_FRAMES,
      fps,
      width: 1080,
      height: 1920,
    }
  }
  // Fallback: estimate from beats word count or legacy bullets.
  const points = props.beats?.points.length ?? Math.min(props.content.length, 4)
  const total = TITLE_FRAMES + points * BULLET_FRAMES + CTA_FRAMES
  return {
    durationInFrames: Math.max(total, fps * 12),
    fps,
    width: 1080,
    height: 1920,
  }
}
