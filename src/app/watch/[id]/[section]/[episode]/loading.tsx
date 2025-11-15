"use client"
export default function Loading() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-[var(--netflix-black)] via-[#0a0a0a] to-[var(--netflix-black)] p-6 grid place-items-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-[var(--netflix-red)]/30 border-t-[var(--netflix-red)] rounded-full animate-spin"></div>
          <div className="absolute inset-2 w-12 h-12 border-4 border-transparent border-b-white rounded-full animate-spin animation-direction-reverse"></div>
        </div>
        <p className="text-white/90">Preparing your player…</p>
      </div>
    </div>
  )
}
