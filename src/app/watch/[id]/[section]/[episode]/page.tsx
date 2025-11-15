"use client"

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, type DocumentData } from 'firebase/firestore'
import { getEmbedConfig } from '@/lib/providers'

export const dynamic = 'force-dynamic'

type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  type?: 'movie' | 'series'
  sections: Section[]
  genres?: string[]
}

export default function EpisodePlayerPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id ?? '')
  const sectionIndex = Number(params?.section ?? -1)
  const episodeIndex = Number(params?.episode ?? -1)

  const [movie, setMovie] = useState<Movie | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hideBranding] = useState(true)
  const [smallScreen, setSmallScreen] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)
  const [shortViewport, setShortViewport] = useState(false)
  const [showRotateHint, setShowRotateHint] = useState(false)
  const [playerLoaded, setPlayerLoaded] = useState(false)
  const loadStartRef = useRef<number>(0)
  const [playerError, setPlayerError] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const loadTimeoutRef = useRef<number | null>(null)
  const [showControls, setShowControls] = useState(false)
  const controlsTimerRef = useRef<number | null>(null)
  const headerHeight = (smallScreen || shortViewport) ? 56 : 68
  const [isCoarse, setIsCoarse] = useState(false)

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
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => setLoading(false))
  }, [id])

  const current = useMemo(() => {
    if (!movie) return null
    const s = movie.sections?.[sectionIndex]
    if (!s) return null
    const url = s.links?.[episodeIndex]
    if (!url) return null
    return { section: s, url }
  }, [movie, sectionIndex, episodeIndex])

  // Track fullscreen
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Responsive detection
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const checkScreenSize = () => {
      setSmallScreen(window.innerWidth <= 640)
      setIsLandscape(window.innerWidth > window.innerHeight)
      setShortViewport(window.innerHeight <= 480)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    window.addEventListener('orientationchange', checkScreenSize)
    
    return () => {
      window.removeEventListener('resize', checkScreenSize)
      window.removeEventListener('orientationchange', checkScreenSize)
    }
  }, [])

  // Update rotate hint visibility
  useEffect(() => {
    setShowRotateHint(isFullscreen && (smallScreen || window.matchMedia('(pointer:coarse)').matches) && !isLandscape)
  }, [isFullscreen, smallScreen, isLandscape])

  // Detect coarse pointer once (mobile/tablet)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setIsCoarse(window.matchMedia('(pointer:coarse)').matches)
    } catch {}
  }, [])

  const isRumble = useMemo(() => {
    const url = current?.url || ''
    return /rumble\.com/i.test(url)
  }, [current])
  const isOdysee = useMemo(() => {
    const url = current?.url || ''
    return /odysee\.com/i.test(url)
  }, [current])

  const embed = useMemo(() => {
    const url = current?.url || ''
    return getEmbedConfig(url)
  }, [current])

  // Reset player loaded state when the video URL changes
  useEffect(() => {
    setPlayerLoaded(false)
    setPlayerError(false)
    loadStartRef.current = Date.now()
    // Setup load timeout for resilience
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    loadTimeoutRef.current = window.setTimeout(() => {
      // If not loaded within 12s, show error overlay with retry
      setPlayerError(true)
    }, 12000)
  }, [embed.src])

  const handleIframeLoad = () => {
    // Ensure a minimum spinner time to avoid flicker
    const elapsed = Date.now() - (loadStartRef.current || Date.now())
    const minMs = 400
    if (elapsed >= minMs) {
      setPlayerLoaded(true)
    } else {
      setTimeout(() => setPlayerLoaded(true), minMs - elapsed)
    }
    // Clear timeout when load completes
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }

  const retryLoad = () => {
    setPlayerError(false)
    setPlayerLoaded(false)
    setReloadNonce((n) => n + 1)
    loadStartRef.current = Date.now()
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    loadTimeoutRef.current = window.setTimeout(() => {
      setPlayerError(true)
    }, 12000)
  }

  const toggleFullscreen = async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        // Try to unlock orientation when leaving fullscreen
        try {
          const anyScreen: any = screen as any
          if (anyScreen?.orientation?.unlock) {
            anyScreen.orientation.unlock()
          }
        } catch {}
      } else {
        await el.requestFullscreen()
        // On mobile/small screens, try to lock to landscape in fullscreen
        try {
          const isCoarse = window.matchMedia('(pointer:coarse)').matches
          const mobileLikely = isCoarse || smallScreen || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
          const anyScreen: any = screen as any
          if (mobileLikely && anyScreen?.orientation?.lock) {
            await anyScreen.orientation.lock('landscape')
          }
        } catch {
          // If lock fails (iOS Safari or unsupported), we'll show rotate hint overlay below
        }
      }
    } catch {
      // ignore
    }
  }

  // Safety: if user exits fullscreen via system gesture, try to unlock orientation
  useEffect(() => {
    if (!isFullscreen) {
      try {
        const anyScreen: any = screen as any
        if (anyScreen?.orientation?.unlock) anyScreen.orientation.unlock()
      } catch {}
      // When leaving fullscreen, always show controls normally
      setShowControls(true)
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current)
        controlsTimerRef.current = null
      }
    }
  }, [isFullscreen])

  // Auto-hide controls shortly after entering fullscreen
  useEffect(() => {
    if (isFullscreen) {
      setShowControls(false)
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current)
      }
      controlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 2500)
    }
  }, [isFullscreen])

  // Calculate overlay dimensions - SIMPLIFIED and more reliable
  const getOverlayStyle = () => {
    // Base (desktop) size
    let width = 130
    let height = 30
    let position: { left?: string; right?: string } = { right: '0px' }

    // Mobile / short viewport: make shield smaller & move to bottom-left for less intrusion
    if (smallScreen || shortViewport) {
      width = isLandscape ? 100 : 86
      height = 26
      position = { left: '0px' }
    }

    return {
      width: `${width}px`,
      height: `${height}px`,
      bottom: '0px',
      ...position,
      background: 'rgba(0,0,0,0.95)',
      zIndex: 30,
      cursor: 'default',
      userSelect: 'none' as const,
      pointerEvents: 'auto' as const
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-[var(--netflix-black)] via-gray-900 to-[var(--netflix-black)] grid place-items-center p-6 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-[var(--netflix-red)] rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-white rounded-full blur-2xl animate-bounce animation-delay-500"></div>
        </div>
        
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-[var(--netflix-red)]/30 border-t-[var(--netflix-red)] rounded-full animate-spin"></div>
            <div className="absolute inset-2 w-12 h-12 border-4 border-transparent border-b-white rounded-full animate-spin animation-direction-reverse"></div>
          </div>
          
          <div className="text-center animate-fade-in-up animation-delay-300">
            <p className="text-lg font-semibold text-white mb-2 animate-pulse">Loading player</p>
            <p className="text-sm text-[var(--netflix-light-gray)] animate-fade-in animation-delay-600">Preparing your cinematic experience...</p>
          </div>
          
          {/* Loading dots */}
          <div className="flex gap-2 animate-fade-in animation-delay-900">
            <div className="w-2 h-2 bg-[var(--netflix-red)] rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-[var(--netflix-red)] rounded-full animate-bounce animation-delay-200"></div>
            <div className="w-2 h-2 bg-[var(--netflix-red)] rounded-full animate-bounce animation-delay-400"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!movie || !current) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] grid place-items-center p-6">
        <p className="text-sm text-[var(--netflix-light-gray)]">{error || 'Not found'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[var(--netflix-black)] via-[#0a0a0a] to-[var(--netflix-black)] p-4 sm:p-6 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-[var(--netflix-red)] rounded-full animate-pulse animation-delay-100"></div>
        <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-white/50 rounded-full animate-bounce animation-delay-200"></div>
        <div className="absolute top-1/2 left-3/4 w-1.5 h-1.5 bg-[var(--netflix-red)]/60 rounded-full animate-ping animation-delay-300"></div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-6 relative z-10">
        {/* Header with movie info - Enhanced animations */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-gradient-to-r from-transparent via-[var(--netflix-red)]/30 to-transparent backdrop-blur-sm transform transition-all duration-700 hover:scale-[1.02]">
          <div className="transform transition-all duration-500 hover:translate-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent animate-gradient">
              {movie.name}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] mt-1 animate-fade-in-up animation-delay-200">
              {movie.type === 'series' ? 'Series' : 'Movie'} • {current.section.name} • Episode {episodeIndex + 1}
            </p>
            {movie.genres && movie.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 animate-fade-in-up animation-delay-400">
                {movie.genres.slice(0,6).map((g, i) => (
                  <span 
                    key={g} 
                    className="px-3 py-1 rounded-full text-[11px] font-medium bg-gradient-to-r from-[var(--netflix-red)]/20 to-black/60 text-white border border-[var(--netflix-red)]/30 hover:border-[var(--netflix-red)] hover:scale-105 transition-all duration-300 cursor-pointer animate-fade-in-right"
                    style={{ animationDelay: `${600 + i * 100}ms` }}
                  >
                    {g}
                  </span>
                ))}
                {movie.genres.length > 6 && (
                  <span className="text-[11px] text-[var(--netflix-light-gray)] animate-fade-in animation-delay-1000">
                    +{movie.genres.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>
          <Link 
            href={`/watch/${movie.id}`} 
            className="group relative rounded-lg bg-gradient-to-r from-[var(--netflix-red)] to-[#b91c1c] text-white px-6 py-3 text-sm font-semibold hover:from-[#b91c1c] hover:to-[var(--netflix-red)] transition-all duration-500 hover:scale-110 hover:shadow-lg hover:shadow-[var(--netflix-red)]/50 transform animate-fade-in-left animation-delay-300"
          >
            <span className="relative z-10">← Back</span>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-shimmer transition-opacity duration-300"></div>
          </Link>
        </div>

        {/* Video player container with enhanced Netflix styling */}
        <div 
          ref={containerRef} 
          className="relative aspect-video w-full rounded-xl overflow-hidden border border-[var(--netflix-red)]/30 shadow-2xl bg-black transform transition-all duration-700 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(229,9,20,0.3)] animate-fade-in-up animation-delay-500 group"
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); }}
          onClick={(e) => {
            // In fullscreen, toggle visibility of our controls on single click/tap
            if (!isFullscreen) return
            e.preventDefault();
            e.stopPropagation();
            const next = !showControls
            setShowControls(next)
            if (controlsTimerRef.current) {
              clearTimeout(controlsTimerRef.current)
              controlsTimerRef.current = null
            }
            if (next) {
              controlsTimerRef.current = window.setTimeout(() => {
                setShowControls(false)
              }, 2500)
            }
          }}
        >
          {/* Glowing border effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--netflix-red)]/20 via-transparent to-[var(--netflix-red)]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          
          {/* Video iframe with loading shimmer */}
          {embed.provider === 'odysee' ? (
            <iframe
              id="odysee-iframe"
              key={`${embed.src}:${reloadNonce}`}
              src={`${embed.src}${embed.src.includes('?') ? '&' : '?'}mbx=${reloadNonce}`}
              style={{ width: '100%', aspectRatio: '16 / 9' }}
              className={`w-full h-full relative z-10 transition-opacity duration-500 ${playerLoaded ? 'opacity-100' : 'opacity-0'}`}
              // Do not allow iframe fullscreen; use our wrapper fullscreen to keep overlays visible
              allow={embed.allow}
              referrerPolicy={embed.referrerPolicy as any}
              onLoad={handleIframeLoad}
            />
          ) : (
            <iframe
              key={`${embed.src}:${reloadNonce}`}
              src={`${embed.src}${embed.src.includes('?') ? '&' : '?'}mbx=${reloadNonce}`}
              className={`w-full h-full relative z-10 transition-opacity duration-500 ${playerLoaded ? 'opacity-100' : 'opacity-0'}`}
              // Explicitly omit fullscreen permission so the embedded player's default fullscreen control is disabled
              allow={embed.allow}
              sandbox={embed.sandbox}
              onLoad={handleIframeLoad}
            />
          )}

          {/* Player loading overlay */}
          {!playerLoaded && !playerError && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-14 h-14 border-4 border-[var(--netflix-red)]/30 border-t-[var(--netflix-red)] rounded-full animate-spin"></div>
                  <div className="absolute inset-3 w-8 h-8 border-4 border-transparent border-b-white rounded-full animate-spin animation-direction-reverse"></div>
                </div>
                <div className="text-white text-sm">Loading player…</div>
              </div>
            </div>
          )}

          {/* Player error overlay with retry */}
          {playerError && !playerLoaded && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-4">
                <div className="text-white text-sm">Player failed to load. Please retry.</div>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="px-4 py-2 rounded-md bg-[var(--netflix-red)] text-white text-sm hover:brightness-110"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Rotate hint for iOS/unsupported orientation lock */}
          {showRotateHint && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white px-6 py-4 rounded-lg border border-white/20 bg-black/40">
                <div className="mb-2 text-lg font-semibold">Rotate your device</div>
                <div className="text-sm text-white/80">For fullscreen, please rotate to landscape.</div>
              </div>
            </div>
          )}

          {/* RUMBLE OVERLAY - Always show when Rumble and hideBranding is true */}
          {hideBranding && isRumble && (
            <>
              {/* Primary overlay */}
              <div
                aria-hidden="true"
                className="absolute pointer-events-auto"
                style={getOverlayStyle()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              />
              {/* Backup overlay with slight offset */}
              <div
                aria-hidden="true"
                className="absolute pointer-events-auto"
                style={{
                  ...getOverlayStyle(),
                  right: '2px',
                  bottom: '2px',
                  zIndex: 31
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              />
            </>
          )}

          {/* ODYSEE OVERLAYS - Block outbound channel/title links and watermark areas */}
          {hideBranding && isOdysee && (
            <>
              {/* Top bar shield to block and visually hide Odysee channel/title */}
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 top-0 z-40 pointer-events-auto"
                style={{
                  height: headerHeight,
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  background: 'rgba(0,0,0,0.98)',
                  opacity: isFullscreen && !showControls ? 0 : 1,
                  transition: 'opacity 250ms'
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              />
              {/* Fullscreen persistent shield for Odysee logo (top-right) on all devices */}
              {isFullscreen && (
                <div
                  aria-hidden="true"
                  className="absolute z-40"
                  style={{
                    top: 0,
                    right: 0,
                    width: smallScreen ? '96px' : '120px',
                    height: smallScreen ? '54px' : '70px',
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    paddingRight: 'env(safe-area-inset-right, 0px)',
                    background: 'rgba(0,0,0,1)',
                    pointerEvents: showControls ? 'none' : 'auto'
                  }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                />
              )}
              {/* Bottom bar shield for symmetry when header hidden */}
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 bottom-0 z-40 pointer-events-none"
                style={{
                  height: headerHeight,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))',
                  opacity: isFullscreen && !showControls ? 0 : 1,
                  transition: 'opacity 250ms'
                }}
              />
              {/* Bottom small shield for watermark/outbound area (moved left & reduced on mobile) */}
              <div
                aria-hidden="true"
                className="absolute bottom-0 z-30 bg-transparent pointer-events-auto"
                style={{
                  // left: smallScreen ? '0px' : 'auto',
                  // right: smallScreen ? '100px' : '0px',
                  width: smallScreen ? '70px' : '84px',
                  height: smallScreen ? '15px' : '60px'
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              />
            </>
          )}

          {/* Other providers overlay: transparent click-blocker; exclude Odysee handled above */}
          {hideBranding && !isRumble && embed.provider !== 'odysee' && (
            <div
              aria-hidden="true"
              className="absolute bottom-0 z-30 bg-transparent pointer-events-auto"
              style={{
                left: smallScreen ? '0px' : 'auto',
                right: smallScreen ? 'auto' : '0px',
                width: smallScreen ? '58px' : '84px',
                height: smallScreen ? '42px' : '60px'
              }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            />
          )}

          {/* Generic fullscreen top-right overlay to hide provider logos (desktop + mobile) */}
          {isFullscreen && !isOdysee && (
            <div
              aria-hidden="true"
              className="absolute z-40 pointer-events-auto"
              style={{
                top: 0,
                right: 0,
                width: smallScreen ? '90px' : '120px',
                height: smallScreen ? '5px' : '70px',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingRight: 'env(safe-area-inset-right, 0px)',
                background: 'rgba(0,0,0,1)'
              }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            />
          )}









          {/* Enhanced fullscreen button */}
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
            className={`absolute top-3 right-3 z-50 group/fs rounded-lg bg-gradient-to-r from-black/80 to-black/60 backdrop-blur-sm text-white text-sm px-4 py-2 transition-all duration-300 border border-white/20 ${isFullscreen ? (showControls ? 'opacity-100' : 'opacity-0 pointer-events-none') : 'opacity-100 hover:from-[var(--netflix-red)]/90 hover:to-[var(--netflix-red)]/70 hover:scale-110 hover:shadow-lg hover:border-[var(--netflix-red)]/50'}`}
            onMouseDown={(e) => { e.stopPropagation() }}
          >
            <span className="flex items-center gap-2">
              <svg 
                className="w-4 h-4 transition-transform duration-300 group-hover/fs:rotate-12" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                {isFullscreen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                )}
              </svg>
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </span>
          </button>

          {/* Alam here below start 1*/}


            {/* Animated black overlay box when in fullscreen - maintains functionality */}
            {/* {isFullscreen && (
              <div
                aria-hidden="true"
                className="fixed top-3 left-3 w-[100px] h-[100px] bg-black z-[2147483647] pointer-events-none animate-fade-in border border-[var(--netflix-red)]/20 rounded-lg shadow-lg"
              />
            )} */}

          {/* Alam here below end 1*/}








        </div>

        {/* Enhanced player info with animations */}
        <div className="flex items-center justify-center animate-fade-in-up animation-delay-800">
          <div className="relative group/tip">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/20 via-[var(--netflix-red)]/10 to-[var(--netflix-red)]/20 rounded-xl blur opacity-0 group-hover/tip:opacity-100 transition-all duration-500"></div>
            <p className="relative text-xs sm:text-sm text-[var(--netflix-light-gray)] text-center px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--netflix-gray)]/60 to-black/40 backdrop-blur-md border border-[var(--netflix-gray)]/30 hover:border-[var(--netflix-red)]/30 transition-all duration-300 hover:scale-105">
              <span className="mr-2 text-lg animate-bounce">💡</span>
              {/* If the player screen is not set correctly, try fullscreen and double-click on the video */}
              Takes hah some time. If the video is not playing, that's means your internet connection is slow or unstable.
            </p>
          </div>
        </div>

        {/* Floating action elements */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 animate-fade-in-right animation-delay-1000">
          <button className="group/float w-12 h-12 bg-gradient-to-br from-[var(--netflix-red)] to-[#b91c1c] rounded-full shadow-lg hover:shadow-xl hover:shadow-[var(--netflix-red)]/30 flex items-center justify-center transition-all duration-300 hover:scale-110 animate-bounce animation-delay-1200">
            <svg className="w-5 h-5 text-white group-hover/float:scale-125 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
          <button className="group/float w-12 h-12 bg-gradient-to-br from-black/80 to-[var(--netflix-gray)] rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 animate-bounce animation-delay-1400">
            <svg className="w-5 h-5 text-white group-hover/float:scale-125 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}







// "use client"

// import Link from 'next/link'
// import { useEffect, useMemo, useRef, useState } from 'react'
// import { useParams, useRouter } from 'next/navigation'
// import { db } from '@/lib/firebase'
// import { doc, getDoc, type DocumentData } from 'firebase/firestore'

// export const dynamic = 'force-dynamic'

// type Section = { name: string; links: string[] }
// type Movie = {
//   id: string
//   name: string
//   pic: string
//   type?: 'movie' | 'series'
//   sections: Section[]
// }

// export default function EpisodePlayerPage() {
//   const router = useRouter()
//   const params = useParams()
//   const id = String(params?.id ?? '')
//   const sectionIndex = Number(params?.section ?? -1)
//   const episodeIndex = Number(params?.episode ?? -1)

//   const [movie, setMovie] = useState<Movie | null>(null)
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)
//   const containerRef = useRef<HTMLDivElement | null>(null)
//   const [isFullscreen, setIsFullscreen] = useState(false)
//   // Branding/controls masking (e.g., hide Rumble logo/controls cluster)
//   const [hideBranding] = useState(true)
//   const [smallScreen, setSmallScreen] = useState(false)
//   const [isLandscape, setIsLandscape] = useState(false)
//   const [shortViewport, setShortViewport] = useState(false)

//   useEffect(() => {
//     const load = async () => {
//       if (!db || !id) return
//       setLoading(true)
//       try {
//         const ref = doc(db, 'movies', id)
//         const snap = await getDoc(ref)
//         if (!snap.exists()) {
//           setError('Not found')
//           return
//         }
//         const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
//         setMovie(data)
//       } catch (e: any) {
//         setError(e?.message || 'Failed to load')
//       } finally {
//         setLoading(false)
//       }
//     }
//     load().catch(() => setLoading(false))
//   }, [id])

//   const current = useMemo(() => {
//     if (!movie) return null
//     const s = movie.sections?.[sectionIndex]
//     if (!s) return null
//     const url = s.links?.[episodeIndex]
//     if (!url) return null
//     return { section: s, url }
//   }, [movie, sectionIndex, episodeIndex])

//   // Track fullscreen when toggled on our wrapper
//   useEffect(() => {
//     const onFsChange = () => {
//       const fsEl = document.fullscreenElement as Element | null
//       const container = containerRef.current
//       if (!fsEl) {
//         setIsFullscreen(false)
//         return
//       }
//       // Consider fullscreen if our container OR any descendant/ancestor is the fullscreen element
//       const within = !!container && (fsEl === container || container.contains(fsEl) || (fsEl instanceof HTMLElement && fsEl.contains(container)))
//       setIsFullscreen(within || !!fsEl)
//     }
//     document.addEventListener('fullscreenchange', onFsChange)
//     return () => document.removeEventListener('fullscreenchange', onFsChange)
//   }, [])

//   // Responsive flags for overlay sizing
//   useEffect(() => {
//     if (typeof window === 'undefined') return
//     try {
//       const mqSm = window.matchMedia('(max-width: 640px)')
//       const applySm = () => setSmallScreen(!!mqSm.matches)
//       // Safari fallback
//       try { mqSm.addEventListener('change', applySm) } catch { mqSm.addListener(applySm) }
//       applySm()
//       return () => { try { mqSm.removeEventListener('change', applySm) } catch { mqSm.removeListener(applySm) } }
//     } catch {
//       // noop
//     }
//   }, [])

//   useEffect(() => {
//     if (typeof window === 'undefined') return
//     try {
//       const mqOrientation = window.matchMedia('(orientation: landscape)')
//       const mqShort = window.matchMedia('(max-height: 480px)')
//       const apply = () => {
//         setIsLandscape(!!mqOrientation.matches)
//         setShortViewport(!!mqShort.matches)
//       }
//       try {
//         mqOrientation.addEventListener('change', apply)
//         mqShort.addEventListener('change', apply)
//       } catch {
//         mqOrientation.addListener(apply)
//         mqShort.addListener(apply)
//       }
//       apply()
//       return () => {
//         try {
//           mqOrientation.removeEventListener('change', apply)
//           mqShort.removeEventListener('change', apply)
//         } catch {
//           mqOrientation.removeListener(apply)
//           mqShort.removeListener(apply)
//         }
//       }
//     } catch {
//       // noop
//     }
//   }, [])

//   const isRumble = useMemo(() => {
//     const url = current?.url || ''
//     return /rumble\.com/i.test(url)
//   }, [current])

//   const toggleFullscreen = async () => {
//     const el = containerRef.current
//     if (!el) return
//     try {
//       if (document.fullscreenElement === el) {
//         await document.exitFullscreen()
//       } else if (!document.fullscreenElement) {
//         await el.requestFullscreen()
//       } else {
//         await document.exitFullscreen()
//         await el.requestFullscreen()
//       }
//     } catch {
//       // ignore
//     }
//   }

//   if (loading) {
//     return (
//       <div className="min-h-dvh grid place-items-center p-6">
//         <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p>
//       </div>
//     )
//   }

//   if (!movie || !current) {
//     return (
//       <div className="min-h-dvh grid place-items-center p-6">
//         <p className="text-sm text-gray-600 dark:text-gray-300">{error || 'Not found'}</p>
//       </div>
//     )
//   }

//   return (
//     <div className="min-h-dvh p-6">
//       <div className="mx-auto w-full max-w-5xl space-y-4">
//         <div className="flex items-center justify-between">
//           <div>
//             <h1 className="text-xl font-semibold">{movie.name}</h1>
//             <p className="text-sm text-gray-600 dark:text-gray-400">
//               {movie.type === 'series' ? 'Series' : 'Movie'} • {current.section.name} • Episode {episodeIndex + 1}
//             </p>
//           </div>
//           <Link href={`/watch/${movie.id}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Back</Link>
//         </div>

//         <div ref={containerRef} className="relative aspect-video w-full rounded-md overflow-hidden border bg-black">
//           {/* Try to embed directly; some providers may block iframes. */}
//           <iframe
//             src={current.url}
//             className="w-full h-full"
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//             sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-pointer-lock"
//             allowFullScreen
//           />

//           {/* Black box overlays to hide Rumble logo/controls cluster (bottom-right) and block clicks */}
//           {hideBranding && isRumble && (
//             <>
//               <div
//                 aria-hidden="true"
//                 title=""
//                 onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
//                 className="absolute pointer-events-auto"
//                 style={{
//                   right: 0,
//                   bottom: 'env(safe-area-inset-bottom, 0px)',
//                   width: (smallScreen || shortViewport) ? (isLandscape ? 145 : 115) : 100,
//                   height: (smallScreen || shortViewport) ? 30 : 40,
//                   background: 'rgba(0,0,0,0.95)',
//                   zIndex: 30,
//                   cursor: 'default',
//                   userSelect: 'none'
//                 }}
//               />
//               {/* Fallback pixel-aligned shield to ensure full coverage on varied DPRs */}
//               <div
//                 aria-hidden="true"
//                 title=""
//                 onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
//                 className="absolute pointer-events-auto"
//                 style={{
//                   right: 2,
//                   bottom: 2,
//                   width: (smallScreen || shortViewport) ? (isLandscape ? 145 : 115) : 100,
//                   height: (smallScreen || shortViewport) ? 30 : 40,
//                   background: 'rgba(0,0,0,0.95)',
//                   zIndex: 31,
//                   cursor: 'default',
//                   userSelect: 'none'
//                 }}
//               />
//             </>
//           )}
//           {/* Minimal generic shield for other providers' bottom-right watermark */}
//           {hideBranding && !isRumble && (
//             <div
//               aria-hidden="true"
//               title=""
//               onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
//               className="absolute bottom-0 right-0 z-30 bg-black pointer-events-auto w-[70px] h-[56px] md:w-[80px] md:h-[64px] lg:w-[90px] lg:h-[72px]"
//               style={{
//                 bottom: 'env(safe-area-inset-bottom, 0px)',
//                 right: 'env(safe-area-inset-right, 0px)'
//               }}
//             />
//           )}

//           {/* Extra overlay only in fullscreen: 100px x 30px at bottom-right */}
//           {isFullscreen && (
//             <div
//               aria-hidden="true"
//               title=""
//               onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
//               className="absolute pointer-events-auto"
//               style={{
//                 right: 'env(safe-area-inset-right, 0px)',
//                 bottom: 'env(safe-area-inset-bottom, 0px)',
//                 width: 100,
//                 height: 30,
//                 background: 'rgba(0,0,0,0.95)',
//                 zIndex: 32,
//                 cursor: 'default',
//                 userSelect: 'none'
//               }}
//             />
//           )}

//           {/* Our fullscreen button so the overlay stays in fullscreen */}
//           <button
//             type="button"
//             aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
//             onClick={toggleFullscreen}
//             className="absolute top-2 right-2 z-30 rounded-md bg-black/70 text-white text-xs px-2 py-1 hover:bg-black/80"
//           >
//             {isFullscreen ? 'Exit' : 'Full screen'}
//           </button>
//         </div>

//         <div className="flex items-center justify-between">
//           <a href={current.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600">Open in new tab</a>
//           <div className="text-xs text-gray-500">If the player doesn’t load, use the link.</div>
//         </div>
//       </div>
//     </div>
//   )
// }
