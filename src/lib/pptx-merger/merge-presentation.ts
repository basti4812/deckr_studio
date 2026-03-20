// src/lib/pptx-merger/merge-presentation.ts

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xpath from 'xpath'
import { NS, PRESENTATION_PATH, PRESENTATION_RELS_PATH, REL_TYPES } from './namespaces'
import { PptxPackage, makeRelativePath, ensureOneXmlDeclaration } from './pptx-package'
import { MergeMapping } from './merge-mapping'

const select = xpath.useNamespaces({
  p: NS.p,
  r: NS.r,
  rel: NS.rel,
})

/**
 * Sammelt alle bestehenden numerischen IDs eines Elements.
 */
function getExistingIds(doc: Document, xpathExpr: string, attr: string): Set<number> {
  const nodes = select(xpathExpr, doc) as Element[]
  const ids = new Set<number>()
  for (const node of nodes) {
    const val = node.getAttribute(attr)
    if (val) ids.add(parseInt(val, 10))
  }
  return ids
}

/**
 * Findet die nächste freie Slide-ID (≥256).
 */
function getNextSlideId(presDoc: Document): number {
  const existing = getExistingIds(presDoc, '//p:sldIdLst/p:sldId', 'id')
  let id = 256
  while (existing.has(id)) id++
  return id
}

/**
 * Findet die nächste freie Master-ID (>2147483647).
 */
function getNextMasterId(presDoc: Document): number {
  const existing = getExistingIds(presDoc, '//p:sldMasterIdLst/p:sldMasterId', 'id')
  let id = 2147483648
  while (existing.has(id)) id++
  return id
}

/**
 * Findet die nächste freie rId in einer .rels Datei.
 */
function getNextRId(relsDoc: Document): string {
  const rels = select('//rel:Relationship', relsDoc) as Element[]
  const existing = new Set(rels.map((r) => r.getAttribute('Id') || ''))
  let i = 1
  while (existing.has(`rId${i}`)) i++
  return `rId${i}`
}

/**
 * Fügt eine neue Relationship in eine .rels Datei ein.
 * Gibt die zugewiesene rId zurück.
 */
function addRelationship(relsDoc: Document, target: string, type: string): string {
  const rId = getNextRId(relsDoc)
  const root = relsDoc.documentElement
  const relEl = relsDoc.createElementNS(NS.rel, 'Relationship')
  relEl.setAttribute('Id', rId)
  relEl.setAttribute('Type', type)
  relEl.setAttribute('Target', target)
  root.appendChild(relEl)
  return rId
}

export interface MergePresentationResult {
  presentationXml: string
  presentationRelsXml: string
}

/**
 * Merged presentation.xml und presentation.xml.rels.
 */
export function mergePresentation(
  pkgA: PptxPackage,
  pkgB: PptxPackage,
  mapping: MergeMapping
): MergePresentationResult {
  const presDoc = pkgA.getXml(PRESENTATION_PATH)
  const presRelsDoc = pkgA.getXml(PRESENTATION_RELS_PATH)

  // --- Slide-Größen prüfen ---
  const presDocB = pkgB.getXml(PRESENTATION_PATH)
  const sldSzA = (select('//p:sldSz', presDoc) as Element[])[0]
  const sldSzB = (select('//p:sldSz', presDocB) as Element[])[0]
  if (sldSzA && sldSzB) {
    const cxA = sldSzA.getAttribute('cx')
    const cyA = sldSzA.getAttribute('cy')
    const cxB = sldSzB.getAttribute('cx')
    const cyB = sldSzB.getAttribute('cy')
    if (cxA !== cxB || cyA !== cyB) {
      console.warn(
        `Warning: Different slide sizes! A: ${cxA}x${cyA}, B: ${cxB}x${cyB}. Using A's size.`
      )
    }
  }

  // --- Themes aus B hinzufügen ---
  const themesInB = pkgB.getRelationships(PRESENTATION_RELS_PATH, REL_TYPES.theme)
  for (const theme of themesInB) {
    const newThemePath = mapping.pathMap.get(theme.resolvedTarget)
    if (!newThemePath) continue

    const relTarget = makeRelativePath(PRESENTATION_RELS_PATH, newThemePath)
    addRelationship(presRelsDoc, relTarget, REL_TYPES.theme)
  }

  // --- Masters aus B hinzufügen ---
  const mastersInB = pkgB.getRelationships(PRESENTATION_RELS_PATH, REL_TYPES.slideMaster)
  for (const master of mastersInB) {
    const newMasterPath = mapping.pathMap.get(master.resolvedTarget)
    if (!newMasterPath) continue

    // Relationship in presentation.xml.rels hinzufügen
    const relTarget = makeRelativePath(PRESENTATION_RELS_PATH, newMasterPath)
    const rId = addRelationship(presRelsDoc, relTarget, REL_TYPES.slideMaster)

    // Eintrag in <p:sldMasterIdLst> hinzufügen
    const masterIdList = (select('//p:sldMasterIdLst', presDoc) as Element[])[0]
    if (masterIdList) {
      const masterIdEl = presDoc.createElementNS(NS.p, 'p:sldMasterId')
      masterIdEl.setAttribute('id', String(getNextMasterId(presDoc)))
      masterIdEl.setAttributeNS(NS.r, 'r:id', rId)
      masterIdList.appendChild(masterIdEl)
    }
  }

  // --- Slides aus B hinzufügen ---
  const slidesInB = pkgB.getRelationships(PRESENTATION_RELS_PATH, REL_TYPES.slide)
  for (const slide of slidesInB) {
    const newSlidePath = mapping.pathMap.get(slide.resolvedTarget)
    if (!newSlidePath) continue

    // Relationship in presentation.xml.rels hinzufügen
    const relTarget = makeRelativePath(PRESENTATION_RELS_PATH, newSlidePath)
    const rId = addRelationship(presRelsDoc, relTarget, REL_TYPES.slide)

    // Eintrag in <p:sldIdLst> hinzufügen
    const slideIdList = (select('//p:sldIdLst', presDoc) as Element[])[0]
    if (slideIdList) {
      const slideIdEl = presDoc.createElementNS(NS.p, 'p:sldId')
      slideIdEl.setAttribute('id', String(getNextSlideId(presDoc)))
      slideIdEl.setAttributeNS(NS.r, 'r:id', rId)
      slideIdList.appendChild(slideIdEl)
    }
  }

  const serializer = new XMLSerializer()

  return {
    presentationXml: ensureOneXmlDeclaration(serializer.serializeToString(presDoc)),
    presentationRelsXml: ensureOneXmlDeclaration(serializer.serializeToString(presRelsDoc)),
  }
}
