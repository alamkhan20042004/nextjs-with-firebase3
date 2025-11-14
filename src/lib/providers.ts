export type Provider = 'odysee' | 'rumble' | 'youtube' | 'vimeo' | 'unknown'

export type EmbedConfig = {
  provider: Provider
  src: string
  id?: string
  // Whether to apply a sandbox attr. Some providers (Odysee) fail when sandboxed
  sandbox?: string
  allow?: string
  referrerPolicy?: string
}

function extractSrcFromIframe(raw: string): string | null {
  // Very small, safe extraction without DOMParser
  const m = raw.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i)
  return m?.[1] ?? null
}

function detectProvider(raw: string): Provider {
  try {
    const u = new URL(raw)
    const h = u.hostname.toLowerCase()
    if (/(^|\.)odysee\.com$/.test(h)) return 'odysee'
    if (/(^|\.)rumble\.com$/.test(h)) return 'rumble'
    if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) return 'youtube'
    if (/(^|\.)vimeo\.com$/.test(h)) return 'vimeo'
    return 'unknown'
  } catch {
    if (/odysee\.com/i.test(raw)) return 'odysee'
    if (/rumble\.com/i.test(raw)) return 'rumble'
    if (/youtube\.com|youtu\.be/i.test(raw)) return 'youtube'
    if (/vimeo\.com/i.test(raw)) return 'vimeo'
    return 'unknown'
  }
}

function toOdyseeEmbed(raw: string): string {
  // Build an embed path that always includes a claim name (segment containing ':')
  // Prefer pattern: /@channel:hash/<claimName>:<shortId>
  try {
    const u = new URL(raw)
    const decoded = decodeURIComponent(u.pathname || '')
    // Already an embed
    if (/\/\$\/embed\//.test(decoded)) return raw

    const parts = decoded.split('/').filter(Boolean)
    // Find the last segment that looks like a claim (contains a colon)
    const claimIdx = [...parts].reverse().findIndex((p) => p.includes(':'))
    const idxFromStart = claimIdx >= 0 ? parts.length - 1 - claimIdx : -1
    const channelIdx = parts.findIndex((p) => p.startsWith('@'))

    let embedPath = ''
    if (idxFromStart >= 0) {
      const claimSeg = parts[idxFromStart]
      if (channelIdx >= 0 && channelIdx < idxFromStart) {
        // Use @channel/.../claim but only keep the direct channel + claim
        embedPath = `${encodeURIComponent(parts[channelIdx])}%2F${encodeURIComponent(claimSeg)}`
      } else {
        // Use claim only
        embedPath = encodeURIComponent(claimSeg)
      }
    } else {
      // Fallback: if no claim found, try using the last segment as-is; this may still fail on Odysee
      const last = parts[parts.length - 1] || ''
      embedPath = encodeURIComponent(last)
    }

    return `https://odysee.com/$/embed/${embedPath}${u.search || ''}`
  } catch {
    // Regex fallback when URL parsing fails
    const m = raw.match(/odysee\.com\/(.+?)(\?.*)?$/i)
    if (m) {
      const decoded = decodeURIComponent(m[1])
      const parts = decoded.split('/').filter(Boolean)
      const claimIdx = [...parts].reverse().findIndex((p) => p.includes(':'))
      const idxFromStart = claimIdx >= 0 ? parts.length - 1 - claimIdx : -1
      const channelIdx = parts.findIndex((p) => p.startsWith('@'))
      let embedPath = ''
      if (idxFromStart >= 0) {
        const claimSeg = parts[idxFromStart]
        if (channelIdx >= 0 && channelIdx < idxFromStart) {
          embedPath = `${encodeURIComponent(parts[channelIdx])}%2F${encodeURIComponent(claimSeg)}`
        } else {
          embedPath = encodeURIComponent(claimSeg)
        }
      } else {
        const last = parts[parts.length - 1] || ''
        embedPath = encodeURIComponent(last)
      }
      const query = m[2] || ''
      return `https://odysee.com/$/embed/${embedPath}${query}`
    }
    return raw
  }
}

export function getEmbedConfig(input: string): EmbedConfig {
  // Accept full <iframe ...> strings too, extract src if present
  const url = extractSrcFromIframe(input) ?? input
  const provider = detectProvider(url)
  switch (provider) {
    case 'odysee': {
      return {
        provider,
        src: toOdyseeEmbed(url),
        id: 'odysee-iframe',
        // Do NOT allow fullscreen so double-click doesn't enter iframe fullscreen
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        referrerPolicy: 'strict-origin-when-cross-origin',
        // No sandbox
      }
    }
    case 'rumble': {
      return {
        provider,
        src: url,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-forms allow-pointer-lock'
      }
    }
    case 'youtube':
    case 'vimeo':
    default: {
      return {
        provider,
        src: url,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-forms allow-pointer-lock'
      }
    }
  }
}
