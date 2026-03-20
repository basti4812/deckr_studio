// src/lib/pptx-merger/update-rels.ts

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xpath from 'xpath'
import { MergeMapping } from './merge-mapping'
import { resolveRelativePath, makeRelativePath, ensureOneXmlDeclaration } from './pptx-package'

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

/**
 * Aktualisiert alle Target-Pfade in einer .rels XML gemäß Mapping.
 *
 * Targets in .rels sind relativ (z.B. "../slideLayouts/slideLayout1.xml").
 * Das Mapping enthält absolute Pfade ("ppt/slideLayouts/slideLayout1.xml").
 * Wir konvertieren zwischen relativ und absolut.
 *
 * @param relsContent - Der XML-String der .rels Datei
 * @param oldRelsPath - Alter Pfad der .rels (für Auflösung relativer Pfade)
 * @param newRelsPath - Neuer Pfad der .rels (für Erstellung neuer relativer Pfade)
 * @param mapping - Das MergeMapping mit pathMap und mediaMap
 * @returns Aktualisierter XML-String
 */
export function updateRelsTargets(
  relsContent: string,
  oldRelsPath: string,
  newRelsPath: string,
  mapping: MergeMapping
): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(relsContent, 'text/xml')

  const select = xpath.useNamespaces({ rel: REL_NS })
  const relationships = select('//rel:Relationship', doc) as Element[]

  for (const rel of relationships) {
    const oldTarget = rel.getAttribute('Target') || ''

    // Externe URLs (http://, https://) nicht anfassen
    if (oldTarget.startsWith('http://') || oldTarget.startsWith('https://')) {
      continue
    }

    // Relativen Pfad zu absolutem auflösen (basierend auf ALTER Position)
    const oldAbsolute = resolveRelativePath(oldRelsPath, oldTarget)

    // Prüfe ob dieser Pfad im Mapping ist
    let newAbsolute = mapping.pathMap.get(oldAbsolute)

    // Auch in mediaMap prüfen (für Medien die dedupliziert wurden)
    if (!newAbsolute) {
      newAbsolute = mapping.mediaMap.get(oldAbsolute)
    }

    if (newAbsolute) {
      // Neuen relativen Pfad berechnen (basierend auf NEUER Position)
      const newTarget = makeRelativePath(newRelsPath, newAbsolute)
      rel.setAttribute('Target', newTarget)
    }
    // Wenn nicht im Mapping: Target bleibt wie es ist (z.B. externe URLs)
  }

  const serializer = new XMLSerializer()
  return ensureOneXmlDeclaration(serializer.serializeToString(doc))
}
