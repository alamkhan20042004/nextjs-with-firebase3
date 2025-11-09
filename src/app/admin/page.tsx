"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { isAdminEmail } from '@/lib/admin'
import LoadingSkeleton from '@/components/LoadingSkeleton'

export const dynamic = 'force-dynamic'

type SectionCount = { name: string; count: number }
type Section = { name: string; links: string[] }
type Movie = {
  id?: string
  name: string
  pic: string
  sections: Section[]
  createdAt?: any
  updatedAt?: any
  type?: 'movie' | 'series'
  featured?: boolean
  popular?: boolean
  topRank?: number | null
  heroDescription?: string
  heroCTALabel?: string
  heroCTAUrl?: string
  heroImageUrl?: string
  genres?: string[]
}

const AVAILABLE_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'Crime',
  'Documentary',
  'Animation',
  'Family',
  'Musical',
  '18+',
  'War',
  'Western',
  'Biographical',
  'Historical'
]

export default function AdminPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  // Form state
  const [movieId, setMovieId] = useState<string | null>(null) // null => create, else update existing
  const [name, setName] = useState('')
  const [pic, setPic] = useState('')
  const [sectionsCounts, setSectionsCounts] = useState<SectionCount[]>([
    { name: 'Season 1', count: 0 },
  ])
  const [typeValue, setTypeValue] = useState<'movie' | 'series'>('movie')
  const [links, setLinks] = useState<string[]>([]) // up to 1000 individual fields
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // New metadata states
  const [featured, setFeatured] = useState(false)
  const [popular, setPopular] = useState(false)
  const [topRank, setTopRank] = useState<number | ''>('')
  const [heroDescription, setHeroDescription] = useState('')
  const [heroCTALabel, setHeroCTALabel] = useState('')
  const [heroCTAUrl, setHeroCTAUrl] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [genres, setGenres] = useState<string[]>([])

  // Data list
  const [movies, setMovies] = useState<Movie[]>([])
  const moviesRef = useMemo(() => (db ? collection(db, 'movies') : null), [])

  // Auth guard
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

  // Fetch movies
  const loadMovies = useCallback(async () => {
    if (!moviesRef) return
    const q = query(moviesRef, orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    const list: Movie[] = []
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DocumentData) } as Movie))
    setMovies(list)
  }, [moviesRef])

  useEffect(() => {
    loadMovies().catch(() => {})
  }, [loadMovies])

  // Helpers
  const nonEmptyLinks = useMemo(() => links.map((l) => l.trim()).filter(Boolean).slice(0, 1000), [links])

  function sliceLinksBySections(counts: SectionCount[], links: string[]): Section[] {
    const sections: Section[] = []
    let index = 0
    for (const sc of counts) {
      const slice = links.slice(index, index + (Number.isFinite(sc.count) ? sc.count : 0))
      sections.push({ name: sc.name || 'Section', links: slice })
      index += sc.count
    }
    return sections
  }

  function resetForm() {
    setMovieId(null)
    setName('')
    setPic('')
    setSectionsCounts([{ name: 'Season 1', count: 0 }])
  setLinks([])
    setMessage(null)
    setTypeValue('movie')
    setFeatured(false)
    setPopular(false)
    setTopRank('')
    setHeroDescription('')
    setHeroCTALabel('')
    setHeroCTAUrl('')
    setHeroImageUrl('')
    setGenres([])
  }

  function loadIntoForm(m: Movie) {
    setMovieId(m.id ?? null)
    setName(m.name)
    setPic(m.pic)
    setTypeValue((m.type as 'movie' | 'series') || 'movie')
    // Reconstruct counts from stored sections
    setSectionsCounts(m.sections.map((s, i) => ({ name: s.name || `Section ${i + 1}`, count: s.links.length })))
  setLinks(m.sections.flatMap((s) => s.links).slice(0, 1000))
    setMessage(null)
  setFeatured(!!m.featured)
  setPopular(!!m.popular)
  setTopRank(typeof m.topRank === 'number' ? m.topRank : '')
  setHeroDescription(m.heroDescription || '')
  setHeroCTALabel(m.heroCTALabel || '')
  setHeroCTAUrl(m.heroCTAUrl || '')
  setHeroImageUrl(m.heroImageUrl || '')
  setGenres(m.genres || [])
  }

  const handleSubmit = useCallback(async () => {
    setMessage(null)
    if (!db || !moviesRef) {
      setMessage({ type: 'error', text: 'Database not available in this environment.' })
      return
    }
    // Basic validation
    if (!name.trim()) return setMessage({ type: 'error', text: 'Name is required.' })
    if (!pic.trim()) return setMessage({ type: 'error', text: 'Pic URL is required.' })
    if (nonEmptyLinks.length === 0) return setMessage({ type: 'error', text: 'Please provide at least one video link.' })
    const totalRequested = sectionsCounts.reduce((a, b) => a + (Number.isFinite(b.count) ? b.count : 0), 0)
    if (totalRequested !== nonEmptyLinks.length) {
      return setMessage({
        type: 'error',
        text: `Links count (${nonEmptyLinks.length}) must equal the total across sections (${totalRequested}).`,
      })
    }

    const sections = sliceLinksBySections(sectionsCounts, nonEmptyLinks)
    const payload: Omit<Movie, 'id'> = {
      name: name.trim(),
      pic: pic.trim(),
      type: typeValue,
      sections,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      featured: featured,
      popular: popular,
      topRank: topRank === '' ? null : topRank,
      ...(heroDescription.trim() ? { heroDescription: heroDescription.trim() } : {}),
      ...(heroCTALabel.trim() ? { heroCTALabel: heroCTALabel.trim() } : {}),
      ...(heroCTAUrl.trim() ? { heroCTAUrl: heroCTAUrl.trim() } : {}),
      ...(heroImageUrl.trim() ? { heroImageUrl: heroImageUrl.trim() } : {}),
      ...(genres.length > 0 ? { genres } : {}),
    }

    setSubmitting(true)
    try {
      if (movieId) {
        // Update existing
        const ref = doc(moviesRef, movieId)
        await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() })
        setMessage({ type: 'success', text: 'Movie updated successfully.' })
      } else {
        // Create new
        await addDoc(moviesRef, payload)
        setMessage({ type: 'success', text: 'Movie added successfully.' })
      }
      await loadMovies()
      if (!movieId) resetForm()
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Failed to save movie.' })
    } finally {
      setSubmitting(false)
    }
  }, [db, moviesRef, name, pic, sectionsCounts, nonEmptyLinks, movieId, loadMovies, typeValue, featured, popular, topRank, heroDescription, heroCTALabel, heroCTAUrl, heroImageUrl, genres])

  const handleDelete = useCallback(async (id: string) => {
    // Deletions are handled on the detail page per new flow
    if (!id) return
  }, [])

  if (authorized === null) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] p-6">
        <div className="mx-auto w-full max-w-6xl space-y-6 fade-in">
          <LoadingSkeleton variant="banner" />
          <LoadingSkeleton variant="table" rows={6} />
        </div>
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <div className="min-h-dvh bg-[var(--netflix-black)]">
      {/* Netflix-style admin header */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[var(--netflix-black)] to-transparent border-b border-[var(--netflix-gray)]">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--netflix-red)]">Admin Dashboard</h1>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] hidden sm:block truncate max-w-[160px]">{email}</p>
            <a
              href="/admin/movies"
              className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
            >
              View all movies
            </a>
            <a
              href="/admin/settings"
              className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
            >
              Global settings
            </a>
            <a
              href="/user"
              className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
            >
              User page
            </a>
            <button
              onClick={() => {
                if (!auth) return
                signOut(auth).then(() => router.replace('/user'))
              }}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 py-1.5 text-xs sm:text-sm transition-all duration-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        {/* Form */}
        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-4 sm:p-6 shadow-xl fade-in">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-white">{movieId ? 'Edit movie' : 'Add movie'}</h2>

          {message && (
            <div
              className={`mb-4 rounded-md border px-3 py-2 text-sm fade-in ${
                message.type === 'success'
                  ? 'border-green-600/50 bg-green-600/10 text-green-400'
                  : 'border-[var(--netflix-red)]/50 bg-[var(--netflix-red)]/10 text-[var(--netflix-red)]'
              }`}
              role="alert"
            >
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Movie or series name"
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Pic URL</label>
              <input
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                placeholder="https://..."
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Type</label>
              <select
                value={typeValue}
                onChange={(e) => setTypeValue(e.target.value as 'movie' | 'series')}
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
              >
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
            </div>
          </div>

            {/* Featured / Popular / Top 10 controls */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border border-[var(--netflix-gray)] bg-black/40 p-3">
                <h3 className="text-sm font-semibold text-white mb-2">Homepage & ranking</h3>
                <div className="flex items-center gap-3 mb-2">
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--netflix-light-gray)]">
                    <input type="checkbox" className="h-4 w-4" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                    Featured (Hero banner)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--netflix-light-gray)]">
                    <input type="checkbox" className="h-4 w-4" checked={popular} onChange={(e) => setPopular(e.target.checked)} />
                    Popular on Netflix
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs text-[var(--netflix-light-gray)] col-span-1">Top 10 rank</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={topRank === '' ? '' : topRank}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') return setTopRank('')
                      const n = Math.max(1, Math.min(10, Number(v)))
                      setTopRank(Number.isFinite(n) ? n : '')
                    }}
                    placeholder="1-10"
                    className="col-span-2 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div className="rounded-md border border-[var(--netflix-gray)] bg-black/40 p-3">
                <h3 className="text-sm font-semibold text-white mb-2">Hero banner metadata (optional)</h3>
                <div className="flex flex-col gap-2">
                  <input
                    value={heroImageUrl}
                    onChange={(e) => setHeroImageUrl(e.target.value)}
                    placeholder="Override hero image URL (optional)"
                    className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                  <input
                    value={heroDescription}
                    onChange={(e) => setHeroDescription(e.target.value)}
                    placeholder="Short description for hero banner"
                    className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={heroCTALabel}
                      onChange={(e) => setHeroCTALabel(e.target.value)}
                      placeholder="CTA label (e.g., Play)"
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

              {/* Genres Section */}
              <div className="rounded-md border border-[var(--netflix-gray)] bg-black/40 p-3">
                <h3 className="text-sm font-semibold text-white mb-3">Genres / Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_GENRES.map((genre) => {
                    const isSelected = genres.includes(genre)
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setGenres(genres.filter(g => g !== genre))
                          } else {
                            setGenres([...genres, genre])
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                          isSelected
                            ? 'bg-[var(--netflix-red)] text-white border-2 border-[var(--netflix-red)]'
                            : 'bg-black/60 text-[var(--netflix-light-gray)] border-2 border-[var(--netflix-gray)] hover:border-[var(--netflix-red)]/50 hover:text-white'
                        }`}
                      >
                        {genre}
                      </button>
                    )
                  })}
                </div>
                {genres.length > 0 && (
                  <p className="text-xs text-[var(--netflix-light-gray)] mt-3">
                    Selected: {genres.join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Sections counts */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Sections (e.g., Season 1 ⇒ 5 videos)</label>
              <button
                className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
                onClick={() => setSectionsCounts((s) => [...s, { name: `Season ${s.length + 1}`, count: 0 }])}
              >
                + Add section
              </button>
            </div>
            <div className="space-y-2">
              {sectionsCounts.map((s, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={s.name}
                    onChange={(e) =>
                      setSectionsCounts((arr) => arr.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                    }
                    placeholder={`Season ${idx + 1}`}
                    className="col-span-7 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.count}
                    onChange={(e) =>
                      setSectionsCounts((arr) =>
                        arr.map((it, i) => (i === idx ? { ...it, count: Math.max(0, Number(e.target.value || 0)) } : it)),
                      )
                    }
                    placeholder="Count"
                    className="col-span-4 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                  <button
                    aria-label="Remove section"
                    className="col-span-1 rounded-md border border-[var(--netflix-gray)] px-2 py-2 text-xs hover:bg-[var(--netflix-red)]/20 hover:border-[var(--netflix-red)]/50 transition-all duration-300 text-white"
                    onClick={() => setSectionsCounts((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Individual link fields */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Video links (individual fields, up to 1000)</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
                  onClick={() => setLinks((arr) => (arr.length < 1000 ? [...arr, ''] : arr))}
                >
                  + Add link
                </button>
                <button
                  className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
                  onClick={() => {
                    const total = sectionsCounts.reduce((a, b) => a + (Number.isFinite(b.count) ? b.count : 0), 0)
                    const newLen = Math.min(1000, Math.max(0, total))
                    setLinks((arr) => {
                      const next = arr.slice(0, newLen)
                      while (next.length < newLen) next.push('')
                      return next
                    })
                  }}
                >
                  Sync to sections total
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded-md border border-[var(--netflix-gray)] bg-black/40 p-2">
              {links.length === 0 ? (
                <p className="text-xs text-[var(--netflix-light-gray)]">No link fields yet. Use "Add link" or "Sync to sections total".</p>
              ) : (
                <div className="space-y-2">
                  {links.map((val, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-1 text-xs text-[var(--netflix-light-gray)]">#{idx + 1}</span>
                      <input
                        value={val}
                        onChange={(e) =>
                          setLinks((arr) => arr.map((it, i) => (i === idx ? e.target.value : it)))
                        }
                        placeholder={`https://.../video-${idx + 1}.mp4`}
                        className="col-span-10 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                      />
                      <button
                        aria-label="Remove link"
                        className="col-span-1 rounded-md border border-[var(--netflix-gray)] px-2 py-2 text-xs hover:bg-[var(--netflix-red)]/20 hover:border-[var(--netflix-red)]/50 transition-all duration-300 text-white"
                        onClick={() => setLinks((arr) => arr.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--netflix-light-gray)]">Links provided: {nonEmptyLinks.length} / {links.length}</p>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-4 py-2 text-sm disabled:opacity-60 transition-all duration-300 font-medium"
            >
              {movieId ? (submitting ? 'Updating…' : 'Update') : submitting ? 'Submitting…' : 'Submit'}
            </button>
            {movieId && (
              <button
                onClick={resetForm}
                className="rounded-md border border-[var(--netflix-gray)] px-4 py-2 text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-4 sm:p-6 shadow-xl fade-in">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 text-white">Movies</h2>
          {movies.length === 0 ? (
            <p className="text-sm text-[var(--netflix-light-gray)]">No movies yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-white">
                <thead>
                  <tr className="text-left border-b border-[var(--netflix-gray)]">
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Type</th>
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Name</th>
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Pic</th>
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Sections</th>
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Videos</th>
                    <th className="py-2 pr-3 text-[var(--netflix-light-gray)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {movies.map((m) => {
                    const totalVideos = m.sections.reduce((a, s) => a + s.links.length, 0)
                    return (
                      <tr key={m.id} className="border-b border-[var(--netflix-gray)] hover:bg-[var(--netflix-gray)]/30 transition-colors duration-200">
                        <td className="py-2 pr-3">{m.type ? (m.type === 'movie' ? 'Movie' : 'Series') : '-'}</td>
                        <td className="py-2 pr-3 font-medium">{m.name}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2 max-w-[280px]">
                            <img
                              src={m.pic}
                              alt={`${m.name} poster`}
                              className="h-12 w-12 rounded object-cover border border-[var(--netflix-gray)]"
                              onError={(e) => {
                                const el = e.currentTarget as HTMLImageElement
                                el.style.visibility = 'hidden'
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-3">{m.sections.length}</td>
                        <td className="py-2 pr-3">{totalVideos}</td>
                        <td className="py-2 pr-3">
                          {m.id && (
                            <a
                              href={`/admin/movies/${m.id}`}
                              className="rounded-md border border-[var(--netflix-gray)] bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-2 py-1 text-xs transition-all duration-300"
                            >
                              Show
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
