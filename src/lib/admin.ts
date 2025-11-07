// Utilities for admin email checks using env var NEXT_PUBLIC_ADMIN_EMAILS

export function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS || ''
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  const list = getAdminEmails()
  return list.includes(email.toLowerCase())
}
