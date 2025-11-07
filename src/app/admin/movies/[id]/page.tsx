"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isAdminEmail } from '@/lib/admin'
import { deleteDoc, doc, getDoc, type DocumentData } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

type Movie = {
  id: string
  name: string
  pic: string
  sections: { name: string; links: string[] }[]
  type?: 'movie' | 'series'
  featured?: boolean
  popular?: boolean
  topRank?: number | null
  heroDescription?: string
  heroCTALabel?: string
  heroCTAUrl?: string
  heroImageUrl?: string
}

export default function MovieDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id ?? '')

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [movie, setMovie] = useState<Movie | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

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
      if (!db || !id) return
      setLoading(true)
      try {
        const ref = doc(db, 'movies', id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setMessage('Movie not found.')
          return
        }
        const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
        setMovie(data)
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    if (!db || !id) return
    try {
      await deleteDoc(doc(db, 'movies', id))
      router.replace('/admin/movies')
    } catch (e: any) {
      setMessage(e?.message || 'Failed to delete movie.')
    }
  }

  if (authorized === null || loading) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p>
      </div>
    )
  }

  if (!authorized || !movie) return null

  return (
    <div className="min-h-dvh bg-[var(--netflix-black)] p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-white">{movie.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs sm:text-sm text-[var(--netflix-light-gray)] hidden sm:block">{email}</p>
            <Link href="/admin/movies" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">Back to list</Link>
            <Link href="/admin/settings" className="rounded-md border border-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm hover:bg-[var(--netflix-gray)] transition-all duration-300 text-white">Global settings</Link>
            <Link href={`/admin/movies/${movie.id}/edit`} className="rounded-md bg-[var(--netflix-gray)] px-3 py-1.5 text-xs sm:text-sm text-white hover:bg-[var(--netflix-gray)]/70 transition-all">Update</Link>
            <button onClick={handleDelete} className="rounded-md border border-[var(--netflix-red)]/50 px-3 py-1.5 text-xs sm:text-sm text-[var(--netflix-red)] hover:bg-[var(--netflix-red)]/10 transition-all">Delete</button>
            <button
              onClick={() => {
                if (!auth) return
                signOut(auth).then(() => router.replace('/user'))
              }}
              className="rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 py-1.5 text-xs sm:text-sm transition-all"
            >
              Sign out
            </button>
          </div>
        </div>

        {message && (
          <div className="rounded-md border border-[var(--netflix-red)]/50 bg-[var(--netflix-red)]/10 text-[var(--netflix-red)] px-3 py-2 text-sm" role="alert">
            {message}
          </div>
        )}

        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-6 shadow-xl space-y-6">
          <div className="flex items-start gap-4">
            <img
              src={movie.pic}
              alt={`${movie.name} poster`}
              className="h-24 w-40 rounded object-cover border border-[var(--netflix-gray)]"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement
                el.style.visibility = 'hidden'
              }}
            />
            <div className="space-y-1 text-sm text-white">
              <p><span className="font-medium text-[var(--netflix-light-gray)]">Type:</span> {movie.type === 'series' ? 'Series' : 'Movie'}</p>
              <p><span className="font-medium text-[var(--netflix-light-gray)]">Sections:</span> {movie.sections?.length ?? 0}</p>
              <p><span className="font-medium text-[var(--netflix-light-gray)]">Featured:</span> {movie.featured ? 'Yes' : 'No'}</p>
              <p><span className="font-medium text-[var(--netflix-light-gray)]">Popular row:</span> {movie.popular ? 'Yes' : 'No'}</p>
              <p><span className="font-medium text-[var(--netflix-light-gray)]">Top 10 rank:</span> {movie.topRank ?? '—'}</p>
              {movie.heroDescription && (
                <p className="text-xs text-[var(--netflix-light-gray)] mt-2">{movie.heroDescription}</p>
              )}
              {(movie.heroCTAUrl || movie.heroCTALabel) && (
                <p className="text-xs mt-1"><span className="font-medium text-[var(--netflix-light-gray)]">Hero CTA:</span> {movie.heroCTALabel || 'Play'} {movie.heroCTAUrl && (<a href={movie.heroCTAUrl} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline break-all">{movie.heroCTAUrl}</a>)} </p>
              )}
              {movie.heroImageUrl && (
                <p className="text-xs mt-1"><span className="font-medium text-[var(--netflix-light-gray)]">Hero Image:</span> <a href={movie.heroImageUrl} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline break-all">{movie.heroImageUrl}</a></p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {movie.sections?.map((s, i) => (
              <div key={i} className="rounded-md border border-[var(--netflix-gray)] p-3 bg-black/40">
                <h3 className="font-medium text-sm mb-2 text-white">{s.name} — {s.links.length} videos</h3>
                {s.links.length === 0 ? (
                  <p className="text-xs text-[var(--netflix-light-gray)]">No links.</p>
                ) : (
                  <ul className="text-xs list-decimal pl-5 space-y-1 break-all">
                    {s.links.map((l, idx) => (
                      <li key={idx}><a href={l} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline">{l}</a></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
