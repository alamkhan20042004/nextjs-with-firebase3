"use client"

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import { collection, getDocs, orderBy, query, doc, getDoc, type DocumentData } from 'firebase/firestore'
import { incrementMovieClick, shouldIncrement } from '@/lib/counters'
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
    hero?: { movieId: string | null; imageUrl?: string; description?: string; ctaLabel?: string; ctaUrl?: string; preferUpcoming?: boolean; upcomingMovieId?: string | null }
    popular?: string[]
    top10?: string[]
    upcoming?: { enabled?: boolean; title?: string }
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

  const isUpcoming = useCallback((m: Movie) => {
    if (typeof m.downloadUrl !== 'string') return false
    return /coming\s*soon/i.test(m.downloadUrl.trim())
  }, [])

  const upcomingItems = useMemo(() => {
    const list = filteredItems.filter(isUpcoming)
    const withTime = (mm: Movie) => {
      try {
        if (mm.createdAt?.toDate) return mm.createdAt.toDate().getTime()
        if (typeof mm.createdAt === 'number') return mm.createdAt
      } catch {}
      return 0
    }
    return list.sort((a, b) => withTime(b) - withTime(a))
  }, [filteredItems, isUpcoming])

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
    // If admin prefers upcoming in hero, try upcoming first
    if (homeCfg?.hero?.preferUpcoming) {
      if (homeCfg.hero.upcomingMovieId) {
        const sel = filteredItems.find((x) => x.id === homeCfg.hero!.upcomingMovieId)
        if (sel && isUpcoming(sel)) return sel
      }
      if (upcomingItems.length > 0) return upcomingItems[0]
    }
    // Prefer explicit hero selection
    if (homeCfg?.hero?.movieId) {
      const m = filteredItems.find((x) => x.id === homeCfg.hero!.movieId)
      return m || filteredItems[0] || null
    }
    const explicit = filteredItems.find((m) => m.featured)
    return explicit || filteredItems[0] || null
  }, [filteredItems, homeCfg, upcomingItems, isUpcoming])

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
                // placeholder="Search titles, genres, actors..."
                placeholder="Search here & Download Full Movie(Series) in Hindi"
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
                  {/* Upcoming (placed before Popular) */}
                  {homeCfg?.upcoming?.enabled && upcomingItems.length > 0 && (
                    <div className="animate-fade-in-up animation-delay-150">
                      <BrowseRow title={homeCfg?.upcoming?.title || 'Upcoming'} items={upcomingItems} />
                    </div>
                  )}
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
                    className="relative shrink-0 w-[140px] sm:w-[160px] md:w-[200px] lg:w-[240px] rounded-xl overflow-hidden snap-start group/card transition-all duration-500 hover:scale-110 hover:z-20 animate-fade-in-right shadow-lg hover:shadow-2xl hover:shadow-[var(--netflix-red)]/20"
                    style={{ animationDelay: `${idx * 100}ms` }}
                    onClick={async () => { try { if (shouldIncrement(m.id)) await incrementMovieClick(m.id) } catch {} }}
                  >
                    {/* Enhanced card design with premium feel */}
                    <div className="relative aspect-[2/3] md:aspect-[16/9] bg-gradient-to-br from-[var(--netflix-gray)] via-gray-800 to-black/80 overflow-hidden">
                      {/* Premium glow effects */}
                      <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/20 via-purple-500/10 to-[var(--netflix-red)]/20 opacity-0 group-hover/card:opacity-100 transition-all duration-500 animate-pulse"></div>
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--netflix-red)] via-pink-500 to-[var(--netflix-red)] rounded-xl opacity-0 group-hover/card:opacity-30 blur-sm transition-all duration-500"></div>
                      
                      {/* Animated border shine */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 animate-[shimmer_2s_ease-in-out_infinite]"></div>
                  
                      <img
                        src={m.pic}
                        alt={m.name}
                        className="w-full h-full object-cover transition-all duration-700 group-hover:brightness-125 group-hover:contrast-110 group-hover:scale-105 transform filter"
                        onError={(e) => {
                          const el = e.currentTarget as HTMLImageElement
                          el.style.display = 'none'
                        }}
                      />

                      {/* Coming Soon badge - EXTRAORDINARY premium style */}
                      {(typeof m.downloadUrl === 'string' && /coming\s*soon/i.test(m.downloadUrl.trim())) && (
                        <div className="absolute bottom-3 left-3 z-30 group-hover/card:bottom-5 group-hover/card:left-5 transition-all duration-500">
                          <div className="relative">
                            {/* Multiple animated glow layers */}
                            <div className="absolute -inset-2 bg-gradient-to-r from-pink-500 via-[var(--netflix-red)] to-orange-500 opacity-75 blur-xl animate-pulse"></div>
                            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 opacity-60 blur-md animate-pulse animation-delay-300"></div>
                            <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)] via-orange-400 to-yellow-300 opacity-90 blur-sm animate-ping animation-delay-500"></div>
                            
                            {/* Rotating border gradient */}
                            <div className="absolute -inset-[3px] bg-gradient-to-r from-yellow-300 via-[var(--netflix-red)] to-purple-500 rounded-xl opacity-0 group-hover/card:opacity-100 animate-spin-slow blur-[1px]" style={{ animation: 'spin 4s linear infinite' }}></div>
                            
                            {/* Shimmer sweep */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover/card:translate-x-full transition-transform duration-1000 rounded-xl"></div>
                            
                            {/* Main badge container */}
                            <div className="relative px-4 py-2 rounded-xl overflow-hidden group-hover/card:scale-125 transition-all duration-500 shadow-2xl" style={{ 
                              background: 'linear-gradient(135deg, #E50914 0%, #FF6B6B 25%, #FFD93D 50%, #FF6B6B 75%, #E50914 100%)',
                              backgroundSize: '200% 200%',
                              animation: 'gradient 3s ease infinite'
                            }}>
                              {/* Inner glow */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/20"></div>
                              
                              {/* Floating particles */}
                              <div className="absolute top-0 left-1/4 w-1 h-1 bg-white rounded-full animate-float opacity-80"></div>
                              <div className="absolute top-1 right-1/4 w-1 h-1 bg-yellow-200 rounded-full animate-float animation-delay-300 opacity-70"></div>
                              <div className="absolute bottom-1 left-1/3 w-0.5 h-0.5 bg-white rounded-full animate-bounce animation-delay-500"></div>
                              
                              {/* Badge content */}
                              <div className="relative flex items-center gap-2">
                                {/* Triple pulsing dots */}
                                <div className="relative flex items-center gap-0.5">
                                  <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50 animation-delay-200"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-yellow-200 to-white shadow-lg shadow-yellow-400/50"></span>
                                  </span>
                                </div>
                                
                                {/* Animated text */}
                                <span className="text-[12px] font-black tracking-widest uppercase relative z-10" style={{
                                  background: 'linear-gradient(90deg, #FFFFFF 0%, #FFD700 25%, #FFFFFF 50%, #FFE4B5 75%, #FFFFFF 100%)',
                                  backgroundSize: '200% auto',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                  animation: 'gradient 2s linear infinite',
                                  textShadow: '0 0 20px rgba(255,215,0,0.8), 0 0 30px rgba(255,255,255,0.6)',
                                  filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.9))'
                                }}>
                                  Coming Soon
                                </span>
                                
                                {/* Sparkle burst */}
                                <div className="relative">
                                  <svg className="w-4 h-4 text-yellow-200 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  <div className="absolute inset-0 animate-ping opacity-50">
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom accent line */}
                              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-60"></div>
                              
                              {/* Top shine */}
                              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent"></div>
                            </div>

                            {/* Outer glow ring */}
                            <div className="absolute -inset-4 border-2 border-yellow-400/30 rounded-2xl opacity-0 group-hover/card:opacity-100 animate-pulse animation-delay-200"></div>
                            
                            {/* Corner light beams */}
                            <div className="absolute -top-1 -right-1 w-8 h-8 bg-gradient-to-br from-white/80 via-yellow-300/40 to-transparent rounded-full blur-sm opacity-90 group-hover/card:scale-150 transition-transform duration-700"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-gradient-to-tr from-orange-400/60 via-red-300/40 to-transparent rounded-full blur-sm opacity-80 group-hover/card:scale-150 transition-transform duration-700 animation-delay-300"></div>
                          </div>
                        </div>
                      )}
                      
                      {/* Quality badge */}
                      <div className="absolute top-3 right-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-lg opacity-90 group-hover/card:opacity-100 transition-all duration-300">
                        4K HDR
                      </div>                  {/* Enhanced badges overlay */}
                      {/* Premium badges */}
                      {idx < 3 && (
                        <div className="absolute top-3 left-3 z-20">
                          <div className="bg-gradient-to-r from-[var(--netflix-red)] via-red-500 to-[var(--netflix-red)] text-white text-[9px] font-bold px-3 py-1.5 rounded-full shadow-xl border border-white/20 backdrop-blur-sm animate-pulse">
                            ✨ NEW
                          </div>
                        </div>
                      )}
                      
                      {/* Trending indicator */}
                      {idx % 4 === 0 && (
                        <div className="absolute top-3 left-3 z-20">
                          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-[9px] font-bold px-3 py-1.5 rounded-full shadow-xl border border-white/20 backdrop-blur-sm">
                            🔥 TRENDING
                          </div>
                        </div>
                      )}
                  
                      {/* Enhanced play button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-500">
                        <div className="relative">
                          {/* Pulsing ring effect */}
                          <div className="absolute inset-0 w-20 h-20 bg-white/10 rounded-full animate-ping"></div>
                          <div className="relative w-20 h-20 bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-md rounded-full flex items-center justify-center group-hover/card:scale-110 transition-all duration-300 border-2 border-white/40 shadow-2xl">
                            <svg className="w-8 h-8 text-white ml-1 drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                  
                      {/* Premium info overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover/card:opacity-100 transition-all duration-500 flex flex-col justify-end p-4">
                        <div className="transform translate-y-6 group-hover/card:translate-y-0 transition-all duration-500 space-y-3">
                          <div className="space-y-2">
                            <h3 className="text-sm font-bold text-white line-clamp-2 group-hover/card:text-transparent group-hover/card:bg-gradient-to-r group-hover/card:from-[var(--netflix-red)] group-hover/card:to-pink-400 group-hover/card:bg-clip-text transition-all duration-500">
                              {m.name}
                            </h3>
                            
                            {/* Rating stars */}
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <svg key={i} className={`w-3 h-3 ${i < 4 ? 'text-yellow-400' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                              <span className="text-xs text-yellow-400 ml-1 font-medium">4.2</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[10px] text-[var(--netflix-light-gray)]">
                            <span className="px-2 py-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full border border-white/20 backdrop-blur-sm">
                              {m.type === 'series' ? '📺 Series' : '🎬 Movie'}
                            </span>
                            {m.sections && m.sections.length > 0 && (
                              <span className="px-2 py-1 bg-gradient-to-r from-[var(--netflix-red)]/20 to-pink-500/20 rounded-full border border-white/20 backdrop-blur-sm">
                                {m.sections.length} {m.type === 'series' ? 'Season' : 'Part'}{m.sections.length > 1 ? 's' : ''}
                              </span>
                            )}
                            <span className="px-2 py-1 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full border border-white/20 backdrop-blur-sm">
                              ✨ Premium
                            </span>
                          </div>
                          
                          {/* Enhanced action buttons */}
                          <div className="flex items-center gap-3 mt-3 opacity-0 group-hover/card:opacity-100 transition-all duration-700 delay-200">
                            <button className="flex items-center gap-1 bg-gradient-to-r from-[var(--netflix-red)] to-red-600 hover:from-red-600 hover:to-[var(--netflix-red)] text-white px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-300 hover:scale-105 shadow-lg">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                              Play
                            </button>
                            <button className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 backdrop-blur-sm border border-white/20">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                              </svg>
                            </button>
                            <button className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 backdrop-blur-sm border border-white/20">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Premium border effects */}
                      <div className="absolute inset-0 border-2 border-gradient-to-r from-[var(--netflix-red)]/40 via-pink-500/40 to-[var(--netflix-red)]/40 opacity-0 group-hover/card:opacity-100 transition-all duration-300 pointer-events-none rounded-xl" />
                      <div className="absolute inset-0 border border-white/30 opacity-0 group-hover/card:opacity-60 transition-all duration-500 pointer-events-none rounded-xl" />
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
                onClick={async () => { try { if (shouldIncrement(m.id)) await incrementMovieClick(m.id) } catch {} }}
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
  const upcoming = typeof item.downloadUrl === 'string' && /coming\s*soon/i.test(item.downloadUrl.trim())
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
          {upcoming && (
            <div className="relative inline-block select-none">
              {/* Outer ambient glow */}
              <div className="absolute -inset-3 bg-gradient-to-r from-yellow-400/20 via-[var(--netflix-red)]/20 to-pink-500/20 blur-2xl rounded-2xl animate-pulse" />
              {/* Rotating soft ring */}
              <div className="pointer-events-none absolute -inset-[2px] rounded-2xl opacity-70" style={{
                background: 'conic-gradient(from 0deg, rgba(255,215,0,0.5), rgba(229,9,20,0.5), rgba(255,105,180,0.4), rgba(255,215,0,0.5))',
                animation: 'spin 8s linear infinite'
              }} />
              {/* Badge body */}
              <div className="relative px-4 sm:px-5 py-1.5 sm:py-2 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md shadow-2xl">
                {/* Shimmer sweep */}
                <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite]" />
                {/* Text */}
                <span
                  className="text-xs sm:text-sm md:text-base font-extrabold tracking-[0.35em] uppercase"
                  style={{
                    background: 'linear-gradient(90deg, #FFFFFF 0%, #FFD700 25%, #FFFFFF 50%, #FFE4B5 75%, #FFFFFF 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'gradient 2.2s linear infinite',
                    textShadow: '0 0 16px rgba(255,215,0,0.85), 0 0 28px rgba(255,255,255,0.5)'
                  }}
                >
                  COMING SOON
                </span>
                {/* Sparkles */}
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-300 shadow-[0_0_10px_rgba(255,215,0,0.9)] animate-ping" />
                <span className="absolute -bottom-1 -left-1 w-1.5 h-1.5 rounded-full bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse" />
              </div>
            </div>
          )}
          {!upcoming && (
            <p className="text-sm sm:text-base text-[var(--netflix-light-gray)] line-clamp-3">
              {cfg?.description || item.heroDescription || (item.type === 'series'
                ? `Binge-watch this series with ${item.sections?.length || 0} season${item.sections?.length !== 1 ? 's' : ''} of thrilling episodes.`
                : 'Experience this captivating story that will keep you on the edge of your seat.')}
            </p>
          )}
          <div className="flex items-center gap-3 pt-2">
            {/* <Link
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
            </Link> */}
          </div>
        </div>
      </div>
    </div>
  )
}
