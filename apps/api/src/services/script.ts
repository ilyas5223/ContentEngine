// Script generation for short-form vertical video.
//
// Extracted from video.worker.ts so both the BullMQ worker and the standalone
// CLI (src/cli/render.ts) drive the same prompt, validator, and retry loop.

import { generateText } from '../lib/llm'
import type { VideoTemplate } from './queue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Beat {
  narration: string
  onScreen: string
}

export interface Beats {
  hook: Beat
  points: Beat[]
  payoff: Beat
  cta: Beat
}

export interface VideoScript {
  title: string
  narration: string
  bullets: string[]
  keywords: string[]
  cta: string
  beats: Beats
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : text.trim()
}

// appear in narration. Add new offenders here as they surface in renders.
const BANNED_TOKENS = [
  'delve', 'leverage', 'fast-paced world', 'moreover', 'furthermore',
  'unlock', 'harness', 'embark', 'realm', 'tapestry', 'elevate', 'seamless',
  "let's dive in", 'in this video', 'have you ever wondered', 'today we',
]

const POINT_COUNT: Record<VideoTemplate, [number, number]> = {
  TopicExplainer: [3, 4],
  TwitterThread: [4, 6],
  QuickTip: [2, 3],
}

const STYLE_HINT: Record<VideoTemplate, string> = {
  TopicExplainer: 'Format: 45–60s explainer. Energetic but informative.',
  TwitterThread: 'Format: 30s thread. Each point is one tweet — punchy, contrarian, conversational.',
  QuickTip: 'Format: 20s quick tip. Brutally concise; every word earns its spot.',
}

const SYSTEM_PROMPT = `You write short-form vertical video scripts for TikTok / Reels / Shorts.

HARD RULES:
- Open with a pattern interrupt: a question, a contrarian claim, or a specific number/stat. Never "Today...", "In this video...", "Have you ever wondered...", "Let's dive in...".
- Spoken-word voice: contractions, second person ("you"), concrete nouns. Sentences ≤14 words.
- BANNED words/phrases (do not use any form): delve, leverage, fast-paced world, moreover, furthermore, unlock, harness, embark, realm, tapestry, elevate, seamless.
- "onScreen" text is NOT a transcript of the spoken "narration" — it's a kinetic-typography fragment. 2–5 words. Should feel like a punchy chyron, not a subtitle.
- Output STRICT JSON only. No markdown, no preamble.

OUTPUT SCHEMA:
{
  "beats": {
    "hook":   { "narration": "≤14 words, opens the video",       "onScreen": "2–5 word chyron" },
    "points": [ { "narration": "≤18 words", "onScreen": "2–5 words" }, ... ],
    "payoff": { "narration": "≤14 words, the 'so what'",         "onScreen": "2–5 words" },
    "cta":    { "narration": "≤8 words",                         "onScreen": "2–4 words" }
  },
  "keywords": ["3 to 5 single search terms for portrait stock footage"]
}

EXAMPLE (QuickTip — "morning routine"):
{
  "beats": {
    "hook":   { "narration": "Your 5am morning routine is making you worse at your job.", "onScreen": "5AM is a trap" },
    "points": [
      { "narration": "Sleep researchers tracked 1,200 people. Early risers lost 40 minutes of deep sleep.",   "onScreen": "−40 min deep sleep" },
      { "narration": "Deep sleep is when your brain consolidates skills. You're trading expertise for vibes.", "onScreen": "Sleep > grindset" },
      { "narration": "Wake up when YOUR body says to. Then attack the day.",                                  "onScreen": "Listen to your body" }
    ],
    "payoff": { "narration": "Discipline isn't a wakeup time. It's matching effort to biology.",              "onScreen": "Match effort to biology" },
    "cta":    { "narration": "Follow for more sleep science.",                                                "onScreen": "Follow for more" }
  },
  "keywords": ["alarm clock", "tired commuter", "office worker", "bedroom morning", "coffee"]
}

EXAMPLE (TwitterThread — "indie hacker pricing"):
{
  "beats": {
    "hook":   { "narration": "Most indie SaaS dies because the founder priced it like a side project.", "onScreen": "Pricing kills indie SaaS" },
    "points": [
      { "narration": "$9/mo means you need 1,000 paying users to make rent. You won't get there.", "onScreen": "$9 = 1000 users" },
      { "narration": "Charge businesses, not consumers. Same product, 10x the willingness to pay.", "onScreen": "B2B pays 10x" },
      { "narration": "Triple your price tomorrow. The customers you lose weren't customers anyway.", "onScreen": "3x your price" },
      { "narration": "Your job is solving expensive problems, not winning a race to zero.",         "onScreen": "Solve expensive problems" }
    ],
    "payoff": { "narration": "Cheap pricing isn't humble. It's a statement that your work isn't worth much.", "onScreen": "Cheap = self-doubt" },
    "cta":    { "narration": "Follow for indie hacker reality checks.",                                       "onScreen": "Follow for more" }
  },
  "keywords": ["laptop coding", "startup office", "money cash", "graph chart", "coffee shop work"]
}`

function buildScriptPrompt(topic: string, summary: string, template: VideoTemplate): string {
  const [pmin, pmax] = POINT_COUNT[template]
  return [
    `TOPIC: ${topic}`,
    summary ? `RESEARCH NOTES: ${summary}` : '',
    STYLE_HINT[template],
    `Use ${pmin}–${pmax} points.`,
    `Return JSON only.`,
  ].filter(Boolean).join('\n\n')
}

function findBannedToken(text: string): string | null {
  const lower = text.toLowerCase()
  for (const tok of BANNED_TOKENS) {
    if (lower.includes(tok)) return tok
  }
  return null
}

// Reject if onScreen is just a substring/transcript of narration. We measure
// shared-token ratio rather than equality — a chyron should be a different
// phrasing of the same idea, not a copy.
function tooSimilar(narration: string, onScreen: string): boolean {
  const tokens = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2))
  const a = tokens(narration)
  const b = tokens(onScreen)
  if (b.size === 0) return false
  // Short labels (1-3 meaningful tokens) are expected to echo narration keywords.
  if (b.size < 4) return false
  let shared = 0
  for (const w of b) if (a.has(w)) shared++
  return shared / b.size >= 0.85
}

function validateBeats(beats: Beats, template: VideoTemplate): string | null {
  if (!beats?.hook || !beats?.points?.length || !beats?.payoff || !beats?.cta) {
    return 'missing required beats (hook/points/payoff/cta)'
  }
  const [pmin, pmax] = POINT_COUNT[template]
  if (beats.points.length < pmin || beats.points.length > pmax) {
    return `points count ${beats.points.length} outside [${pmin}, ${pmax}]`
  }
  const allBeats: Beat[] = [beats.hook, ...beats.points, beats.payoff, beats.cta]
  for (const b of allBeats) {
    if (!b?.narration || !b?.onScreen) return 'beat missing narration or onScreen'
    const banned = findBannedToken(b.narration) ?? findBannedToken(b.onScreen)
    if (banned) return `banned token "${banned}"`
    if (tooSimilar(b.narration, b.onScreen)) {
      return `onScreen too similar to narration: "${b.onScreen}"`
    }
  }
  return null
}

function flattenNarration(beats: Beats): string {
  return [beats.hook, ...beats.points, beats.payoff, beats.cta]
    .map((b) => b.narration.trim())
    .join(' ')
}

function deriveLegacyFields(beats: Beats): {
  title: string
  narration: string
  bullets: string[]
  cta: string
} {
  return {
    title: beats.hook.onScreen.slice(0, 60),
    narration: flattenNarration(beats),
    bullets: beats.points.map((p) => p.onScreen.slice(0, 80)),
    cta: beats.cta.onScreen.slice(0, 30),
  }
}

export async function generateVideoScript(
  topic: string,
  summary: string,
  template: VideoTemplate,
): Promise<VideoScript> {
  const userPrompt = buildScriptPrompt(topic, summary, template)
  let lastError = ''

  // 1 initial + 2 retries. After that we throw — caller marks the job failed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await generateText(userPrompt, {
      system: SYSTEM_PROMPT,
      temperature: 0.8,
      jsonMode: true,
    })
    let parsed: { beats?: Beats; keywords?: string[] }
    try {
      parsed = JSON.parse(extractJSON(raw))
    } catch (err) {
      lastError = `JSON parse failed: ${err instanceof Error ? err.message : err}`
      console.warn(`[script] attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    const beats = parsed.beats
    if (!beats) {
      lastError = 'response missing "beats"'
      console.warn(`[script] attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    const issue = validateBeats(beats, template)
    if (issue) {
      lastError = issue
      console.warn(`[script] attempt ${attempt + 1}: ${issue} — retrying`)
      continue
    }
    const keywords = (parsed.keywords ?? []).filter((k) => typeof k === 'string' && k.trim()).slice(0, 5)
    if (keywords.length === 0) {
      lastError = 'no keywords returned'
      console.warn(`[script] attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    return { ...deriveLegacyFields(beats), keywords, beats }
  }
  throw new Error(`generateVideoScript exhausted retries: ${lastError}`)
}
