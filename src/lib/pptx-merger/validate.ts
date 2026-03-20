// src/lib/pptx-merger/validate.ts

import { PptxPackage, resolveRelativePath } from './pptx-package'
import { CONTENT_TYPES_PATH, PRESENTATION_PATH, PRESENTATION_RELS_PATH, NS } from './namespaces'
import * as xpath from 'xpath'

export interface ValidationResult {
  valid: boolean
  slideCount: number
  masterCount: number
  errors: string[]
}

export async function validateMergedPptx(buffer: Buffer): Promise<ValidationResult> {
  const errors: string[] = []
  const pkg = await PptxPackage.fromBuffer(buffer)

  const presDoc = pkg.getXml(PRESENTATION_PATH)
  const presRelsDoc = pkg.getXml(PRESENTATION_RELS_PATH)

  const selectRel = xpath.useNamespaces({ rel: NS.rel })
  const selectP = xpath.useNamespaces({ p: NS.p, r: NS.r })

  // 1. Jedes Relationship-Target existiert als Datei im ZIP
  const rels = selectRel('//rel:Relationship', presRelsDoc) as Element[]
  for (const rel of rels) {
    const target = rel.getAttribute('Target') || ''
    // Externe URLs überspringen
    if (target.startsWith('http://') || target.startsWith('https://')) continue
    const resolved = resolveRelativePath(PRESENTATION_RELS_PATH, target)
    if (!pkg.hasFile(resolved)) {
      errors.push(`Missing file: ${resolved} (Target: ${target})`)
    }
  }

  // 2. Jeder Slide hat eine .rels mit Layout-Referenz → volle Kette prüfen
  let slides: ReturnType<PptxPackage['getSlides']> = []
  try {
    slides = pkg.getSlides()
    for (const slide of slides) {
      if (!pkg.hasFile(slide.layoutPath)) {
        errors.push(`Missing layout: ${slide.layoutPath} for slide ${slide.slidePath}`)
      }
      if (!pkg.hasFile(slide.masterPath)) {
        errors.push(`Missing master: ${slide.masterPath} for slide ${slide.slidePath}`)
      }
      if (!pkg.hasFile(slide.themePath)) {
        errors.push(`Missing theme: ${slide.themePath} for slide ${slide.slidePath}`)
      }
    }
  } catch (err) {
    errors.push(`Reference chain error: ${(err as Error).message}`)
  }

  // 3. [Content_Types].xml hat Einträge für alle Slides/Layouts/Masters
  const ctDoc = pkg.getXml(CONTENT_TYPES_PATH)
  const selectCt = xpath.useNamespaces({ ct: NS.ct })
  const overrides = selectCt('//ct:Override', ctDoc) as Element[]
  const registeredParts = new Set(overrides.map((o) => o.getAttribute('PartName') || ''))

  for (const slide of slides) {
    if (!registeredParts.has(`/${slide.slidePath}`)) {
      errors.push(`Missing in [Content_Types].xml: ${slide.slidePath}`)
    }
  }

  // 4. Keine doppelten IDs
  const slideIds = (selectP('//p:sldIdLst/p:sldId', presDoc) as Element[]).map((el) =>
    el.getAttribute('id')
  )
  const uniqueSlideIds = new Set(slideIds)
  if (slideIds.length !== uniqueSlideIds.size) {
    errors.push('Duplicate slide IDs in presentation.xml!')
  }

  const masterIds = (selectP('//p:sldMasterIdLst/p:sldMasterId', presDoc) as Element[]).map((el) =>
    el.getAttribute('id')
  )
  const uniqueMasterIds = new Set(masterIds)
  if (masterIds.length !== uniqueMasterIds.size) {
    errors.push('Duplicate master IDs in presentation.xml!')
  }

  return {
    valid: errors.length === 0,
    slideCount: slides.length,
    masterCount: uniqueMasterIds.size,
    errors,
  }
}
