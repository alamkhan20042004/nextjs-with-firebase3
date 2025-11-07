"use client"

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, type DocumentData } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  type?: 'movie' | 'series'
  sections: Section[]
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

  const isRumble = useMemo(() => {
    const url = current?.url || ''
    return /rumble\.com/i.test(url)
  }, [current])

  const toggleFullscreen = async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch {
      // ignore
    }
  }

  // Calculate overlay dimensions - SIMPLIFIED and more reliable
  const getOverlayStyle = () => {
    let width = 100
    let height = 40

    if (smallScreen || shortViewport) {
      width = isLandscape ? 145 : 115
      height = 30
    }

    return {
      width: `${width}px`,
      height: `${height}px`,
      right: '0px',
      bottom: '0px',
      background: 'rgba(0,0,0,0.95)',
      zIndex: 30,
      cursor: 'default',
      userSelect: 'none' as const,
      pointerEvents: 'auto' as const
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] grid place-items-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[var(--netflix-red)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--netflix-light-gray)]">Loading player…</p>
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
    <div className="min-h-dvh bg-[var(--netflix-black)] p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4 animate-fadeIn">
        {/* Header with movie info */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-[var(--netflix-gray)]">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{movie.name}</h1>
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] mt-1">
              {movie.type === 'series' ? 'Series' : 'Movie'} • {current.section.name} • Episode {episodeIndex + 1}
            </p>
          </div>
          <Link 
            href={`/watch/${movie.id}`} 
            className="rounded-md bg-[var(--netflix-gray)] text-white px-4 py-2 text-sm hover:bg-[var(--netflix-gray)]/70 transition-all duration-300"
          >
            Back
          </Link>
        </div>

        {/* Video player container with Netflix shadow */}
        <div 
          ref={containerRef} 
          className="relative aspect-video w-full rounded-lg overflow-hidden border border-[var(--netflix-gray)] shadow-2xl bg-black"
        >
          {/* Video iframe */}
          <iframe
            src={current.url}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-pointer-lock"
            allowFullScreen
          />

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

          {/* Other providers overlay */}
          {hideBranding && !isRumble && (
            <div
              aria-hidden="true"
              className="absolute bottom-0 right-0 z-30 bg-black pointer-events-auto"
              style={{
                width: smallScreen ? '70px' : '90px',
                height: smallScreen ? '56px' : '72px'
              }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            />
          )}

          {/* Fullscreen button - Higher z-index to stay above overlays */}
          {/* <button
            type="button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 z-50 rounded-md bg-black/70 text-white text-xs px-2 py-1 hover:bg-black/80"
          >
            {isFullscreen ? 'Exit' : 'Full screen'}
          </button> */}

        </div>

        {/* Player info with Netflix styling */}
        <div className="flex items-center justify-center">
          <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] text-center px-4 py-2 rounded-md bg-[var(--netflix-gray)]/50 backdrop-blur">
            💡 If the player screen is not set correctly, try fullscreen and double-click on the video
          </p>
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
