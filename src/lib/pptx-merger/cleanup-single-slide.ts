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

  const result = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return result
}
