// OpenRouter-backed LLM helper. Free models have low per-minute quotas and
// occasionally 429/402, so we walk a fallback list before giving up.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Curated fallback list of free models on OpenRouter, ordered roughly by
// capability. Free model availability changes fast — verified 2026-08-23.
// Refresh from
// https://openrouter.ai/api/v1/models (filter id.endsWith(':free')) if these
// start 404'ing.
const DEFAULT_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-9b-v2:free',
]

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message: string; code?: number }
}

export interface GenerateTextOptions {
  temperature?: number
  // When true, requests JSON-mode from the provider. Not all OpenRouter
  // models honor this — callers must still validate the parsed structure.
  jsonMode?: boolean
  system?: string
}

export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const models = process.env.OPENROUTER_MODELS
    ? process.env.OPENROUTER_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MODELS

  const messages: Array<{ role: string; content: string }> = []
  if (options.system) messages.push({ role: 'system', content: options.system })
  messages.push({ role: 'user', content: prompt })

  let lastError: unknown
  for (const model of models) {
    try {
      const body: Record<string, unknown> = { model, messages }
      if (options.temperature !== undefined) body.temperature = options.temperature
      if (options.jsonMode) body.response_format = { type: 'json_object' }

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL ?? 'http://localhost:3000',
          'X-Title': 'ContentEngine',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        // 429 = rate-limited, 402 = free credits exhausted, 404 = model retired
        if (res.status === 429 || res.status === 402 || res.status === 404) {
          console.warn(`[llm] ${model} unavailable (${res.status}), trying next`)
          lastError = new Error(`${model} ${res.status}: ${errText}`)
          continue
        }
        throw new Error(`OpenRouter ${res.status}: ${errText}`)
      }

      const data = (await res.json()) as OpenRouterResponse
      if (data.error) throw new Error(data.error.message)
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new Error('Empty response from OpenRouter')
      return text
    } catch (err) {
      lastError = err
      console.warn(`[llm] ${model} failed:`, err instanceof Error ? err.message : err)
    }
  }
  throw new Error(
    `All OpenRouter models failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}
