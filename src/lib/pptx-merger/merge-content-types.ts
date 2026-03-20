// src/lib/pptx-merger/merge-content-types.ts

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xpath from 'xpath'
import { ensureOneXmlDeclaration } from './pptx-package'

const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'

/** ContentType-Zuordnung für bekannte Dateipfad-Patterns */
const CONTENT_TYPE_MAP: Record<string, string> = {
  'ppt/slides/': 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  'ppt/slideLayouts/':
    'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  'ppt/slideMasters/':
    'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  'ppt/theme/': 'application/vnd.openxmlformats-officedocument.drawingml.theme+xml',
  'ppt/notesSlides/': 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  'ppt/tags/': 'application/vnd.openxmlformats-officedocument.presentationml.tags+xml',
}

function getContentTypeForPath(path: string): string | null {
  for (const [prefix, ct] of Object.entries(CONTENT_TYPE_MAP)) {
    if (path.startsWith(prefix) && path.endsWith('.xml')) {
      return ct
    }
  }
  return null
}

/**
 * Fügt Content-Type Override-Einträge für alle neuen XML-Dateien hinzu.
 *
 * @param ctContent - Bestehende [Content_Types].xml als String
 * @param newPaths - Array von neuen Dateipfaden (ohne führenden /)
 * @returns Aktualisierte [Content_Types].xml als String
 */
export function mergeContentTypes(ctContent: string, newPaths: string[]): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(ctContent, 'text/xml')
  const root = doc.documentElement

  // Bestehende PartNames sammeln (um Duplikate zu vermeiden)
  const select = xpath.useNamespaces({ ct: CT_NS })
  const existingOverrides = select('//ct:Override', doc) as Element[]
  const existingParts = new Set(existingOverrides.map((el) => el.getAttribute('PartName') || ''))

  for (const path of newPaths) {
    const partName = `/${path}` // PartName braucht führenden /
    if (existingParts.has(partName)) continue

    const contentType = getContentTypeForPath(path)
    if (!contentType) continue // Unbekannter Typ (Medien etc. haben Default-Einträge)

    const overrideEl = doc.createElementNS(CT_NS, 'Override')
    overrideEl.setAttribute('PartName', partName)
    overrideEl.setAttribute('ContentType', contentType)
    root.appendChild(overrideEl)
    existingParts.add(partName)
  }

  const serializer = new XMLSerializer()
  return ensureOneXmlDeclaration(serializer.serializeToString(doc))
}
