import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion'
import {
  TransitionSeries,
  linearTiming,
} from '@remotion/transitions'
import { wipe } from '@remotion/transitions/wipe'
import type { VideoProps } from '../shared/schema'

const FPS = 30
const HOOK_FRAMES = 75
const CONTENT_FRAMES = 135
const CTA_FRAMES = 60
const TRANSITION_FRAMES = 12

const HookCard: React.FC<{ title: string; brandColor: string }> = ({
  title,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const scale = interpolate(frame, [0, 25], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  })
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

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
          opacity,
          transform: `scale(${scale})`,
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

const ContentCard: React.FC<{
  lines: string[]
  brandColor: string
}> = ({ lines, brandColor }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#fff',
        padding: 96,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 900 }}>
        {lines.slice(0, 3).map((line, i) => {
          const start = i * 20
          const opacity = interpolate(frame, [start, start + 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })
          const y = interpolate(frame, [start, start + 25], [30, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })
          return (
            <div
              key={i}
              style={{
                opacity,
                transform: `translateY(${y}px)`,
                marginBottom: 40,
                borderLeft: `8px solid ${brandColor}`,
                paddingLeft: 32,
              }}
            >
              <p
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#0b0b0f',
                  lineHeight: 1.3,
                }}
              >
                {line}
              </p>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

const CTACard: React.FC<{ cta: string; brandColor: string }> = ({
  cta,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill
      style={{
        backgroundColor: brandColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity, textAlign: 'center' }}>
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
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={HOOK_FRAMES}>
          <HookCard title={title} brandColor={brandColor} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-left' })}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />

        <TransitionSeries.Sequence durationInFrames={CONTENT_FRAMES}>
          <ContentCard lines={content} brandColor={brandColor} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-right' })}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />

        <TransitionSeries.Sequence durationInFrames={CTA_FRAMES}>
          <CTACard cta={cta} brandColor={brandColor} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {audioUrl ? (
        <Sequence from={0}>
          <Audio src={audioUrl} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}

export const calculateQuickTipMetadata = () => {
  const total =
    HOOK_FRAMES + CONTENT_FRAMES + CTA_FRAMES - TRANSITION_FRAMES * 2
  return {
    durationInFrames: total,
    fps: FPS,
    width: 1080,
    height: 1920,
  }
}
