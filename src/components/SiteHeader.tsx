"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

// NOTE: This is a full replacement of the header, not a mix.
// Structure & styling mirror the screenshot: logo, nav items in one row, actions right.

const NAV = [
  { label: "Home", href: "/user" },
  { label: "Shows", href: "/user?filter=series" },
  { label: "Movies", href: "/user?filter=movie" },
  { label: "Games", href: "/user?section=games" },
  { label: "New & Popular", href: "/user?section=new" },
  { label: "My List", href: "/user?section=my-list" },
  { label: "Browse by Languages", href: "/user?section=languages" },
]

export default function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const hide = useMemo(() => pathname?.startsWith("/admin") ?? false, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (hide) return null

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-[64px] flex items-center transition-colors duration-300 ${
        scrolled ? "bg-[#141414]" : "bg-gradient-to-b from-black/85 via-black/40 to-transparent"
      }`}
    >
      <div className="w-full px-6 lg:px-10 flex items-center">
        {/* Logo */}
        <Link href="/user" className="mr-8 select-none">
          <span className="text-[var(--netflix-red)] text-[26px] font-extrabold tracking-[0.15em] leading-none">NETFLIX</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:block flex-1">
          <ul className="flex items-center gap-6">
            {NAV.map((item) => {
              const active = pathname === item.href
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`text-[15px] font-medium transition-colors ${
                      active ? "text-white" : "text-[#e5e5e5] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-5 ml-auto">
          {/* Search icon */}
            <button aria-label="Search" className="p-1 hover:opacity-80 transition-opacity">
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
          {/* Bell with badge */}
          <button aria-label="Notifications" className="relative p-1 hover:opacity-80 transition-opacity">
            <svg
              className="w-6 h-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
              <path d="M9 17a3 3 0 0 0 6 0" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 bg-[var(--netflix-red)] text-white text-[10px] leading-none px-1.5 py-[3px] rounded-full font-semibold shadow">10</span>
          </button>
          {/* Profile avatar + caret */}
          <button className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded bg-[#1762a7] flex items-center justify-center overflow-hidden shadow">
              <span className="text-white text-sm font-semibold">U</span>
            </div>
            <svg
              className="w-4 h-4 text-white group-hover:text-[#e5e5e5] transition-colors"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
