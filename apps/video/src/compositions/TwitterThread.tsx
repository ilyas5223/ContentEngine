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
// Halved from Phase A: thread tweets used to hold 4s; now ~2s feels alive.
const TWEET_FRAMES = 60
const PAD_FRAMES = 20

const TweetCard: React.FC<{
  text: string
  index: number
  total: number
  author: string
  brandColor: string
}> = ({ text, index, total, author, brandColor }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })

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
          opacity: pop,
          transform: `translateY(${(1 - pop) * 60}px) scale(${0.94 + pop * 0.06})`,
          width: '100%',
          maxWidth: 900,
          backgroundColor: '#1e1e26',
          borderRadius: 32,
          padding: 56,
          border: '2px solid #2a2a35',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
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
  beats,
  captions,
}) => {
  const { fps, durationInFrames } = useVideoConfig()
  const timings = deriveBeatTimings(beats, captions, fps, durationInFrames)

  // Hook + points + payoff each become their own tweet card. CTA stays as the
  // final card via legacy bar.
  const tweetTexts = beats
    ? [
        beats.hook.narration,
        ...beats.points.map((p) => p.narration),
        beats.payoff.narration,
      ]
    : content.length > 0
    ? content
    : [title]

  const author = title.length > 24 ? title.slice(0, 24) + '…' : title

  // Per-tweet duration: snap to beat span if available, else fixed.
  const beatSpans: { start: number; end: number }[] = timings
    ? [
        { start: timings.hook.startFrame, end: timings.hook.endFrame },
        ...timings.points.map((p) => ({ start: p.startFrame, end: p.endFrame })),
        { start: timings.payoff.startFrame, end: timings.payoff.endFrame },
      ]
    : []

  const tweetFrames = tweetTexts.map((_, i) => {
    if (beatSpans[i]) return Math.max(30, beatSpans[i]!.end - beatSpans[i]!.start)
    return TWEET_FRAMES
  })

  let cursor = 0
  const tweetStarts: number[] = []
  for (const f of tweetFrames) {
    tweetStarts.push(cursor)
    cursor += f
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#15151b' }}>
      {tweetTexts.map((tweet, i) => (
        <Sequence
          key={i}
          from={tweetStarts[i]!}
          durationInFrames={tweetFrames[i]!}
        >
          <TweetCard
            text={tweet}
            index={i}
            total={tweetTexts.length}
            author={author}
            brandColor={brandColor}
          />
        </Sequence>
      ))}

      <BrandBar brandColor={brandColor} title={title} />

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

export const calculateTwitterThreadMetadata = ({
  props,
}: {
  props: VideoProps
}) => {
  const fps = FPS
  if (props.captions?.length) {
    const last = props.captions[props.captions.length - 1]!
    return {
      durationInFrames: Math.ceil(last.end * fps) + PAD_FRAMES,
      fps,
      width: 1080,
      height: 1920,
    }
  }
  const tweets = props.beats
    ? props.beats.points.length + 2
    : Math.max(1, props.content.length)
  const total = tweets * TWEET_FRAMES
  return {
    durationInFrames: Math.max(total, fps * 10),
    fps,
    width: 1080,
    height: 1920,
  }
}
