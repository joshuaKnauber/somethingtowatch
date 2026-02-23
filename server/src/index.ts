import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') })

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamText, generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'

// ── Rate limiter (in-memory, per IP) ────────────────────────────────────────
interface RateEntry { count: number; resetAt: number }

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 20
const rateMap = new Map<string, RateEntry>()

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_WINDOW_MS
    rateMap.set(ip, { count: 1, resetAt })
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt }
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetAt: entry.resetAt }
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, e] of rateMap) if (now > e.resetAt) rateMap.delete(ip)
}, 5 * 60_000)

// ── Genre ID maps ──────────────────────────────────────────────────────────
const MOVIE_GENRE_IDS: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Fantasy: 14, Horror: 27, Mystery: 9648,
  Romance: 10749, 'Sci-Fi': 878, Thriller: 53, Family: 10751,
  History: 36, Music: 10402, War: 10752, Western: 37,
}

const TV_GENRE_IDS: Record<string, number> = {
  Action: 10759, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Fantasy: 10765, Family: 10751,
  Mystery: 9648, 'Sci-Fi': 10765, War: 10768, Western: 37,
  Romance: 10749, Horror: 27, Thriller: 53,
}

// ── TMDB helper ────────────────────────────────────────────────────────────
async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  url.searchParams.set('api_key', process.env.TMDB_API_KEY!)
  url.searchParams.set('language', 'en-US')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── App ─────────────────────────────────────────────────────────────────────
const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.use('/api/*', async (c, next) => {
  const ip = getClientIp(c.req.raw)
  const { allowed, remaining, resetAt } = checkRateLimit(ip)
  c.header('X-RateLimit-Limit', String(RATE_LIMIT))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
  if (!allowed) return c.json({ error: 'Too many requests. Please wait a minute.' }, 429)
  await next()
})

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// ── Providers ──────────────────────────────────────────────────────────────
app.get('/api/providers', async (c) => {
  if (!process.env.TMDB_API_KEY) return c.json({ error: 'TMDB not configured' }, 500)
  const region = c.req.query('region') ?? 'US'

  const [movies, tv] = await Promise.all([
    tmdbFetch('/watch/providers/movie', { watch_region: region }),
    tmdbFetch('/watch/providers/tv', { watch_region: region }),
  ])

  const map = new Map<number, Record<string, unknown>>()
  for (const p of [...(movies.results ?? []), ...(tv.results ?? [])]) {
    if (!map.has(p.provider_id)) map.set(p.provider_id, p)
  }

  const sorted = [...map.values()]
    .sort((a, b) => (a.display_priority as number) - (b.display_priority as number))
    .slice(0, 30)

  return c.json(sorted)
})

// ── Recommend ──────────────────────────────────────────────────────────────
// Streams: [SEARCHING]\n  →  [FOUND:N]\n  →  AI text
app.post('/api/recommend', async (c) => {
  if (!process.env.OPENROUTER_API_KEY) return c.json({ error: 'OpenRouter not configured' }, 500)
  if (!process.env.TMDB_API_KEY) return c.json({ error: 'TMDB not configured' }, 500)

  let body: {
    country?: string
    providerIds?: number[]
    mediaType?: 'movie' | 'tv'
    genres?: string[]
    moods?: string[]
    styles?: string[]
    description?: string
    liked?: string[]
    disliked?: string[]
  }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const {
    country = 'US',
    providerIds = [],
    mediaType = 'movie',
    genres = [],
    moods = [],
    styles = [],
    description = '',
    liked = [],
    disliked = [],
  } = body

  const genreIdMap = mediaType === 'movie' ? MOVIE_GENRE_IDS : TV_GENRE_IDS
  const selectedGenreIds = genres.flatMap((g: string) =>
    genreIdMap[g] != null ? [genreIdMap[g]] : []
  )

  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // ── Phase 1: signal search start ──────────────────────────────────
        controller.enqueue(encoder.encode('[SEARCHING]\n'))

        // ── TMDB fetch ────────────────────────────────────────────────────
        type TmdbItem = {
          id?: number
          title?: string; name?: string
          release_date?: string; first_air_date?: string
          overview?: string; vote_average?: number; poster_path?: string | null
        }

        const baseParams: Record<string, string> = {
          'vote_count.gte': '40',
          'vote_average.gte': '5.5',
        }
        if (selectedGenreIds.length > 0) {
          baseParams.with_genres = selectedGenreIds.join(',')
        }
        // watch_region alone is a no-op on TMDB — it must be paired with either
        // with_watch_providers or with_watch_monetization_types to actually filter results.
        if (providerIds.length > 0) {
          baseParams.with_watch_providers = providerIds.join('|')
          baseParams.watch_region = country
        } else {
          // No specific providers selected — filter to anything streamable in the region.
          baseParams.watch_region = country
          baseParams.with_watch_monetization_types = 'flatrate|free|ads'
        }

        // Phase 1: discover fetches (region-filtered) + description filter generation — all in parallel
        const [filterResult, disc1, disc2, disc3, disc4, disc5] = await Promise.allSettled([
          // If description provided, use a fast model to extract targeted search terms
          description.trim()
            ? generateObject({
                model: openrouter('openai/gpt-4o-mini'),
                schema: z.object({
                  searchQueries: z.array(z.string()).max(3)
                    .describe('2-3 short TMDB search queries (2-4 words each) that capture the essence of the description'),
                  similarTitles: z.array(z.string()).max(3)
                    .describe('2-3 specific well-known titles that match what is described'),
                }),
                prompt: `A user wants a ${mediaType === 'movie' ? 'movie' : 'TV show'} matching this description: "${description}"

Generate short TMDB search queries and similar well-known ${mediaType === 'movie' ? 'movie' : 'TV show'} titles.
Search queries should be 2-4 words capturing themes, tone, or style.
Similar titles should be real, recognisable ${mediaType === 'movie' ? 'films' : 'shows'}.`,
              })
            : Promise.resolve(null),
          // General discover fetches — all use baseParams which always includes watch_region
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '1' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '2' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '3' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': '150', page: '1' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': '150', page: '2' }),
        ])
        const discoverFetches = [disc1, disc2, disc3, disc4, disc5]

        // Phase 2: if filters were generated, run targeted TMDB searches
        const descriptionPool: TmdbItem[] = []
        if (filterResult?.status === 'fulfilled' && filterResult.value) {
          const { searchQueries, similarTitles } = filterResult.value.object
          console.log(`[recommend] description filters: queries=${JSON.stringify(searchQueries)} similar=${JSON.stringify(similarTitles)}`)
          const descSearches = await Promise.allSettled([
            ...searchQueries.map(q => tmdbFetch(`/search/${mediaType}`, { query: q, include_adult: 'false' })),
            ...similarTitles.map(t => tmdbFetch(`/search/${mediaType}`, { query: t, include_adult: 'false' })),
          ])
          for (const res of descSearches) {
            if (res.status === 'fulfilled') {
              descriptionPool.push(...(res.value.results ?? []) as TmdbItem[])
            }
          }
        }

        // Build the set of IDs from region-filtered discover calls.
        const discoverIds = new Set<number>()
        for (const res of discoverFetches) {
          if (res.status !== 'fulfilled') continue
          for (const item of (res.value.results ?? []) as TmdbItem[]) {
            if (item.id != null) discoverIds.add(item.id)
          }
        }

        // Description pool: only keep items that also appear in the regional discover pool.
        // /search/ has no region filter so unvalidated results must not get priority.
        const priorityDesc = discoverIds.size > 0
          ? descriptionPool.filter(item => item.id != null && discoverIds.has(item.id))
          : descriptionPool

        // Merge with deduplication — region-valid description results go first (priority)
        const seen = new Set<number>()
        const pool: TmdbItem[] = []

        for (const item of priorityDesc) {
          if (item.id == null || seen.has(item.id)) continue
          seen.add(item.id)
          pool.push(item)
        }
        const descCount = pool.length

        // Add discover results (all region-filtered)
        for (const res of discoverFetches) {
          if (res.status !== 'fulfilled') continue
          for (const item of (res.value.results ?? []) as TmdbItem[]) {
            if (item.id == null || seen.has(item.id)) continue
            seen.add(item.id)
            pool.push(item)
          }
        }

        // Shuffle only the general tail — description results stay at the front
        const tail = pool.splice(descCount)
        for (let i = tail.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[tail[i], tail[j]] = [tail[j], tail[i]]
        }
        pool.push(...tail)

        // Filter out titles the user has already seen (liked or disliked)
        const seenTitles = new Set([
          ...(liked as string[]).map((t: string) => t.toLowerCase()),
          ...(disliked as string[]).map((t: string) => t.toLowerCase()),
        ])
        const freshPool = seenTitles.size > 0
          ? pool.filter(r => !seenTitles.has((r.title ?? r.name ?? '').toLowerCase()))
          : pool

        const poolSlice = freshPool.slice(0, 30)

        // ── Phase 2: signal found count ───────────────────────────────────
        controller.enqueue(encoder.encode(`[FOUND:${pool.length}]\n`))

        console.log(`[recommend] pool: ${poolSlice.map(r => r.title ?? r.name).join(', ')}`)

        // ── Phase 3: AI picks + stream ────────────────────────────────────
        const prefsParts = [
          genres.length > 0 ? `Genres: ${genres.join(', ')}` : null,
          moods.length > 0 ? `Mood: ${moods.join(', ')}` : null,
          styles.length > 0 ? `Style: ${styles.join(', ')}` : null,
          description ? `Notes: "${description}"` : null,
          providerIds.length > 0 ? `(On selected services in ${country})` : null,
        ].filter(Boolean).join('\n')

        const feedbackParts = [
          (liked as string[]).length > 0
            ? `Titles they ENJOYED — find more like these: ${(liked as string[]).join(', ')}`
            : null,
          (disliked as string[]).length > 0
            ? `Titles they did NOT enjoy — avoid this tone/style: ${(disliked as string[]).join(', ')}`
            : null,
        ].filter(Boolean).join('\n')

        // Step 1: structured index selection — model picks by number so it cannot
        // hallucinate a title that isn't in the pool.
        const numberedList = poolSlice.map((r, i) => {
          const title = r.title ?? r.name ?? 'Unknown'
          const year = (r.release_date ?? r.first_air_date ?? '').slice(0, 4)
          const rating = r.vote_average?.toFixed(1) ?? '?'
          const overview = r.overview?.slice(0, 150) ?? ''
          return `${i}. ${title} (${year}) [${rating}★] — ${overview}`
        }).join('\n')

        const selection = await generateObject({
          model: openrouter('openai/gpt-4o-mini'),
          schema: z.object({
            picks: z.array(z.object({
              index: z.number().int().min(0).max(29).describe('index from the numbered list'),
              vibe: z.string().describe('2–4 word genre/vibe label, e.g. "Cosy British Comedy"'),
            })).min(3).max(5),
          }),
          prompt: `User wants: ${mediaType === 'movie' ? 'a movie' : 'a TV show'}
${prefsParts}${feedbackParts ? `\n\nFeedback on previous picks:\n${feedbackParts}` : ''}

Pick 3–5 titles by index that best match the preferences. Vary your choices.
${numberedList}`,
        })

        // Step 2: validate indices against the pool (model might hallucinate out-of-range)
        const pickedItems = selection.object.picks
          .filter(p => p.index >= 0 && p.index < poolSlice.length)
          .map(p => {
            const r = poolSlice[p.index]
            return {
              title: r.title ?? r.name ?? 'Unknown',
              year: (r.release_date ?? r.first_air_date ?? '').slice(0, 4),
              overview: r.overview?.slice(0, 200) ?? '',
              img: r.poster_path ? ` [img:${r.poster_path}]` : '',
              vibe: p.vibe,
            }
          })

        // Step 3: stream warm descriptions for exactly the validated picks
        const pickedText = pickedItems
          .map(p => `${p.title} (${p.year})${p.img} · ${p.vibe} — ${p.overview}`)
          .join('\n')

        const result = streamText({
          model: openrouter('x-ai/grok-4.1-fast'),
          temperature: 0.9,
          system: `Write warm, personal film/TV recommendations.
Format each one EXACTLY like this (include [img:...] if listed):
**[Title]** ([Year]) · [Genre/Vibe] [img:[poster_path]]
_Why you'll love it:_ [1–2 warm, specific sentences]
Write about ONLY the titles given to you — do not add, substitute, or mention any other title.`,
          prompt: `Write enthusiastic recommendations for exactly these titles:\n${pickedText}`,
          maxTokens: 900,
        })

        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      } catch (err) {
        console.error('[recommend]', err)
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
})

// ── Static client files (production only) ──────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../client/dist' }))
  app.get('/*', serveStatic({ path: 'index.html', root: '../client/dist' }))
}

// ── Start ──────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  Server ready → http://localhost:${port}\n`)
})
