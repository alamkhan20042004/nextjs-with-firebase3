"use client"

import { useEffect, useMemo, useState } from 'react'

type DownloadCTAProps = {
  url: string
  label?: string
  variant?: 'button' | 'link'
  className?: string
}

export default function DownloadCTA({ url, label = 'Download', variant = 'button', className = '' }: DownloadCTAProps) {
  const [clickedAt, setClickedAt] = useState<Date | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const upcoming = useMemo(() => {
    try {
      return typeof url === 'string' && /coming\s*soon/i.test(url.trim())
    } catch {
      return false
    }
  }, [url])
  const resolvedLabel = upcoming ? 'Upcoming Movie Download' : label

  // Format timestamp nicely
  const clickedAtText = useMemo(() => {
    if (!clickedAt) return ''
    try {
      return clickedAt.toLocaleTimeString()
    } catch {
      return ''
    }
  }, [clickedAt])

  useEffect(() => {
    if (!clickedAt) return
    setReady(false)
    setCopied(false)
    setSecondsLeft(15)
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id)
          setReady(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [clickedAt])

  const onCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // ignore
    }
  }

  if (!url) return null

  if (variant === 'link') {
    return (
      <div className={className}>
        {!clickedAt && !upcoming && (
          <button
            type="button"
            onClick={() => setClickedAt(new Date())}
            className="inline-flex items-center gap-2 text-sm font-medium underline text-[var(--netflix-red)] hover:text-white transition-colors px-3 py-2 rounded-md min-h-[44px] sm:min-h-[36px]"
            style={{ touchAction: 'manipulation' }}
            aria-label={resolvedLabel}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3a1 1 0 011 1v9.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.414 0l-4.001-4a1 1 0 111.414-1.414L11 13.586V4a1 1 0 011-1z" />
              <path d="M5 20a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z" />
            </svg>
            {resolvedLabel}
          </button>
        )}
        {upcoming && (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--netflix-light-gray)] px-3 py-2 rounded-md opacity-70 select-none cursor-not-allowed" aria-disabled="true">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3a1 1 0 011 1v9.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.414 0l-4.001-4a1 1 0 111.414-1.414L11 13.586V4a1 1 0 011-1z" />
              <path d="M5 20a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z" />
            </svg>
            {resolvedLabel}
          </span>
        )}
        {clickedAt && !ready && !upcoming && (
          <div className="text-xs text-[var(--netflix-light-gray)]" role="status" aria-live="polite">
            Requested at <span className="text-white font-semibold">{clickedAtText}</span>. Link will appear in <span className="text-white font-mono">{secondsLeft}s</span>.
          </div>
        )}
        {ready && !upcoming && (
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <span className="text-[var(--netflix-light-gray)]">Requested at</span>
            <span className="text-white font-semibold">{clickedAtText}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--netflix-red)] text-white hover:brightness-110 transition"
            >
              Open Link
            </a>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/40 border border-[var(--netflix-gray)] text-white hover:border-[var(--netflix-red)]/60 transition"
            >
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
            <code className="block w-full sm:w-auto truncate px-2 py-1 rounded bg-black/40 border border-[var(--netflix-gray)] text-[10px] text-[var(--netflix-light-gray)]">{url}</code>
          </div>
        )}
      </div>
    )
  }

  // Default animated button variant
  return (
    <div className={className}>
      {!clickedAt && !upcoming && (
        <button
          type="button"
          onClick={() => setClickedAt(new Date())}
          className="group relative inline-flex items-center gap-4 px-12 py-6 text-xl font-bold text-white rounded-2xl shadow-2xl transition-all duration-700 overflow-hidden bg-gradient-to-r from-[var(--netflix-red)] via-[#ff1744] to-[var(--netflix-red)] hover:shadow-[0_0_60px_rgba(229,9,20,0.8)] transform hover:scale-110 active:scale-95 border-2 border-transparent hover:border-white/30"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#ff6b6b] via-[var(--netflix-red)] to-[#ff1744] opacity-0 group-hover:opacity-100 transition-opacity duration-700 animate-gradient-x"></div>
          <div className="absolute inset-0 -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
          <div className="absolute inset-0 rounded-2xl bg-[var(--netflix-red)] opacity-75 group-hover:animate-ping"></div>
          <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/20 group-hover:bg-white/30 group-hover:rotate-180 transition-all duration-700 group-active:rotate-[360deg]">
            <svg 
              className="w-6 h-6 text-white group-hover:scale-125 group-active:scale-150 transition-transform duration-500" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M12 2L12 15M12 15L8 11M12 15L16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M3 17L3 19C3 20.1046 3.89543 21 5 21L19 21C20.1046 21 21 20.1046 21 19L21 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="relative z-10">{resolvedLabel}</span>
        </button>
      )}
      {upcoming && (
        <button
          type="button"
          aria-disabled="true"
          disabled
          className="relative inline-flex items-center gap-4 px-12 py-6 text-xl font-bold text-white/70 rounded-2xl border-2 border-[var(--netflix-gray)] bg-black/50 cursor-not-allowed select-none"
        >
          <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/10">
            <svg 
              className="w-6 h-6 text-white/70"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L12 15M12 15L8 11M12 15L16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M3 17L3 19C3 20.1046 3.89543 21 5 21L19 21C20.1046 21 21 20.1046 21 19L21 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="relative z-10">{resolvedLabel}</span>
        </button>
      )}

      {clickedAt && !ready && !upcoming && (
        <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
          <div className="relative inline-flex items-center gap-3 px-8 py-4 rounded-xl border-2 border-white/20 bg-black/50 text-white">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
            <span className="text-sm">Preparing link… <span className="font-mono">{secondsLeft}s</span></span>   {/* This text will be displayed inside button while the link is being prepared */}
          </div>
          {/* <div className="text-xs text-[var(--netflix-light-gray)]">Requested at <span className="text-white font-semibold">{clickedAtText}</span></div> */}
        </div>
      )}

      {ready && !upcoming && (
        <div className="flex flex-col items-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-3 px-10 py-4 text-lg font-semibold text-white rounded-xl bg-gradient-to-r from-[var(--netflix-red)] to-[#b91c1c] hover:brightness-110 transition-all duration-300 border border-white/20"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a1 1 0 011 1v9.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.414 0l-4.001-4a1 1 0 111.414-1.414L11 13.586V4a1 1 0 011-1z" /><path d="M5 20a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z" /></svg>
            Open Download
          </a>
          {/* <div className="flex items-center flex-wrap gap-2 text-xs">
            <span className="text-[var(--netflix-light-gray)]">Requested at</span>
            <span className="text-white font-semibold">{clickedAtText}</span>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/40 border border-[var(--netflix-gray)] text-white hover:border-[var(--netflix-red)]/60 transition"
            >
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
            <code className="block w-full sm:w-auto truncate px-2 py-1 rounded bg-black/40 border border-[var(--netflix-gray)] text-[10px] text-[var(--netflix-light-gray)]">{url}</code>
          </div> */}
        </div>
      )}
    </div>
  )
}
