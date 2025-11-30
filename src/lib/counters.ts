import { doc, runTransaction } from 'firebase/firestore'
import { db } from './firebase'

type CounterFields = {
  todayCount?: number
  yesterdayCount?: number
  totalClicks?: number
  lastCountDate?: string
}

export async function incrementMovieClick(movieId: string): Promise<void> {
  if (!db || !movieId) return
  const ref = doc(db, 'movies', movieId)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const data = (snap.exists() ? (snap.data() as CounterFields) : {})
    const last = data.lastCountDate || todayStr
    let todayCount = data.todayCount || 0
    let yesterdayCount = data.yesterdayCount || 0
    let totalClicks = data.totalClicks || 0
    if (last === todayStr) {
      todayCount += 1
    } else {
      yesterdayCount = todayCount
      todayCount = 1
    }
    totalClicks += 1
    tx.update(ref, {
      todayCount,
      yesterdayCount,
      totalClicks,
      lastCountDate: todayStr
    })
  })
}

// Client-side guard to avoid duplicate increments from rapid repeated clicks.
export function shouldIncrement(movieId: string, windowMs = 300000): boolean {
  try {
    if (typeof window === 'undefined') return true
    const key = `mbx_click_${movieId}`
    const raw = localStorage.getItem(key)
    const now = Date.now()
    if (raw) {
      const last = Number(raw)
      if (Number.isFinite(last) && now - last < windowMs) {
        return false
      }
    }
    localStorage.setItem(key, String(now))
    return true
  } catch {
    return true
  }
}
