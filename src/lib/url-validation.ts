/**
 * Validates that a URL points to the configured Supabase storage.
 * Used to prevent SSRF attacks by ensuring server-side fetch()
 * calls only target our own storage backend.
 */
export function isAllowedStorageUrl(url: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  try {
    const parsed = new URL(url)
    const expected = new URL(supabaseUrl)
    return parsed.protocol === 'https:' && parsed.hostname === expected.hostname
  } catch {
    return false
  }
}
