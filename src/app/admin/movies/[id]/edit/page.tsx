"use client"

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import { doc, getDoc, serverTimestamp, updateDoc, type DocumentData } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

type SectionCount = { name: string; count: number }
type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  sections: Section[]
  type?: 'movie' | 'series'
  featured?: boolean
  popular?: boolean
  topRank?: number | null
  heroDescription?: string
  heroCTALabel?: string
  heroCTAUrl?: string
  heroImageUrl?: string
  genres?: string[]
  trailerUrl?: string | null
  downloadUrl?: string | null
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

export default function EditMoviePage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id ?? '')

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  // Form
  const [name, setName] = useState('')
  const [pic, setPic] = useState('')
  const [sectionsCounts, setSectionsCounts] = useState<SectionCount[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [typeValue, setTypeValue] = useState<'movie' | 'series'>('movie')
  const [featured, setFeatured] = useState(false)
  const [popular, setPopular] = useState(false)
  const [topRank, setTopRank] = useState<number | ''>('')
  const [heroDescription, setHeroDescription] = useState('')
  const [heroCTALabel, setHeroCTALabel] = useState('')
  const [heroCTAUrl, setHeroCTAUrl] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [trailerUrl, setTrailerUrl] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Input sanitizers / normalizers (same as create)
  function extractHrefFromAnchor(input: string): string | null {
    try {
      const m = input.match(/href\s*=\s*"([^"]+)"/i) || input.match(/href\s*=\s*'([^']+)'/i)
      if (m && m[1]) return m[1]
    } catch {}
    return null
  }
  function normalizeDownloadInput(input: string): string {
    const raw = input.trim()
    if (!raw) return ''
    if (raw.startsWith('<')) {
      const href = extractHrefFromAnchor(raw)
      return href ? href.trim() : ''
    }
    return raw
  }
  function extractYouTubeId(input: string): string | null {
    const raw = input.trim()
    if (!raw) return null
    if (raw.startsWith('<')) {
      const src = (raw.match(/src\s*=\s*"([^"]+)"/i) || raw.match(/src\s*=\s*'([^']+)'/i))?.[1]
      if (src) return extractYouTubeId(src)
    }
    if (raw.includes('youtu.be/')) return raw.split('youtu.be/')[1]?.split(/[?&#]/)[0] || null
    if (raw.includes('youtube.com/watch')) {
      try { const u = new URL(raw); return u.searchParams.get('v') } catch { return null }
    }
    if (raw.includes('youtube.com/embed/')) return raw.split('/embed/')[1]?.split(/[?&#]/)[0] || null
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
    return null
  }
  function normalizeYouTubeInput(input: string): string {
    const id = extractYouTubeId(input)
    return id ? `https://www.youtube.com/watch?v=${id}` : ''
  }

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

  const load = useCallback(async () => {
    if (!db || !id) return
    setLoading(true)
    try {
      const ref = doc(db, 'movies', id)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        setMessage({ type: 'error', text: 'Movie not found.' })
        return
      }
    const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
      setName(data.name)
      setPic(data.pic)
    setTypeValue((data.type as 'movie' | 'series') || 'movie')
  setSectionsCounts(data.sections.map((s, i) => ({ name: s.name || `Section ${i + 1}`, count: s.links.length })))
  setLinks(data.sections.flatMap((s) => s.links).slice(0, 1000))
    setFeatured(!!data.featured)
    setPopular(!!data.popular)
    setTopRank(typeof data.topRank === 'number' ? data.topRank : '')
    setHeroDescription(data.heroDescription || '')
    setHeroCTALabel(data.heroCTALabel || '')
    setHeroCTAUrl(data.heroCTAUrl || '')
    setHeroImageUrl(data.heroImageUrl || '')
    setGenres(data.genres || [])
    setTrailerUrl((data as any).trailerUrl || '')
    setDownloadUrl((data as any).downloadUrl || '')
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Failed to load movie.' })
    } finally {
      setLoading(false)
    }
  }, [db, id])

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [load])

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

  const nonEmptyLinks = useMemo(() => links.map((l) => l.trim()).filter(Boolean).slice(0, 1000), [links])

  const handleUpdate = async () => {
    setMessage(null)
    if (!db || !id) return
    const linksArray = nonEmptyLinks
    if (!name.trim()) return setMessage({ type: 'error', text: 'Name is required.' })
    if (!pic.trim()) return setMessage({ type: 'error', text: 'Pic URL is required.' })
    // Allow zero links/sections. If links exist but no sections are defined, auto-group into a single default section.
    let sections: Section[] = []
    if (linksArray.length > 0) {
      if (sectionsCounts.length === 0) {
        sections = [{ name: 'Section 1', links: linksArray }]
      } else {
        const totalRequested = sectionsCounts.reduce((a, b) => a + (Number.isFinite(b.count) ? b.count : 0), 0)
        if (totalRequested !== linksArray.length) {
          return setMessage({ type: 'error', text: `Links count (${linksArray.length}) must equal the total across sections (${totalRequested}).` })
        }
        sections = sliceLinksBySections(sectionsCounts, linksArray)
      }
    }
    setSaving(true)
    try {
      const ref = doc(db, 'movies', id)
      // Build an update payload without undefined values.
      const base: any = {
        name: name.trim(),
        pic: pic.trim(),
        type: typeValue,
        sections,
        featured: featured,
        popular: popular,
        topRank: topRank === '' ? null : topRank,
        updatedAt: serverTimestamp(),
      }
      if (heroDescription.trim()) base.heroDescription = heroDescription.trim(); else base.heroDescription = null
      if (heroCTALabel.trim()) base.heroCTALabel = heroCTALabel.trim(); else base.heroCTALabel = null
      if (heroCTAUrl.trim()) base.heroCTAUrl = heroCTAUrl.trim(); else base.heroCTAUrl = null
      if (heroImageUrl.trim()) base.heroImageUrl = heroImageUrl.trim(); else base.heroImageUrl = null
      const normalizedTrailer = normalizeYouTubeInput(trailerUrl)
      const normalizedDownload = normalizeDownloadInput(downloadUrl)
      base.trailerUrl = normalizedTrailer || null
      base.downloadUrl = normalizedDownload || null
      base.genres = genres.length > 0 ? genres : []
      await updateDoc(ref, base)
      setMessage({ type: 'success', text: 'Movie updated successfully.' })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Failed to update movie.' })
    } finally {
      setSaving(false)
    }
  }

  if (authorized === null || loading) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-netflix-black">
        <p className="text-sm text-netflix-white/80">Loading…</p>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className="min-h-dvh p-6 bg-[var(--netflix-black)] text-white">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Edit movie</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-[var(--netflix-light-gray)] hidden sm:block">{email}</p>
            <Link
              href="/admin/movies"
              className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-sm text-white hover:bg-[var(--netflix-gray)] transition-all duration-300"
            >
              Back to list
            </Link>
            <button
              onClick={() => {
                if (!auth) return
                signOut(auth).then(() => router.replace('/user'))
              }}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 py-1.5 text-sm transition-all duration-300"
            >
              Sign out
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              message.type === 'success'
                ? 'border-netflix-green/30 bg-netflix-green/10 text-netflix-green'
                : 'border-netflix-red/30 bg-netflix-red/10 text-netflix-red'
            }`}
            role="alert"
          >
            {message.text}
          </div>
        )}

        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-6 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                placeholder="Enter movie name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Pic URL</label>
              <input
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                placeholder="Enter image URL"
              />
              <div className="flex items-start gap-2 mt-2">
                <img
                  src={pic}
                  alt={`${name || 'poster'} preview`}
                  className="h-20 w-16 rounded object-cover border border-[var(--netflix-gray)]"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                  }}
                />
                {pic && (
                  <a href={pic} target="_blank" rel="noreferrer" className="text-xs text-[var(--netflix-red)] hover:underline break-all">
                    {pic}
                  </a>
                )}
              </div>
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

          {/* Featured / Popular / Top 10 & Hero metadata */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-[var(--netflix-gray)] bg-black/40 p-3">
              <h3 className="text-sm font-semibold text-white mb-2">Homepage & ranking</h3>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[var(--netflix-light-gray)]">
                  <input type="checkbox" className="h-4 w-4" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                  Featured (Hero banner)
                </label>
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[var(--netflix-light-gray)]">
                  <input type="checkbox" className="h-4 w-4" checked={popular} onChange={(e) => setPopular(e.target.checked)} />
                  Popular row
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
              <h3 className="text-sm font-semibold text-white mb-2">Hero banner metadata</h3>
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
                  placeholder="Short description"
                  className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={heroCTALabel}
                    onChange={(e) => setHeroCTALabel(e.target.value)}
                    placeholder="CTA label"
                    className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                  />
                  <input
                    value={heroCTAUrl}
                    onChange={(e) => setHeroCTAUrl(e.target.value)}
                    placeholder="CTA link"
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
            {/* Trailer & Download */}
            <div className="rounded-md border border-[var(--netflix-gray)] bg-black/40 p-3">
              <h3 className="text-sm font-semibold text-white mb-3">Trailer & Download</h3>
              <div className="flex flex-col gap-2">
                <input
                  value={trailerUrl}
                  onChange={(e) => setTrailerUrl(e.target.value)}
                  placeholder="YouTube watch or embed URL (optional)"
                  className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                />
                <input
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                  placeholder="Direct download URL (optional)"
                  className="rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Sections (optional; name + count)</label>
              <button
                className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs text-white hover:bg-[var(--netflix-gray)] hover:scale-105 hover:shadow-md transition-all duration-300 transform active:scale-95"
                onClick={() => setSectionsCounts((s) => [...s, { name: `Section ${s.length + 1}`, count: 0 }])}
              >
                + Add section
              </button>
            </div>
            <p className="text-xs text-[var(--netflix-light-gray)] mb-2">Tip: Leave sections empty and all video links will be grouped into one default section automatically.</p>
            <div className="space-y-2">
              {sectionsCounts.map((s, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={s.name}
                    onChange={(e) =>
                      setSectionsCounts((arr) => arr.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                    }
                    className="col-span-7 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                    placeholder="Section name"
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
                    className="col-span-4 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                    placeholder="Count"
                  />
                  <button
                    aria-label="Remove section"
                    className="col-span-1 rounded-md border border-[var(--netflix-gray)] px-2 py-2 text-xs text-white hover:bg-[var(--netflix-red)]/20 hover:border-[var(--netflix-red)]/50 transition-all duration-300"
                    onClick={() => setSectionsCounts((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--netflix-light-gray)]">Video links (optional, up to 1000)</label>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs text-white hover:bg-[var(--netflix-gray)] transition-all duration-300"
                  onClick={() => setLinks((arr) => (arr.length < 1000 ? [...arr, ''] : arr))}
                >
                  + Add link
                </button>
                <button
                  className="rounded-md border border-[var(--netflix-gray)] px-2 py-1 text-xs text-white hover:bg-[var(--netflix-gray)] transition-all duration-300"
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
            <p className="text-xs text-[var(--netflix-light-gray)] mb-2">Optional: You can provide zero links, or any number. If sections are empty, all links will go into a single default section.</p>
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
                        onChange={(e) => setLinks((arr) => arr.map((it, i) => (i === idx ? e.target.value : it)))}
                        className="col-span-10 rounded-md border border-[var(--netflix-gray)] bg-black/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-transparent transition-all"
                        placeholder="Paste video link here"
                      />
                      <button
                        aria-label="Remove link"
                        className="col-span-1 rounded-md border border-[var(--netflix-gray)] px-2 py-2 text-xs text-white hover:bg-[var(--netflix-red)]/20 hover:border-[var(--netflix-red)]/50 transition-all duration-300"
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

          <div className="mt-6">
            <button
              disabled={saving}
              onClick={handleUpdate}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] hover:scale-105 hover:shadow-lg hover:shadow-red-500/30 text-white px-4 py-2 text-sm disabled:opacity-60 disabled:scale-100 disabled:shadow-none transition-all duration-300 font-medium transform active:scale-95"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}









// "use client"

// import Link from 'next/link'
// import { useCallback, useEffect, useMemo, useState } from 'react'
// import { useParams, useRouter } from 'next/navigation'
// import { auth, db } from '@/lib/firebase'
// import { onAuthStateChanged, signOut } from 'firebase/auth'
// import { isAdminEmail } from '@/lib/admin'
// import { doc, getDoc, serverTimestamp, updateDoc, type DocumentData } from 'firebase/firestore'

// export const dynamic = 'force-dynamic'

// type SectionCount = { name: string; count: number }
// type Section = { name: string; links: string[] }
// type Movie = {
//   id: string
//   name: string
//   pic: string
//   sections: Section[]
//   type?: 'movie' | 'series'
// }

// export default function EditMoviePage() {
//   const router = useRouter()
//   const params = useParams()
//   const id = String(params?.id ?? '')

//   const [authorized, setAuthorized] = useState<boolean | null>(null)
//   const [email, setEmail] = useState<string | null>(null)

//   // Form
//   const [name, setName] = useState('')
//   const [pic, setPic] = useState('')
//   const [sectionsCounts, setSectionsCounts] = useState<SectionCount[]>([])
//   const [links, setLinks] = useState<string[]>([])
//   const [typeValue, setTypeValue] = useState<'movie' | 'series'>('movie')
//   const [loading, setLoading] = useState(true)
//   const [saving, setSaving] = useState(false)
//   const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

//   useEffect(() => {
//     if (!auth) {
//       router.replace('/user')
//       return
//     }
//     const unsub = onAuthStateChanged(auth, (user) => {
//       const userEmail = user?.email ?? null
//       setEmail(userEmail)
//       if (userEmail && isAdminEmail(userEmail)) {
//         setAuthorized(true)
//       } else {
//         setAuthorized(false)
//         router.replace('/user')
//       }
//     })
//     return () => unsub()
//   }, [router])

//   const load = useCallback(async () => {
//     if (!db || !id) return
//     setLoading(true)
//     try {
//       const ref = doc(db, 'movies', id)
//       const snap = await getDoc(ref)
//       if (!snap.exists()) {
//         setMessage({ type: 'error', text: 'Movie not found.' })
//         return
//       }
//     const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
//       setName(data.name)
//       setPic(data.pic)
//     setTypeValue((data.type as 'movie' | 'series') || 'movie')
//   setSectionsCounts(data.sections.map((s, i) => ({ name: s.name || `Section ${i + 1}`, count: s.links.length })))
//   setLinks(data.sections.flatMap((s) => s.links).slice(0, 1000))
//     } catch (e: any) {
//       setMessage({ type: 'error', text: e?.message || 'Failed to load movie.' })
//     } finally {
//       setLoading(false)
//     }
//   }, [db, id])

//   useEffect(() => {
//     load().catch(() => setLoading(false))
//   }, [load])

//   function sliceLinksBySections(counts: SectionCount[], links: string[]): Section[] {
//     const sections: Section[] = []
//     let index = 0
//     for (const sc of counts) {
//       const slice = links.slice(index, index + (Number.isFinite(sc.count) ? sc.count : 0))
//       sections.push({ name: sc.name || 'Section', links: slice })
//       index += sc.count
//     }
//     return sections
//   }

//   const nonEmptyLinks = useMemo(() => links.map((l) => l.trim()).filter(Boolean).slice(0, 1000), [links])

//   const handleUpdate = async () => {
//     setMessage(null)
//     if (!db || !id) return
//     const linksArray = nonEmptyLinks
//     if (!name.trim()) return setMessage({ type: 'error', text: 'Name is required.' })
//     if (!pic.trim()) return setMessage({ type: 'error', text: 'Pic URL is required.' })
//     if (linksArray.length === 0) return setMessage({ type: 'error', text: 'Please provide at least one video link.' })
//     const totalRequested = sectionsCounts.reduce((a, b) => a + (Number.isFinite(b.count) ? b.count : 0), 0)
//     if (totalRequested !== linksArray.length) {
//       return setMessage({ type: 'error', text: `Links count (${linksArray.length}) must equal the total across sections (${totalRequested}).` })
//     }
//     const sections = sliceLinksBySections(sectionsCounts, linksArray)
//     setSaving(true)
//     try {
//       const ref = doc(db, 'movies', id)
//       await updateDoc(ref, {
//         name: name.trim(),
//         pic: pic.trim(),
//         type: typeValue,
//         sections,
//         updatedAt: serverTimestamp(),
//       })
//       setMessage({ type: 'success', text: 'Movie updated successfully.' })
//     } catch (e: any) {
//       setMessage({ type: 'error', text: e?.message || 'Failed to update movie.' })
//     } finally {
//       setSaving(false)
//     }
//   }

//   if (authorized === null || loading) {
//     return (
//       <div className="min-h-dvh grid place-items-center p-6">
//         <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p>
//       </div>
//     )
//   }

//   if (!authorized) return null

//   return (
//     <div className="min-h-dvh p-6">
//       <div className="mx-auto w-full max-w-3xl space-y-6">
//         <div className="flex items-center justify-between">
//           <h1 className="text-2xl font-semibold">Edit movie</h1>
//           <div className="flex items-center gap-3">
//             <p className="text-sm text-gray-600 dark:text-gray-300 hidden sm:block">{email}</p>
//             <Link href="/admin/movies" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
//               Back to list
//             </Link>
//             <button
//               onClick={() => {
//                 if (!auth) return
//                 signOut(auth).then(() => router.replace('/user'))
//               }}
//               className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800"
//             >
//               Sign out
//             </button>
//           </div>
//         </div>

//         {message && (
//           <div
//             className={`rounded-md border px-3 py-2 text-sm ${
//               message.type === 'success'
//                 ? 'border-green-200 bg-green-50 text-green-800'
//                 : 'border-red-200 bg-red-50 text-red-800'
//             }`}
//             role="alert"
//           >
//             {message.text}
//           </div>
//         )}

//         <div className="rounded-xl border border-gray-200/40 bg-white/70 dark:bg-gray-900/40 backdrop-blur p-6 shadow-sm">
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             <div className="flex flex-col gap-1.5">
//               <label className="text-sm font-medium">Name</label>
//               <input
//                 value={name}
//                 onChange={(e) => setName(e.target.value)}
//                 className="rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//               />
//             </div>
//             <div className="flex flex-col gap-1.5">
//               <label className="text-sm font-medium">Pic URL</label>
//               <input
//                 value={pic}
//                 onChange={(e) => setPic(e.target.value)}
//                 className="rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//               />
//               <div className="flex items-start gap-2 mt-2">
//                 <img
//                   src={pic}
//                   alt={`${name || 'poster'} preview`}
//                   className="h-20 w-16 rounded object-cover border"
//                   onError={(e) => {
//                     const el = e.currentTarget as HTMLImageElement
//                     el.style.display = 'none'
//                   }}
//                 />
//                 {pic && (
//                   <a href={pic} target="_blank" rel="noreferrer" className="text-xs text-blue-600 break-all">
//                     {pic}
//                   </a>
//                 )}
//               </div>
//             </div>

//             <div className="flex flex-col gap-1.5">
//               <label className="text-sm font-medium">Type</label>
//               <select
//                 value={typeValue}
//                 onChange={(e) => setTypeValue(e.target.value as 'movie' | 'series')}
//                 className="rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//               >
//                 <option value="movie">Movie</option>
//                 <option value="series">Series</option>
//               </select>
//             </div>
//           </div>

//           <div className="mt-4">
//             <div className="flex items-center justify-between mb-2">
//               <label className="text-sm font-medium">Sections (name + count)</label>
//               <button
//                 className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
//                 onClick={() => setSectionsCounts((s) => [...s, { name: `Section ${s.length + 1}`, count: 0 }])}
//               >
//                 + Add section
//               </button>
//             </div>
//             <div className="space-y-2">
//               {sectionsCounts.map((s, idx) => (
//                 <div key={idx} className="grid grid-cols-12 gap-2 items-center">
//                   <input
//                     value={s.name}
//                     onChange={(e) =>
//                       setSectionsCounts((arr) => arr.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
//                     }
//                     className="col-span-7 rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//                   />
//                   <input
//                     type="number"
//                     min={0}
//                     value={s.count}
//                     onChange={(e) =>
//                       setSectionsCounts((arr) =>
//                         arr.map((it, i) => (i === idx ? { ...it, count: Math.max(0, Number(e.target.value || 0)) } : it)),
//                       )
//                     }
//                     className="col-span-4 rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//                   />
//                   <button
//                     aria-label="Remove section"
//                     className="col-span-1 rounded-md border px-2 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/30"
//                     onClick={() => setSectionsCounts((arr) => arr.filter((_, i) => i !== idx))}
//                   >
//                     ✕
//                   </button>
//                 </div>
//               ))}
//             </div>
//           </div>

//           <div className="mt-4">
//             <div className="flex items-center justify-between mb-2">
//               <label className="text-sm font-medium">Video links (individual fields, up to 1000)</label>
//               <div className="flex gap-2">
//                 <button
//                   className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
//                   onClick={() => setLinks((arr) => (arr.length < 1000 ? [...arr, ''] : arr))}
//                 >
//                   + Add link
//                 </button>
//                 <button
//                   className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
//                   onClick={() => {
//                     const total = sectionsCounts.reduce((a, b) => a + (Number.isFinite(b.count) ? b.count : 0), 0)
//                     const newLen = Math.min(1000, Math.max(0, total))
//                     setLinks((arr) => {
//                       const next = arr.slice(0, newLen)
//                       while (next.length < newLen) next.push('')
//                       return next
//                     })
//                   }}
//                 >
//                   Sync to sections total
//                 </button>
//               </div>
//             </div>
//             <div className="max-h-[360px] overflow-y-auto rounded-md border p-2">
//               {links.length === 0 ? (
//                 <p className="text-xs text-gray-500">No link fields yet. Use "Add link" or "Sync to sections total".</p>
//               ) : (
//                 <div className="space-y-2">
//                   {links.map((val, idx) => (
//                     <div key={idx} className="grid grid-cols-12 gap-2 items-center">
//                       <span className="col-span-1 text-xs text-gray-500">#{idx + 1}</span>
//                       <input
//                         value={val}
//                         onChange={(e) => setLinks((arr) => arr.map((it, i) => (i === idx ? e.target.value : it)))}
//                         className="col-span-10 rounded-md border px-3 py-2 text-sm bg-white/90 dark:bg-gray-950/60"
//                       />
//                       <button
//                         aria-label="Remove link"
//                         className="col-span-1 rounded-md border px-2 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/30"
//                         onClick={() => setLinks((arr) => arr.filter((_, i) => i !== idx))}
//                       >
//                         ✕
//                       </button>
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>
//             <p className="mt-1 text-xs text-gray-500">Links provided: {nonEmptyLinks.length} / {links.length}</p>
//           </div>

//           <div className="mt-6">
//             <button
//               disabled={saving}
//               onClick={handleUpdate}
//               className="rounded-md bg-black text-white px-4 py-2 text-sm hover:bg-black/90 disabled:opacity-60"
//             >
//               {saving ? 'Saving…' : 'Save changes'}
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }
