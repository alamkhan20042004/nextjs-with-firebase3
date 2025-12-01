"use client"

import { useCallback, useEffect, useState } from 'react'

// Inject CSS after hydration to avoid pre-hydration DOM mutations
function useAdblockAnimationsStyle() {
  useEffect(() => {
    try {
      if (typeof document !== 'undefined' && !document.querySelector('#adblock-animations')) {
        const style = document.createElement('style')
        style.id = 'adblock-animations'
        style.textContent = `
          @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
          @keyframes fade-in-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
          @keyframes shimmer { 0% { transform:translateX(-100%); } 100% { transform:translateX(100%); } }
          .animate-fade-in { animation: fade-in .6s ease-out; }
          .animate-fade-in-up { animation: fade-in-up .8s ease-out; }
          .animate-shimmer { animation: shimmer 1.5s ease-in-out; }
          .animation-delay-100 { animation-delay:.1s; }
          .animation-delay-200 { animation-delay:.2s; }
          .animation-delay-300 { animation-delay:.3s; }
          .animation-delay-400 { animation-delay:.4s; }
          .animation-delay-500 { animation-delay:.5s; }
          .animation-delay-600 { animation-delay:.6s; }
          .animation-delay-800 { animation-delay:.8s; }
          .animation-delay-1000 { animation-delay:1s; }
          .animation-direction-reverse { animation-direction: reverse; }
          /* Strict hide all content except the overlay when adblock detected */
          html[data-adblock="true"] body > *:not(.adblock-overlay) { display: none !important; }
        `
        document.head.appendChild(style)
      }
    } catch {}
  }, [])
}

export default function AdblockGate() {
  useAdblockAnimationsStyle()
  const [blocked, setBlocked] = useState(false)
  const [checking, setChecking] = useState(true)

  const check = useCallback(async () => {
    setChecking(true)

    // If offline, skip gating to avoid false positives due to network
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setBlocked(false)
      setChecking(false)
      return
    }

    // Helper: fetch with timeout; returns true if request looks blocked/failed
    const testFetch = async (url: string, init?: RequestInit, timeoutMs = 1500): Promise<boolean> => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const id = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined
      try {
        await fetch(url, { cache: 'no-store', mode: 'no-cors', signal: controller?.signal, ...init })
        if (id) clearTimeout(id)
        // If we got here without throw, consider not blocked (opaque is fine)
        return false
      } catch {
        if (id) clearTimeout(id)
        return true
      }
    }

    // 1) DOM bait element (hidden by many blockers)
    let domSignal = false
    try {
      const bait = document.createElement('div')
      bait.className = 'adsbox adsbygoogle ad ad-banner ad-unit ad-slot advertisement sponsor sponsored'
      bait.style.cssText = 'position:absolute; left:-9999px; height:10px; width:10px; pointer-events:none;'
      document.body.appendChild(bait)
      // Allow a frame to compute styles
      domSignal = await new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          try {
            const cs = window.getComputedStyle(bait)
            const hidden = (
              cs.display === 'none' ||
              cs.visibility === 'hidden' ||
              bait.offsetParent === null ||
              bait.clientHeight === 0 ||
              bait.clientWidth === 0
            )
            resolve(hidden)
          } catch {
            resolve(false)
          } finally {
            try { document.body.removeChild(bait) } catch {}
          }
        })
      })
    } catch {}

    // 2) Multiple local bait paths commonly filtered by path rules
    const localUrls = ['/ads.js', '/advertisement.js', '/adservice.js']
    const localResults = await Promise.all(localUrls.map((u) => testFetch(u)))
    const localAnyBlocked = localResults.some(Boolean)

    // 3) Remote ad script fetch using host commonly filtered (non-decisive alone)
    const remoteBlocked = await testFetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')

    // 4) Script tag injection test with onerror (more decisive)
    const scriptInjectedBlocked = await (async () => {
      return new Promise<boolean>((resolve) => {
        let settled = false
        const timer = window.setTimeout(() => {
          if (!settled) { settled = true; resolve(false) }
        }, 1600)
        const s = document.createElement('script')
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
        s.async = true
        s.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(true) } }
        s.onload = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false) } }
        try { document.head.appendChild(s) } catch {}
        // Clean up after a short delay
        window.setTimeout(() => { try { document.head.removeChild(s) } catch {} }, 2500)
      })
    })()

    // Decide using weighted signals to reduce false positives
    const contentSignals = [domSignal, scriptInjectedBlocked].filter(Boolean).length
    const networkSignals = [localAnyBlocked, remoteBlocked].filter(Boolean).length

    const detected = contentSignals >= 1 || networkSignals >= 2

    setBlocked(detected)
    setChecking(false)
  }, [])

  useEffect(() => {
    // Defer to next tick so SSR hydration completes
    const id = setTimeout(() => {
      check().catch(() => {})
    }, 0)
    return () => clearTimeout(id)
  }, [check])

  // Auto-recheck when user returns focus/visibility (e.g., after toggling extension)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && !checking) {
        check().catch(() => {})
      }
    }
    window.addEventListener('focus', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('focus', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [check, checking])

  // Apply / remove strict gating attribute on html element when blocked changes
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    if (blocked) {
      html.setAttribute('data-adblock', 'true')
    } else {
      if (html.getAttribute('data-adblock') === 'true') {
        html.removeAttribute('data-adblock')
      }
    }
  }, [blocked])

  if (!blocked) return null

  // Enhanced full-screen overlay blocking UI with animations (strict gating hides all other body children)
  return (
    <div className="adblock-overlay fixed inset-0 z-[9999] bg-gradient-to-br from-[var(--netflix-black)] via-gray-900 to-[var(--netflix-black)] text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-[var(--netflix-red)]/40 rounded-full blur-3xl animate-pulse animation-delay-100"></div>
        <div className="absolute bottom-1/3 right-1/3 w-24 h-24 bg-white/30 rounded-full blur-2xl animate-bounce animation-delay-500"></div>
        <div className="absolute top-2/3 left-1/2 w-16 h-16 bg-[var(--netflix-red)]/60 rounded-full blur-xl animate-pulse animation-delay-1000"></div>
      </div>

      <div className="max-w-lg text-center space-y-6 relative z-10 animate-fade-in-up">
        {/* Animated warning icon */}
        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-[var(--netflix-red)] to-red-700 rounded-full flex items-center justify-center animate-bounce shadow-2xl shadow-[var(--netflix-red)]/30">
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent animate-fade-in animation-delay-200">
            Ad Blocker Detected
          </h2>
          <p className="text-base text-[var(--netflix-light-gray)] leading-relaxed animate-fade-in animation-delay-400">
            {/* Please disable your ad blocker and reload the page to continue enjoying our content. */}
            Please disable your ad blocker and enable vpn must then reload the page to continue enjoying our content.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-fade-in animation-delay-600">
          <button
            onClick={() => window.location.reload()}
            className="group relative w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[var(--netflix-red)] to-red-700 hover:from-red-700 hover:to-[var(--netflix-red)] text-white px-6 py-3 rounded-lg font-semibold transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-[var(--netflix-red)]/40 transform active:scale-95 active:rotate-1 overflow-hidden"
          >
            {/* Animated background shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>
            
            <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="relative z-10">Reload Page</span>
            
            {/* Pulse effect on click */}
            <div className="absolute inset-0 rounded-lg bg-white/20 scale-0 group-active:scale-100 group-active:animate-ping"></div>
          </button>
          
          <button
            onClick={() => check()}
            disabled={checking}
            className="group relative w-full sm:w-auto flex items-center justify-center gap-2 bg-transparent border-2 border-[var(--netflix-gray)] hover:border-[var(--netflix-red)] text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 hover:bg-[var(--netflix-gray)]/20 hover:scale-105 transform active:scale-95 active:rotate-[-1deg] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 disabled:active:rotate-0 overflow-hidden"
          >
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-lg border-2 border-[var(--netflix-red)]/50 scale-110 opacity-0 group-hover:opacity-100 group-hover:animate-pulse transition-opacity duration-300"></div>
            
            {checking ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span className="relative z-10 animate-pulse">Checking...</span>
                {/* Loading dots animation */}
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce animation-delay-100"></div>
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce animation-delay-200"></div>
                  <div className="w-1 h-1 bg-white rounded-full animate-bounce animation-delay-300"></div>
                </div>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="relative z-10">Check Again</span>
              </>
            )}
            
            {/* Click ripple effect */}
            <div className="absolute inset-0 rounded-lg bg-[var(--netflix-red)]/20 scale-0 group-active:scale-100 group-active:animate-ping"></div>
          </button>
        </div>

        {/* Extraordinary animated instructions with premium effects */}
        <div className="text-sm text-[var(--netflix-light-gray)] space-y-6 mt-12 animate-fade-in animation-delay-800">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/20 via-purple-500/20 to-[var(--netflix-red)]/20 blur-xl animate-pulse"></div>
            <p className="relative text-2xl font-bold text-white bg-gradient-to-r from-white via-red-200 to-white bg-clip-text text-transparent animate-fade-in">
              ⚡ Quick Setup Guide ⚡
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* VPN Card - Enhanced */}
            <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[var(--netflix-gray)]/40 via-[var(--netflix-gray)]/30 to-transparent border-2 border-[var(--netflix-gray)]/50 hover:border-[var(--netflix-red)] transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--netflix-red)]/40 transform hover:scale-110 hover:-rotate-2 overflow-hidden">
              {/* Animated background glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/0 via-[var(--netflix-red)]/20 to-[var(--netflix-red)]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
              
              {/* Floating particles */}
              <div className="absolute top-2 right-2 w-3 h-3 bg-[var(--netflix-red)] rounded-full animate-ping opacity-75"></div>
              <div className="absolute bottom-3 left-3 w-2 h-2 bg-white rounded-full animate-bounce animation-delay-300"></div>
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/50 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></span>
                  </div>
                  <div className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full text-[10px] font-bold text-green-400 uppercase tracking-wider animate-pulse">
                    Required
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xl font-bold text-white group-hover:text-green-400 transition-colors duration-300">
                    🔐 VPN MUST BE ON
                  </p>
                  <p className="text-sm text-[var(--netflix-light-gray)] group-hover:text-white transition-colors duration-300 leading-relaxed">
                    Enable your VPN before accessing content for secure & unrestricted streaming
                  </p>
                </div>

                {/* Progress indicator */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[var(--netflix-gray)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full w-0 group-hover:w-full transition-all duration-1000 ease-out"></div>
                  </div>
                  <span className="text-xs text-green-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300">Step 1</span>
                </div>
              </div>

              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/30 to-transparent rounded-bl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>

            {/* Adblocker Card - Enhanced */}
            <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[var(--netflix-gray)]/40 via-[var(--netflix-gray)]/30 to-transparent border-2 border-[var(--netflix-gray)]/50 hover:border-[var(--netflix-red)] transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--netflix-red)]/40 transform hover:scale-110 hover:rotate-2 overflow-hidden">
              {/* Animated background glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--netflix-red)]/0 via-[var(--netflix-red)]/20 to-[var(--netflix-red)]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer animation-direction-reverse"></div>
              
              {/* Floating particles */}
              <div className="absolute top-3 left-3 w-3 h-3 bg-[var(--netflix-red)] rounded-full animate-ping opacity-75 animation-delay-200"></div>
              <div className="absolute bottom-2 right-2 w-2 h-2 bg-white rounded-full animate-bounce animation-delay-500"></div>
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-[var(--netflix-red)] to-red-700 rounded-xl flex items-center justify-center shadow-lg shadow-[var(--netflix-red)]/50 group-hover:rotate-[-12deg] group-hover:scale-110 transition-all duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <span className="w-3 h-3 bg-[var(--netflix-red)] rounded-full animate-pulse shadow-lg shadow-[var(--netflix-red)]/50"></span>
                  </div>
                  <div className="px-3 py-1 bg-[var(--netflix-red)]/20 border border-[var(--netflix-red)]/50 rounded-full text-[10px] font-bold text-[var(--netflix-red)] uppercase tracking-wider animate-pulse">
                    Critical
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xl font-bold text-white group-hover:text-[var(--netflix-red)] transition-colors duration-300">
                    🚫 DISABLE ADBLOCKER
                  </p>
                  <p className="text-sm text-[var(--netflix-light-gray)] group-hover:text-white transition-colors duration-300 leading-relaxed">
                    Turn off your ad blocker extension to access premium content seamlessly
                  </p>
                </div>

                {/* Progress indicator */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[var(--netflix-gray)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[var(--netflix-red)] to-red-700 rounded-full w-0 group-hover:w-full transition-all duration-1000 ease-out"></div>
                  </div>
                  <span className="text-xs text-[var(--netflix-red)] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300">Step 2</span>
                </div>
              </div>

              {/* Corner accent */}
              <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-bl from-[var(--netflix-red)]/30 to-transparent rounded-br-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
          </div>

          {/* Extra emphasis footer with pulsing arrow */}
          <div className="relative mt-8 p-4 rounded-xl bg-gradient-to-r from-transparent via-[var(--netflix-red)]/10 to-transparent border border-[var(--netflix-red)]/30">
            <div className="flex items-center justify-center gap-3">
              <svg className="w-5 h-5 text-[var(--netflix-red)] animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
              <p className="text-xs font-medium text-white">
                Complete both steps above, then click <span className="text-[var(--netflix-red)] font-bold animate-pulse">"Reload Page"</span> to continue
              </p>
              <svg className="w-5 h-5 text-[var(--netflix-red)] animate-bounce animation-delay-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
