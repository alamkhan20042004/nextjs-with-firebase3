"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { useParams } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, type DocumentData } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

type Section = { name: string; links: string[] }
type Movie = {
  id: string
  name: string
  pic: string
  type?: 'movie' | 'series'
  sections: Section[]
}

export default function WatchLandingPage() {
  const params = useParams()
  const id = String(params?.id ?? '')

  const [movie, setMovie] = useState<Movie | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!db || !id) return
      setLoading(true)
      try {
        const ref = doc(db, 'movies', id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setError('Not found')
          return
        }
        const data = { id: snap.id, ...(snap.data() as DocumentData) } as Movie
        setMovie(data)
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-dvh p-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-28 w-44 rounded bg-gray-200/70 dark:bg-gray-800/60" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-40 rounded bg-gray-200/70 dark:bg-gray-800/60" />
              <div className="h-4 w-28 rounded bg-gray-200/70 dark:bg-gray-800/60" />
            </div>
          </div>
          <LoadingSkeleton variant="grid" count={6} />
        </div>
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">{error || 'Not found'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-start gap-4">
          <img
            src={movie.pic}
            alt={`${movie.name} poster`}
            className="h-28 w-44 rounded object-cover border"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.visibility = 'hidden'
            }}
          />
          <div>
            <h1 className="text-2xl font-semibold">{movie.name}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{movie.type === 'series' ? 'Series' : 'Movie'}</p>
          </div>
        </div>

        <div className="space-y-4">
          {movie.sections?.map((s, si) => (
            <div key={si} className="rounded-xl border p-4">
              <h2 className="font-medium text-sm mb-2">{s.name} — {s.links.length} episodes</h2>
              {s.links.length === 0 ? (
                <p className="text-xs text-gray-500">No links.</p>
              ) : (
                <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {s.links.map((l, ei) => (
                    <li key={ei}>
                      <Link
                        href={`/watch/${movie.id}/${si}/${ei}`}
                        className="block rounded-md border px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Episode {ei + 1}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
