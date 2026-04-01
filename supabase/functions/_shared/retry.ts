/**
 * Shared retry utility with exponential backoff for GHL/Bonzo API calls.
 * Retries on 429 (rate limit) and 5xx (transient server errors).
 * Respects Retry-After header when present.
 */

interface RetryOptions {
  maxRetries?: number      // Default: 3
  initialDelayMs?: number  // Default: 1000
  backoffMultiplier?: number // Default: 2
  timeoutMs?: number       // Per-request timeout, default: 15000
}

interface RetryResult {
  response: Response
  attempts: number
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  timeoutMs: 15_000,
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch with automatic retry on 429 and 5xx responses.
 * On 429, respects Retry-After header (seconds or date).
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOpts: RetryOptions = {}
): Promise<RetryResult> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOpts }
  let lastResponse: Response | undefined
  let delayMs = opts.initialDelayMs

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs)

    try {
      const resp = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)
      lastResponse = resp

      // Success or client error (4xx except 429) — don't retry
      if (resp.ok || (resp.status >= 400 && resp.status < 500 && resp.status !== 429)) {
        return { response: resp, attempts: attempt }
      }

      // 429 or 5xx — retry if we have attempts left
      if (attempt <= opts.maxRetries) {
        // Check Retry-After header for 429
        if (resp.status === 429) {
          const retryAfter = resp.headers.get('Retry-After')
          if (retryAfter) {
            const retrySeconds = parseInt(retryAfter, 10)
            if (!isNaN(retrySeconds)) {
              delayMs = retrySeconds * 1000
            } else {
              // Retry-After can be an HTTP date
              const retryDate = new Date(retryAfter).getTime()
              if (!isNaN(retryDate)) {
                delayMs = Math.max(retryDate - Date.now(), 1000)
              }
            }
          }
        }

        console.warn(`[retry] ${url} returned ${resp.status}, retrying in ${delayMs}ms (attempt ${attempt}/${opts.maxRetries + 1})`)
        await sleep(delayMs)
        delayMs = Math.min(delayMs * opts.backoffMultiplier, 30_000) // Cap at 30s
      }
    } catch (err) {
      clearTimeout(timeout)

      if ((err as Error).name === 'AbortError') {
        if (attempt <= opts.maxRetries) {
          console.warn(`[retry] ${url} timed out, retrying in ${delayMs}ms (attempt ${attempt}/${opts.maxRetries + 1})`)
          await sleep(delayMs)
          delayMs = Math.min(delayMs * opts.backoffMultiplier, 30_000)
          continue
        }
        throw new Error(`Request to ${url} timed out after ${opts.maxRetries + 1} attempts`)
      }
      throw err
    }
  }

  // All retries exhausted — return the last response
  return { response: lastResponse!, attempts: opts.maxRetries + 1 }
}
