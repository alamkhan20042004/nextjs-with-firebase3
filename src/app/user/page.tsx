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
  trailerUrl?: string | null
  downloadUrl?: string | null
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
        // setError('This account is not an admin.')
        setError('------------')
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
  <div className="min-h-dvh bg-gradient-to-br from-[var(--netflix-black)] via-gray-900 to-[var(--netflix-black)] relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-[var(--netflix-red)] rounded-full blur-3xl animate-pulse animation-delay-100"></div>
        <div className="absolute top-3/4 right-1/3 w-24 h-24 bg-white/30 rounded-full blur-2xl animate-bounce animation-delay-200"></div>
        <div className="absolute top-1/2 left-3/4 w-20 h-20 bg-[var(--netflix-red)]/40 rounded-full blur-xl animate-ping animation-delay-300"></div>
        <div className="absolute bottom-1/4 left-1/3 w-16 h-16 bg-white/20 rounded-full blur-lg animate-float animation-delay-500"></div>
      </div>

      {/* Enhanced Netflix-style top bar */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[var(--netflix-black)]/95 via-[var(--netflix-black)]/80 to-transparent backdrop-blur-sm border-b border-[var(--netflix-red)]/10">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[var(--netflix-red)] to-[#ff4757] bg-clip-text text-transparent animate-gradient">
            MovieBox
          </h1>
          <div className="flex-1 min-w-[200px] max-w-full order-3 sm:order-none animate-fade-in animation-delay-200">
            <label className="relative block group">
              <span className="sr-only">Search</span>
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-[var(--netflix-light-gray)] group-focus-within:text-[var(--netflix-red)] transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles, genres, actors..."
                className="w-full sm:w-[320px] md:w-[420px] rounded-lg bg-[var(--netflix-gray)]/60 border border-[var(--netflix-gray)]/50 pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--netflix-light-gray)] focus:outline-none focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-[var(--netflix-red)]/50 transition-all duration-300 hover:bg-[var(--netflix-gray)]/80 backdrop-blur-sm"
              />
            </label>
          </div>
          <div className="flex items-center gap-4 animate-fade-in animation-delay-400">
            {email && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--netflix-gray)]/50 backdrop-blur-sm border border-[var(--netflix-gray)]/30">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] truncate max-w-[120px]">
                  {email}
                </p>
              </div>
            )}
            <button
              onClick={handleCheckAdmin}
              disabled={loading}
              className="group relative rounded-lg bg-gradient-to-r from-[var(--netflix-red)] to-[#b91c1c] hover:from-[#b91c1c] hover:to-[var(--netflix-red)] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60 transition-all duration-500 hover:scale-105 hover:shadow-lg hover:shadow-[var(--netflix-red)]/30 transform"
            >
              
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Checking…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Login
                  </>
                )}
              </span>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-shimmer transition-opacity duration-300"></div>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl pb-12">
        {error && (
          <div className="mb-6 mx-4 sm:mx-6 rounded-xl border border-[var(--netflix-red)]/50 bg-gradient-to-r from-[var(--netflix-red)]/20 to-red-900/20 text-[var(--netflix-red)] px-6 py-4 text-sm animate-fade-in backdrop-blur-sm shadow-lg" role="alert">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        {loadingList || loadingCfg ? (
          <div className="space-y-8 animate-fade-in px-4 sm:px-6">
            {/* Enhanced loading skeleton */}
            <div className="relative">
              <div className="aspect-[21/9] bg-gradient-to-r from-[var(--netflix-gray)]/40 to-black/60 rounded-2xl animate-pulse">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-2xl"></div>
                <div className="absolute bottom-8 left-8 space-y-4">
                  <div className="h-8 w-64 bg-white/20 rounded animate-pulse animation-delay-200"></div>
                  <div className="h-4 w-96 bg-white/10 rounded animate-pulse animation-delay-400"></div>
                  <div className="flex gap-3 mt-6">
                    <div className="h-12 w-24 bg-white/20 rounded-lg animate-pulse animation-delay-600"></div>
                    <div className="h-12 w-32 bg-white/10 rounded-lg animate-pulse animation-delay-800"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="animate-fade-in-up animation-delay-300">
              <div className="flex items-center justify-between mb-6">
                <div className="h-7 w-40 rounded-lg bg-gradient-to-r from-[var(--netflix-red)]/20 to-transparent animate-pulse" />
              </div>
              <div className="flex gap-4 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-44 space-y-3">
                    <div className="aspect-[2/3] bg-gradient-to-br from-[var(--netflix-gray)]/40 to-black/40 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }}></div>
                    <div className="h-4 w-32 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 100 + 200}ms` }}></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="animate-fade-in-up animation-delay-600">
              <div className="h-7 w-36 rounded-lg bg-gradient-to-r from-[var(--netflix-red)]/20 to-transparent animate-pulse mb-6" />
              <div className="flex gap-4 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-44 space-y-3">
                    <div className="aspect-[2/3] bg-gradient-to-br from-[var(--netflix-gray)]/40 to-black/40 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100 + 400}ms` }}></div>
                    <div className="h-4 w-28 bg-white/10 rounded animate-pulse" style={{ animationDelay: `${i * 100 + 600}ms` }}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {q.trim().length > 0 ? (
              <div className="px-4 sm:px-6 animate-fade-in-up">
                <BrowseRow title={`Search results (${filteredItems.length})`} items={filteredItems} />
              </div>
            ) : (
              <>
                {/* Hero Banner */}
                {featuredItem && <HeroBanner item={featuredItem} cfg={homeCfg?.hero} />}
                
                <div className="px-4 sm:px-6 space-y-12 mt-12 relative z-10">
                  {/* Popular on Netflix */}
                  {popularItems.length > 0 && (
                    <div className="animate-fade-in-up animation-delay-200">
                      <BrowseRow title="Popular on Netflix" items={popularItems} />
                    </div>
                  )}
                  
                  {/* Top 10 */}
                  {top10.length > 0 && (
                    <div className="animate-fade-in-up animation-delay-400">
                      <TopTenRow title="Top 10 Today" items={top10} />
                    </div>
                  )}
                  
                  {/* Movies */}
                  {movies.length > 0 && (
                    <div className="animate-fade-in-up animation-delay-600">
                      <BrowseRow title="Movies" items={movies} />
                    </div>
                  )}
                  
                  {/* Series */}
                  {series.length > 0 && (
                    <div className="animate-fade-in-up animation-delay-800">
                      <BrowseRow title="Series" items={series} />
                    </div>
                  )}
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
    <div>
      <div className="flex items-center gap-3 mb-6 group/title cursor-pointer">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent group-hover/title:from-[var(--netflix-red)] group-hover/title:to-[#ff4757] transition-all duration-500 animate-gradient">
          {title}
        </h2>
        <svg className="w-5 h-5 text-[var(--netflix-red)] opacity-0 group-hover/title:opacity-100 transition-all duration-300 transform group-hover/title:translate-x-2 group-hover/title:scale-110" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--netflix-light-gray)] animate-fade-in">No {title.toLowerCase()} available.</p>
      ) : (
        <div className="relative group/row">
          <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-4 snap-x snap-mandatory no-vertical-scroll overscroll-x-contain hover:pb-6 transition-all duration-300"
            style={{ WebkitOverflowScrolling: 'touch' }}>
                {items.map((m, idx) => (
                  <Link
                    key={m.id}
                    href={`/watch/${m.id}`}
                    className="relative shrink-0 w-[140px] sm:w-[160px] md:w-[200px] lg:w-[240px] rounded-xl overflow-hidden snap-start group/card transition-all duration-500 hover:scale-110 hover:z-20 animate-fade-in-right"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    {/* Consistent portrait style like TOP 10 row on mobile */}
                    <div className="relative aspect-[2/3] md:aspect-[16/9] bg-gradient-to-br from-[var(--netflix-gray)] to-black/60">
                  {/* Glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/20 via-transparent to-[var(--netflix-red)]/20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 rounded-xl"></div>
                  
              <img
                src={movie.pic}
                alt={movie.name}
                className="w-full aspect-[2/3] object-cover rounded-lg transition-all duration-500 group-hover:brightness-110 group-hover:scale-105 transform"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement
                  el.style.display = 'none'
                }}
              />                  {/* Enhanced badges overlay */}
                  {idx < 3 && (
                    <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
                      <span className="bg-gradient-to-r from-[var(--netflix-red)] to-[#b91c1c] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg animate-pulse">
                        Recently Added
                      </span>
                    </div>
                  )}
                  
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover/card:scale-110 transition-transform duration-300 border border-white/30">
                      <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Enhanced hover info overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover/card:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 sm:p-4">
                    <div className="transform translate-y-4 group-hover/card:translate-y-0 transition-all duration-300 space-y-2">
                      <p className="text-[13px] sm:text-[14px] md:text-sm font-bold text-white line-clamp-2 group-hover/card:text-[var(--netflix-red)] transition-colors duration-300">
                        {m.name}
                      </p>
                          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] md:text-xs text-[var(--netflix-light-gray)]">
                        <span className="px-2 py-0.5 bg-white/20 rounded-full">
                          {m.type === 'series' ? 'Series' : 'Movie'}
                        </span>
                        {m.sections && m.sections.length > 0 && (
                          <span className="px-2 py-0.5 bg-[var(--netflix-red)]/30 rounded-full">
                            {m.sections.length} {m.type === 'series' ? 'Season' : 'Part'}{m.sections.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 animation-delay-200">
                        <button className="w-7 h-7 sm:w-8 sm:h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                        <button className="w-7 h-7 sm:w-8 sm:h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Subtle border on hover */}
                  <div className="absolute inset-0 border-2 border-white/20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-none" />
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
      <div className="flex items-center gap-2 mb-3 group/title cursor-pointer">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white group-hover/title:text-[var(--netflix-light-gray)] transition-colors">{title}</h2>
        <svg className="w-4 h-4 text-white opacity-0 group-hover/title:opacity-100 transition-all transform group-hover/title:translate-x-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--netflix-light-gray)]">No items yet.</p>
      ) : (
        <div className="relative group/row">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-3 snap-x snap-mandatory no-vertical-scroll overscroll-x-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}>
            {items.map((m, idx) => (
              <Link
                key={m.id}
                href={`/watch/${m.id}`}
                className="relative group/top10 shrink-0 snap-start"
              >
                {/* Large ranking number with TOP 10 badge */}
                <div className="absolute -left-3 sm:-left-4 md:-left-6 top-0 bottom-0 flex items-end z-0 pointer-events-none">
                  <span className="text-[100px] sm:text-[140px] md:text-[180px] lg:text-[220px] font-black leading-none select-none" 
                    style={{
                      WebkitTextStroke: '2px var(--netflix-gray)',
                      WebkitTextFillColor: 'transparent',
                      textShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                    {idx + 1}
                  </span>
                </div>
                {/* Poster card */}
                <div className="relative z-10 w-[140px] sm:w-[160px] md:w-[200px] lg:w-[240px] rounded overflow-hidden transition-transform duration-300 hover:scale-110">
                  <div className="relative aspect-[2/3] sm:aspect-[16/9] bg-[var(--netflix-gray)]">
                    {/* TOP 10 badge */}
                    <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 z-10">
                      <div className="bg-[var(--netflix-red)] text-white text-[10px] font-bold px-2 py-1 flex items-center gap-1">
                        <span className="text-xs">TOP</span>
                        <span className="text-lg leading-none">{idx < 9 ? '10' : '10'}</span>
                      </div>
                    </div>
                    <img
                      src={m.pic}
                      alt={`${m.name} poster`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement
                        el.style.visibility = 'hidden'
                      }}
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover/top10:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                      <div className="transform translate-y-2 group-hover/top10:translate-y-0 transition-transform duration-200">
                        <p className="text-xs sm:text-sm font-bold text-white mb-1 line-clamp-2">{m.name}</p>
                        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[var(--netflix-light-gray)]">
                          <span>#{idx + 1} in Top 10</span>
                        </div>
                      </div>
                    </div>
                    {/* Border on hover */}
                    <div className="absolute inset-0 border-2 border-white/20 opacity-0 group-hover/top10:opacity-100 transition-opacity duration-200 pointer-events-none" />
                  </div>
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
  const hasFirstPlayable = !!(item.sections?.[0]?.links?.[0])
  const playHref = hasFirstPlayable ? `/watch/${item.id}/0/0` : `/watch/${item.id}`
  return (
    <div className="relative w-full h-[46vh] sm:h-[60vh] md:h-[70vh] overflow-hidden fade-in">
      {/* Background image with gradient overlay */}
      <div className="absolute inset-0">
        <img
          src={(cfg?.imageUrl || item.heroImageUrl || item.pic)}
          alt={item.name}
          className="w-full h-full object-cover object-center sm:object-cover"
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
      <div className="relative h-full flex items-end pb-12 sm:pb-20 px-3 sm:px-6 w-full md:max-w-7xl mx-auto">
        <div className="w-full max-w-xl space-y-4">
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
              href={playHref}
              className="flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold px-5 py-2.5 rounded-md transition-all duration-300 shadow-lg w-fit"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              {cfg?.ctaLabel || item.heroCTALabel || 'Play'}
            </Link>
            <Link
              href={`/watch/${item.id}`}
              className="flex items-center gap-2 bg-[var(--netflix-gray)]/70 hover:bg-[var(--netflix-gray)] text-white font-semibold px-5 py-2.5 rounded-md transition-all duration-300 backdrop-blur w-fit"
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
