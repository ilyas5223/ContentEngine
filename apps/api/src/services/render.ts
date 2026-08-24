// Remotion render layer. Extracted from video.worker.ts so the BullMQ worker
// and the standalone CLI (src/cli/render.ts) share one bundle cache and one
// long-lived browser instance.

import path from 'path'
import { bundle } from '@remotion/bundler'
import {
  selectComposition,
  renderMedia,
  ensureBrowser,
  openBrowser,
} from '@remotion/renderer'
import type { VideoTemplate } from './queue'

type HeadlessBrowser = Awaited<ReturnType<typeof openBrowser>>

const RENDER_TIMEOUT_MS = 90_000

// ---------------------------------------------------------------------------
// Bundle cache (per process)
// ---------------------------------------------------------------------------

let cachedServeUrl: string | null = null

export async function getServeUrl(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl
  // Resolve from apps/api/src/services to apps/video/src/index.ts.
  // Works for tsx dev (src/) and compiled dist/ (dist/services/).
  const entry = path.resolve(__dirname, '../../../video/src/index.ts')
  console.log('[render] bundling Remotion entry:', entry)
  cachedServeUrl = await bundle({
    entryPoint: entry,
    webpackOverride: (config) => config,
  })
  return cachedServeUrl
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

// Reuse a single browser instance across renders — Remotion's per-render
// browser launch has a hardcoded 25s connect timeout that Windows + Chromium
// cold starts routinely blow past. Pay the launch cost once.
let sharedBrowser: HeadlessBrowser | null = null

export async function getBrowser(): Promise<HeadlessBrowser> {
  if (sharedBrowser) return sharedBrowser
  // chrome-for-testing is an isolated Chrome install Remotion manages itself.
  // Avoids the singleton-profile lock that empty-stderr-kills a system Chrome
  // launch when the user already has Chrome open.
  sharedBrowser = await openBrowser('chrome', { chromeMode: 'chrome-for-testing' })
  return sharedBrowser
}

/** Download Chrome if needed, build the bundle, and launch the browser. */
export async function warmupRenderer(): Promise<void> {
  await ensureBrowser({ chromeMode: 'chrome-for-testing' })
  await getServeUrl()
  await getBrowser()
}

export async function closeRenderer(): Promise<void> {
  if (!sharedBrowser) return
  try {
    await sharedBrowser.close({ silent: true })
  } catch {}
  sharedBrowser = null
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface RenderVideoOptions {
  template: VideoTemplate
  inputProps: Record<string, unknown>
  /** Absolute path of the .mp4 to write. */
  outputPath: string
  /** 0..1 render progress. */
  onProgress?: (progress: number) => void
}

export async function renderVideo(opts: RenderVideoOptions): Promise<string> {
  const { template, inputProps, outputPath, onProgress } = opts
  const serveUrl = await getServeUrl()
  const browser = await getBrowser()

  const composition = await selectComposition({
    serveUrl,
    id: template,
    inputProps,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    puppeteerInstance: browser,
  })

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    puppeteerInstance: browser,
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
  })

  return outputPath
}
