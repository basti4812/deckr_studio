// src/lib/pptx-merger/remap-layout-ids.ts

/**
 * Remaps sldLayoutIdLst IDs in a slideMaster XML to avoid collisions.
 *
 * Each slideMaster contains a <p:sldLayoutIdLst> with entries like:
 *   <p:sldLayoutId id="2147483649" r:id="rId1"/>
 *
 * These IDs must be globally unique across ALL masters in the presentation.
 * When merging, the copied master's IDs may collide with the base master's IDs.
 *
 * This function replaces any colliding IDs with new unique values.
 */
export function remapLayoutIds(masterXml: string, existingIds: Set<number>): string {
  // Find all sldLayoutId entries with their IDs
  const idRegex = /(sldLayoutId[^>]*\bid=")(\d+)(")/g

  // First pass: collect IDs that need remapping
  let nextId = 2147483648
  // Find a starting point above all existing IDs
  for (const id of existingIds) {
    if (id >= nextId) nextId = id + 1
  }

  // Also collect IDs from this master that don't collide (to avoid self-collision)
  const masterIds = new Set<number>()
  let match
  const tempRegex = /sldLayoutId[^>]*\bid="(\d+)"/g
  while ((match = tempRegex.exec(masterXml)) !== null) {
    masterIds.add(parseInt(match[1], 10))
  }

  // Build remap table: only remap IDs that collide
  const remap = new Map<string, string>()
  for (const id of masterIds) {
    if (existingIds.has(id)) {
      // Find next available ID
      while (existingIds.has(nextId) || masterIds.has(nextId)) {
        nextId++
      }
      remap.set(String(id), String(nextId))
      existingIds.add(nextId) // Reserve it
      nextId++
    }
  }

  if (remap.size === 0) return masterXml // No collisions

  // Replace the colliding IDs
  return masterXml.replace(idRegex, (_match, prefix, idStr, suffix) => {
    const newId = remap.get(idStr)
    return newId ? `${prefix}${newId}${suffix}` : `${prefix}${idStr}${suffix}`
  })
}
