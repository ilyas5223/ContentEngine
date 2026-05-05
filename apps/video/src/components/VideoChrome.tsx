import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'

// Lightweight chrome layer: SVG film grain (~6% opacity) + a 2px progress
// bar pinned to the bottom edge. Mounted once at the root of every
// composition above the content but below captions.
//
// Grain is inline SVG (feTurbulence) instead of @remotion/noise so we don't
// add another dep to the video bundle. Same visual cost.

const GRAIN_DATA_URI =
  "url(\"data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>` +
      `<filter id='n'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
      `<feColorMatrix type='saturate' values='0'/>` +
      `</filter>` +
      `<rect width='100%' height='100%' filter='url(#n)' opacity='0.55'/>` +
    `</svg>`,
  ) + "\")"

export const VideoChrome: React.FC<{ brandColor?: string }> = ({
  brandColor = '#6366f1',
}) => {
  const frame = useCurrentFrame()
  const { durationInFrames, width } = useVideoConfig()
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)))

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_DATA_URI,
          backgroundSize: '240px 240px',
          opacity: 0.06,
          mixBlendMode: 'overlay',
        }}
      />
      <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
        <div
          style={{
            width: '100%',
            height: 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            style={{
              width: progress * width,
              height: '100%',
              backgroundColor: brandColor,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
