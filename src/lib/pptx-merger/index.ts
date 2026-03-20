// src/lib/pptx-merger/index.ts

import JSZip from 'jszip'
import { PptxPackage } from './pptx-package'
import { createMergeMapping } from './merge-mapping'
import { updateRelsTargets } from './update-rels'
import { mergePresentation } from './merge-presentation'
import { mergeContentTypes } from './merge-content-types'
import { CONTENT_TYPES_PATH, PRESENTATION_PATH, PRESENTATION_RELS_PATH } from './namespaces'

export interface MergeOptions {
  /** Wenn true, wirft einen Error bei unterschiedlichen Slide-Größen */
  strictSizeCheck?: boolean
}

/**
 * Hauptfunktion: Merged zwei PPTX-Buffers und gibt das Ergebnis als Buffer zurück.
 *
 * Verwendung in API-Route:
 *   const merged = await mergePptx(bufferA, bufferB);
 *
 * Verwendung als CLI:
 *   const merged = await mergePptx(fs.readFileSync('a.pptx'), fs.readFileSync('b.pptx'));
 *   fs.writeFileSync('merged.pptx', merged);
 */
export async function mergePptx(
  bufferA: Buffer,
  bufferB: Buffer,
  _options: MergeOptions = {}
): Promise<Buffer> {
  // 1. Pakete lesen
  const pkgA = await PptxPackage.fromBuffer(bufferA)
  const pkgB = await PptxPackage.fromBuffer(bufferB)

  // 2. Mapping erstellen (kollisionsfreie Pfade)
  const mapping = createMergeMapping(pkgA, pkgB)

  // 3. Start: Alle Dateien aus A
  const mergedFiles = new Map(pkgA.files)

  // 4. Dateien aus B kopieren und .rels-Referenzen aktualisieren
  for (const [oldPath, newPath] of mapping.pathMap) {
    const content = pkgB.files.get(oldPath)
    if (!content) continue

    if (oldPath.endsWith('.rels')) {
      // .rels Datei: Targets aktualisieren
      const updated = updateRelsTargets(content.toString('utf-8'), oldPath, newPath, mapping)
      mergedFiles.set(newPath, Buffer.from(updated, 'utf-8'))
    } else if (oldPath.endsWith('.xml')) {
      // XML-Dateien: einfach kopieren (rIds bleiben gleich, nur .rels ändern sich)
      mergedFiles.set(newPath, content)
    } else {
      // Binäre Dateien (Medien etc.): direkt kopieren
      mergedFiles.set(newPath, content)
    }
  }

  // 5. presentation.xml und presentation.xml.rels mergen
  const { presentationXml, presentationRelsXml } = mergePresentation(pkgA, pkgB, mapping)
  mergedFiles.set(PRESENTATION_PATH, Buffer.from(presentationXml, 'utf-8'))
  mergedFiles.set(PRESENTATION_RELS_PATH, Buffer.from(presentationRelsXml, 'utf-8'))

  // 6. [Content_Types].xml mergen
  const ctContent = mergedFiles.get(CONTENT_TYPES_PATH)?.toString('utf-8') || ''
  const newXmlPaths = [...mapping.pathMap.values()].filter(
    (p) => p.endsWith('.xml') && !p.endsWith('.rels')
  )
  const updatedCt = mergeContentTypes(ctContent, newXmlPaths)
  mergedFiles.set(CONTENT_TYPES_PATH, Buffer.from(updatedCt, 'utf-8'))

  // 7. Als ZIP (= PPTX) schreiben
  const zip = new JSZip()
  for (const [path, data] of mergedFiles) {
    zip.file(path, data)
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }) as Promise<Buffer>
}

// Re-exports
export { PptxPackage } from './pptx-package'
export { createMergeMapping } from './merge-mapping'
export { updateRelsTargets } from './update-rels'
export { mergePresentation } from './merge-presentation'
export { mergeContentTypes } from './merge-content-types'
export { validateMergedPptx } from './validate'
