"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import { collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, type DocumentData } from 'firebase/firestore'
import LoadingSkeleton from '@/components/LoadingSkeleton'

export const dynamic = 'force-dynamic'

type Movie = {
  id: string
  name: string
  pic: string
  sections: { name: string; links: string[] }[]
  createdAt?: Timestamp
  type?: 'movie' | 'series'
  genres?: string[]
  trailerUrl?: string | null
  downloadUrl?: string | null
  todayCount?: number
  yesterdayCount?: number
  totalClicks?: number
}

export default function MoviesListPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const moviesRef = useMemo(() => (db ? collection(db, 'movies') : null), [])

  useEffect(() => {
    if (!auth) {
      router.replace('/user')
      return
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      const userEmail = user?.email ?? null
      setEmail(userEmail)
      if (userEmail && isAdminEmail(userEmail)) {
        setAuthorized(true)
      } else {
        setAuthorized(false)
        router.replace('/user')
      }
    })
    return () => unsub()
  }, [router])

  useEffect(() => {
    const load = async () => {
      if (!moviesRef) return
      setLoading(true)
      try {
        const q = query(moviesRef, orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        const list: Movie[] = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DocumentData) } as Movie))
        setMovies(list)
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => setLoading(false))
  }, [moviesRef])

  const handleDelete = async (id: string) => {
    if (!moviesRef) return
    // Ask for confirmation before deleting
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this movie permanently? This cannot be undone.') : true
    if (!confirmed) return
    try {
      await deleteDoc(doc(moviesRef, id))
      setMessage('Movie deleted.')
      // refresh
      const q = query(moviesRef, orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const list: Movie[] = []
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DocumentData) } as Movie))
      setMovies(list)
    } catch (e: any) {
      setMessage(e?.message || 'Failed to delete movie.')
    }
  }

  if (authorized === null) {
    return (
      <div className="min-h-dvh bg-[var(--netflix-black)] grid place-items-center p-6">
        <p className="text-sm text-[var(--netflix-light-gray)]">Checking admin access…</p>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className="min-h-dvh bg-[var(--netflix-black)]">
      {/* Netflix-style admin header */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-[var(--netflix-black)] to-transparent border-b border-[var(--netflix-gray)]">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--netflix-red)]">All Movies</h1>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] hidden sm:block truncate max-w-[160px]">{email}</p>
            <label className="relative block">
              <span className="sr-only">Search</span>
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-[var(--netflix-light-gray)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name…"
                className="w-[220px] sm:w-[260px] rounded-md bg-[var(--netflix-gray)]/60 border border-[var(--netflix-gray)]/50 pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder:text-[var(--netflix-light-gray)] focus:outline-none focus:ring-2 focus:ring-[var(--netflix-red)]/50 focus:border-[var(--netflix-red)]/50 transition-all"
              />
            </label>
            <Link href="/admin" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">
              Admin home
            </Link>
            <Link href="/admin/settings" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">
              Global settings
            </Link>
            <button
              onClick={() => {
                if (!auth) return
                signOut(auth).then(() => router.replace('/user'))
              }}
              className="rounded-md bg-[var(--netflix-red)] text-white px-3 py-1.5 text-xs sm:text-sm hover:bg-[#b20710] transition-all duration-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        {message && (
          <div className="rounded-md bg-[var(--netflix-red)]/10 border border-[var(--netflix-red)]/30 text-white px-4 py-3 text-sm backdrop-blur" role="alert">
            {message}
          </div>
        )}

        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)] p-4 sm:p-6 shadow-xl">
          {loading ? (
            <LoadingSkeleton variant="table" rows={6} />
          ) : movies.length === 0 ? (
            <p className="text-sm text-[var(--netflix-light-gray)]">No movies yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--netflix-gray)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--netflix-gray)]/50">
                  <tr className="text-left">
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Type</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Name</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Pic</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Genres</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Sections</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Videos</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Today</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Yesterday</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Total</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Created</th>
                    <th className="py-3 px-3 font-bold text-white text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--netflix-gray)]">
                  {(q.trim() ? movies.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())) : movies).map((m) => {
                    const totalVideos = m.sections?.reduce((a, s) => a + s.links.length, 0) ?? 0
                    const created = m.createdAt?.toDate ? m.createdAt.toDate() : undefined
                    return (
                      <tr key={m.id} className="hover:bg-[var(--netflix-gray)]/30 transition-colors duration-200 group">
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-black/40 border border-[var(--netflix-gray)]">
                            {m.type ? (m.type === 'movie' ? 'Movie' : 'Series') : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-white group-hover:text-[var(--netflix-red)] transition-colors">
                          {m.name}
                          {(typeof m.downloadUrl === 'string' && /coming\s*soon/i.test(m.downloadUrl.trim())) && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--netflix-red)]/20 text-[var(--netflix-red)] border border-[var(--netflix-red)]/40">Upcoming</span>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[240px]">
                          <div className="flex items-center gap-3">
                            <img
                              src={m.pic}
                              alt={`${m.name} poster`}
                              className="h-12 w-20 rounded object-cover border border-[var(--netflix-gray)] shadow-md group-hover:border-[var(--netflix-red)]/50 transition-colors"
                              onError={(e) => {
                                const el = e.currentTarget as HTMLImageElement
                                el.style.visibility = 'hidden'
                              }}
                            />
                            <a href={m.pic} target="_blank" rel="noreferrer" className="truncate text-[var(--netflix-light-gray)] hover:text-[var(--netflix-red)] hover:underline block max-w-[160px] text-xs">
                              {m.pic}
                            </a>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {(m.genres || []).slice(0,4).map((g) => (
                              <span key={g} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/40 text-white border border-[var(--netflix-gray)]">
                                {g}
                              </span>
                            ))}
                            {(m.genres?.length || 0) > 4 && (
                              <span className="text-[10px] text-[var(--netflix-light-gray)]">+{(m.genres!.length - 4)}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">{m.sections?.length ?? 0}</td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">{totalVideos}</td>
                        <td className="py-3 px-3 text-white">{m.todayCount ?? 0}</td>
                        <td className="py-3 px-3 text-white">{m.yesterdayCount ?? 0}</td>
                        <td className="py-3 px-3 text-white">{m.totalClicks ?? 0}</td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)] text-xs">{created ? created.toLocaleString() : '-'}</td>
                        <td className="py-3 px-3">
                          <Link
                            href={`/admin/movies/${m.id}`}
                            className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] hover:scale-105 hover:shadow-lg hover:shadow-red-500/30 text-white px-3 py-1.5 text-xs font-medium transition-all duration-300 transform active:scale-95 inline-block"
                          >
                            Show
                          </Link>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="ml-2 rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs text-white hover:bg-[var(--netflix-gray)] transition-all duration-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
