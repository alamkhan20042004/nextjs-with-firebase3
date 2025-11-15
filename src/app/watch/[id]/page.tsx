"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type DocumentData } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  type?: 'movie' | 'series'
  sections: Section[]
  heroDescription?: string
  heroCTALabel?: string
  heroCTAUrl?: string
  heroImageUrl?: string
  createdAt?: any
  genres?: string[]
  trailerUrl?: string | null
  downloadUrl?: string | null
}

export default function WatchLandingPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [movie, setMovie] = useState<Movie | null>(null)
  const [relatedMovies, setRelatedMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState(0)
  const [downloadPending, setDownloadPending] = useState(false)
  const [downloadCountdown, setDownloadCountdown] = useState(10)
  const downloadTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) {
        window.clearInterval(downloadTimerRef.current)
        downloadTimerRef.current = null
      }
    }
  }, [])

  const handleDownloadClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!movie?.downloadUrl) return
    // Start a 15s countdown before navigating
    e.preventDefault()
    if (downloadPending) return
    setDownloadPending(true)
    setDownloadCountdown(10)
    const id = window.setInterval(() => {
      setDownloadCountdown((prev) => {
        if (prev <= 1) {
          if (downloadTimerRef.current) {
            window.clearInterval(downloadTimerRef.current)
            downloadTimerRef.current = null
          }
          // Navigate to the download URL after countdown
          window.location.href = movie.downloadUrl!
          return 0
        }
        return prev - 1
      })
    }, 1000)
    downloadTimerRef.current = id
  }

  useEffect(() => {
    const load = async () => {
      if (!db || !id) return
      setLoading(true)
      try {
        const ref = doc(db, 'movies', id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setError('Not found')
          return
        }
        const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
        setMovie(data)

        // Load related content based on genres or type
        const moviesCol = collection(db, 'movies')
        let related: Movie[] = []
        
        // Try to get movies with at least one matching genre
        if (data.genres && data.genres.length > 0) {
          const genreQuery = query(
            moviesCol,
            where('genres', 'array-contains-any', data.genres.slice(0, 10)), // Firestore limit: max 10 values
            orderBy('createdAt', 'desc'),
            limit(12)
          )
          try {
            const genreSnap = await getDocs(genreQuery)
            genreSnap.forEach((d) => {
              if (d.id !== id) {
                related.push({ id: d.id, ...(d.data() as DocumentData) } as Movie)
              }
            })
          } catch (genreError) {
            console.log('Genre query failed, falling back to type:', genreError)
          }
        }
        
        // Fallback to same type if not enough genre matches
        if (related.length < 6) {
          const typeQuery = query(
            moviesCol,
            where('type', '==', data.type || 'movie'),
            orderBy('createdAt', 'desc'),
            limit(12)
          )
          const typeSnap = await getDocs(typeQuery)
          typeSnap.forEach((d) => {
            if (d.id !== id && !related.find(r => r.id === d.id)) {
              related.push({ id: d.id, ...(d.data() as DocumentData) } as Movie)
            }
          })
        }
        
        setRelatedMovies(related.slice(0, 6))
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)]">
        <div className="h-[70vh] bg-gradient-to-b from-gray-800 to-[var(--netflix-black)] animate-pulse" />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">
          <LoadingSkeleton variant="grid" count={6} />
        </div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] grid place-items-center p-6">
        <div className="text-center">
          <p className="text-lg text-white mb-4">{error || 'Movie not found'}</p>
          <button
            onClick={() => router.push('/user')}
            className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-6 py-2 text-sm font-medium transition-all duration-300"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const heroImage = movie.heroImageUrl || movie.pic
  const totalEpisodes = movie.sections?.reduce((sum, s) => sum + s.links.length, 0) || 0
  const description = movie.heroDescription || (
    movie.type === 'series'
      ? `${totalEpisodes} episode${totalEpisodes !== 1 ? 's' : ''} across ${movie.sections?.length || 0} season${(movie.sections?.length || 0) !== 1 ? 's' : ''}`
      : 'A feature film'
  )

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[var(--netflix-black)] via-[#0a0a0a] to-[var(--netflix-black)] relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-40 h-40 bg-[var(--netflix-red)] rounded-full blur-3xl animate-pulse animation-delay-100"></div>
        <div className="absolute top-3/4 right-1/3 w-32 h-32 bg-white/20 rounded-full blur-2xl animate-bounce animation-delay-200"></div>
        <div className="absolute top-1/2 left-3/4 w-24 h-24 bg-[var(--netflix-red)]/60 rounded-full blur-xl animate-ping animation-delay-300"></div>
      </div>

      {/* Enhanced Hero Banner */}
      <div className="relative h-[70vh] md:h-[85vh] animate-fade-in">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt={movie.name}
            className="w-full h-full object-cover transition-all duration-700 hover:scale-105"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.src = movie.pic
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--netflix-black)] via-[var(--netflix-black)]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-black)] via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--netflix-black)]/90" />
        </div>

        {/* Enhanced Close button */}
        <button
          onClick={() => router.push('/user')}
          className="absolute top-6 right-6 z-20 group w-12 h-12 rounded-xl bg-gradient-to-br from-black/80 to-black/60 hover:from-[var(--netflix-red)]/90 hover:to-[var(--netflix-red)]/70 flex items-center justify-center transition-all duration-500 border border-white/20 hover:border-[var(--netflix-red)]/50 hover:scale-110 animate-fade-in animation-delay-800 backdrop-blur-sm"
          aria-label="Close"
        >
          <svg className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Enhanced Content */}
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 md:px-12 pb-20">
          <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3 animate-fade-in-right animation-delay-200">
              <div className="w-2 h-2 bg-[var(--netflix-red)] rounded-full animate-pulse"></div>
              <span className="text-[var(--netflix-red)] font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-[var(--netflix-red)] to-[#ff4757] bg-clip-text text-transparent">
                {movie.type === 'series' ? 'Netflix Series' : 'Netflix Film'}
              </span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-white drop-shadow-2xl animate-fade-in-up animation-delay-400 bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent">
              {movie.name}
            </h1>

            <div className="flex items-center gap-4 text-sm text-white animate-fade-in-up animation-delay-600">
              <span className="px-3 py-1 border border-white/50 text-xs font-bold rounded-full bg-white/10 backdrop-blur-sm">4K HDR</span>
              <span className="px-3 py-1 bg-green-600/80 text-xs font-bold rounded-full">{movie.type}</span>
              {movie.type === 'series' && (
                <>
                  <span className="px-3 py-1 bg-[var(--netflix-red)]/80 text-xs font-bold rounded-full">
                    {movie.sections?.length || 0} Season{movie.sections?.length !== 1 ? 's' : ''}
                  </span>
                  {totalEpisodes > 0 && (
                    <span className="px-3 py-1 bg-blue-600/80 text-xs font-bold rounded-full">
                      {totalEpisodes} Episode{totalEpisodes !== 1 ? 's' : ''}
                    </span>
                  )}
                </>
              )}
            </div>

            <p className="text-base sm:text-xl text-white/90 max-w-2xl leading-relaxed drop-shadow-lg animate-fade-in-up animation-delay-800">
              {description}
            </p>

            <div className="flex items-center gap-4 pt-4 animate-fade-in-up animation-delay-1000">
              {movie.sections?.[0]?.links?.[0] && (
                <Link
                  href={`/watch/${movie.id}/0/0`}
                  className="group relative flex items-center gap-3 bg-white hover:bg-white/95 text-black px-8 py-4 rounded-lg font-bold text-lg transition-all duration-500 hover:scale-105 hover:shadow-xl shadow-lg"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </Link>
              )}
              <button className="flex items-center gap-2 bg-gray-500/70 hover:bg-gray-500/50 hover:scale-105 hover:shadow-lg text-white px-6 py-2.5 rounded-md font-bold text-base transition-all duration-300 transform active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                My List
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 space-y-10">
        {/* Trailer & Download */}
        {(movie.trailerUrl || movie.downloadUrl) && (
          <div className="space-y-4">
            {movie.trailerUrl && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-3">Trailer</h2>
                <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    className="absolute inset-0 w-full h-full rounded-lg border border-[var(--netflix-gray)]"
                    src={(function () {
                      const raw = String(movie.trailerUrl)
                      try {
                        if (raw.startsWith('<')) {
                          const src = (raw.match(/src\s*=\s*"([^"]+)"/i) || raw.match(/src\s*=\s*'([^']+)'/i))?.[1]
                          if (src) return src
                        }
                        if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
                          return `https://www.youtube.com/embed/${raw}`
                        }
                        if (raw.includes('youtube.com/watch')) {
                          const u = new URL(raw)
                          const v = u.searchParams.get('v')
                          if (v) return `https://www.youtube.com/embed/${v}`
                        }
                        if (raw.includes('youtu.be/')) {
                          const id = raw.split('youtu.be/')[1]?.split(/[?&#]/)[0]
                          if (id) return `https://www.youtube.com/embed/${id}`
                        }
                      } catch {}
                      return raw
                    })()}
                    title="Trailer"
                    frameBorder={0}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            {movie.downloadUrl && (
              <div className="relative z-10 flex justify-center mt-8">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  aria-disabled={downloadPending}
                  className={`group relative inline-flex items-center gap-4 px-12 py-6 text-xl font-bold text-white rounded-2xl shadow-2xl transition-all duration-500 border-2 overflow-hidden ${downloadPending ? 'cursor-not-allowed opacity-80 bg-[var(--netflix-gray)] border-[var(--netflix-gray)]' : 'bg-gradient-to-r from-[var(--netflix-red)] via-[#ff1744] to-[var(--netflix-red)] hover:shadow-[0_0_50px_rgba(229,9,20,0.8)] transform hover:scale-110 active:scale-105 border-transparent hover:border-white/30'}`}
                >
                  {/* Animated background gradient */}
                  {!downloadPending && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#ff6b6b] via-[var(--netflix-red)] to-[#ff1744] opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-x"></div>
                  )}
                  
                  {/* Shimmer effect */}
                  {!downloadPending && (
                    <div className="absolute inset-0 -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                  )}
                  
                  {/* Pulsing glow */}
                  {!downloadPending && (
                    <div className="absolute inset-0 rounded-2xl bg-[var(--netflix-red)] opacity-75 group-hover:animate-ping"></div>
                  )}
                  
                  {/* Icon with animations */}
                  <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 group-hover:rotate-180 transition-all duration-500">
                    <svg 
                      className="w-6 h-6 text-white group-hover:scale-125 transition-transform duration-300" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                    >
                      <path d="M12 2L12 15M12 15L8 11M12 15L16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      <path d="M3 17L3 19C3 20.1046 3.89543 21 5 21L19 21C20.1046 21 21 20.1046 21 19L21 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  
                  {/* Text with typewriter effect */}
                  {!downloadPending ? (
                    <span className="relative z-10 group-hover:animate-pulse">
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '0ms'}}>D</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '50ms'}}>o</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '100ms'}}>w</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '150ms'}}>n</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '200ms'}}>l</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '250ms'}}>o</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '300ms'}}>a</span>
                      <span className="inline-block group-hover:animate-bounce" style={{animationDelay: '350ms'}}>d</span>
                    </span>
                  ) : (
                    <span className="relative z-10">Starting in {downloadCountdown}s…</span>
                  )}
                  
                  {/* Floating particles */}
                  {!downloadPending && (
                    <>
                      <div className="absolute -top-2 -left-2 w-2 h-2 bg-white rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping" style={{animationDelay: '0s'}}></div>
                      <div className="absolute -top-1 -right-3 w-1.5 h-1.5 bg-yellow-300 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping" style={{animationDelay: '0.2s'}}></div>
                      <div className="absolute -bottom-2 -left-3 w-1 h-1 bg-blue-300 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping" style={{animationDelay: '0.4s'}}></div>
                      <div className="absolute -bottom-1 -right-2 w-2 h-2 bg-green-300 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping" style={{animationDelay: '0.6s'}}></div>
                    </>
                  )}
                  
                  {/* Success ripple on click */}
                  {!downloadPending && (
                    <div className="absolute inset-0 rounded-2xl bg-green-400 opacity-0 group-active:opacity-50 group-active:animate-ping transition-opacity duration-200"></div>
                  )}
                </button>
                
                {/* Download hint text */}
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center">
                  {!downloadPending ? (
                    <p className="text-sm text-[var(--netflix-light-gray)] opacity-75 group-hover:opacity-100 transition-opacity duration-300">
                      🚀 High Quality • Lightning Fast
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--netflix-light-gray)] opacity-90" aria-live="polite">
                      Preparing your download… redirecting in {downloadCountdown}s
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Episodes Section (Series only) */}
        {movie.type === 'series' && movie.sections && movie.sections.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Episodes</h2>
              {movie.sections.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedSeasonIndex}
                    onChange={(e) => setSelectedSeasonIndex(Number(e.target.value))}
                    className="appearance-none bg-[var(--netflix-dark)] border border-[var(--netflix-gray)] text-white px-4 py-2 pr-10 rounded-md text-sm font-medium cursor-pointer hover:bg-[var(--netflix-gray)]/50 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--netflix-red)]/50"
                  >
                    {movie.sections.map((section, index) => (
                      <option key={index} value={index} className="bg-[var(--netflix-dark)]">
                        {section.name} ({section.links.length} Episode{section.links.length !== 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            {/* Season Details */}
            {movie.sections[selectedSeasonIndex] && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-white font-semibold">{movie.sections[selectedSeasonIndex].name}:</span>
                <span className="px-2 py-0.5 border border-white/40 text-xs font-medium text-white">18+</span>
                <span className="text-[var(--netflix-light-gray)]">violence, sex, nudity, language, substances, suicide</span>
              </div>
            )}

            {/* Episodes list */}
            {movie.sections[selectedSeasonIndex] && (
              <div className="space-y-4">
                {movie.sections[selectedSeasonIndex].links.length === 0 ? (
                  <p className="text-[var(--netflix-light-gray)] italic">No episodes available.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {movie.sections[selectedSeasonIndex].links.map((link, ei) => (
                      <Link
                        key={ei}
                        href={`/watch/${movie.id}/${selectedSeasonIndex}/${ei}`}
                        className="group flex items-start gap-4 p-4 rounded-lg bg-[var(--netflix-gray)]/30 hover:bg-[var(--netflix-gray)]/50 border border-[var(--netflix-gray)]/50 hover:border-[var(--netflix-gray)] transition-all duration-300"
                      >
                        <div className="flex-shrink-0 text-3xl font-bold text-[var(--netflix-light-gray)] w-12 text-center">
                          {ei + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="text-white font-semibold mb-1 group-hover:text-[var(--netflix-red)] transition-colors">
                                Episode {ei + 1}
                              </h4>
                              <p className="text-sm text-[var(--netflix-light-gray)] line-clamp-2">
                                Watch episode {ei + 1} of {movie.sections[selectedSeasonIndex].name}
                              </p>
                            </div>
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-black/50 group-hover:bg-[var(--netflix-red)] flex items-center justify-center transition-all duration-300">
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* More Like This / Related Content */}
        {relatedMovies.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">More Like This</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {relatedMovies.map((item) => (
                <Link
                  key={item.id}
                  href={`/watch/${item.id}`}
                  className="group block"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--netflix-gray)] border border-[var(--netflix-gray)] hover:border-white transition-all duration-300">
                    <img
                      src={item.pic}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement
                        el.style.visibility = 'hidden'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                      <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1">
                        {item.name}
                      </h3>
                      <p className="text-xs text-[var(--netflix-light-gray)]">
                        {item.type === 'series' ? 'Series' : 'Movie'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* About Section */}
        <div className="space-y-4 pb-12">
          <h2 className="text-2xl font-bold text-white">About {movie.name}</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <span className="text-[var(--netflix-light-gray)] min-w-[100px]">Type:</span>
              <span className="text-white">{movie.type === 'series' ? 'TV Series' : 'Movie'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--netflix-light-gray)] min-w-[100px]">Genres:</span>
              <div className="flex flex-wrap gap-2">
                {movie.genres && movie.genres.length > 0 ? (
                  movie.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--netflix-gray)]/50 text-white border border-[var(--netflix-gray)]"
                    >
                      {genre}
                    </span>
                  ))
                ) : (
                  <span className="text-white">Not specified</span>
                )}
              </div>
            </div>
            {description && (
              <div className="flex gap-2">
                <span className="text-[var(--netflix-light-gray)] min-w-[100px]">Description:</span>
                <span className="text-white">{description}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
