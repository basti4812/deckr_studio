// src/lib/pptx-merger/cleanup-single-slide.ts

import JSZip from 'jszip'

/**
 * Cleans a single-slide PPTX buffer extracted from a multi-page file.
 *
 * extractSinglePage keeps ALL files from the original PPTX, including
 * orphaned notesMasters, handoutMasters, comments, and notesSlides
 * that reference deleted slides. These trigger PowerPoint's repair dialog.
 *
 * This function removes those orphans and fixes all broken references.
 */
/** Resolve a relative path from a base directory */
function resolvePath(baseDir: string, relative: string): string {
  const parts = baseDir.split('/')
  for (const p of relative.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.' && p !== '') parts.push(p)
  }
  return parts.join('/')
}

/**
 * Traces the reference chain from slide1 → layout → master → theme
 * and removes all masters, layouts, and themes that are NOT in that chain.
 * This prevents multi-master source PPTXs from polluting the merge.
 */
async function removeUnreferencedMasterChain(zip: JSZip): Promise<void> {
  // Step 1: Find which layout slide1 references
  const slideRelsFile = zip.file('ppt/slides/_rels/slide1.xml.rels')
  if (!slideRelsFile) return
  const slideRels = await slideRelsFile.async('string')

  const referencedLayouts = new Set<string>()
  const referencedMasters = new Set<string>()
  const referencedThemes = new Set<string>()

  // Find layout(s) referenced by the slide
  for (const m of slideRels.matchAll(/Type="[^"]*slideLayout"[^>]*Target="([^"]+)"/g)) {
    referencedLayouts.add(resolvePath('ppt/slides', m[1]))
  }

  // Step 2: From each layout, find the master
  for (const layoutPath of referencedLayouts) {
    const layoutName = layoutPath.split('/').pop()!
    const layoutRelsFile = zip.file(`ppt/slideLayouts/_rels/${layoutName}.rels`)
    if (!layoutRelsFile) continue
    const layoutRels = await layoutRelsFile.async('string')
    for (const m of layoutRels.matchAll(/Type="[^"]*slideMaster"[^>]*Target="([^"]+)"/g)) {
      referencedMasters.add(resolvePath('ppt/slideLayouts', m[1]))
    }
  }

  // Step 3: From each master, find the theme AND all layouts it owns
  for (const masterPath of referencedMasters) {
    const masterName = masterPath.split('/').pop()!
    const masterRelsFile = zip.file(`ppt/slideMasters/_rels/${masterName}.rels`)
    if (!masterRelsFile) continue
    const masterRels = await masterRelsFile.async('string')
    for (const m of masterRels.matchAll(/Type="[^"]*theme"[^>]*Target="([^"]+)"/g)) {
      referencedThemes.add(resolvePath('ppt/slideMasters', m[1]))
    }
    // All layouts owned by this master are referenced (master's sldLayoutIdLst)
    for (const m of masterRels.matchAll(/Type="[^"]*slideLayout"[^>]*Target="([^"]+)"/g)) {
      referencedLayouts.add(resolvePath('ppt/slideMasters', m[1]))
    }
  }

  // Step 4: Remove unreferenced masters, their rels, and update presentation.xml
  let contentTypes = (await zip.file('[Content_Types].xml')?.async('string')) ?? ''
  let presXml = (await zip.file('ppt/presentation.xml')?.async('string')) ?? ''
  let presRels = (await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')) ?? ''

  const allMasters = Object.keys(zip.files).filter((f) =>
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f)
  )
  for (const masterPath of allMasters) {
    if (referencedMasters.has(masterPath)) continue
    // Remove master file + rels
    zip.remove(masterPath)
    const relsPath = masterPath.replace('ppt/slideMasters/', 'ppt/slideMasters/_rels/') + '.rels'
    zip.remove(relsPath)
    const escaped = ('/' + masterPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    contentTypes = contentTypes.replace(
      new RegExp(`<Override[^>]*PartName="${escaped}"[^>]*/>\\s*`, 'g'),
      ''
    )
    // Remove from presentation.xml.rels
    const masterTarget = masterPath.replace('ppt/', '')
    presRels = presRels.replace(
      new RegExp(
        `<Relationship[^>]*Target="${masterTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>\\s*`,
        'g'
      ),
      ''
    )
  }

  // Remove corresponding sldMasterIdLst entries for removed masters
  // We rebuild sldMasterIdLst to only contain referenced masters
  const masterIdEntries: string[] = []
  for (const m of presXml.matchAll(/<p:sldMasterId\b[^>]*\/>/g)) {
    const ridMatch = m[0].match(/r:id="([^"]+)"/)
    if (!ridMatch) continue
    // Check if this rId still exists in presRels
    if (presRels.includes(`Id="${ridMatch[1]}"`)) {
      masterIdEntries.push(m[0])
    }
  }
  presXml = presXml.replace(
    /<p:sldMasterIdLst>[\s\S]*?<\/p:sldMasterIdLst>/,
    `<p:sldMasterIdLst>${masterIdEntries.join('')}</p:sldMasterIdLst>`
  )

  // Step 5: Remove unreferenced layouts + rels
  const allLayouts = Object.keys(zip.files).filter((f) =>
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)
  )
  for (const layoutPath of allLayouts) {
    if (referencedLayouts.has(layoutPath)) continue
    zip.remove(layoutPath)
    const relsPath = layoutPath.replace('ppt/slideLayouts/', 'ppt/slideLayouts/_rels/') + '.rels'
    zip.remove(relsPath)
    const escaped = ('/' + layoutPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    contentTypes = contentTypes.replace(
      new RegExp(`<Override[^>]*PartName="${escaped}"[^>]*/>\\s*`, 'g'),
      ''
    )
  }

  // Step 6: Remove unreferenced themes + rels
  const allThemes = Object.keys(zip.files).filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f))
  for (const themePath of allThemes) {
    if (referencedThemes.has(themePath)) continue
    zip.remove(themePath)
    const escaped = ('/' + themePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    contentTypes = contentTypes.replace(
      new RegExp(`<Override[^>]*PartName="${escaped}"[^>]*/>\\s*`, 'g'),
      ''
    )
    // Remove from presentation.xml.rels if present
    const themeTarget = themePath.replace('ppt/', '')
    presRels = presRels.replace(
      new RegExp(
        `<Relationship[^>]*Target="${themeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>\\s*`,
        'g'
      ),
      ''
    )
  }

  // Write back updated files
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('ppt/presentation.xml', presXml)
  zip.file('ppt/_rels/presentation.xml.rels', presRels)
}

export async function cleanSingleSlidePptx(buffer: Uint8Array): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)

  // --- Remove orphaned files ---
  const orphanPrefixes = [
    'ppt/notesSlides/',
    'ppt/notesSlides/_rels/',
    'ppt/comments/',
    'ppt/comments/_rels/',
    'ppt/notesMasters/',
    'ppt/notesMasters/_rels/',
    'ppt/handoutMasters/',
    'ppt/handoutMasters/_rels/',
  ]

  let contentTypes = (await zip.file('[Content_Types].xml')?.async('string')) ?? ''

  for (const prefix of orphanPrefixes) {
    for (const filePath of Object.keys(zip.files).filter((p) => p.startsWith(prefix))) {
      zip.remove(filePath)
      const escaped = ('/' + filePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      contentTypes = contentTypes.replace(
        new RegExp(`<Override[^>]*PartName="${escaped}"[^>]*/>\\s*`, 'g'),
        ''
      )
    }
  }

  // --- Strip notesMaster/handoutMaster relationships from presentation.xml.rels ---
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
  if (presRelsFile) {
    let presRels = await presRelsFile.async('string')
    presRels = presRels.replace(
      /<Relationship[^>]*Type="[^"]*\/(notesMaster|handoutMaster)"[^>]*\/>\s*/g,
      ''
    )
    zip.file('ppt/_rels/presentation.xml.rels', presRels)
  }

  // --- Strip notesMasterIdLst and handoutMasterIdLst from presentation.xml ---
  const presFile = zip.file('ppt/presentation.xml')
  if (presFile) {
    let presXml = await presFile.async('string')
    presXml = presXml.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>\s*/g, '')
    presXml = presXml.replace(/<p:handoutMasterIdLst>[\s\S]*?<\/p:handoutMasterIdLst>\s*/g, '')
    zip.file('ppt/presentation.xml', presXml)
  }

  // --- Strip broken references from slide1.xml.rels ---
  const slideRelsFile = zip.file('ppt/slides/_rels/slide1.xml.rels')
  if (slideRelsFile) {
    let slideRels = await slideRelsFile.async('string')
    slideRels = slideRels.replace(/<Relationship\b[^>]*\/>\s*/g, (match) => {
      // Keep external relationships (hyperlinks)
      if (/TargetMode\s*=\s*"External"/.test(match)) return match
      const target = match.match(/\bTarget="([^"]+)"/)?.[1]
      if (!target) return match
      // Resolve relative path from ppt/slides/
      const parts = 'ppt/slides'.split('/')
      for (const p of target.split('/')) {
        if (p === '..') parts.pop()
        else if (p !== '.') parts.push(p)
      }
      const resolvedPath = parts.join('/')
      return zip.file(resolvedPath) ? match : ''
    })
    zip.file('ppt/slides/_rels/slide1.xml.rels', slideRels)
  }

  // --- Remove unreferenced masters, layouts, and themes ---
  // extractSinglePage keeps ALL masters/layouts/themes from the original
  // multi-page PPTX. We only need the ones actually referenced by slide1.
  await removeUnreferencedMasterChain(zip)

  const result = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return result
}
