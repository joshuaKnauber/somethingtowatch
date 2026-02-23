import { useEffect, useRef, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Field } from "@base-ui/react/field";
import { Toggle } from "@base-ui/react/toggle";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  FilmSlateIcon,
  GearSixIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  SmileySadIcon,
  SparkleIcon,
  TelevisionIcon,
  WarningIcon,
} from "@phosphor-icons/react";

// ── Constants ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" }, { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" }, { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" }, { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" }, { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" }, { code: "CH", name: "Switzerland" },
  { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" }, { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" }, { code: "AR", name: "Argentina" },
  { code: "ZA", name: "South Africa" }, { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
]

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Fantasy", "Horror", "Mystery",
  "Romance", "Sci-Fi", "Thriller", "Family", "History",
  "Music", "War", "Western",
]

const MOODS = [
  "Cozy & warm", "Dark & gritty", "Funny & light", "Thrilling & tense",
  "Heartwarming", "Mind-bending", "Nostalgic", "Romantic",
  "Weird & surreal", "Inspirational",
]

const STYLES = [
  "Animated", "Live-action", "CGI-heavy", "Practical effects",
  "Black & white", "Shot on film", "Widescreen epic", "Found footage",
  "Stop motion", "Docustyle",
]

// ── Types ──────────────────────────────────────────────────────────────────
type Step = "setup" | "type" | "preferences" | "results"
type MediaType = "movie" | "tv"
type SearchStatus = "idle" | "searching" | "found" | "streaming" | "done" | "error"

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
  display_priority: number
}

interface SearchState {
  status: SearchStatus
  foundCount: number | null
  completion: string
  error: string | null
}

// ── Recommendation renderer ────────────────────────────────────────────────
const TMDB_IMG = "https://image.tmdb.org/t/p/w185"

interface RecBlock {
  key: string
  title: string
  meta: string
  posterPath?: string
  description?: string
}

function parseBlocks(text: string): RecBlock[] {
  const lines = text.split("\n")
  const blocks: RecBlock[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(/^\*\*(.+?)\*\*(.+?)(?:\s*\[img:([^\]]+)\])?\s*$/)
    if (m) {
      const block: RecBlock = {
        key: `${i}`,
        title: m[1].trim(),
        meta: m[2].replace(/\[img:[^\]]+\]/g, "").trim(),
        posterPath: m[3],
      }
      if (i + 1 < lines.length) {
        const dm = lines[i + 1].match(/^_(.+?)_\s*(.*)$/)
        if (dm) { block.description = dm[2].trim(); i++ }
      }
      blocks.push(block)
    }
    i++
  }
  return blocks
}

function RecCard({ block }: { block: RecBlock }) {
  return (
    <div className="flex gap-4 items-start animate-slide-in">
      {block.posterPath ? (
        <img
          src={`${TMDB_IMG}${block.posterPath}`}
          alt={block.title}
          className="w-16 shrink-0 rounded-lg object-cover shadow-lg"
          style={{ aspectRatio: "2/3" }}
        />
      ) : (
        <div
          className="w-16 shrink-0 rounded-lg bg-surface-elevated border border-surface-border"
          style={{ aspectRatio: "2/3" }}
        />
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="leading-snug">
          <strong className="font-display text-[1.1rem] font-semibold text-accent">
            {block.title}
          </strong>
          <span className="text-[#60606a] text-[12px] font-mono ml-2">{block.meta}</span>
        </p>
        {block.description && (
          <p className="text-[13px] text-[#888890] mt-1.5 leading-relaxed">
            {block.description}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // ── Step
  const [step, setStep] = useState<Step>(() =>
    localStorage.getItem("stw_country") ? "type" : "setup"
  )

  // ── Setup (persisted)
  const [country, setCountry] = useState<string>(
    () => localStorage.getItem("stw_country") ?? "US"
  )
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProviders, setSelectedProviders] = useState<Set<number>>(() => {
    try {
      const s = localStorage.getItem("stw_providers")
      return s ? new Set<number>(JSON.parse(s)) : new Set<number>()
    } catch { return new Set<number>() }
  })
  const [providersLoading, setProvidersLoading] = useState(false)

  // ── Type
  const [mediaType, setMediaType] = useState<MediaType>("movie")

  // ── Preferences
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set())
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set())
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState("")
  // ── Search state (replaces useChat/useCompletion)
  const [searchState, setSearchState] = useState<SearchState>({
    status: "idle", foundCount: null, completion: "", error: null,
  })

  const resultsRef = useRef<HTMLDivElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // ── Effects
  useEffect(() => { localStorage.setItem("stw_country", country) }, [country])
  useEffect(() => {
    localStorage.setItem("stw_providers", JSON.stringify([...selectedProviders]))
  }, [selectedProviders])

  const prevCountryRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevCountryRef.current !== null && prevCountryRef.current !== country) {
      setSelectedProviders(new Set())
    }
    prevCountryRef.current = country
  }, [country])

  useEffect(() => {
    setProvidersLoading(true)
    fetch(`/api/providers?region=${country}`)
      .then((r) => r.json())
      .then((d: unknown) => setProviders(Array.isArray(d) ? d : []))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false))
  }, [country])

  useEffect(() => {
    if (step === "results") {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
    }
  }, [step])

  useEffect(() => {
    const el = descRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [description])

  // ── Helpers
  function toggleProvider(id: number, pressed: boolean) {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      pressed ? next.add(id) : next.delete(id)
      return next
    })
  }

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set)
    next.has(val) ? next.delete(val) : next.add(val)
    return next
  }

  // ── Streaming fetch
  async function handleSubmit() {
    setSearchState({ status: "searching", foundCount: null, completion: "", error: null })
    setStep("results")

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          providerIds: [...selectedProviders],
          mediaType,
          genres: [...selectedGenres],
          moods: [...selectedMoods],
          styles: [...selectedStyles],
          description,
        }),
      })

      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const d = await res.json() as { error?: string }; msg = d.error ?? msg } catch { /* noop */ }
        throw new Error(msg)
      }

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let foundCount: number | null = null
      let textStart: number | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Detect [FOUND:N] marker
        if (foundCount === null) {
          const m = buffer.match(/\[FOUND:(\d+)\]\n/)
          if (m && m.index !== undefined) {
            foundCount = parseInt(m[1])
            textStart = m.index + m[0].length
            setSearchState((prev) => ({ ...prev, status: "found", foundCount }))
          }
        }

        // Extract display text (everything after the [FOUND:N] marker)
        if (textStart !== null) {
          const cleanText = buffer.slice(textStart)
          if (cleanText.trim()) {
            setSearchState((prev) => ({ ...prev, status: "streaming", completion: cleanText }))
          }
        }
      }

      setSearchState((prev) => ({ ...prev, status: "done" }))
    } catch (e) {
      setSearchState((prev) => ({
        ...prev,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
      }))
    }
  }

  function startOver() {
    setSelectedGenres(new Set())
    setSelectedMoods(new Set())
    setSelectedStyles(new Set())
    setDescription("")
    setSearchState({ status: "idle", foundCount: null, completion: "", error: null })
    setStep("type")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const { status: ss, foundCount, completion, error: searchError } = searchState
  const recBlocks = parseBlocks(completion)
  const isActive = ss === "searching" || ss === "found" || ss === "streaming"

  return (
    <div className="min-h-screen bg-surface text-[#e0e0ea] font-sans antialiased">
      {/* Film grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025] z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px",
        }}
      />
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[240px] opacity-[0.05] z-0"
        style={{ background: "radial-gradient(ellipse, #e8b86d 0%, transparent 70%)" }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-10 pb-20">

        {/* ── Header ── */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-surface-card border border-surface-border">
              <FilmSlateIcon size={17} weight="duotone" className="text-accent" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight">
              something<span className="text-accent">towatch</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Step pills */}
            {step !== "setup" && (
              <div className="flex items-center gap-1.5">
                {(["type", "preferences", "results"] as Step[]).map((s) => (
                  <div
                    key={s}
                    className={`rounded-full transition-all duration-300 ${
                      s === step
                        ? "w-5 h-1.5 bg-accent"
                        : ["type", "preferences", "results"].indexOf(s) <
                          ["type", "preferences", "results"].indexOf(step)
                        ? "w-1.5 h-1.5 bg-accent opacity-60"
                        : "w-1.5 h-1.5 bg-surface-elevated border border-surface-border"
                    }`}
                  />
                ))}
              </div>
            )}
            {step !== "setup" && (
              <button
                onClick={() => setStep("setup")}
                className="p-1.5 rounded-lg text-[#454550] hover:text-[#a0a0a8] hover:bg-surface-elevated transition-colors"
                title="Settings"
              >
                <GearSixIcon size={15} />
              </button>
            )}
          </div>
        </header>

        {/* ════════════════════════════════════════════════════
            SETUP
        ════════════════════════════════════════════════════ */}
        {step === "setup" && (
          <div className="animate-slide-up">
            <div className="mb-7">
              <h1 className="font-display text-[2.6rem] font-semibold text-[#f0f0f2] leading-[1.15] mb-2">
                Where are you<br />
                <em className="text-accent not-italic">watching tonight?</em>
              </h1>
              <p className="text-[14px] text-[#585860]">
                Set your region and services once. We'll remember.
              </p>
            </div>

            <div className="rounded-2xl border border-surface-border bg-surface-card p-5 space-y-5">
              {/* Country */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <GlobeIcon size={12} className="text-[#454550]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#454550]">
                    Region
                  </span>
                </div>
                <div className="relative inline-block">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="appearance-none bg-surface-elevated border border-surface-border
                      rounded-xl pl-3.5 pr-8 py-2 text-[13px] text-[#c0c0ca]
                      focus:outline-none focus:border-[#e8b86d30] transition-colors cursor-pointer"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#454550] text-[9px]">▾</span>
                </div>
              </div>

              {/* Providers */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#454550]">
                    Streaming services
                  </span>
                  {selectedProviders.size > 0 && (
                    <span className="text-[10px] text-accent font-mono">· {selectedProviders.size} selected</span>
                  )}
                </div>
                {providersLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-8 w-24 rounded-xl bg-surface-elevated animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {providers.map((p) => (
                      <Toggle
                        key={p.provider_id}
                        pressed={selectedProviders.has(p.provider_id)}
                        onPressedChange={(pressed) => toggleProvider(p.provider_id, pressed)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[12px]
                          text-[#606068] bg-surface-elevated border-surface-border cursor-pointer
                          transition-all select-none hover:text-[#a0a0a8] hover:border-[#353540]
                          data-[pressed]:border-[#e8b86d40] data-[pressed]:bg-accent-glow data-[pressed]:text-accent"
                      >
                        <img src={`https://image.tmdb.org/t/p/w45${p.logo_path}`} alt="" className="w-4 h-4 rounded object-cover" />
                        {p.provider_name}
                      </Toggle>
                    ))}
                    {providers.length === 0 && !providersLoading && (
                      <p className="text-[12px] text-[#353540] italic">No providers found for this region</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setStep("type")}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl
                bg-accent text-[#09090c] font-semibold text-[14px]
                hover:bg-[#f0c87a] active:scale-[0.99] transition-all cursor-pointer"
            >
              Continue
              <ArrowRightIcon size={14} weight="bold" />
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TYPE
        ════════════════════════════════════════════════════ */}
        {step === "type" && (
          <div className="animate-slide-up">
            <div className="mb-7">
              <h1 className="font-display text-[2.6rem] font-semibold text-[#f0f0f2] leading-[1.15] mb-2">
                What are you in<br />
                <em className="text-accent not-italic">the mood for?</em>
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {([
                { type: "movie" as const, icon: <FilmSlateIcon size={30} weight="duotone" className="text-accent" />, label: "Movie", sub: "Feature films" },
                { type: "tv" as const, icon: <TelevisionIcon size={30} weight="duotone" className="text-accent" />, label: "TV Show", sub: "Series & episodes" },
              ]).map(({ type, icon, label, sub }) => (
                <button
                  key={type}
                  onClick={() => { setMediaType(type); setStep("preferences") }}
                  className="group relative flex flex-col items-center justify-center gap-3.5
                    rounded-2xl border border-surface-border bg-surface-card
                    py-11 px-6 cursor-pointer transition-all duration-200
                    hover:border-[#e8b86d30] hover:bg-surface-elevated"
                >
                  <div className="p-3 rounded-xl bg-surface-elevated border border-surface-border
                    group-hover:border-[#e8b86d25] group-hover:bg-accent-glow transition-all">
                    {icon}
                  </div>
                  <div className="text-center">
                    <p className="font-display text-[1.25rem] font-semibold text-[#e8e8f0]">{label}</p>
                    <p className="text-[11px] text-[#454550] mt-0.5">{sub}</p>
                  </div>
                  <ArrowRightIcon
                    size={13}
                    className="absolute bottom-3.5 right-3.5 text-[#353540] group-hover:text-accent transition-colors"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            PREFERENCES
        ════════════════════════════════════════════════════ */}
        {step === "preferences" && (
          <div className="animate-slide-up">
            <button
              onClick={() => setStep("type")}
              className="flex items-center gap-1.5 text-[12px] text-[#454550] hover:text-[#909098] transition-colors mb-6"
            >
              <ArrowLeftIcon size={12} />
              Back
            </button>

            <div className="mb-7">
              <h1 className="font-display text-[2.6rem] font-semibold text-[#f0f0f2] leading-[1.15] mb-2">
                Tell us what you<br />
                <em className="text-accent not-italic">want to feel.</em>
              </h1>
              <p className="text-[13px] text-[#585860]">All optional — any combo works.</p>
            </div>

            <div className="space-y-2.5">
              {/* Genre */}
              <div className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[#454550] mb-3">Genre</p>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map((g) => (
                    <Toggle
                      key={g}
                      pressed={selectedGenres.has(g)}
                      onPressedChange={() => setSelectedGenres((prev) => toggleSet(prev, g))}
                      className="px-3 py-1.5 rounded-xl border text-[12px] cursor-pointer
                        transition-all select-none bg-surface-elevated border-surface-border
                        text-[#606068] hover:border-[#353540] hover:text-[#a0a0a8]
                        data-[pressed]:border-[#e8b86d40] data-[pressed]:bg-accent-glow data-[pressed]:text-accent"
                    >
                      {g}
                    </Toggle>
                  ))}
                </div>
              </div>

              {/* Mood */}
              <div className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[#454550] mb-3">Mood</p>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((mood) => (
                    <Toggle
                      key={mood}
                      pressed={selectedMoods.has(mood)}
                      onPressedChange={() => setSelectedMoods((prev) => toggleSet(prev, mood))}
                      className="px-3 py-1.5 rounded-xl border text-[12px] cursor-pointer
                        transition-all select-none bg-surface-elevated border-surface-border
                        text-[#606068] hover:border-[#353540] hover:text-[#a0a0a8]
                        data-[pressed]:border-[#e8b86d40] data-[pressed]:bg-accent-glow data-[pressed]:text-accent"
                    >
                      {mood}
                    </Toggle>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="rounded-2xl border border-surface-border bg-surface-card p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[#454550] mb-3">Style</p>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((style) => (
                    <Toggle
                      key={style}
                      pressed={selectedStyles.has(style)}
                      onPressedChange={() => setSelectedStyles((prev) => toggleSet(prev, style))}
                      className="px-3 py-1.5 rounded-xl border text-[12px] cursor-pointer
                        transition-all select-none bg-surface-elevated border-surface-border
                        text-[#606068] hover:border-[#353540] hover:text-[#a0a0a8]
                        data-[pressed]:border-[#e8b86d40] data-[pressed]:bg-accent-glow data-[pressed]:text-accent"
                    >
                      {style}
                    </Toggle>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="rounded-2xl border border-surface-border bg-surface-card p-4 focus-within:border-[#e8b86d25] transition-colors">
                <p className="text-[10px] font-mono uppercase tracking-widest text-[#454550] mb-2.5">
                  Something specific? <span className="normal-case font-sans text-[#353540]">(optional)</span>
                </p>
                <Field.Root className="w-full">
                  <Field.Control
                    render={<textarea ref={descRef} rows={1} />}
                    value={description}
                    onChange={(e) => setDescription((e.target as HTMLInputElement).value)}
                    placeholder="e.g. 'Something like Arrival but more emotional…'"
                    className="w-full resize-none bg-transparent text-[13px] text-[#e0e0e4]
                      placeholder:text-[#353540] focus:outline-none leading-relaxed"
                  />
                </Field.Root>
              </div>
            </div>

            <button
              onClick={() => { void handleSubmit() }}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl
                bg-accent text-[#09090c] font-semibold text-[14px]
                hover:bg-[#f0c87a] active:scale-[0.99] transition-all cursor-pointer"
            >
              <SparkleIcon size={14} weight="fill" />
              Find something to watch
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            RESULTS
        ════════════════════════════════════════════════════ */}
        {step === "results" && (
          <div ref={resultsRef} className="animate-slide-up">
            <button
              onClick={() => setStep("preferences")}
              className="flex items-center gap-1.5 text-[12px] text-[#454550] hover:text-[#909098] transition-colors mb-6"
            >
              <ArrowLeftIcon size={12} />
              Back
            </button>

            <div className="mb-6">
              <h1 className="font-display text-[2.6rem] font-semibold text-[#f0f0f2] leading-[1.15]">
                {isActive && recBlocks.length === 0
                  ? <><em className="text-accent not-italic">Finding</em> your next watch…</>
                  : <><em className="text-accent not-italic">Your picks</em> for tonight.</>
                }
              </h1>
            </div>

            {/* Progress steps */}
            {(isActive || ss === "done" || ss === "error") && (
              <div className="rounded-2xl border border-surface-border bg-surface-card p-4 mb-6 space-y-2.5">
                {/* Search step */}
                <div className="flex items-center gap-3">
                  {ss === "searching" ? (
                    <MagnifyingGlassIcon size={15} className="text-accent shrink-0 animate-pulse" />
                  ) : (
                    <CheckCircleIcon size={15} weight="fill" className="text-accent shrink-0" />
                  )}
                  <span className="text-[12px] text-[#808088]">
                    {ss === "searching" ? "Searching TMDB…" : `Found ${foundCount ?? "?"} titles`}
                  </span>
                </div>

                {/* AI step */}
                {(ss === "found" || ss === "streaming" || ss === "done") && (
                  <div className="flex items-center gap-3">
                    {ss === "done" ? (
                      <CheckCircleIcon size={15} weight="fill" className="text-accent shrink-0" />
                    ) : (
                      <SparkleIcon size={15} weight="fill" className="text-accent shrink-0 animate-pulse" />
                    )}
                    <span className="text-[12px] text-[#808088]">
                      {ss === "done" ? "Recommendations ready" : "Picking the best matches…"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recommendation cards */}
            {recBlocks.length > 0 && (
              <div className="space-y-5">
                {recBlocks.map((block) => (
                  <RecCard key={block.key} block={block} />
                ))}
              </div>
            )}

            {/* Error */}
            {ss === "error" && searchError && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[#1e1015] border border-[#3a1e24]">
                {searchError.includes("429") ? (
                  <SmileySadIcon size={16} weight="duotone" className="text-[#e87070] shrink-0 mt-0.5" />
                ) : (
                  <WarningIcon size={16} weight="duotone" className="text-[#e87070] shrink-0 mt-0.5" />
                )}
                <p className="text-[12px] text-[#e87070] leading-relaxed">
                  {searchError.includes("429")
                    ? "Too many requests — take a breath and try again in a minute."
                    : `Something went wrong: ${searchError}`}
                </p>
              </div>
            )}

            {/* Done actions */}
            {(ss === "done" || ss === "error") && (
              <div className="flex items-center gap-4 mt-7 pt-5 border-t border-surface-border">
                <Button
                  onClick={() => { void handleSubmit() }}
                  className="flex items-center gap-1.5 text-[12px] text-[#808088]
                    hover:text-[#c0c0c8] transition-colors cursor-pointer"
                >
                  <SparkleIcon size={12} />
                  Try again
                </Button>
                <Button
                  onClick={startOver}
                  className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl
                    bg-surface-elevated border border-surface-border text-[12px]
                    text-[#808088] hover:border-[#353540] hover:text-[#c0c0c8]
                    transition-all cursor-pointer"
                >
                  Start over
                  <ArrowRightIcon size={12} />
                </Button>
              </div>
            )}
          </div>
        )}

        <footer className="mt-16 text-[10px] font-mono text-[#252530] text-center">
          Powered by OpenRouter · TMDB · Built with Hono + React
        </footer>
      </div>
    </div>
  )
}
