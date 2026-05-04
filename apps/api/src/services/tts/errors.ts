// Thrown when a provider isn't configured (missing API key, missing binary).
// The cascade in index.ts uses this to silently fall through to the next
// provider; any other error is logged.
export class TtsUnavailableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'TtsUnavailableError'
  }
}
