"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'

export type SmartVideoPlayerProps = {
  src: string
  poster?: string
  className?: string
  onReady?: () => void
  onError?: (e: any) => void
}

// Simple URL checkers
const isM3U8 = (url: string) => /\.m3u8(\?|$)/i.test(url)
const isMP4 = (url: string) => /\.(mp4|webm|ogg)(\?|$)/i.test(url)

export default function SmartVideoPlayer({ src, poster, className, onReady, onError }: SmartVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const saveTimerRef = useRef<number | null>(null)
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number, end: number }>>([])
  const lastTimeRef = useRef<number>(0)
  const SKIP_INTERVAL = 10 // seconds to skip with arrow keys

  const posKey = useMemo(() => `sv:pos:${encodeURIComponent(src)}`, [src])

  const kind: 'm3u8' | 'mp4' | 'other' = useMemo(() => {
    if (isM3U8(src)) return 'm3u8'
    if (isMP4(src)) return 'mp4'
    return 'other'
  }, [src])

  useEffect(() => {
    setErr(null)
    setLoading(true)
  }, [src, retryNonce])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    let destroyed = false

    const handleCanPlay = () => {
      if (destroyed) return
      setLoading(false)
      onReady?.()
    }
    const handleWaiting = () => {
      if (destroyed) return
      const vEl = videoRef.current
      if (vEl) {
        const inBuffered = isTimeBuffered(vEl.currentTime, bufferedRanges)
        if (inBuffered) {
          // Suppress loading overlay for backward seek into already buffered data
          setLoading(false)
          return
        }
      }
      setLoading(true)
    }
    const handlePlaying = () => {
      if (destroyed) return
      setLoading(false)
    }
    const handleError = () => {
      if (destroyed) return
      const code = v.error?.code
      setErr(`Playback error${code ? ` (code ${code})` : ''}`)
      onError?.(v.error)
    }

    v.addEventListener('canplay', handleCanPlay)
    v.addEventListener('playing', handlePlaying)
    v.addEventListener('waiting', handleWaiting)
    v.addEventListener('error', handleError)

    const handleLoadedMetadata = () => {
      try {
        const raw = localStorage.getItem(posKey)
        const last = raw ? parseFloat(raw) : 0
        if (Number.isFinite(last) && last > 5 && v.duration && last < v.duration - 2) {
          v.currentTime = last
        }
      } catch {}
    }
    const handleTimeUpdate = () => {
      try {
        if (saveTimerRef.current) return
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null
        }, 2000)
        if (!isNaN(v.currentTime) && v.currentTime > 0) {
          localStorage.setItem(posKey, String(Math.floor(v.currentTime)))
        }
      } catch {}
      // Refresh buffered ranges snapshot
      setBufferedRanges(extractBuffered(v))
      lastTimeRef.current = v.currentTime
    }
    const handleEnded = () => {
      try { localStorage.removeItem(posKey) } catch {}
    }
    const handleProgress = () => {
      setBufferedRanges(extractBuffered(v))
    }
    const handleSeeking = () => {
      const target = v.currentTime
      const prev = lastTimeRef.current
      // Backward seek detection
      if (target < prev) {
        if (isTimeBuffered(target, bufferedRanges)) {
          // Already have data; keep loading false
          setLoading(false)
        }
      }
    }

    v.addEventListener('loadedmetadata', handleLoadedMetadata)
    v.addEventListener('timeupdate', handleTimeUpdate)
    v.addEventListener('ended', handleEnded)
    v.addEventListener('progress', handleProgress)
    v.addEventListener('seeking', handleSeeking)

    return () => {
      v.removeEventListener('canplay', handleCanPlay)
      v.removeEventListener('playing', handlePlaying)
      v.removeEventListener('waiting', handleWaiting)
      v.removeEventListener('error', handleError)
      v.removeEventListener('loadedmetadata', handleLoadedMetadata)
      v.removeEventListener('timeupdate', handleTimeUpdate)
      v.removeEventListener('ended', handleEnded)
      v.removeEventListener('progress', handleProgress)
      v.removeEventListener('seeking', handleSeeking)
    }
  }, [onReady, onError, retryNonce])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // Reset source
    v.pause()
    v.removeAttribute('src')
    v.load()

    let cleanup: (() => void) | undefined

    async function setup() {
      try {
        if (kind === 'm3u8') {
          // Native support first
          if ((v as any).canPlayType('application/vnd.apple.mpegurl')) {
            const el = v as HTMLVideoElement
            el.src = src
            el.load()
          } else {
            const Hls = (await import('hls.js')).default as any
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                autoStartLoad: true,
                // Keep a larger back buffer so short backward seeks are instant.
                backBufferLength: 120,
                // Increase forward buffer for smoother scrubbing.
                maxBufferLength: 180,
                maxBufferSize: 120 * 1000 * 1000,
                fragLoadingTimeOut: 20000,
                manifestLoadingTimeOut: 20000,
                // Favor smoother playback on slow networks
                capLevelToPlayerSize: true,
                lowLatencyMode: false,
                abrEwmaDefaultEstimate: 300000,
              })
              hlsRef.current = hls
              hls.attachMedia(v)
              hls.on((Hls as any).Events.MEDIA_ATTACHED, () => {
                hls.loadSource(src)
              })
              hls.on((Hls as any).Events.ERROR, (_e: any, data: any) => {
                if (data?.fatal) {
                  try {
                    if (data.type === (Hls as any).ErrorTypes.NETWORK_ERROR) {
                      hls.startLoad()
                    } else if (data.type === (Hls as any).ErrorTypes.MEDIA_ERROR) {
                      hls.recoverMediaError()
                    } else {
                      setErr('Fatal HLS error')
                      onError?.(data)
                    }
                  } catch (ex) {
                    setErr('HLS recovery failed')
                    onError?.(ex)
                  }
                }
              })
              cleanup = () => {
                try { hls.destroy() } catch {}
                hlsRef.current = null
              }
            } else {
              // Fallback: try direct src anyway
              const el = v as HTMLVideoElement
              el.src = src
            }
          }
        } else if (kind === 'mp4') {
          const el = v as HTMLVideoElement
          el.src = src
          el.load()
        } else {
          // Unknown type: just set src and let the browser try
          const el = v as HTMLVideoElement
          el.src = src
          el.load()
        }
      } catch (e) {
        setErr('Player init failed')
        onError?.(e)
      }
    }

    setup()

    return () => {
      if (cleanup) cleanup()
      v.pause()
      v.removeAttribute('src')
      try { v.load() } catch {}
    }
  }, [src, kind, onError, retryNonce])

  // Global arrow key seeking (avoid when user typing in an editable field)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current
      if (!v) return
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return
      }
      if (e.key === 'ArrowLeft') {
        v.currentTime = Math.max(0, v.currentTime - SKIP_INTERVAL)
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        const dur = v.duration || (v.currentTime + SKIP_INTERVAL)
        v.currentTime = Math.min(dur, v.currentTime + SKIP_INTERVAL)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [SKIP_INTERVAL])

  return (
    <div className={className || 'relative w-full h-full bg-black'}>
      <video
        key={retryNonce}
        ref={videoRef}
        poster={poster}
        className="w-full h-full"
        controls
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />

      {/* Loading overlay */}
      {loading && !err && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <div className="absolute inset-2 w-8 h-8 border-4 border-transparent border-b-white rounded-full animate-spin" style={{ animationDirection: 'reverse' }} />
            </div>
            <div className="w-40 h-1.5 bg-white/10 rounded overflow-hidden">
              <div className="h-full w-1/3 bg-white/70 animate-[progress_1.2s_linear_infinite]" />
            </div>
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            {/* Buffered ranges visualization (simple) */}
            <div className="w-40 h-1 bg-white/20 rounded mt-2 flex">
              {bufferedRanges.map((r, i) => (
                <div
                  key={i}
                  className="bg-white/60 h-full"
                  style={{
                    flexBasis: `${((r.end - r.start) / (videoRef.current?.duration || 1)) * 100}%`,
                    marginLeft: `${(r.start / (videoRef.current?.duration || 1)) * 100}%`,
                  }}
                />
              ))}
              <div
                className="h-full bg-red-500/70"
                style={{
                  position: 'absolute',
                  left: `${(videoRef.current?.currentTime || 0) / (videoRef.current?.duration || 1) * 100}%`,
                  width: '2px'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error overlay + retry */}
      {err && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center space-y-3">
            <div className="text-white text-sm">{err}</div>
            <button
              onClick={() => setRetryNonce((n) => n + 1)}
              className="px-4 py-2 rounded-md bg-white text-black text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* No custom overlays or fullscreen button */}
    </div>
  )
}

function extractBuffered(v: HTMLVideoElement): Array<{ start: number, end: number }> {
  const out: Array<{ start: number, end: number }> = []
  const b = v.buffered
  for (let i = 0; i < b.length; i++) {
    out.push({ start: b.start(i), end: b.end(i) })
  }
  return out
}

function isTimeBuffered(time: number, ranges: Array<{ start: number, end: number }>): boolean {
  for (const r of ranges) {
    if (time >= r.start && time <= r.end) return true
  }
  return false
}
