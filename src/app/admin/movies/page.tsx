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
}

export default function MoviesListPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

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
                <thead className="bg-[var(--netflix-gray)]">
                  <tr className="text-left">
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Type</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Name</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Pic</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Sections</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Videos</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Created</th>
                    <th className="py-3 px-3 font-semibold text-white text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--netflix-gray)]">
                  {movies.map((m) => {
                    const totalVideos = m.sections?.reduce((a, s) => a + s.links.length, 0) ?? 0
                    const created = m.createdAt?.toDate ? m.createdAt.toDate() : undefined
                    return (
                      <tr key={m.id} className="hover:bg-[var(--netflix-gray)]/30 transition-colors duration-200">
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">{m.type ? (m.type === 'movie' ? 'Movie' : 'Series') : '-'}</td>
                        <td className="py-3 px-3 font-medium text-white">{m.name}</td>
                        <td className="py-3 px-3 max-w-[240px]">
                          <div className="flex items-center gap-3">
                            <img
                              src={m.pic}
                              alt={`${m.name} poster`}
                              className="h-12 w-20 rounded object-cover border border-[var(--netflix-gray)] shadow-md"
                              onError={(e) => {
                                const el = e.currentTarget as HTMLImageElement
                                el.style.visibility = 'hidden'
                              }}
                            />
                            <a href={m.pic} target="_blank" rel="noreferrer" className="truncate text-[var(--netflix-red)] hover:underline block max-w-[160px] text-xs">
                              {m.pic}
                            </a>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">{m.sections?.length ?? 0}</td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)]">{totalVideos}</td>
                        <td className="py-3 px-3 text-[var(--netflix-light-gray)] text-xs">{created ? created.toLocaleString() : '-'}</td>
                        <td className="py-3 px-3">
                          <Link
                            href={`/admin/movies/${m.id}`}
                            className="rounded-md bg-[var(--netflix-red)] text-white px-3 py-1.5 text-xs hover:bg-[#b20710] transition-all duration-300 inline-block"
                          >
                            Show
                          </Link>
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
