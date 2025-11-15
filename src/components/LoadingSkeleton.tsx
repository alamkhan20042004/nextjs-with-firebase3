"use client"
import React, { useEffect } from 'react'

// Simple shimmering skeleton blocks. Usage:
// <LoadingSkeleton variant="grid" count={6} />
// <LoadingSkeleton variant="table" rows={5} />
// <LoadingSkeleton variant="card" />

type Variant = 'card' | 'grid' | 'row' | 'table' | 'banner'

type Props = {
  variant?: Variant
  count?: number // for grid/row
  rows?: number // for table
  className?: string
}

const shimmer = 'relative overflow-hidden bg-gray-200/70 dark:bg-gray-800/60 rounded'
const shine: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  transform: 'translateX(-100%)',
  background:
    'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.35) 50%, rgba(255,255,255,0) 100%)',
  animation: 'skltn 1.2s infinite',
}

export default function LoadingSkeleton({ variant = 'card', count = 1, rows = 4, className = '' }: Props) {
  // Ensure keyframes are injected after hydration to avoid pre-hydration DOM mutations
  useEffect(() => {
    try {
      if (typeof document !== 'undefined' && !document.getElementById('skltn-anim')) {
        const style = document.createElement('style')
        style.id = 'skltn-anim'
        style.innerHTML = `@keyframes skltn { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }`
        document.head.appendChild(style)
      }
    } catch {}
  }, [])
  if (variant === 'grid') {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`${shimmer} h-28`}>
            <div style={shine} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={`w-full border rounded-xl overflow-hidden ${className}`}>
        <div className="h-10 bg-gray-100/60 dark:bg-gray-900/40" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${shimmer} h-12 border-t`}> 
            <div style={shine} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'row') {
    return (
      <div className={`flex gap-3 overflow-hidden ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`${shimmer} h-24 w-40`}>
            <div style={shine} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div className={`${shimmer} h-12 w-full`}> 
        <div style={shine} />
      </div>
    )
  }

  // default card
  return (
    <div className={`${shimmer} h-28 w-full ${className}`}>
      <div style={shine} />
    </div>
  )
}

// (moved to useEffect above to avoid pre-hydration mutations)
