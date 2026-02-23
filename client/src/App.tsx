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
import { useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "ZA", name: "South Africa" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
];

const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "Family",
  "History",
  "Music",
  "War",
  "Western",
];

const MOODS = [
  "Cozy & warm",
  "Dark & gritty",
  "Funny & light",
  "Thrilling & tense",
  "Heartwarming",
  "Mind-bending",
  "Nostalgic",
  "Romantic",
  "Weird & surreal",
  "Inspirational",
];

const STYLES = [
  "Animated",
  "Live-action",
  "CGI-heavy",
  "Practical effects",
  "Black & white",
  "Shot on film",
  "Widescreen epic",
  "Found footage",
  "Stop motion",
  "Docustyle",
];

// ── Types ──────────────────────────────────────────────────────────────────
type Step = "setup" | "type" | "preferences" | "results";
type MediaType = "movie" | "tv";
type SearchStatus =
  | "idle"
  | "searching"
  | "found"
  | "streaming"
  | "done"
  | "error";

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

interface SearchState {
  status: SearchStatus;
  foundCount: number | null;
  completion: string;
  error: string | null;
}

// ── Decorative components ──────────────────────────────────────────────────

// Horizontal film strip with sprocket holes
function FilmStrip({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-[14px] w-full shrink-0 ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='14'%3E%3Crect width='26' height='14' fill='%231A1612'/%3E%3Crect x='3' y='2' width='8' height='10' rx='1' fill='%230D0B08'/%3E%3Crect x='15' y='2' width='8' height='10' rx='1' fill='%230D0B08'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat-x",
        backgroundSize: "26px 14px",
      }}
    />
  );
}

// Marquee bulb row
function MarqueeLights({ className = "" }: { className?: string }) {
  return (
    <div className={`flex gap-[5px] overflow-hidden ${className}`} aria-hidden>
      {Array.from({ length: 120 }).map((_, i) => (
        <div
          key={i}
          className="w-[4px] h-[4px] rounded-full shrink-0"
          style={{
            background:
              i % 5 === 0 ? "#F0DFA0" : i % 5 === 2 ? "#C9922A" : "#2E2418",
            boxShadow:
              i % 5 === 0
                ? "0 0 5px 2px rgba(240,223,160,0.18)"
                : i % 5 === 2
                  ? "0 0 4px 1px rgba(201,146,42,0.12)"
                  : "none",
            opacity: i % 5 === 0 ? 0.95 : i % 5 === 2 ? 0.65 : 0.2,
          }}
        />
      ))}
    </div>
  );
}

// Vertical film perforation strip (for card edges)
function FilmPerfs({ count = 5 }: { count?: number }) {
  return (
    <div
      className="flex flex-col justify-evenly items-center py-3 gap-0"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[9px] h-[7px] rounded-[1px] bg-[#0D0B08] border border-[#252018]"
        />
      ))}
    </div>
  );
}

// ── Recommendation renderer ────────────────────────────────────────────────
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";

interface RecBlock {
  key: string;
  title: string;
  meta: string;
  posterPath?: string;
  description?: string;
}

function parseBlocks(text: string): RecBlock[] {
  const lines = text.split("\n");
  const blocks: RecBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\*\*(.+?)\*\*(.+?)(?:\s*\[img:([^\]]+)\])?\s*$/);
    if (m) {
      const block: RecBlock = {
        key: `${i}`,
        title: m[1].trim(),
        meta: m[2].replace(/\[img:[^\]]+\]/g, "").trim(),
        posterPath: m[3],
      };
      if (i + 1 < lines.length) {
        const dm = lines[i + 1].match(/^_(.+?)_\s*(.*)$/);
        if (dm) {
          block.description = dm[2].trim();
          i++;
        }
      }
      blocks.push(block);
    }
    i++;
  }
  return blocks;
}

function RecCard({ block }: { block: RecBlock }) {
  return (
    <div className="flex animate-slide-in border-b border-[#2E2620] last:border-b-0">
      {/* Left perforations */}
      <div className="w-5 shrink-0 bg-[#161210] border-r border-[#2E2620]">
        <FilmPerfs count={6} />
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-4 p-4 bg-[#120F0C]">
        {block.posterPath ? (
          <div
            className="relative shrink-0 self-start w-[72px]"
            style={{ aspectRatio: "2/3" }}
          >
            <img
              src={`${TMDB_IMG}${block.posterPath}`}
              alt={block.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: "inset 0 0 0 2px #C8281E" }}
            />
          </div>
        ) : (
          <div
            className="shrink-0 self-start bg-[#1E1A16] border border-[#2E2620]"
            style={{ width: "52px", aspectRatio: "2/3" }}
          />
        )}

        <div className="flex-1 min-w-0 pt-0.5">
          <p className="font-display text-[1.45rem] leading-none tracking-wider text-[#F2ECD8] uppercase">
            {block.title}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9922A] mt-1.5">
            {block.meta}
          </p>
          {block.description && (
            <p className="font-sans text-[12px] text-[#A09080] mt-2 leading-relaxed">
              {block.description}
            </p>
          )}
        </div>
      </div>

      {/* Right perforations */}
      <div className="w-5 shrink-0 bg-[#161210] border-l border-[#2E2620]">
        <FilmPerfs count={6} />
      </div>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-[#8A7050] mb-1">
      — {children} —
    </p>
  );
}

// ── Preference card wrapper ────────────────────────────────────────────────
function PrefCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#2E2620] bg-[#120F0C] overflow-hidden">
      <FilmStrip />
      <div className="p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#8A7050] mb-3">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // ── Step
  const [step, setStep] = useState<Step>(() =>
    localStorage.getItem("stw_country") ? "type" : "setup",
  );

  // ── Setup (persisted)
  const [country, setCountry] = useState<string>(
    () => localStorage.getItem("stw_country") ?? "US",
  );
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Set<number>>(
    () => {
      try {
        const s = localStorage.getItem("stw_providers");
        return s ? new Set<number>(JSON.parse(s)) : new Set<number>();
      } catch {
        return new Set<number>();
      }
    },
  );
  const [providersLoading, setProvidersLoading] = useState(false);

  // ── Type
  const [mediaType, setMediaType] = useState<MediaType>("movie");

  // ── Preferences
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set());
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");

  // ── Search state
  const [searchState, setSearchState] = useState<SearchState>({
    status: "idle",
    foundCount: null,
    completion: "",
    error: null,
  });

  const resultsRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // ── Effects
  useEffect(() => {
    localStorage.setItem("stw_country", country);
  }, [country]);
  useEffect(() => {
    localStorage.setItem(
      "stw_providers",
      JSON.stringify([...selectedProviders]),
    );
  }, [selectedProviders]);

  const prevCountryRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevCountryRef.current !== null && prevCountryRef.current !== country) {
      setSelectedProviders(new Set());
    }
    prevCountryRef.current = country;
  }, [country]);

  useEffect(() => {
    setProvidersLoading(true);
    fetch(`/api/providers?region=${country}`)
      .then((r) => r.json())
      .then((d: unknown) => setProviders(Array.isArray(d) ? d : []))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, [country]);

  useEffect(() => {
    if (step === "results") {
      setTimeout(
        () =>
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        80,
      );
    }
  }, [step]);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [description]);

  // ── Helpers
  function toggleProvider(id: number, pressed: boolean) {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      pressed ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  }

  // ── Streaming fetch
  async function handleSubmit() {
    setSearchState({
      status: "searching",
      foundCount: null,
      completion: "",
      error: null,
    });
    setStep("results");

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
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const d = (await res.json()) as { error?: string };
          msg = d.error ?? msg;
        } catch {
          /* noop */
        }
        throw new Error(msg);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let foundCount: number | null = null;
      let textStart: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        if (foundCount === null) {
          const m = buffer.match(/\[FOUND:(\d+)\]\n/);
          if (m && m.index !== undefined) {
            foundCount = parseInt(m[1]);
            textStart = m.index + m[0].length;
            setSearchState((prev) => ({
              ...prev,
              status: "found",
              foundCount,
            }));
          }
        }

        if (textStart !== null) {
          const cleanText = buffer.slice(textStart);
          if (cleanText.trim()) {
            setSearchState((prev) => ({
              ...prev,
              status: "streaming",
              completion: cleanText,
            }));
          }
        }
      }

      setSearchState((prev) => ({ ...prev, status: "done" }));
    } catch (e) {
      setSearchState((prev) => ({
        ...prev,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    }
  }

  function startOver() {
    setSelectedGenres(new Set());
    setSelectedMoods(new Set());
    setSelectedStyles(new Set());
    setDescription("");
    setSearchState({
      status: "idle",
      foundCount: null,
      completion: "",
      error: null,
    });
    setStep("type");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const {
    status: ss,
    foundCount,
    completion,
    error: searchError,
  } = searchState;
  const recBlocks = parseBlocks(completion);
  const isActive = ss === "searching" || ss === "found" || ss === "streaming";

  // Shared pill classes
  const pill =
    "px-3 py-1.5 border font-mono text-[10px] uppercase tracking-[0.12em] cursor-pointer select-none transition-all duration-150 " +
    "bg-[#120F0C] border-[#2E2620] text-[#9A8870] " +
    "hover:border-[#6A5840] hover:text-[#C0A880] " +
    "data-[pressed]:bg-[#C8281E] data-[pressed]:border-[#C8281E] data-[pressed]:text-[#F2ECD8]";

  return (
    <div className="min-h-screen bg-[#0D0B08] text-[#F2ECD8] font-sans antialiased">
      {/* Deep ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] z-0"
        style={{
          background: "radial-gradient(ellipse, #C8281E07 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] z-0"
        style={{
          background: "radial-gradient(ellipse, #C9922A05 0%, transparent 65%)",
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto pb-24">
        {/* ═══════════════════════════════════════════
            MARQUEE HEADER
        ═══════════════════════════════════════════ */}
        <header className="pt-6 mb-10">
          <MarqueeLights className="px-0 mb-2" />
          <div className="h-[3px] bg-[#C8281E]" />

          <div className="px-5 py-5 flex items-end justify-between gap-4">
            <div>
              <h1
                className="font-display leading-none text-[#F2ECD8] animate-flicker"
                style={{
                  fontSize: "clamp(2.6rem, 8vw, 3.4rem)",
                  textShadow:
                    "0 0 60px rgba(200,40,30,0.12), 0 2px 4px rgba(0,0,0,0.6)",
                  letterSpacing: "0.04em",
                }}
              >
                Something
                <br />
                to Watch
              </h1>
              <p className="font-serif italic text-[13px] text-[#A89070] mt-2 leading-snug">
                presented for your viewing pleasure
              </p>
            </div>

            {/* Step indicator + settings */}
            <div className="flex flex-col items-end gap-2.5 shrink-0 pb-0.5">
              {step !== "setup" && (
                <button
                  onClick={() => setStep("setup")}
                  className="p-2 border border-[#2E2620] text-[#A89070] hover:border-[#4A3828] hover:text-[#C0A880] transition-colors"
                  title="Settings"
                >
                  <GearSixIcon size={13} />
                </button>
              )}
              {step !== "setup" && (
                <div className="flex gap-[3px] items-center">
                  {(["type", "preferences", "results"] as Step[]).map((s) => {
                    const steps = ["type", "preferences", "results"];
                    const sIdx = steps.indexOf(s);
                    const cIdx = steps.indexOf(step);
                    return (
                      <div
                        key={s}
                        className="h-[3px] transition-all duration-300"
                        style={{
                          width: s === step ? "28px" : "10px",
                          background:
                            s === step
                              ? "#C8281E"
                              : sIdx < cIdx
                                ? "#6A2018"
                                : "#2E2620",
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="h-[3px] bg-[#C8281E]" />
          <MarqueeLights className="px-0 mt-2" />
        </header>

        <div className="px-5">
          {/* ═══════════════════════════════════════════
              SETUP
          ═══════════════════════════════════════════ */}
          {step === "setup" && (
            <div className="animate-slide-up">
              <div className="mb-7">
                <SectionLabel>Lobby</SectionLabel>
                <h2
                  className="font-display leading-none text-[#F2ECD8]"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 2.6rem)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Set Your Location
                </h2>
                <p className="font-serif italic text-[13px] text-[#A89070] mt-1.5">
                  We'll find what's playing near you.
                </p>
              </div>

              <div className="border border-[#2E2620] bg-[#120F0C]">
                <FilmStrip />

                <div className="p-5 space-y-6">
                  {/* Country */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <GlobeIcon size={10} className="text-[#8A7050]" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#8A7050]">
                        Region
                      </span>
                    </div>
                    <div className="relative inline-block">
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="appearance-none bg-[#1A1612] border border-[#2E2620]
                          pl-3 pr-8 py-2 font-mono text-[12px] text-[#B0A080] tracking-wider
                          focus:outline-none focus:border-[#C8281E50] transition-colors cursor-pointer"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7050] text-[9px]">
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* Providers */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#8A7050]">
                        Streaming Services
                      </span>
                      {selectedProviders.size > 0 && (
                        <span className="font-mono text-[9px] text-[#C8281E] tracking-wider">
                          · {selectedProviders.size} selected
                        </span>
                      )}
                    </div>

                    {providersLoading ? (
                      <div className="flex flex-wrap gap-2">
                        {[...Array(8)].map((_, i) => (
                          <div
                            key={i}
                            className="h-7 w-20 bg-[#1A1612] animate-pulse border border-[#2E2620]"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {providers.map((p) => (
                          <Toggle
                            key={p.provider_id}
                            pressed={selectedProviders.has(p.provider_id)}
                            onPressedChange={(pressed) =>
                              toggleProvider(p.provider_id, pressed)
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[10px]
                              tracking-wider cursor-pointer select-none transition-all
                              bg-[#120F0C] border-[#2E2620] text-[#9A8870]
                              hover:border-[#6A5840] hover:text-[#C0A880]
                              data-[pressed]:bg-[#C8281E18] data-[pressed]:border-[#C8281E60] data-[pressed]:text-[#F2A898]"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                              alt=""
                              className="w-3.5 h-3.5 object-cover"
                            />
                            {p.provider_name}
                          </Toggle>
                        ))}
                        {providers.length === 0 && !providersLoading && (
                          <p className="font-mono text-[11px] text-[#7A6848] italic tracking-wider">
                            No providers found for this region
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <FilmStrip />
              </div>

              <button
                onClick={() => setStep("type")}
                className="mt-4 w-full flex items-center justify-center gap-3 py-4
                  bg-[#C8281E] text-[#F2ECD8] font-display tracking-[0.15em]
                  hover:bg-[#D8301E] active:scale-[0.99] transition-all cursor-pointer"
                style={{ fontSize: "1.3rem" }}
              >
                ENTER THE CINEMA
                <ArrowRightIcon size={15} weight="bold" />
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              TYPE
          ═══════════════════════════════════════════ */}
          {step === "type" && (
            <div className="animate-slide-up">
              <div className="mb-7">
                <SectionLabel>Now Showing</SectionLabel>
                <h2
                  className="font-display leading-none text-[#F2ECD8]"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 2.6rem)",
                    letterSpacing: "0.04em",
                  }}
                >
                  What Shall We Screen?
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    type: "movie" as const,
                    icon: <FilmSlateIcon size={28} weight="fill" />,
                    label: "Feature Film",
                    sub: "A single story, one sitting",
                  },
                  {
                    type: "tv" as const,
                    icon: <TelevisionIcon size={28} weight="fill" />,
                    label: "Television",
                    sub: "Series & episodes",
                  },
                ].map(({ type, icon, label, sub }) => (
                  <button
                    key={type}
                    onClick={() => {
                      setMediaType(type);
                      setStep("preferences");
                    }}
                    className="group relative flex flex-col border border-[#2E2620] bg-[#120F0C]
                      cursor-pointer transition-all duration-200 overflow-hidden text-left
                      hover:border-[#C8281E50]"
                  >
                    {/* Red band */}
                    <div className="h-[5px] w-full bg-[#C8281E] shrink-0 group-hover:bg-[#D8301E] transition-colors" />

                    <div className="p-5 flex flex-col gap-4 flex-1">
                      <span className="text-[#C8281E] group-hover:text-[#E03828] transition-colors">
                        {icon}
                      </span>
                      <div>
                        <p
                          className="font-display leading-none text-[#F2ECD8] tracking-wide"
                          style={{ fontSize: "1.45rem" }}
                        >
                          {label}
                        </p>
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A7050] mt-1.5">
                          {sub}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-4 flex items-center justify-between">
                      <div className="flex gap-[5px]">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-[6px] h-[6px] rounded-full bg-[#0D0B08] border border-[#2E2620]"
                          />
                        ))}
                      </div>
                      <ArrowRightIcon
                        size={12}
                        className="text-[#2E2620] group-hover:text-[#C8281E] transition-colors"
                      />
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep("setup")}
                className="flex items-center gap-1.5 mt-5 font-mono text-[9px] uppercase tracking-[0.25em] text-[#7A6848] hover:text-[#C0A880] transition-colors"
              >
                <ArrowLeftIcon size={10} />
                Change Region
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              PREFERENCES
          ═══════════════════════════════════════════ */}
          {step === "preferences" && (
            <div className="animate-slide-up">
              <button
                onClick={() => setStep("type")}
                className="flex items-center gap-1.5 mb-7 font-mono text-[9px] uppercase tracking-[0.25em] text-[#7A6848] hover:text-[#C0A880] transition-colors"
              >
                <ArrowLeftIcon size={10} />
                Back
              </button>

              <div className="mb-7">
                <SectionLabel>Programme</SectionLabel>
                <h2
                  className="font-display leading-none text-[#F2ECD8]"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 2.6rem)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Curate Your Selection
                </h2>
                <p className="font-serif italic text-[13px] text-[#A89070] mt-1.5">
                  All optional — any combination works.
                </p>
              </div>

              <div className="space-y-2.5">
                <PrefCard label="Genre">
                  <div className="flex flex-wrap gap-1.5">
                    {GENRES.map((g) => (
                      <Toggle
                        key={g}
                        pressed={selectedGenres.has(g)}
                        onPressedChange={() =>
                          setSelectedGenres((prev) => toggleSet(prev, g))
                        }
                        className={pill}
                      >
                        {g}
                      </Toggle>
                    ))}
                  </div>
                </PrefCard>

                <PrefCard label="Mood">
                  <div className="flex flex-wrap gap-1.5">
                    {MOODS.map((mood) => (
                      <Toggle
                        key={mood}
                        pressed={selectedMoods.has(mood)}
                        onPressedChange={() =>
                          setSelectedMoods((prev) => toggleSet(prev, mood))
                        }
                        className={pill}
                      >
                        {mood}
                      </Toggle>
                    ))}
                  </div>
                </PrefCard>

                <PrefCard label="Style">
                  <div className="flex flex-wrap gap-1.5">
                    {STYLES.map((style) => (
                      <Toggle
                        key={style}
                        pressed={selectedStyles.has(style)}
                        onPressedChange={() =>
                          setSelectedStyles((prev) => toggleSet(prev, style))
                        }
                        className={pill}
                      >
                        {style}
                      </Toggle>
                    ))}
                  </div>
                </PrefCard>

                {/* Description */}
                <div className="border border-[#2E2620] bg-[#120F0C] overflow-hidden focus-within:border-[#C8281E40] transition-colors">
                  <FilmStrip />
                  <div className="p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#8A7050] mb-3">
                      Describe It{" "}
                      <span className="normal-case font-sans tracking-normal text-[#5A4838]">
                        (optional)
                      </span>
                    </p>
                    <Field.Root className="w-full">
                      <Field.Control
                        render={<textarea ref={descRef} rows={1} />}
                        value={description}
                        onChange={(e) =>
                          setDescription((e.target as HTMLInputElement).value)
                        }
                        placeholder="e.g. 'Something like Arrival but more emotional…'"
                        className="w-full resize-none bg-transparent font-sans text-[13px] text-[#C0A880]
                          placeholder:text-[#5A4838] focus:outline-none leading-relaxed"
                      />
                    </Field.Root>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  void handleSubmit();
                }}
                className="mt-4 w-full flex items-center justify-center gap-3 py-4
                  bg-[#C8281E] text-[#F2ECD8] font-display tracking-[0.15em]
                  hover:bg-[#D8301E] active:scale-[0.99] transition-all cursor-pointer"
                style={{ fontSize: "1.3rem" }}
              >
                <FilmSlateIcon size={17} weight="fill" />
                LIGHTS DOWN
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              RESULTS
          ═══════════════════════════════════════════ */}
          {step === "results" && (
            <div ref={resultsRef} className="animate-slide-up">
              <button
                onClick={() => setStep("preferences")}
                className="flex items-center gap-1.5 mb-7 font-mono text-[9px] uppercase tracking-[0.25em] text-[#7A6848] hover:text-[#C0A880] transition-colors"
              >
                <ArrowLeftIcon size={10} />
                Back
              </button>

              <div className="mb-6">
                <SectionLabel>Now Playing</SectionLabel>
                <h2
                  className="font-display leading-none text-[#F2ECD8]"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 2.6rem)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {isActive && recBlocks.length === 0
                    ? "Finding Your Film…"
                    : "Tonight's Selection"}
                </h2>
                {!isActive && recBlocks.length > 0 && (
                  <p className="font-serif italic text-[13px] text-[#A89070] mt-1.5">
                    Curated for your viewing pleasure.
                  </p>
                )}
              </div>

              {/* Progress */}
              {(isActive || ss === "done" || ss === "error") && (
                <div className="border border-[#2E2620] bg-[#120F0C] mb-6 overflow-hidden">
                  <FilmStrip />
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      {ss === "searching" ? (
                        <MagnifyingGlassIcon
                          size={12}
                          className="text-[#C8281E] shrink-0 animate-pulse"
                        />
                      ) : (
                        <CheckCircleIcon
                          size={12}
                          weight="fill"
                          className="text-[#C8281E] shrink-0"
                        />
                      )}
                      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#A89070]">
                        {ss === "searching"
                          ? "Searching Archives…"
                          : `Found ${foundCount ?? "?"} Titles`}
                      </span>
                    </div>

                    {(ss === "found" ||
                      ss === "streaming" ||
                      ss === "done") && (
                      <div className="flex items-center gap-3">
                        {ss === "done" ? (
                          <CheckCircleIcon
                            size={12}
                            weight="fill"
                            className="text-[#C8281E] shrink-0"
                          />
                        ) : (
                          <SparkleIcon
                            size={12}
                            weight="fill"
                            className="text-[#C9922A] shrink-0 animate-pulse"
                          />
                        )}
                        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#A89070]">
                          {ss === "done"
                            ? "Programme Ready"
                            : "Selecting Best Matches…"}
                        </span>
                      </div>
                    )}
                  </div>
                  <FilmStrip />
                </div>
              )}

              {/* Rec cards */}
              {recBlocks.length > 0 && (
                <div className="border border-[#2E2620] overflow-hidden">
                  {recBlocks.map((block) => (
                    <RecCard key={block.key} block={block} />
                  ))}
                </div>
              )}

              {/* Error */}
              {ss === "error" && searchError && (
                <div className="flex items-start gap-3 px-4 py-3.5 border border-[#5A1A14] bg-[#1A0C0A]">
                  {searchError.includes("429") ? (
                    <SmileySadIcon
                      size={13}
                      weight="duotone"
                      className="text-[#C8281E] shrink-0 mt-0.5"
                    />
                  ) : (
                    <WarningIcon
                      size={13}
                      weight="duotone"
                      className="text-[#C8281E] shrink-0 mt-0.5"
                    />
                  )}
                  <p className="font-mono text-[10px] text-[#C05050] leading-relaxed tracking-[0.1em]">
                    {searchError.includes("429")
                      ? "Too many requests — take a breath and try again in a minute."
                      : `Something went wrong: ${searchError}`}
                  </p>
                </div>
              )}

              {/* Done actions */}
              {(ss === "done" || ss === "error") && (
                <div className="flex items-center gap-4 mt-7 pt-5 border-t border-[#2E2620]">
                  <Button
                    onClick={() => {
                      void handleSubmit();
                    }}
                    className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[#7A6848] hover:text-[#C0A880] transition-colors cursor-pointer"
                  >
                    <SparkleIcon size={11} />
                    Try Again
                  </Button>
                  <Button
                    onClick={startOver}
                    className="ml-auto flex items-center gap-2 px-4 py-2 border border-[#2E2620] bg-[#120F0C]
                      font-mono text-[9px] uppercase tracking-[0.25em] text-[#7A6848]
                      hover:border-[#4A3828] hover:text-[#C0A880] transition-all cursor-pointer"
                  >
                    New Search
                    <ArrowRightIcon size={10} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* /px-5 */}

        {/* Footer */}
        <footer className="mt-20 px-0">
          <div className="h-[3px] bg-[#C8281E]" />
          <MarqueeLights className="mt-2 mb-3" />
        </footer>
      </div>
    </div>
  );
}
