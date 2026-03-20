// src/lib/pptx-merger/merge-mapping.ts

import { createHash } from 'crypto'
import { PptxPackage, getRelsPath } from './pptx-package'

export interface MergeMapping {
  /** alt_pfad → neu_pfad (für alle Dateien die von B nach A kopiert werden) */
  pathMap: Map<string, string>
  /** Medien: alt_pfad → neu_pfad (mit Deduplizierung) */
  mediaMap: Map<string, string>
}

/**
 * Findet den nächsten freien Index für einen Dateityp.
 */
function findNextIndex(existingFiles: Set<string>, prefix: string, suffix: string): number {
  let i = 1
  while (existingFiles.has(`${prefix}${i}${suffix}`)) {
    i++
  }
  return i
}

/**
 * Erstellt einen MD5-Hash für Medien-Deduplizierung.
 */
function hashBuffer(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex')
}

export function createMergeMapping(pkgA: PptxPackage, pkgB: PptxPackage): MergeMapping {
  const pathMap = new Map<string, string>()
  const mediaMap = new Map<string, string>()

  // Alle existierenden Pfade in A (wird laufend erweitert bei jeder Zuweisung)
  const existing = new Set(pkgA.files.keys())

  // Hashes der Medien in A (für Deduplizierung)
  const mediaHashesA = new Map<string, string>() // hash → pfad in A
  for (const [path, content] of pkgA.files) {
    if (path.startsWith('ppt/media/')) {
      mediaHashesA.set(hashBuffer(content), path)
    }
  }

  // 1. Theme-Dateien umbenennen
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/theme\/theme\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/theme/theme', '.xml')
      const newPath = `ppt/theme/theme${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)
    }
  }

  // 2. SlideMaster-Dateien umbenennen (inkl. .rels)
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/slideMasters\/slideMaster\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/slideMasters/slideMaster', '.xml')
      const newPath = `ppt/slideMasters/slideMaster${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)

      // Auch die .rels Datei mappen
      const oldRels = getRelsPath(path)
      const newRels = getRelsPath(newPath)
      if (pkgB.hasFile(oldRels)) {
        pathMap.set(oldRels, newRels)
        existing.add(newRels)
      }
    }
  }

  // 3. SlideLayout-Dateien umbenennen (inkl. .rels)
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/slideLayouts/slideLayout', '.xml')
      const newPath = `ppt/slideLayouts/slideLayout${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)

      const oldRels = getRelsPath(path)
      const newRels = getRelsPath(newPath)
      if (pkgB.hasFile(oldRels)) {
        pathMap.set(oldRels, newRels)
        existing.add(newRels)
      }
    }
  }

  // 4. Slide-Dateien umbenennen (inkl. .rels)
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/slides/slide', '.xml')
      const newPath = `ppt/slides/slide${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)

      const oldRels = getRelsPath(path)
      const newRels = getRelsPath(newPath)
      if (pkgB.hasFile(oldRels)) {
        pathMap.set(oldRels, newRels)
        existing.add(newRels)
      }
    }
  }

  // 5. Media-Dateien: Deduplizierung per Hash
  for (const [path, content] of pkgB.files) {
    if (path.startsWith('ppt/media/')) {
      const hash = hashBuffer(content)
      const existingInA = mediaHashesA.get(hash)

      if (existingInA) {
        // Identischer Inhalt existiert schon → auf existierende Datei mappen
        mediaMap.set(path, existingInA)
      } else {
        // Neuer Inhalt → neuen Namen vergeben
        const ext = path.substring(path.lastIndexOf('.'))
        const baseName = 'ppt/media/image'
        const idx = findNextIndex(existing, baseName, ext)
        const newPath = `${baseName}${idx}${ext}`
        mediaMap.set(path, newPath)
        pathMap.set(path, newPath)
        existing.add(newPath)
        mediaHashesA.set(hash, newPath) // Für weitere Dedup innerhalb B
      }
    }
  }

  // 6. noteSlides umbenennen (falls vorhanden)
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/notesSlides/notesSlide', '.xml')
      const newPath = `ppt/notesSlides/notesSlide${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)

      const oldRels = getRelsPath(path)
      const newRels = getRelsPath(newPath)
      if (pkgB.hasFile(oldRels)) {
        pathMap.set(oldRels, newRels)
        existing.add(newRels)
      }
    }
  }

  // 7. Tags umbenennen (falls vorhanden)
  for (const [path] of pkgB.files) {
    if (path.match(/^ppt\/tags\/tag\d+\.xml$/)) {
      const idx = findNextIndex(existing, 'ppt/tags/tag', '.xml')
      const newPath = `ppt/tags/tag${idx}.xml`
      pathMap.set(path, newPath)
      existing.add(newPath)
    }
  }

  // 8. Embeddings umbenennen (falls vorhanden)
  for (const [path] of pkgB.files) {
    if (path.startsWith('ppt/embeddings/')) {
      const filename = path.substring(path.lastIndexOf('/') + 1)
      const dotIdx = filename.lastIndexOf('.')
      const basePart = filename.substring(0, dotIdx).replace(/\d+$/, '')
      const ext = filename.substring(dotIdx)
      const prefix = `ppt/embeddings/${basePart}`
      const idx = findNextIndex(existing, prefix, ext)
      const newPath = `${prefix}${idx}${ext}`
      pathMap.set(path, newPath)
      existing.add(newPath)
    }
  }

  return { pathMap, mediaMap }
}
