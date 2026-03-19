import JSZip from 'jszip'

/**
 * Detect hidden slides in a PPTX and return the 0-based indices of visible slides.
 *
 * In OOXML, a slide is hidden when its root `<p:sld>` element has `show="0"`.
 * ConvertAPI (and PowerPoint's print/export) skip hidden slides, so this
 * mapping is needed to align our page_index with ConvertAPI's output.
 *
 * Works in both browser and Node.js (only depends on JSZip).
 */
export async function getVisibleSlideIndices(
  input: JSZip | ArrayBuffer | Uint8Array
): Promise<number[]> {
  const zip = input instanceof JSZip ? input : await JSZip.loadAsync(input)

  // Read presentation.xml.rels to build rId → target mapping
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
  if (!presRelsFile) {
    // Fallback: can't determine order, assume single visible slide
    return [0]
  }
  const presRelsXml = await presRelsFile.async('string')

  const ridToTarget = new Map<string, string>()
  for (const m of presRelsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const el = m[0]
    const idMatch = el.match(/\bId="([^"]+)"/)
    const targetMatch = el.match(/\bTarget="([^"]+)"/)
    if (idMatch && targetMatch) ridToTarget.set(idMatch[1], targetMatch[1])
  }

  // Read presentation.xml to get ordered slide list
  const presFile = zip.file('ppt/presentation.xml')
  if (!presFile) return [0]
  const presXml = await presFile.async('string')

  const orderedSlideTargets: string[] = []
  for (const m of presXml.matchAll(/<p:sldId\b[^>]*(?:\/>|>[^<]*<\/p:sldId>)/g)) {
    const ridMatch = m[0].match(/r:id="([^"]+)"/)
    if (ridMatch) {
      const target = ridToTarget.get(ridMatch[1])
      if (target) orderedSlideTargets.push(target)
    }
  }

  if (orderedSlideTargets.length === 0) {
    // Fallback: count slide files directly
    const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    return slideFiles.length > 0 ? slideFiles.map((_, i) => i) : [0]
  }

  // Check each slide's XML for show="0" (hidden)
  const visibleIndices: number[] = []
  for (let i = 0; i < orderedSlideTargets.length; i++) {
    const slidePath = `ppt/${orderedSlideTargets[i]}`
    const slideFile = zip.file(slidePath)
    if (!slideFile) continue

    const slideXml = await slideFile.async('string')
    // The root element <p:sld show="0"> marks a hidden slide
    const rootMatch = slideXml.match(/<p:sld\b[^>]*>/)
    if (rootMatch) {
      const showAttr = rootMatch[0].match(/\bshow="([^"]*)"/)
      if (showAttr && showAttr[1] === '0') continue // hidden — skip
    }

    visibleIndices.push(i)
  }

  return visibleIndices.length > 0 ? visibleIndices : [0]
}
