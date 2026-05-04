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
import { slide } from '@remotion/transitions/slide'
import type { VideoProps } from '../shared/schema'

const FPS = 30
const TWEET_FRAMES = 120
const TRANSITION_FRAMES = 15

const TweetCard: React.FC<{
  text: string
  index: number
  total: number
  author: string
  brandColor: string
}> = ({ text, index, total, author, brandColor }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#15151b',
        padding: 80,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          opacity,
          width: '100%',
          maxWidth: 900,
          backgroundColor: '#1e1e26',
          borderRadius: 32,
          padding: 56,
          border: '2px solid #2a2a35',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: brandColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            {author.charAt(0).toUpperCase()}
          </div>
          <div>
            <p
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 32,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {author}
            </p>
            <p
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 26,
                color: '#8a8a95',
              }}
            >
              {index + 1}/{total}
            </p>
          </div>
        </div>
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 44,
            fontWeight: 500,
            color: '#fff',
            lineHeight: 1.4,
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  )
}

const BrandBar: React.FC<{ brandColor: string; title: string }> = ({
  brandColor,
  title,
}) => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: brandColor,
          padding: '32px 80px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: -0.5,
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          ▶ thread
        </p>
      </div>
    </AbsoluteFill>
  )
}

export const TwitterThread: React.FC<VideoProps> = ({
  title,
  content,
  brandColor,
  audioUrl,
}) => {
  const tweets = content.length > 0 ? content : [title]
  const author = title.length > 24 ? title.slice(0, 24) + '…' : title

  return (
    <AbsoluteFill style={{ backgroundColor: '#15151b' }}>
      <TransitionSeries>
        {tweets.map((tweet, i) => (
          <React.Fragment key={i}>
            {i > 0 ? (
              <TransitionSeries.Transition
                presentation={slide({ direction: 'from-bottom' })}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />
            ) : null}
            <TransitionSeries.Sequence durationInFrames={TWEET_FRAMES}>
              <TweetCard
                text={tweet}
                index={i}
                total={tweets.length}
                author={author}
                brandColor={brandColor}
              />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>

      <BrandBar brandColor={brandColor} title={title} />

      {audioUrl ? (
        <Sequence from={0}>
          <Audio src={audioUrl} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}

export const calculateTwitterThreadMetadata = ({
  props,
}: {
  props: VideoProps
}) => {
  const tweets = props.content.length > 0 ? props.content.length : 1
  const total = tweets * TWEET_FRAMES - (tweets - 1) * TRANSITION_FRAMES
  return {
    durationInFrames: Math.max(total, FPS * 10),
    fps: FPS,
    width: 1080,
    height: 1920,
  }
}
