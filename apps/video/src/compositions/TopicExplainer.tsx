import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion'
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import type { VideoProps } from '../shared/schema'

const FPS = 30
const TITLE_FRAMES = 90
const BULLET_FRAMES = 120
const IMAGE_FRAMES = 120
const CTA_FRAMES = 90
const TRANSITION_FRAMES = 15

const TitleCard: React.FC<{ title: string; brandColor: string }> = ({
  title,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })
  const translateY = interpolate(frame, [0, 30], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
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
          transform: `translateY(${translateY}px)`,
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
          }}
        >
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  )
}

const BulletCard: React.FC<{
  bullets: string[]
  brandColor: string
}> = ({ bullets, brandColor }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#111118',
        padding: 80,
        justifyContent: 'center',
      }}
    >
      {bullets.slice(0, 3).map((text, i) => {
        const start = i * 25
        const opacity = interpolate(frame, [start, start + 20], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })
        const x = interpolate(frame, [start, start + 25], [-60, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })
        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateX(${x}px)`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 32,
              marginBottom: 48,
            }}
          >
            <div
              style={{
                minWidth: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: brandColor,
                color: '#fff',
                fontFamily: 'system-ui, sans-serif',
                fontSize: 32,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </div>
            <p
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 56,
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.3,
                flex: 1,
              }}
            >
              {text}
            </p>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

const ImageCard: React.FC<{ src: string; caption: string }> = ({
  src,
  caption,
}) => {
  const frame = useCurrentFrame()
  const scale = interpolate(frame, [0, IMAGE_FRAMES], [1.05, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 50%)',
          justifyContent: 'flex-end',
          padding: 80,
        }}
      >
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 52,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.3,
          }}
        >
          {caption}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const CTACard: React.FC<{ cta: string; brandColor: string }> = ({
  cta,
  brandColor,
}) => {
  const frame = useCurrentFrame()
  const scale = interpolate(frame, [0, 30], [0.8, 1], {
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
        backgroundColor: brandColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
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

export const TopicExplainer: React.FC<VideoProps> = ({
  title,
  content,
  images,
  brandColor,
  audioUrl,
  cta,
}) => {
  const hasImages = images.length > 0
  const imgBullets = content.slice(0, Math.min(images.length, 3))

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={TITLE_FRAMES}>
          <TitleCard title={title} brandColor={brandColor} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />

        <TransitionSeries.Sequence durationInFrames={BULLET_FRAMES}>
          <BulletCard bullets={content} brandColor={brandColor} />
        </TransitionSeries.Sequence>

        {hasImages &&
          imgBullets.map((caption, i) => (
            <React.Fragment key={i}>
              <TransitionSeries.Transition
                presentation={slide({ direction: 'from-right' })}
                timing={springTiming({
                  config: { damping: 200 },
                  durationInFrames: 20,
                })}
              />
              <TransitionSeries.Sequence durationInFrames={IMAGE_FRAMES}>
                <ImageCard src={images[i]!} caption={caption} />
              </TransitionSeries.Sequence>
            </React.Fragment>
          ))}

        <TransitionSeries.Transition
          presentation={fade()}
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

export const calculateTopicExplainerMetadata = ({
  props,
}: {
  props: VideoProps
}) => {
  const imgCount = Math.min(props.images.length, 3)
  const total =
    TITLE_FRAMES +
    BULLET_FRAMES +
    imgCount * IMAGE_FRAMES +
    CTA_FRAMES -
    TRANSITION_FRAMES * (2 + imgCount)
  return {
    durationInFrames: Math.max(total, FPS * 10),
    fps: FPS,
    width: 1080,
    height: 1920,
  }
}
