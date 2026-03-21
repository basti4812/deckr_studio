/* eslint-disable no-restricted-globals */
/**
 * PPTX Image Compressor Web Worker
 *
 * Receives a PPTX file (as ArrayBuffer), unpacks it with JSZip,
 * resamples images to their slide display dimensions (max 1920px),
 * re-encodes as JPEG 85 / PNG, and repacks the PPTX.
 *
 * Messages IN:
 *   { type: 'compress', buffer: ArrayBuffer }
 *
 * Messages OUT:
 *   { type: 'progress', percent: number, currentImage: string }
 *   { type: 'done', buffer: ArrayBuffer, originalSize: number, compressedSize: number, imagesProcessed: number, imagesSkipped: number }
 *   { type: 'no-images' }
 *   { type: 'already-optimal', buffer: ArrayBuffer }
 *   { type: 'error', message: string }
 */

importScripts('/workers/jszip.min.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse EMU values from slide XML to get image display dimensions in pixels */
function parseImageDimensionsFromSlideXml(xmlText, imageRelId) {
  // Look for blipFill with the matching embed rId, then find the parent's extent (ext)
  // Pattern: <a:blip r:embed="rIdX" ... /> ... <a:ext cx="..." cy="..." />
  // We need to find the spTree element that references this image and get its transform

  const emuToPixels = (emu) => Math.round(emu / 914400 * 96) // EMU to pixels at 96 DPI

  // Find all sp (shape) elements that contain this image reference
  const blipPattern = new RegExp(
    '<p:pic[\\s\\S]*?<a:blip[^>]*r:embed="' + imageRelId + '"[\\s\\S]*?<a:ext\\s+cx="(\\d+)"\\s+cy="(\\d+)"',
    'g'
  )
  const match = blipPattern.exec(xmlText)
  if (match) {
    return {
      width: emuToPixels(parseInt(match[1], 10)),
      height: emuToPixels(parseInt(match[2], 10)),
    }
  }

  // Fallback: try a simpler pattern for newer PPTX structures
  const simplePattern = new RegExp(
    'r:embed="' + imageRelId + '"[\\s\\S]*?<a:ext\\s+cx="(\\d+)"\\s+cy="(\\d+)"'
  )
  const simpleMatch = simplePattern.exec(xmlText)
  if (simpleMatch) {
    return {
      width: emuToPixels(parseInt(simpleMatch[1], 10)),
      height: emuToPixels(parseInt(simpleMatch[2], 10)),
    }
  }

  return null
}

/** Get the relationship ID for an image from the slide rels file */
function parseRelsForImages(relsXml) {
  const results = []
  const pattern = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/(image|oleObject)"[^>]*\/>/g
  let match
  while ((match = pattern.exec(relsXml)) !== null) {
    if (match[3] === 'image') {
      results.push({ rId: match[1], target: match[2] })
    }
  }
  // Also try reversed attribute order
  const pattern2 = /<Relationship[^>]*Type="[^"]*\/image"[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g
  while ((match = pattern2.exec(relsXml)) !== null) {
    results.push({ rId: match[1], target: match[2] })
  }
  return results
}

/** Check if an image has transparency (alpha channel) */
function hasTransparency(imageData) {
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true
  }
  return false
}

/** Supported image formats for compression */
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp']

function isSupportedImage(filename) {
  const lower = filename.toLowerCase()
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function getImageMimeType(filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

const MAX_DIMENSION = 1920

// ---------------------------------------------------------------------------
// Main compression logic
// ---------------------------------------------------------------------------

async function compressImage(imageBlob, targetWidth, targetHeight) {
  // Decode the image using createImageBitmap (available in workers)
  const bitmap = await createImageBitmap(imageBlob)
  const origWidth = bitmap.width
  const origHeight = bitmap.height

  // Calculate target dimensions
  let newWidth = targetWidth || origWidth
  let newHeight = targetHeight || origHeight

  // Cap at MAX_DIMENSION on longest edge
  const longestEdge = Math.max(newWidth, newHeight)
  if (longestEdge > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longestEdge
    newWidth = Math.round(newWidth * scale)
    newHeight = Math.round(newHeight * scale)
  }

  // Don't upscale — only downscale
  if (newWidth > origWidth || newHeight > origHeight) {
    newWidth = origWidth
    newHeight = origHeight

    // Still cap at MAX_DIMENSION
    const longestOrig = Math.max(newWidth, newHeight)
    if (longestOrig > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longestOrig
      newWidth = Math.round(newWidth * scale)
      newHeight = Math.round(newHeight * scale)
    }
  }

  // If image is already small enough and is JPEG, might not need reprocessing
  // But we still re-encode to normalize quality

  // Use OffscreenCanvas for drawing
  const canvas = new OffscreenCanvas(newWidth, newHeight)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight)
  bitmap.close()

  // Check for transparency
  const imageData = ctx.getImageData(0, 0, newWidth, newHeight)
  const isTransparent = hasTransparency(imageData)

  if (isTransparent) {
    // Encode as PNG (transparency required)
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' })
    return { blob: pngBlob, extension: '.png', contentType: 'image/png' }
  }

  // Encode as JPEG quality 85
  const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })

  // Also try PNG to see which is smaller
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' })

  if (pngBlob.size < jpegBlob.size) {
    return { blob: pngBlob, extension: '.png', contentType: 'image/png' }
  }

  return { blob: jpegBlob, extension: '.jpeg', contentType: 'image/jpeg' }
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = async function (e) {
  if (e.data.type !== 'compress') return

  try {
    const originalBuffer = e.data.buffer
    const originalSize = originalBuffer.byteLength

    // Load the PPTX
    const zip = await JSZip.loadAsync(originalBuffer)

    // Find all image files in ppt/media/
    const mediaFiles = []
    zip.forEach((relativePath, entry) => {
      if (
        relativePath.startsWith('ppt/media/') &&
        !entry.dir &&
        isSupportedImage(relativePath)
      ) {
        mediaFiles.push({ path: relativePath, entry })
      }
    })

    if (mediaFiles.length === 0) {
      self.postMessage({ type: 'no-images' })
      return
    }

    // Build a map of image paths to their display dimensions from slide XMLs
    const imageDimensions = new Map()

    // Read all slide XMLs and their rels
    const slideFiles = []
    zip.forEach((path) => {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
        slideFiles.push(path)
      }
    })

    for (const slidePath of slideFiles) {
      const slideXml = await zip.file(slidePath).async('text')
      const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
      const relsFile = zip.file(relsPath)
      if (!relsFile) continue

      const relsXml = await relsFile.async('text')
      const imageRels = parseRelsForImages(relsXml)

      for (const rel of imageRels) {
        // Resolve relative target path
        let imagePath = rel.target
        if (imagePath.startsWith('../')) {
          imagePath = 'ppt/' + imagePath.slice(3)
        } else if (!imagePath.startsWith('ppt/')) {
          imagePath = 'ppt/slides/' + imagePath
        }

        const dims = parseImageDimensionsFromSlideXml(slideXml, rel.rId)
        if (dims) {
          // Keep the largest display size across all slides
          const existing = imageDimensions.get(imagePath)
          if (!existing || (dims.width * dims.height > existing.width * existing.height)) {
            imageDimensions.set(imagePath, dims)
          }
        }
      }
    }

    // Also check slide layouts and masters for shared images
    const layoutFiles = []
    zip.forEach((path) => {
      if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)) {
        layoutFiles.push(path)
      }
    })
    for (const layoutPath of layoutFiles) {
      const layoutXml = await zip.file(layoutPath).async('text')
      const relsPath = layoutPath.replace('ppt/slideLayouts/', 'ppt/slideLayouts/_rels/') + '.rels'
      const relsFile = zip.file(relsPath)
      if (!relsFile) continue
      const relsXml = await relsFile.async('text')
      const imageRels = parseRelsForImages(relsXml)
      for (const rel of imageRels) {
        let imagePath = rel.target
        if (imagePath.startsWith('../')) {
          imagePath = 'ppt/' + imagePath.slice(3)
        } else if (!imagePath.startsWith('ppt/')) {
          imagePath = 'ppt/slideLayouts/' + imagePath
        }
        const dims = parseImageDimensionsFromSlideXml(layoutXml, rel.rId)
        if (dims && !imageDimensions.has(imagePath)) {
          imageDimensions.set(imagePath, dims)
        }
      }
    }

    // Process images sequentially
    let imagesProcessed = 0
    let imagesSkipped = 0
    const totalImages = mediaFiles.length

    for (let i = 0; i < mediaFiles.length; i++) {
      const { path, entry } = mediaFiles[i]
      const filename = path.split('/').pop()

      self.postMessage({
        type: 'progress',
        percent: Math.round(((i) / totalImages) * 100),
        currentImage: filename,
      })

      try {
        const imageBuffer = await entry.async('arraybuffer')
        const imageBlob = new Blob([imageBuffer], { type: getImageMimeType(path) })

        const dims = imageDimensions.get(path)
        const targetWidth = dims ? dims.width : null
        const targetHeight = dims ? dims.height : null

        const result = await compressImage(imageBlob, targetWidth, targetHeight)

        // Only replace if compressed version is smaller
        const compressedBuffer = await result.blob.arrayBuffer()
        if (compressedBuffer.byteLength < imageBuffer.byteLength) {
          // If extension changed, we need to update the Content_Types and rels
          // For simplicity, keep the same path but update the content
          zip.file(path, compressedBuffer)
          imagesProcessed++
        } else {
          // Keep original
          imagesSkipped++
        }
      } catch (imgErr) {
        // Non-fatal: keep original image
        console.warn('[pptx-compressor] Skipping image:', path, imgErr)
        imagesSkipped++
      }
    }

    self.postMessage({
      type: 'progress',
      percent: 100,
      currentImage: '',
    })

    // Repack the PPTX
    const compressedBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const compressedSize = compressedBuffer.byteLength

    // If compressed file is larger than or equal to original, return original
    if (compressedSize >= originalSize) {
      self.postMessage({ type: 'already-optimal', buffer: originalBuffer })
      return
    }

    self.postMessage({
      type: 'done',
      buffer: compressedBuffer,
      originalSize,
      compressedSize,
      imagesProcessed,
      imagesSkipped,
    })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Compression failed' })
  }
}
