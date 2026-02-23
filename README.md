# Something to Watch

AI-powered movie and TV show recommendations with a retro cinema aesthetic.

## How it works

1. Pick your country and streaming services
2. Choose movie or TV show
3. Select genres, moods, styles, and an optional description
4. Get 3–5 AI-curated picks with posters
5. Like or dislike results to refine recommendations

The server fetches a pool of titles from TMDB, then streams an AI response (via OpenRouter) that picks the best matches from that pool.

## Stack

- **Client** — React 18 + Vite + Tailwind CSS + Base UI
- **Server** — Hono + Node.js + Vercel AI SDK + OpenRouter
- **Data** — TMDB API

## Setup

1. Copy the example env file and fill in your keys:
   ```bash
   cp .env.example .env
   ```

   | Variable | Where to get it |
   |---|---|
   | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
   | `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) |

2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

   Client runs on `http://localhost:5173`, server on `http://localhost:3000`.

## Deployment (Railway)

Set the following in your Railway service:

- **Build command**: `npm run build`
- **Start command**: `npm run start`
- **Environment variables**: `OPENROUTER_API_KEY`, `TMDB_API_KEY`

The server reads `PORT` from the environment automatically.
