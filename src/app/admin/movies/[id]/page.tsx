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
  genres?: string[]
  trailerUrl?: string | null
  downloadUrl?: string | null
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

        <div className="rounded-xl border border-[var(--netflix-gray)] bg-[var(--netflix-dark)]/90 backdrop-blur p-6 shadow-xl space-y-8">
          <div className="flex items-start gap-6">
            <img
              src={movie.pic}
              alt={`${movie.name} poster`}
              className="h-32 w-[9rem] rounded-lg object-cover border border-[var(--netflix-gray)] shadow-lg hover:border-[var(--netflix-red)]/50 transition-all duration-300"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement
                el.style.visibility = 'hidden'
              }}
            />
            <div className="space-y-3 text-sm text-white flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Type:</span> 
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-black/50 border border-[var(--netflix-gray)]">
                      {movie.type === 'series' ? 'Series' : 'Movie'}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Sections:</span> 
                    <span className="text-white font-medium">{movie.sections?.length ?? 0}</span>
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Genres:</span>
                    <div className="flex flex-wrap gap-1">
                      {(movie.genres || []).length === 0 ? (
                        <span className="text-[var(--netflix-light-gray)]">—</span>
                      ) : (
                        (movie.genres || []).map((g) => (
                          <span key={g} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/40 text-white border border-[var(--netflix-gray)]">{g}</span>
                        ))
                      )}
                    </div>
                  </div>
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Featured:</span> 
                    <span className={movie.featured ? 'text-green-400 font-medium' : 'text-[var(--netflix-light-gray)]'}>{movie.featured ? 'Yes' : 'No'}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Popular:</span> 
                    <span className={movie.popular ? 'text-green-400 font-medium' : 'text-[var(--netflix-light-gray)]'}>{movie.popular ? 'Yes' : 'No'}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--netflix-light-gray)] min-w-[80px]">Top 10:</span> 
                    <span className="text-white font-medium">{movie.topRank ?? '—'}</span>
                  </p>
                </div>
              </div>
              
              {movie.heroDescription && (
                <div className="mt-4 p-3 rounded-lg bg-black/40 border border-[var(--netflix-gray)]/50">
                  <p className="font-semibold text-[var(--netflix-light-gray)] text-xs mb-1">Hero Description:</p>
                  <p className="text-sm text-white">{movie.heroDescription}</p>
                </div>
              )}
              
              {(movie.heroCTAUrl || movie.heroCTALabel) && (
                <div className="mt-2 p-3 rounded-lg bg-black/40 border border-[var(--netflix-gray)]/50">
                  <p className="font-semibold text-[var(--netflix-light-gray)] text-xs mb-1">Hero CTA:</p>
                  <p className="text-sm">
                    <span className="text-white font-medium">{movie.heroCTALabel || 'Play'}</span>
                    {movie.heroCTAUrl && (
                      <> → <a href={movie.heroCTAUrl} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline break-all">{movie.heroCTAUrl}</a></>
                    )}
                  </p>
                </div>
              )}
              
              {movie.heroImageUrl && (
                <div className="mt-2 p-3 rounded-lg bg-black/40 border border-[var(--netflix-gray)]/50">
                  <p className="font-semibold text-[var(--netflix-light-gray)] text-xs mb-1">Hero Image:</p>
                  <a href={movie.heroImageUrl} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline break-all text-sm">{movie.heroImageUrl}</a>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white border-b border-[var(--netflix-gray)] pb-2">Sections & Links</h2>
            {movie.sections?.map((s, i) => (
              <div key={i} className="rounded-lg border border-[var(--netflix-gray)] p-4 bg-black/40 hover:border-[var(--netflix-gray)]/70 transition-all duration-300">
                <h3 className="font-semibold text-base mb-3 text-white flex items-center justify-between">
                  <span>{s.name}</span>
                  <span className="text-xs font-normal px-2.5 py-1 rounded-full bg-[var(--netflix-red)]/20 text-[var(--netflix-red)] border border-[var(--netflix-red)]/30">{s.links.length} video{s.links.length !== 1 ? 's' : ''}</span>
                </h3>
                {s.links.length === 0 ? (
                  <p className="text-sm text-[var(--netflix-light-gray)] italic">No links available.</p>
                ) : (
                  <ul className="text-sm list-decimal pl-5 space-y-2 break-all">
                    {s.links.map((l, idx) => (
                      <li key={idx} className="text-[var(--netflix-light-gray)] hover:text-white transition-colors">
                        <a href={l} target="_blank" rel="noreferrer" className="text-[var(--netflix-red)] hover:underline">{l}</a>
                      </li>
                    ))}
                    {(movie.trailerUrl || movie.downloadUrl) && (
                      <div className="space-y-4">
                        {movie.trailerUrl && (
                          <div>
                            <h2 className="text-lg font-semibold text-white mb-2">Trailer</h2>
                            <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                              <iframe
                                className="absolute inset-0 w-full h-full rounded-lg border border-[var(--netflix-gray)]"
                                src={(function(){
                                  const url = String(movie.trailerUrl)
                                  try {
                                    if (url.includes('youtube.com/watch')) {
                                      const u = new URL(url)
                                      const v = u.searchParams.get('v')
                                      if (v) return `https://www.youtube.com/embed/${v}`
                                    }
                                    if (url.includes('youtu.be/')) {
                                      const id = url.split('youtu.be/')[1]?.split(/[?&#]/)[0]
                                      if (id) return `https://www.youtube.com/embed/${id}`
                                    }
                                  } catch {}
                                  return url
                                })()}
                                title="Trailer"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                              />
                            </div>
                          </div>
                        )}
                        {movie.downloadUrl && (
                          <div>
                            <a
                              href={movie.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-md bg-[var(--netflix-red)] hover:bg-[#F40612] text-white px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-300"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 3a1 1 0 011 1v9.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.414 0l-4.001-4a1 1 0 111.414-1.414L11 13.586V4a1 1 0 011-1z" />
                                <path d="M5 20a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z" />
                              </svg>
                              Download
                            </a>
                          </div>
                        )}
                      </div>
                    )}
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
