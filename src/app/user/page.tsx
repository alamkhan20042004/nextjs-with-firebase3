"use client"

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import { collection, getDocs, orderBy, query, doc, getDoc, type DocumentData } from 'firebase/firestore'
import LoadingSkeleton from '@/components/LoadingSkeleton'

type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  heroImageUrl?: string
  type?: 'movie' | 'series'
  sections: Section[]
  createdAt?: any
  featured?: boolean
  popular?: boolean
  topRank?: number | null
  heroDescription?: string
  heroCTALabel?: string
  heroCTAUrl?: string
}

export default function UserPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const [items, setItems] = useState<Movie[]>([])
  const [homeCfg, setHomeCfg] = useState<{
    hero?: { movieId: string | null; imageUrl?: string; description?: string; ctaLabel?: string; ctaUrl?: string }
    popular?: string[]
    top10?: string[]
  } | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingCfg, setLoadingCfg] = useState(true)
  const moviesRef = useMemo(() => (db ? collection(db, 'movies') : null), [db])
  const homeConfigRef = useMemo(() => (db ? doc(db, 'config', 'home') : null), [db])

  useEffect(() => {
    if (!auth) return
    const unsub = onAuthStateChanged(auth, (user) => {
      setEmail(user?.email ?? null)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!moviesRef) return
      setLoadingList(true)
      try {
        const q = query(moviesRef, orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        const list: Movie[] = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DocumentData) } as Movie))
        setItems(list)
        setError(null)
      } catch (e: any) {
        setError(e?.message || 'Failed to load movies')
      } finally {
        setLoadingList(false)
      }
    }
    load().catch((e) => setError(String(e)))
  }, [moviesRef])

  // Load global home config
  useEffect(() => {
    const loadCfg = async () => {
      if (!homeConfigRef) return
      setLoadingCfg(true)
      try {
        const snap = await getDoc(homeConfigRef)
        if (snap.exists()) {
          setHomeCfg(snap.data() as any)
        } else {
          setHomeCfg(null)
        }
      } finally {
        setLoadingCfg(false)
      }
    }
    loadCfg().catch(() => setLoadingCfg(false))
  }, [homeConfigRef])

  // Ensure we have at least anonymous auth to satisfy common Firestore rules
  useEffect(() => {
    if (!auth) return
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(() => {})
    }
  }, [])

  const handleCheckAdmin = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (!auth) {
        setError('Auth not available in this environment.')
        return
      }
      let current = auth.currentUser
      if (!current) {
        const provider = new GoogleAuthProvider()
        const cred = await signInWithPopup(auth, provider)
        current = cred.user
      }
      const userEmail = current?.email ?? null
      if (isAdminEmail(userEmail)) {
        router.push('/admin')
      } else {
        // setError('This account is not premium.')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to sign in or check admin.')
    } finally {
      setLoading(false)
    }
  }, [router])

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return items
    return items.filter((m) => m.name.toLowerCase().includes(term))
  }, [items, q])

  const movies = filteredItems.filter((i) => (i.type ?? 'movie') === 'movie')
  const series = filteredItems.filter((i) => i.type === 'series')

  const top10 = useMemo(() => {
    // Prefer global config if available
    if (homeCfg?.top10 && homeCfg.top10.length > 0) {
      const byId = new Map(filteredItems.map((m) => [m.id, m]))
      return homeCfg.top10.map((id) => byId.get(id)).filter(Boolean) as Movie[]
    }
    // Fallback to old behavior
    const ranked = filteredItems.filter((m) => typeof m.topRank === 'number' && m.topRank! >= 1 && m.topRank! <= 10)
    if (ranked.length > 0) {
      return ranked.sort((a, b) => (a.topRank! - b.topRank!)).slice(0, 10)
    }
    const getTime = (m: Movie) => {
      try {
        if (m.createdAt?.toDate) return m.createdAt.toDate().getTime()
        if (typeof m.createdAt === 'number') return m.createdAt
      } catch {}
      return 0
    }
    return [...filteredItems].sort((a, b) => getTime(b) - getTime(a)).slice(0, 10)
  }, [filteredItems, homeCfg])

  const featuredItem = useMemo(() => {
    // Prefer global hero selection
    if (homeCfg?.hero?.movieId) {
      const m = filteredItems.find((x) => x.id === homeCfg.hero!.movieId)
      return m || filteredItems[0] || null
    }
    const explicit = filteredItems.find((m) => m.featured)
    return explicit || filteredItems[0] || null
  }, [filteredItems, homeCfg])

  const popularItems = useMemo(() => {
    if (homeCfg?.popular && homeCfg.popular.length > 0) {
      const byId = new Map(filteredItems.map((m) => [m.id, m]))
      return homeCfg.popular.map((id) => byId.get(id)).filter(Boolean).slice(0, 12) as Movie[]
    }
    const flagged = filteredItems.filter((m) => m.popular)
    if (flagged.length > 0) return flagged.slice(0, 12)
    return filteredItems.slice(0, 12)
  }, [filteredItems, homeCfg])

  return (
    <div className="min-h-dvh bg-[var(--netflix-black)]">
      {/* Netflix-style top bar */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[var(--netflix-black)] to-transparent">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--netflix-red)]">MovieBox</h1>
          <div className="flex-1 min-w-[200px] max-w-full order-3 sm:order-none">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles"
                className="w-full sm:w-[320px] md:w-[420px] rounded-md bg-[var(--netflix-gray)]/70 border border-[var(--netflix-gray)] px-3 py-2 text-sm text-white placeholder:text-[var(--netflix-light-gray)] focus:outline-none focus:ring-2 focus:ring-[var(--netflix-red)]/50"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            {email && (
              <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] hidden sm:block truncate max-w-[120px]">
                {email}
              </p>
            )}
            <button
              onClick={handleCheckAdmin}
              disabled={loading}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium disabled:opacity-60 transition-all duration-300"
            >
              {loading ? 'Checking…' : 'Login'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl pb-12">
        {error && (
          <div className="mb-6 mx-4 sm:mx-6 rounded-md border border-[var(--netflix-red)] bg-[var(--netflix-red)]/10 text-[var(--netflix-red)] px-4 py-3 text-sm fade-in" role="alert">
            {error}
          </div>
        )}

        {loadingList || loadingCfg ? (
          <div className="space-y-8 fade-in px-4 sm:px-6">
            <LoadingSkeleton variant="banner" />
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-32 rounded bg-gray-800/60" />
              </div>
              <LoadingSkeleton variant="row" count={6} />
            </div>
            <div>
              <div className="h-6 w-32 rounded bg-gray-800/60 mb-4" />
              <LoadingSkeleton variant="row" count={6} />
            </div>
          </div>
        ) : (
          <>
            {q.trim().length > 0 ? (
              <div className="px-4 sm:px-6">
                <BrowseRow title={`Search results (${filteredItems.length})`} items={filteredItems} />
              </div>
            ) : (
              <>
                {/* Hero Banner */}
                {featuredItem && <HeroBanner item={featuredItem} cfg={homeCfg?.hero} />}
                
                <div className="px-4 sm:px-6 space-y-10 mt-8">
                  {/* Popular on Netflix */}
                  <BrowseRow title="Popular on Netflix" items={popularItems} />
                  
                  {/* Top 10 */}
                  <TopTenRow title="Top 10 Today" items={top10} />
                  
                  {/* Movies */}
                  <BrowseRow title="Movies" items={movies} />
                  
                  {/* Series */}
                  <BrowseRow title="Series" items={series} />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function BrowseRow({ title, items }: { title: string; items: Movie[] }) {
  return (
    <div className="fade-in">
      <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-[var(--netflix-white)]">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--netflix-light-gray)]">No {title.toLowerCase()} available.</p>
      ) : (
        <div className="relative">
    <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-3 snap-x snap-mandatory no-vertical-scroll overscroll-x-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}>
            {items.map((m) => (
              <Link
                key={m.id}
                href={`/watch/${m.id}`}
                className="netflix-card shrink-0 w-[120px] sm:w-[150px] md:w-[180px] rounded-lg overflow-hidden bg-[var(--netflix-gray)] snap-start group/card"
              >
                <div className="relative">
                  <img
                    src={m.pic}
                    alt={`${m.name} poster`}
                    className="w-full h-[180px] sm:h-[225px] md:h-[270px] object-cover transition-all duration-300 group-hover/card:opacity-80 group-hover/card:scale-105"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement
                      el.style.visibility = 'hidden'
                    }}
                  />
                  {/* Enhanced hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                    <div className="transform translate-y-2 group-hover/card:translate-y-0 transition-transform duration-300">
                      <p className="text-xs sm:text-sm font-semibold text-white mb-1">{m.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] sm:text-xs text-[var(--netflix-light-gray)]">
                          {m.type === 'series' ? 'Series' : 'Movie'}
                        </span>
                        {m.sections && m.sections.length > 0 && (
                          <span className="text-[10px] sm:text-xs text-[var(--netflix-light-gray)]">
                            • {m.sections.length} {m.type === 'series' ? 'Season' : 'Part'}{m.sections.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Red border on hover */}
                  <div className="absolute inset-0 border-2 border-[var(--netflix-red)] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 rounded-lg pointer-events-none" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TopTenRow({ title, items }: { title: string; items: Movie[] }) {
  return (
    <div className="fade-in">
      <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-[var(--netflix-white)]">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--netflix-light-gray)]">No items yet.</p>
      ) : (
        <div className="relative">
    <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-3 snap-x snap-mandatory no-vertical-scroll overscroll-x-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}>
            {items.map((m, idx) => (
              <Link
                key={m.id}
                href={`/watch/${m.id}`}
                className="relative group/top10 shrink-0 snap-start"
              >
                {/* Ranking number backdrop */}
                <span className="absolute -left-2 sm:-left-3 bottom-[-8px] sm:bottom-[-10px] text-[96px] sm:text-[120px] md:text-[160px] font-black text-white/10 leading-none select-none pointer-events-none z-0 group-hover/top10:text-white/20 transition-colors duration-300">
                  {idx + 1}
                </span>
                {/* Poster */}
                <div className="relative z-10 w-[120px] sm:w-[150px] md:w-[180px] rounded-lg overflow-hidden netflix-card bg-[var(--netflix-gray)]">
                  <img
                    src={m.pic}
                    alt={`${m.name} poster`}
                    className="w-full h-[180px] sm:h-[225px] md:h-[270px] object-cover transition-all duration-300 group-hover/top10:opacity-80 group-hover/top10:scale-105"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement
                      el.style.visibility = 'hidden'
                    }}
                  />
                  {/* Enhanced hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover/top10:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                    <div className="transform translate-y-2 group-hover/top10:translate-y-0 transition-transform duration-300">
                      <p className="text-xs sm:text-sm font-semibold text-white mb-1">{m.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] sm:text-xs text-[var(--netflix-light-gray)]">
                          #{idx + 1} in Top 10
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Red border on hover */}
                  <div className="absolute inset-0 border-2 border-[var(--netflix-red)] opacity-0 group-hover/top10:opacity-100 transition-opacity duration-300 rounded-lg pointer-events-none" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HeroBanner({ item, cfg }: { item: Movie; cfg?: { imageUrl?: string; description?: string; ctaLabel?: string; ctaUrl?: string } }) {
  return (
    <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh] overflow-hidden fade-in">
      {/* Background image with gradient overlay */}
      <div className="absolute inset-0">
        <img
          src={(cfg?.imageUrl || item.heroImageUrl || item.pic)}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement
            el.style.visibility = 'hidden'
          }}
        />
        {/* Multi-layer gradient for Netflix look */}
  <div className="absolute inset-0 bg-gradient-to-t from-[var(--netflix-black)] via-[var(--netflix-black)]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-black)]/80 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--netflix-black)] to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-end pb-16 sm:pb-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="max-w-xl space-y-4">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white drop-shadow-2xl">
            {item.name}
          </h1>
          <p className="text-sm sm:text-base text-[var(--netflix-light-gray)] line-clamp-3">
            {cfg?.description || item.heroDescription || (item.type === 'series'
              ? `Binge-watch this series with ${item.sections?.length || 0} season${item.sections?.length !== 1 ? 's' : ''} of thrilling episodes.`
              : 'Experience this captivating story that will keep you on the edge of your seat.')}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <Link
              href={(cfg?.ctaUrl || item.heroCTAUrl || `/watch/${item.id}`)}
              className="flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold px-6 py-2.5 rounded-md transition-all duration-300 shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              {cfg?.ctaLabel || item.heroCTALabel || 'Play'}
            </Link>
            <Link
              href={`/watch/${item.id}`}
              className="flex items-center gap-2 bg-[var(--netflix-gray)]/70 hover:bg-[var(--netflix-gray)] text-white font-semibold px-6 py-2.5 rounded-md transition-all duration-300 backdrop-blur"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              More Info
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
