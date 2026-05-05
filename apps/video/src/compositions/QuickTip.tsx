import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import type { VideoProps } from '../shared/schema'
import { Captions } from '../components/Captions'
import { VideoChrome } from '../components/VideoChrome'
import { deriveBeatTimings } from '../shared/beatTimings'

const FPS = 30
// Halved from Phase A. Quick tips need to feel snappy.
const HOOK_FRAMES = 38
const POINT_FRAMES = 50
const CTA_FRAMES = 30
const PAD_FRAMES = 20

const HookCard: React.FC<{ title: string; brandColor: string }> = ({
  title,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b0b0f',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          opacity: pop,
          transform: `scale(${0.85 + pop * 0.15})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '16px 40px',
            backgroundColor: brandColor,
            borderRadius: 48,
            marginBottom: 48,
          }}
        >
          <p
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 36,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: 1,
            }}
          >
            QUICK TIP
          </p>
        </div>
        <h1
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 120,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.05,
            letterSpacing: -3,
          }}
        >
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  )
}

const PointCard: React.FC<{
  text: string
  index: number
  brandColor: string
}> = ({ text, index, brandColor }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#fff',
        padding: 96,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          opacity: pop,
          transform: `translateY(${(1 - pop) * 40}px)`,
          width: '100%',
          maxWidth: 900,
          borderLeft: `8px solid ${brandColor}`,
          paddingLeft: 32,
        }}
      >
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 40,
            fontWeight: 700,
            color: brandColor,
            marginBottom: 16,
            letterSpacing: 2,
          }}
        >
          STEP {index + 1}
        </p>
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 64,
            fontWeight: 800,
            color: '#0b0b0f',
            lineHeight: 1.2,
            letterSpacing: -1,
          }}
        >
          {text}
        </p>
      </div>
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
      <div style={{ opacity: pop, transform: `scale(${0.85 + pop * 0.15})`, textAlign: 'center' }}>
        <h2
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 110,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -2,
          }}
        >
          {cta}
        </h2>
      </div>
    </AbsoluteFill>
  )
}

export const QuickTip: React.FC<VideoProps> = ({
  title,
  content,
  brandColor,
  cta,
  audioUrl,
  beats,
  captions,
}) => {
  const { fps, durationInFrames } = useVideoConfig()
  const timings = deriveBeatTimings(beats, captions, fps, durationInFrames)

  const hookText = beats?.hook.onScreen ?? title
  const points = beats?.points.map((p) => p.onScreen) ?? content
  const ctaText = beats?.cta.onScreen ?? cta

  const hookFrames = timings
    ? Math.max(20, timings.hook.endFrame - timings.hook.startFrame)
    : HOOK_FRAMES
  const pointFrames = points.map((_, i) => {
    if (timings && timings.points[i]) {
      const t = timings.points[i]!
      return Math.max(20, t.endFrame - t.startFrame)
    }
    return POINT_FRAMES
  })
  const ctaFrames = timings
    ? Math.max(25, timings.cta.endFrame - timings.cta.startFrame + PAD_FRAMES)
    : CTA_FRAMES

  let cursor = 0
  const hookStart = cursor
  cursor += hookFrames
  const pointStarts: number[] = []
  for (const f of pointFrames) {
    pointStarts.push(cursor)
    cursor += f
  }
  const ctaStart = cursor

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={hookStart} durationInFrames={hookFrames}>
        <HookCard title={hookText} brandColor={brandColor} />
      </Sequence>

      {points.map((text, i) => (
        <Sequence
          key={i}
          from={pointStarts[i]!}
          durationInFrames={pointFrames[i]!}
        >
          <PointCard text={text} index={i} brandColor={brandColor} />
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

export const calculateQuickTipMetadata = ({ props }: { props: VideoProps }) => {
  const fps = FPS
  if (props.captions?.length) {
    const last = props.captions[props.captions.length - 1]!
    return {
      durationInFrames: Math.ceil(last.end * fps) + CTA_FRAMES + PAD_FRAMES,
      fps,
      width: 1080,
      height: 1920,
    }
  }
  const pts = props.beats?.points.length ?? Math.min(props.content.length, 3)
  const total = HOOK_FRAMES + pts * POINT_FRAMES + CTA_FRAMES
  return {
    durationInFrames: Math.max(total, fps * 8),
    fps,
    width: 1080,
    height: 1920,
  }
}
