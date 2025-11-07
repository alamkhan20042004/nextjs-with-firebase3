"use client"

import { useCallback, useEffect, useState } from 'react'

export default function AdblockGate() {
  const [blocked, setBlocked] = useState(false)
  const [checking, setChecking] = useState(true)

  const check = useCallback(async () => {
    setChecking(true)
    let detected = false

    // 1) DOM bait element (hidden by many blockers)
    try {
      const bait = document.createElement('div')
      bait.className = 'adsbox adsbygoogle ad ad-banner ad-unit ad-slot advertisement sponsor sponsored'
      bait.style.position = 'absolute'
      bait.style.left = '-9999px'
      bait.style.height = '10px'
      bait.style.width = '10px'
      document.body.appendChild(bait)
      const cs = window.getComputedStyle(bait)
      const baitHidden = (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        bait.offsetParent === null ||
        bait.clientHeight === 0 ||
        bait.clientWidth === 0
      )
      document.body.removeChild(bait)
      if (baitHidden) detected = true
    } catch {}

    // Helper: fetch a URL and indicate block if request errors
    const testFetch = async (url: string, init?: RequestInit) => {
      try {
        const res = await fetch(url, { cache: 'no-store', ...init })
        // If we got a response, consider it not blocked. Some extensions may return opaque but that's fine.
        return false
      } catch {
        return true
      }
    }

    // 2) Multiple local bait paths commonly filtered by path rules
    const localUrls = ['/ads.js', '/advertisement.js', '/adservice.js']
    const localResults = await Promise.all(localUrls.map((u) => testFetch(u)))
    if (localResults.some(Boolean)) detected = true

    // 3) Remote ad script fetch using no-cors (commonly blocked by host rules)
    const remoteBlocked = await testFetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', { mode: 'no-cors' })
    if (remoteBlocked) detected = true

    // 4) Script tag injection test with onerror (some blockers cancel script loads)
    if (!detected) {
      detected = await new Promise<boolean>((resolve) => {
        let settled = false
        const timer = window.setTimeout(() => {
          if (!settled) { settled = true; resolve(false) }
        }, 1500)
        const s = document.createElement('script')
        s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
        s.async = true
        s.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(true) } }
        s.onload = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false) } }
        document.head.appendChild(s)
        // Clean up after a while
        window.setTimeout(() => {
          try { document.head.removeChild(s) } catch {}
        }, 3000)
      })
    }

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

  if (!blocked) return null

  // Full-screen overlay blocking UI
  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--netflix-black)] text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold">Ad blocker detected</h2>
        <p className="text-sm text-[var(--netflix-light-gray)]">
          To view this site, please disable your ad blocker and reload the page.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-4 py-2 text-sm transition-all duration-300"
          >
            Reload
          </button>
          <button
            onClick={() => check()}
            disabled={checking}
            className="rounded-md border border-[var(--netflix-gray)] px-4 py-2 text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Recheck'}
          </button>
        </div>
      </div>
    </div>
  )
}
