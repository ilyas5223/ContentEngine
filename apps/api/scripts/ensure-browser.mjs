// Downloads the Chrome build Remotion renders with, so the image ships with it
// rather than fetching one on the first render.
//
// chromeMode must stay in sync with services/render.ts — asking for a
// different mode here just means the container downloads a second browser at
// runtime, silently undoing the point of baking one in.

import { ensureBrowser } from '@remotion/renderer'

const CHROME_MODE = 'chrome-for-testing'

try {
  await ensureBrowser({ chromeMode: CHROME_MODE })
  console.log(`${CHROME_MODE} ready`)
} catch (err) {
  console.error(`ensure-browser failed: ${err?.message ?? err}`)
  process.exit(1)
}
