import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') })

import { serve } from '@hono/node-server'
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
    origin: ['http://localhost:5173'],
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
        if (providerIds.length > 0) {
          baseParams.with_watch_providers = providerIds.join('|')
          baseParams.watch_region = country
        }

        const searchQ = [...genres, ...moods].slice(0, 2).join(' ')

        // Phase 1: general TMDB discover + description filter generation — all in parallel
        const [filterResult, ...tmdbResults] = await Promise.allSettled([
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
          // General discover fetches
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '1' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '2' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'popularity.desc', page: '3' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': '150', page: '1' }),
          tmdbFetch(`/discover/${mediaType}`, { ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': '150', page: '2' }),
          searchQ
            ? tmdbFetch(`/search/${mediaType}`, { query: searchQ, include_adult: 'false' })
            : Promise.resolve({ results: [] }),
        ])

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

        // Merge with deduplication — description-derived results go first (priority)
        const seen = new Set<number>()
        const pool: TmdbItem[] = []

        for (const item of descriptionPool) {
          if (item.id == null || seen.has(item.id)) continue
          seen.add(item.id)
          pool.push(item)
        }
        const descCount = pool.length

        for (const res of tmdbResults) {
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

        const items = pool.slice(0, 30).map((r) => {
          const title = r.title ?? r.name ?? 'Unknown'
          const year = (r.release_date ?? r.first_air_date ?? '').slice(0, 4)
          const rating = r.vote_average?.toFixed(1) ?? '?'
          const overview = r.overview?.slice(0, 200) ?? ''
          const img = r.poster_path ? ` [img:${r.poster_path}]` : ''
          return `• ${title} (${year})${img} [${rating}★] — ${overview}`
        }).join('\n')

        // ── Phase 2: signal found count ───────────────────────────────────
        controller.enqueue(encoder.encode(`[FOUND:${pool.length}]\n`))

        console.log(`[recommend] found ${pool.length} titles, streaming AI…`)

        // ── Phase 3: AI stream ────────────────────────────────────────────
        const prefsParts = [
          genres.length > 0 ? `Genres: ${genres.join(', ')}` : null,
          moods.length > 0 ? `Mood: ${moods.join(', ')}` : null,
          styles.length > 0 ? `Style: ${styles.join(', ')}` : null,
          description ? `Notes: "${description}"` : null,
          providerIds.length > 0 ? `(On selected services in ${country})` : null,
        ].filter(Boolean).join('\n')

        const result = streamText({
          model: openrouter('x-ai/grok-4.1-fast'),
          temperature: 1.1,
          system: `You are an expert film and TV recommender.
Only recommend titles from the list provided — never invent titles.
Format EXACTLY like this (include [img:...] if listed for that title):
**[Title]** ([Year]) · [Genre/Vibe] [img:[poster_path]]
_Why you'll love it:_ [1–2 warm, specific sentences]
Pick 3–5 titles. Be enthusiastic and personal. Vary your selections — avoid repeating the same picks you may have chosen before.`,
          prompt: `Looking for: ${mediaType === 'movie' ? 'a movie' : 'a TV show'}\n${prefsParts}\n\nAvailable titles (pick from anywhere in this list):\n${items}\n\nRecommend the best matches.`,
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

// ── Start ──────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  Server ready → http://localhost:${port}\n`)
})
