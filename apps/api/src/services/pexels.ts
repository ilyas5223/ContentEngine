// Pexels stock-footage lookup. Extracted from video.worker.ts so the worker
// and the standalone CLI share one cache and one selection policy.

interface PexelsPhoto {
  id: number
  src: {
    large2x: string
    large: string
    original: string
  }
}

interface PexelsPhotoResponse {
  photos: PexelsPhoto[]
}

interface PexelsVideoFile {
  link: string
  width: number
  height: number
  file_type: string
  quality: string
}

interface PexelsVideo {
  id: number
  duration: number
  width: number
  height: number
  video_files: PexelsVideoFile[]
}

interface PexelsVideoResponse {
  videos: PexelsVideo[]
}

export type MediaItem = { type: 'image' | 'video'; url: string; duration?: number }


// Simple in-process cache for Pexels search responses. 24h TTL; restart wipes
// it, which is fine — we just want to dodge the 200 req/hr limit during dev.
const pexelsCache = new Map<string, { at: number; value: MediaItem | null }>()
const PEXELS_TTL_MS = 24 * 60 * 60 * 1000

function cacheGet(key: string): MediaItem | null | undefined {
  const hit = pexelsCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > PEXELS_TTL_MS) {
    pexelsCache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key: string, value: MediaItem | null) {
  pexelsCache.set(key, { at: Date.now(), value })
}

// Pick the smallest portrait .mp4 ≥ 720p for fast Chromium decoding. Pexels
// returns multiple `video_files` per video; HD/SD MP4 is what OffthreadVideo
// handles best.
function pickVideoFile(video: PexelsVideo): string | null {
  const mp4s = video.video_files.filter((f) => f.file_type === 'video/mp4')
  if (!mp4s.length) return null
  const portrait = mp4s.filter((f) => f.height >= f.width)
  const candidates = (portrait.length ? portrait : mp4s)
    .filter((f) => f.height >= 720)
    .sort((a, b) => a.height - b.height)
  return (candidates[0] ?? mp4s[0]!).link
}

async function searchPexelsVideo(keyword: string, key: string): Promise<MediaItem | null> {
  const cacheKey = `v:${keyword.toLowerCase()}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search` +
        `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait&size=medium`,
      { headers: { Authorization: key } },
    )
    if (!res.ok) {
      cacheSet(cacheKey, null)
      return null
    }
    const data = (await res.json()) as PexelsVideoResponse
    const video = data.videos[0]
    if (!video) {
      cacheSet(cacheKey, null)
      return null
    }
    const url = pickVideoFile(video)
    if (!url) {
      cacheSet(cacheKey, null)
      return null
    }
    const item: MediaItem = { type: 'video', url, duration: video.duration }
    cacheSet(cacheKey, item)
    return item
  } catch (err) {
    console.warn(`[pexels] video search failed for "${keyword}":`, err)
    return null
  }
}

async function searchPexelsImage(keyword: string, key: string): Promise<MediaItem | null> {
  const cacheKey = `i:${keyword.toLowerCase()}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search` +
        `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait&size=large`,
      { headers: { Authorization: key } },
    )
    if (!res.ok) {
      cacheSet(cacheKey, null)
      return null
    }
    const data = (await res.json()) as PexelsPhotoResponse
    const photo = data.photos[0]
    if (!photo) {
      cacheSet(cacheKey, null)
      return null
    }
    const url = photo.src.large2x ?? photo.src.large ?? photo.src.original
    const item: MediaItem = { type: 'image', url }
    cacheSet(cacheKey, item)
    return item
  } catch (err) {
    console.warn(`[pexels] image search failed for "${keyword}":`, err)
    return null
  }
}

// Prefer videos (Pexels Videos API), fall back to a still image per keyword
// when no portrait video is available. Returns up to 3 typed media items.
export async function fetchPexelsMedia(keywords: string[]): Promise<MediaItem[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []
  const out: MediaItem[] = []
  for (const keyword of keywords.slice(0, 5)) {
    if (out.length >= 3) break
    const video = await searchPexelsVideo(keyword, key)
    if (video) {
      out.push(video)
      continue
    }
    const image = await searchPexelsImage(keyword, key)
    if (image) out.push(image)
  }
  return out
}
