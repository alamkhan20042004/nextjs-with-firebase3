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

    return () => {
      v.removeEventListener('canplay', handleCanPlay)
      v.removeEventListener('playing', handlePlaying)
      v.removeEventListener('waiting', handleWaiting)
      v.removeEventListener('error', handleError)
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
                backBufferLength: 30,
                maxBufferLength: 60,
                maxBufferSize: 60 * 1000 * 1000,
                fragLoadingTimeOut: 20000,
                manifestLoadingTimeOut: 20000,
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
    </div>
  )
}
