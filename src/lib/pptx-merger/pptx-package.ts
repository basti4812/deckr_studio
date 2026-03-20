// src/lib/pptx-merger/pptx-package.ts

import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import * as xpath from 'xpath'
import { PRESENTATION_RELS_PATH, REL_TYPES } from './namespaces'

export interface SlideInfo {
  slidePath: string
  slideRelsPath: string
  layoutPath: string
  layoutRelsPath: string
  masterPath: string
  masterRelsPath: string
  themePath: string
  layoutRIdInSlide: string
  masterRIdInLayout: string
  themeRIdInMaster: string
  mediaFiles: string[]
}

export class PptxPackage {
  /** Alle Dateien im ZIP: Pfad → Inhalt (Buffer) */
  public files: Map<string, Buffer> = new Map()

  private constructor() {}

  /** Factory: PPTX aus Buffer laden */
  static async fromBuffer(buffer: Buffer): Promise<PptxPackage> {
    const pkg = new PptxPackage()
    const zip = await JSZip.loadAsync(buffer)

    const promises: Promise<void>[] = []
    zip.forEach((relativePath, file) => {
      if (!file.dir) {
        promises.push(
          file.async('nodebuffer').then((content) => {
            pkg.files.set(relativePath, content)
          })
        )
      }
    })
    await Promise.all(promises)

    return pkg
  }

  /** Factory: PPTX von Dateipfad laden (für CLI/Tests) */
  static async fromFile(path: string): Promise<PptxPackage> {
    const fs = await import('fs/promises')
    const buffer = await fs.readFile(path)
    return PptxPackage.fromBuffer(buffer)
  }

  /** XML-Datei parsen und als Document zurückgeben */
  getXml(path: string): Document {
    const content = this.files.get(path)
    if (!content) throw new Error(`File not found: ${path}`)
    const parser = new DOMParser()
    return parser.parseFromString(content.toString('utf-8'), 'text/xml')
  }

  /** XML-Document zurück zu String serialisieren */
  static serializeXml(doc: Document): string {
    const serializer = new XMLSerializer()
    return ensureOneXmlDeclaration(serializer.serializeToString(doc))
  }

  /** Prüft ob eine Datei existiert */
  hasFile(path: string): boolean {
    return this.files.has(path)
  }

  /**
   * Findet Relationships eines bestimmten Typs in einer .rels Datei.
   */
  getRelationships(
    relsPath: string,
    relType: string
  ): Array<{
    rId: string
    target: string
    resolvedTarget: string
  }> {
    const doc = this.getXml(relsPath)
    const select = xpath.useNamespaces({
      rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    })
    const nodes = select(`//rel:Relationship[@Type="${relType}"]`, doc) as Element[]

    return nodes.map((node) => {
      const rId = node.getAttribute('Id') || ''
      const target = node.getAttribute('Target') || ''
      return {
        rId,
        target,
        resolvedTarget: resolveRelativePath(relsPath, target),
      }
    })
  }

  /**
   * Findet ALLE Relationships in einer .rels Datei.
   */
  getAllRelationships(relsPath: string): Array<{
    rId: string
    target: string
    type: string
    resolvedTarget: string
  }> {
    const doc = this.getXml(relsPath)
    const select = xpath.useNamespaces({
      rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    })
    const nodes = select('//rel:Relationship', doc) as Element[]

    return nodes.map((node) => ({
      rId: node.getAttribute('Id') || '',
      target: node.getAttribute('Target') || '',
      type: node.getAttribute('Type') || '',
      resolvedTarget: resolveRelativePath(relsPath, node.getAttribute('Target') || ''),
    }))
  }

  /**
   * Liest die komplette Referenzkette für jeden Slide.
   * Slide → Layout → Master → Theme
   */
  getSlides(): SlideInfo[] {
    const slideRels = this.getRelationships(PRESENTATION_RELS_PATH, REL_TYPES.slide)
    const slides: SlideInfo[] = []

    for (const { resolvedTarget: slidePath } of slideRels) {
      const slideRelsPath = getRelsPath(slidePath)

      // Slide → Layout
      const layoutRels = this.getRelationships(slideRelsPath, REL_TYPES.slideLayout)
      if (layoutRels.length === 0) {
        throw new Error(`Slide ${slidePath} has no layout reference!`)
      }
      const layoutPath = layoutRels[0].resolvedTarget
      const layoutRelsPath = getRelsPath(layoutPath)

      // Layout → Master
      const masterRels = this.getRelationships(layoutRelsPath, REL_TYPES.slideMaster)
      if (masterRels.length === 0) {
        throw new Error(`Layout ${layoutPath} has no master reference!`)
      }
      const masterPath = masterRels[0].resolvedTarget
      const masterRelsPath = getRelsPath(masterPath)

      // Master → Theme
      const themeRels = this.getRelationships(masterRelsPath, REL_TYPES.theme)
      if (themeRels.length === 0) {
        throw new Error(`Master ${masterPath} has no theme reference!`)
      }
      const themePath = themeRels[0].resolvedTarget

      // Medien sammeln (aus Slide .rels)
      const allSlideRels = this.getAllRelationships(slideRelsPath)
      const mediaFiles = allSlideRels
        .filter((r) => r.type === REL_TYPES.image || r.type === REL_TYPES.oleObject)
        .map((r) => r.resolvedTarget)

      slides.push({
        slidePath,
        slideRelsPath,
        layoutPath,
        layoutRelsPath,
        masterPath,
        masterRelsPath,
        themePath,
        layoutRIdInSlide: layoutRels[0].rId,
        masterRIdInLayout: masterRels[0].rId,
        themeRIdInMaster: themeRels[0].rId,
        mediaFiles,
      })
    }

    return slides
  }
}

// ─── Hilfsfunktionen für Pfade ────────────────────────────────────────

/**
 * Gibt das Verzeichnis des Source-Parts zurück, das eine .rels beschreibt.
 *
 * In OOXML sind .rels-Targets relativ zum Source-Part, nicht zur .rels-Datei.
 *   "ppt/_rels/presentation.xml.rels" → source part "ppt/presentation.xml" → dir "ppt/"
 *   "ppt/slides/_rels/slide1.xml.rels" → source part "ppt/slides/slide1.xml" → dir "ppt/slides/"
 */
function getSourcePartDir(relsPath: string): string {
  if (relsPath.includes('/_rels/') && relsPath.endsWith('.rels')) {
    const sourcePartPath = relsPath.replace('/_rels/', '/').replace(/\.rels$/, '')
    return sourcePartPath.substring(0, sourcePartPath.lastIndexOf('/') + 1)
  }
  return relsPath.substring(0, relsPath.lastIndexOf('/') + 1)
}

/**
 * Löst einen relativen Pfad relativ zum Source-Part einer .rels-Datei auf.
 *
 * Beispiel:
 *   basePath = "ppt/slides/_rels/slide1.xml.rels"
 *   relativeTarget = "../slideLayouts/slideLayout1.xml"
 *   → "ppt/slideLayouts/slideLayout1.xml"
 */
export function resolveRelativePath(basePath: string, relativeTarget: string): string {
  const baseDir = getSourcePartDir(basePath)
  const parts = (baseDir + relativeTarget).split('/')
  const resolved: string[] = []

  for (const part of parts) {
    if (part === '..') {
      resolved.pop()
    } else if (part !== '.' && part !== '') {
      resolved.push(part)
    }
  }

  return resolved.join('/')
}

/**
 * Erstellt einen relativen Pfad von einer .rels Datei zum Target.
 *
 * Beispiel:
 *   fromRelsPath = "ppt/slides/_rels/slide5.xml.rels"
 *   toPath = "ppt/slideLayouts/slideLayout8.xml"
 *   → "../slideLayouts/slideLayout8.xml"
 */
export function makeRelativePath(fromRelsPath: string, toPath: string): string {
  const fromDir = getSourcePartDir(fromRelsPath)
  const fromParts = fromDir.split('/').filter(Boolean)
  const toParts = toPath.split('/').filter(Boolean)

  // Gemeinsamen Prefix finden
  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++
  }

  const ups = fromParts.length - common
  const remaining = toParts.slice(common)

  return '../'.repeat(ups) + remaining.join('/')
}

/**
 * Gibt den .rels-Pfad für eine gegebene XML-Datei zurück.
 *
 * Beispiel:
 *   "ppt/slides/slide1.xml" → "ppt/slides/_rels/slide1.xml.rels"
 */
export function getRelsPath(filePath: string): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  const filename = filePath.substring(filePath.lastIndexOf('/') + 1)
  return `${dir}/_rels/${filename}.rels`
}

/**
 * Stellt sicher, dass genau eine XML-Declaration am Anfang steht.
 * XMLSerializer gibt die geparste Declaration mit aus, daher manuelles
 * Hinzufügen führt zu Duplikaten.
 */
export function ensureOneXmlDeclaration(xml: string): string {
  // Alle bestehenden XML-Declarations entfernen
  const stripped = xml.replace(/<\?xml[^?]*\?>\s*/g, '')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + stripped
}
