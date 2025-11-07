"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'

export const dynamic = 'force-dynamic'

// Firestore document path: config/home
// Shape stored:
// {
//   hero: { movieId: string | null, imageUrl?: string, description?: string, ctaLabel?: string, ctaUrl?: string },
//   popular: string[]; // ordered list of movie IDs
//   top10: string[]; // ordered list of movie IDs length <= 10
//   updatedAt: Timestamp
// }

interface Movie { id: string; name: string; pic: string }
interface HomeConfig {
  hero: { movieId: string | null; imageUrl?: string; description?: string; ctaLabel?: string; ctaUrl?: string }
  popular: string[]
  top10: string[]
}

export default function GlobalSettingsPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  const [movies, setMovies] = useState<Movie[]>([])
  const [loadingMovies, setLoadingMovies] = useState(true)

  const [configLoading, setConfigLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Global config state
  const [heroMovieId, setHeroMovieId] = useState<string | ''>('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [heroDescription, setHeroDescription] = useState('')
  const [heroCTALabel, setHeroCTALabel] = useState('')
  const [heroCTAUrl, setHeroCTAUrl] = useState('')

  const [popularIds, setPopularIds] = useState<string[]>([])
  const [top10Ids, setTop10Ids] = useState<string[]>([])

  const moviesRef = useMemo(() => (db ? collection(db, 'movies') : null), [db])
  const homeConfigRef = useMemo(() => (db ? doc(db, 'config', 'home') : null), [db])

  // Auth
  useEffect(() => {
    if (!auth) {
      router.replace('/user')
      return
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      const userEmail = user?.email ?? null
      setEmail(userEmail)
      if (userEmail && isAdminEmail(userEmail)) {
        setAuthorized(true)
      } else {
        setAuthorized(false)
        router.replace('/user')
      }
    })
    return () => unsub()
  }, [router])

  // Load movies list for selection
  useEffect(() => {
    const loadMovies = async () => {
      if (!moviesRef) return
      setLoadingMovies(true)
      try {
        const q = query(moviesRef, orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        const list: Movie[] = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DocumentData) } as Movie))
        setMovies(list)
      } finally {
        setLoadingMovies(false)
      }
    }
    loadMovies().catch(() => setLoadingMovies(false))
  }, [moviesRef])

  // Load existing global config
  useEffect(() => {
    const loadConfig = async () => {
      if (!homeConfigRef) return
      setConfigLoading(true)
      try {
        const snap = await getDoc(homeConfigRef)
        if (snap.exists()) {
          const data = snap.data() as DocumentData
          const cfg: HomeConfig = {
            hero: {
              movieId: data.hero?.movieId || '',
              imageUrl: data.hero?.imageUrl || '',
              description: data.hero?.description || '',
              ctaLabel: data.hero?.ctaLabel || '',
              ctaUrl: data.hero?.ctaUrl || '',
            },
            popular: Array.isArray(data.popular) ? data.popular.filter((x: any) => typeof x === 'string') : [],
            top10: Array.isArray(data.top10) ? data.top10.filter((x: any) => typeof x === 'string').slice(0, 10) : [],
          }
          setHeroMovieId(cfg.hero.movieId || '')
          setHeroImageUrl(cfg.hero.imageUrl || '')
          setHeroDescription(cfg.hero.description || '')
          setHeroCTALabel(cfg.hero.ctaLabel || '')
          setHeroCTAUrl(cfg.hero.ctaUrl || '')
          setPopularIds(cfg.popular)
          setTop10Ids(cfg.top10)
        } else {
          // Initialize empty config state
          setHeroMovieId('')
          setPopularIds([])
          setTop10Ids([])
        }
      } finally {
        setConfigLoading(false)
      }
    }
    loadConfig().catch(() => setConfigLoading(false))
  }, [homeConfigRef])

  function togglePopular(id: string) {
    setPopularIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleTop10(id: string) {
    setTop10Ids((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 10) return prev // limit
      return [...prev, id]
    })
  }
  function moveItem(arr: string[], id: string, dir: -1 | 1): string[] {
    const idx = arr.indexOf(id)
    if (idx === -1) return arr
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= arr.length) return arr
    const copy = [...arr]
    const tmp = copy[idx]
    copy[idx] = copy[nextIdx]
    copy[nextIdx] = tmp
    return copy
  }

  async function handleSave() {
    setMessage(null)
    if (!homeConfigRef) {
      setMessage({ type: 'error', text: 'Database not available.' })
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        hero: {
          movieId: heroMovieId || null,
          ...(heroImageUrl.trim() ? { imageUrl: heroImageUrl.trim() } : {}),
          ...(heroDescription.trim() ? { description: heroDescription.trim() } : {}),
          ...(heroCTALabel.trim() ? { ctaLabel: heroCTALabel.trim() } : {}),
          ...(heroCTAUrl.trim() ? { ctaUrl: heroCTAUrl.trim() } : {}),
        },
        popular: popularIds,
        top10: top10Ids.slice(0, 10),
        updatedAt: serverTimestamp(),
      }
      await setDoc(homeConfigRef, payload, { merge: true })
      setMessage({ type: 'success', text: 'Global settings saved.' })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  if (authorized === null || loadingMovies || configLoading) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] grid place-items-center p-6">
        <p className="text-sm text-[var(--netflix-light-gray)]">Loading…</p>
      </div>
    )
  }
  if (!authorized) return null

  return (
    <div className="min-h-dvh bg-[var(--netflix-black)]">
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[var(--netflix-black)] to-transparent border-b border-[var(--netflix-gray)]">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--netflix-red)]">Global Settings</h1>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] hidden sm:block truncate max-w-[160px]">{email}</p>
            <a href="/admin" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">Admin home</a>
            <a href="/admin/movies" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">Movies</a>
            <button
              onClick={() => { if (!auth) return; signOut(auth).then(() => router.replace('/user')) }}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 py-1.5 text-xs sm:text-sm transition-all duration-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        {message && (
          <div className={`rounded-md border px-3 py-2 text-sm fade-in ${message.type === 'success' ? 'border-green-600/50 bg-green-600/10 text-green-400' : 'border-[var(--netflix-red)]/50 bg-[var(--netflix-red)]/10 text-[var(--netflix-red)]'}`} role="alert">{message.text}</div>
        )}

        {/* Hero banner config */}
        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-4 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Hero Banner</h2>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Select movie/series for hero</label>
            <select
              value={heroMovieId}
              onChange={(e) => setHeroMovieId(e.target.value)}
              className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
            >
              <option value="">-- None (fallback to newest) --</option>
              {movies.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <input
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="Override hero image URL (optional)"
              className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
            />
            <textarea
              value={heroDescription}
              onChange={(e) => setHeroDescription(e.target.value)}
              placeholder="Description"
              rows={3}
              className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={heroCTALabel}
                onChange={(e) => setHeroCTALabel(e.target.value)}
                placeholder="CTA label (Play)"
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
              />
              <input
                value={heroCTAUrl}
                onChange={(e) => setHeroCTAUrl(e.target.value)}
                placeholder="CTA link (optional)"
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Popular selection */}
        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-4 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Popular Row</h2>
          <p className="text-xs text-[var(--netflix-light-gray)]">Select any titles to appear (ordered as selected). Click to toggle, use arrows to reorder. Limit 24 recommended.</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto p-1 border border-[var(--netflix-gray)] rounded-md bg-black/40">
            {movies.map((m) => {
              const active = popularIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => togglePopular(m.id)}
                  className={`text-left rounded-md border px-2 py-1 text-xs flex items-center gap-2 transition-all ${active ? 'border-[var(--netflix-red)] bg-[var(--netflix-red)]/20 text-white' : 'border-[var(--netflix-gray)] hover:bg-[var(--netflix-gray)] text-[var(--netflix-light-gray)]'}`}
                >
                  <img src={m.pic} alt={m.name} className="h-8 w-8 rounded object-cover border border-[var(--netflix-gray)]" />
                  <span className="truncate flex-1">{m.name}</span>
                  {active && <span className="text-[10px] opacity-70">#{popularIds.indexOf(m.id) + 1}</span>}
                </button>
              )
            })}
          </div>
          {popularIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {popularIds.map((id) => {
                const movie = movies.find((m) => m.id === id)
                if (!movie) return null
                return (
                  <div key={id} className="flex items-center gap-2 rounded border border-[var(--netflix-gray)] px-2 py-1 text-xs bg-black/50">
                    <span className="text-white truncate max-w-[120px]">{movie.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPopularIds((arr) => moveItem(arr, id, -1))}
                        className="rounded border border-[var(--netflix-gray)] px-1 hover:bg-[var(--netflix-gray)] text-white"
                        aria-label="Move up"
                      >↑</button>
                      <button
                        onClick={() => setPopularIds((arr) => moveItem(arr, id, 1))}
                        className="rounded border border-[var(--netflix-gray)] px-1 hover:bg-[var(--netflix-gray)] text-white"
                        aria-label="Move down"
                      >↓</button>
                      <button
                        onClick={() => setPopularIds((arr) => arr.filter((x) => x !== id))}
                        className="rounded border border-[var(--netflix-red)]/50 px-1 hover:bg-[var(--netflix-red)]/20 text-[var(--netflix-red)]"
                        aria-label="Remove"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top 10 selection */}
        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-4 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Top 10 Today</h2>
          <p className="text-xs text-[var(--netflix-light-gray)]">Select up to 10 titles and order them. First = #1.</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-1 border border-[var(--netflix-gray)] rounded-md bg-black/40">
            {movies.map((m) => {
              const active = top10Ids.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleTop10(m.id)}
                  className={`text-left rounded-md border px-2 py-1 text-xs flex items-center gap-2 transition-all ${active ? 'border-[var(--netflix-red)] bg-[var(--netflix-red)]/20 text-white' : 'border-[var(--netflix-gray)] hover:bg-[var(--netflix-gray)] text-[var(--netflix-light-gray)]'}`}
                >
                  <img src={m.pic} alt={m.name} className="h-8 w-8 rounded object-cover border border-[var(--netflix-gray)]" />
                  <span className="truncate flex-1">{m.name}</span>
                  {active && <span className="text-[10px] opacity-70">#{top10Ids.indexOf(m.id) + 1}</span>}
                </button>
              )
            })}
          </div>
          {top10Ids.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {top10Ids.map((id) => {
                const movie = movies.find((m) => m.id === id)
                if (!movie) return null
                return (
                  <div key={id} className="flex items-center gap-2 rounded border border-[var(--netflix-gray)] px-2 py-1 text-xs bg-black/50">
                    <span className="text-white truncate max-w-[120px]">{movie.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setTop10Ids((arr) => moveItem(arr, id, -1))}
                        className="rounded border border-[var(--netflix-gray)] px-1 hover:bg-[var(--netflix-gray)] text-white"
                        aria-label="Move up"
                      >↑</button>
                      <button
                        onClick={() => setTop10Ids((arr) => moveItem(arr, id, 1))}
                        className="rounded border border-[var(--netflix-gray)] px-1 hover:bg-[var(--netflix-gray)] text-white"
                        aria-label="Move down"
                      >↓</button>
                      <button
                        onClick={() => setTop10Ids((arr) => arr.filter((x) => x !== id))}
                        className="rounded border border-[var(--netflix-red)]/50 px-1 hover:bg-[var(--netflix-red)]/20 text-[var(--netflix-red)]"
                        aria-label="Remove"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            disabled={saving}
            onClick={handleSave}
            className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-4 py-2 text-sm disabled:opacity-60 transition-all duration-300 font-medium"
          >
            {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </main>
    </div>
  )
}
