// src/lib/pptx-merger/namespaces.ts

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
} as const

export const CONTENT_TYPES_PATH = '[Content_Types].xml'
export const PRESENTATION_PATH = 'ppt/presentation.xml'
export const PRESENTATION_RELS_PATH = 'ppt/_rels/presentation.xml.rels'

// Relationship-Typen (für Type-Attribut in .rels)
export const REL_TYPES = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  noteSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  oleObject: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject',
} as const
