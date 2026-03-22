'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileX, Info, Loader2, PackageOpen, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import { useTranslation } from 'react-i18next'
import { parsePptxFields } from '@/lib/pptx-parser'
import { getVisibleSlideIndices } from '@/lib/pptx-utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { usePptxCompressor } from '@/hooks/use-pptx-compressor'
import type { Slide } from './slide-card'

// ---------------------------------------------------------------------------
// Supported formats
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = ['.pptx', '.ppt', '.key', '.odp']
const ACCEPT_STRING =
  '.pptx,.ppt,.key,.odp,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.ms-powerpoint,' +
  'application/x-iwork-keynote-sffkey,' +
  'application/vnd.oasis.opendocument.presentation'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB
const MAX_FILE_SIZE_NON_PPTX_HARD = 100 * 1024 * 1024 // 100 MB (non-PPTX cannot be compressed client-side)
const MAX_FILES = 10

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// PPTX page counter (client-side, only works for .pptx)
// ---------------------------------------------------------------------------

async function countPptxPages(
  file: File
): Promise<{ pageCount: number; visibleIndices: number[] }> {
  const zip = await JSZip.loadAsync(file)
  const visibleIndices = await getVisibleSlideIndices(zip)
  if (visibleIndices.length === 0) {
    throw new Error('NO_VISIBLE_SLIDES')
  }
  return { pageCount: visibleIndices.length, visibleIndices }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedFile {
  file: File
  extension: string
  status: 'pending' | 'uploading' | 'converting' | 'processing' | 'done' | 'error'
  error?: string
  slidesCreated: number
  /** Original file size before compression (only set if compressed) */
  originalSize?: number
  /** Whether this file was compressed */
  compressed?: boolean
}

/** Phase of the upload dialog */
type DialogPhase = 'selection' | 'compression-prompt' | 'compressing' | 'uploading'

interface UploadSlideDialogProps {
  open: boolean
  tenantId: string
  onClose: () => void
  onUploaded: (slide: Slide) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadSlideDialog({ open, tenantId, onClose, onUploaded }: UploadSlideDialogProps) {
  const { t } = useTranslation()
  const [queue, setQueueState] = useState<QueuedFile[]>([])
  const queueRef = useRef<QueuedFile[]>([])
  // Wrapper that keeps ref in sync with state
  const setQueue: typeof setQueueState = (update) => {
    setQueueState((prev) => {
      const next = typeof update === 'function' ? update(prev) : update
      queueRef.current = next
      return next
    })
  }
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentFileIndex, setCurrentFileIndex] = useState(-1)
  const [statusText, setStatusText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compression state
  const [phase, setPhase] = useState<DialogPhase>('selection')
  const [compressionResult, setCompressionResult] = useState<{
    originalSize: number
    compressedSize: number
  } | null>(null)
  const [isMandatoryCompression, setIsMandatoryCompression] = useState(false)
  const { compress, compressing, progress: compressionProgress } = usePptxCompressor()

  // ---- beforeunload warning during upload ----

  const beforeUnloadHandler = useCallback((e: BeforeUnloadEvent) => {
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (uploading || compressing) {
      window.addEventListener('beforeunload', beforeUnloadHandler)
    } else {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
  }, [uploading, compressing, beforeUnloadHandler])

  // ---- File selection ----

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files
    if (!selected || selected.length === 0) return
    setError(null)

    const newFiles: QueuedFile[] = []
    const currentCount = queue.length

    for (let i = 0; i < selected.length; i++) {
      if (currentCount + newFiles.length >= MAX_FILES) {
        setError(t('slides.max_10_files'))
        break
      }

      const file = selected[i]
      const ext = getExtension(file.name)

      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setError(t('slides.unsupported_format'))
        continue
      }

      // Non-PPTX files over 100 MB are rejected (can't compress client-side)
      if (ext !== '.pptx' && file.size > MAX_FILE_SIZE_NON_PPTX_HARD) {
        setError(t('slides.non_pptx_too_large', { name: file.name }))
        continue
      }

      // PPTX files: no hard upper limit rejection (compression will handle it)
      // But we still reject truly absurd sizes to prevent browser crashes
      if (file.size > 500 * 1024 * 1024) {
        setError(t('slides.file_too_large_absolute', { name: file.name }))
        continue
      }

      newFiles.push({
        file,
        extension: ext,
        status: 'pending',
        slidesCreated: 0,
      })
    }

    if (newFiles.length > 0) {
      setQueue((prev) => [...prev, ...newFiles])
    }

    // Reset input so the same files can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    if (uploading || compressing) return
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }

  // ---- Close / reset ----

  function handleClose() {
    if (uploading || compressing) return
    setQueue([])
    setError(null)
    setStatusText('')
    setCurrentFileIndex(-1)
    setPhase('selection')
    setCompressionResult(null)
    setIsMandatoryCompression(false)
    onClose()
  }

  // ---- Reset for new batch ----

  function handleResetForNewBatch() {
    setQueue([])
    setError(null)
    setStatusText('')
    setCurrentFileIndex(-1)
    setPhase('selection')
    setCompressionResult(null)
    setIsMandatoryCompression(false)
  }

  // ---- Compression logic ----

  /** Check if any PPTX file in the queue needs mandatory compression (> 100 MB) */
  function hasMandatoryCompressionFiles(): boolean {
    return queue.some((f) => f.extension === '.pptx' && f.file.size > MAX_FILE_SIZE)
  }

  /** Check if any PPTX file in the queue could benefit from optional compression (<=100 MB) */
  function hasOptionalCompressionFiles(): boolean {
    return queue.some((f) => f.extension === '.pptx' && f.file.size <= MAX_FILE_SIZE)
  }

  /** Run compression on all PPTX files in the queue */
  async function runCompression() {
    setPhase('compressing')
    setCompressionResult(null)

    let totalOriginal = 0
    let totalCompressed = 0

    for (let i = 0; i < queue.length; i++) {
      const qf = queue[i]
      if (qf.extension !== '.pptx') continue

      const result = await compress(qf.file)

      if (result.status === 'done') {
        totalOriginal += result.originalSize
        totalCompressed += result.compressedSize

        if (result.imagesSkipped > 0) {
          setError(t('slides.compression_skipped_images', { count: result.imagesSkipped }))
        }

        setQueue((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  file: result.file,
                  originalSize: result.originalSize,
                  compressed: true,
                }
              : f
          )
        )
      } else if (result.status === 'already-optimal') {
        setQueue((prev) => prev.map((f, idx) => (idx === i ? { ...f, compressed: false } : f)))
        setError(t('slides.compression_already_optimal'))
      } else if (result.status === 'no-images') {
        setQueue((prev) => prev.map((f, idx) => (idx === i ? { ...f, compressed: false } : f)))
        setError(t('slides.compression_no_images'))
      } else if (result.status === 'error') {
        setError(t('slides.compression_warning', { name: qf.file.name }))
      }
    }

    if (totalOriginal > 0 && totalCompressed > 0) {
      setCompressionResult({ originalSize: totalOriginal, compressedSize: totalCompressed })
    }

    // Warn if any file still exceeds 100 MB after compression
    setQueue((prev) => {
      const stillTooLarge = prev.filter((f) => f.file.size > MAX_FILE_SIZE)
      if (stillTooLarge.length > 0) {
        const names = stillTooLarge.map((f) => f.file.name).join(', ')
        setError(t('slides.compression_still_too_large', { names }))
      }
      return prev
    })

    setPhase('selection')
  }

  // ---- "Start Upload" button handler with compression check ----

  async function handleStartUpload() {
    if (queue.length === 0) {
      setError(t('slides.select_file_first'))
      return
    }

    // Check if we need compression
    const hasMandatory = hasMandatoryCompressionFiles()
    const hasOptional = hasOptionalCompressionFiles()
    const alreadyCompressed = queue.some((f) => f.compressed === true)

    if (hasMandatory && !alreadyCompressed) {
      // Mandatory compression — start immediately
      setIsMandatoryCompression(true)
      await runCompression()
      // After compression finishes, proceed to upload
      handleUpload()
      return
    }

    if (hasOptional && !alreadyCompressed && queue.some((f) => f.compressed === undefined)) {
      // Optional compression — show prompt
      setPhase('compression-prompt')
      return
    }

    // No compression needed or already compressed — proceed to upload
    handleUpload()
  }

  /** User chose to compress (from optional prompt) */
  async function handleCompressAndUpload() {
    setIsMandatoryCompression(false)
    await runCompression()
    handleUpload()
  }

  /** User chose to skip compression (from optional prompt) */
  function handleSkipCompression() {
    setPhase('selection')
    // Mark all files as not needing compression
    setQueue((prev) => prev.map((f) => ({ ...f, compressed: false })))
    handleUpload()
  }

  // ---- Upload all files ----

  async function handleUpload() {
    // Read from ref to get the latest queue (after compression state updates)
    const currentQueue = queueRef.current
    if (currentQueue.length === 0) {
      setError(t('slides.select_file_first'))
      return
    }

    setPhase('uploading')
    setUploading(true)
    setError(null)

    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setError('Not authenticated')
      setUploading(false)
      setPhase('selection')
      return
    }

    const allCreatedSlideIds: string[] = []

    for (let fi = 0; fi < currentQueue.length; fi++) {
      const qf = currentQueue[fi]
      setCurrentFileIndex(fi)

      // Update status to uploading
      setQueue((prev) => prev.map((f, i) => (i === fi ? { ...f, status: 'uploading' } : f)))
      setStatusText(t('slides.processing_file', { current: fi + 1, total: queue.length }))

      try {
        const isPptx = qf.extension === '.pptx'
        const title = qf.file.name.replace(/\.[^.]+$/, '')
        const tempId = crypto.randomUUID()

        // --- Step 1: Upload original file to storage ---
        const contentTypeMap: Record<string, string> = {
          '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '.ppt': 'application/vnd.ms-powerpoint',
          '.key': 'application/x-iwork-keynote-sffkey',
          '.odp': 'application/vnd.oasis.opendocument.presentation',
        }

        const originalPath = `${tenantId}/${tempId}/original${qf.extension}`
        const { error: storageError } = await supabase.storage
          .from('slides')
          .upload(originalPath, qf.file, {
            contentType: contentTypeMap[qf.extension] ?? 'application/octet-stream',
            upsert: false,
          })

        if (storageError) throw new Error(storageError.message)

        // --- Step 2: Get signed URL ---
        const { data: urlData, error: signedUrlError } = await supabase.storage
          .from('slides')
          .createSignedUrl(originalPath, 60 * 60 * 24 * 365)

        if (signedUrlError || !urlData?.signedUrl) {
          throw new Error('Failed to create signed URL')
        }

        let pptxUrl: string
        let pageCount: number
        let visibleIndices: number[] | null = null

        if (isPptx) {
          // --- PPTX: client-side page counting (skips hidden slides) ---
          pptxUrl = urlData.signedUrl
          const result = await countPptxPages(qf.file)
          pageCount = result.pageCount
          visibleIndices = result.visibleIndices
        } else {
          // --- Non-PPTX: server-side conversion ---
          setQueue((prev) => prev.map((f, i) => (i === fi ? { ...f, status: 'converting' } : f)))
          setStatusText(t('slides.converting_file', { name: qf.file.name }))

          const sourceFormat = qf.extension.slice(1) // remove leading dot
          const convertRes = await fetch('/api/slides/convert-presentation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              sourceUrl: urlData.signedUrl,
              sourceFormat,
              tenantId,
              fileId: tempId,
            }),
          })

          if (!convertRes.ok) {
            const data = await convertRes.json().catch(() => ({}))
            throw new Error(
              (data as { error?: string }).error ?? `Conversion failed for ${qf.file.name}`
            )
          }

          const convertData = (await convertRes.json()) as { pptxUrl: string; pageCount: number }
          pptxUrl = convertData.pptxUrl
          pageCount = convertData.pageCount
        }

        // --- Step 3: Create slide records ---
        setQueue((prev) => prev.map((f, i) => (i === fi ? { ...f, status: 'processing' } : f)))

        const fileSlideIds: string[] = []

        // For PPTX: use visible indices (skips hidden slides)
        // For converted: sequential 0..pageCount-1 (converted files have no hidden slides)
        const indices = visibleIndices ?? Array.from({ length: pageCount }, (_, i) => i)

        for (let idx = 0; idx < indices.length; idx++) {
          const pi = indices[idx] // actual PPTX page index (for extractSinglePage)
          const slideNum = idx + 1 // display number (1-based, visible only)
          const slideTitle = indices.length > 1 ? `${title} — Slide ${slideNum}` : title

          // Auto-detect text fields from PPTX (client-side)
          // All fields default to 'locked' — admin must explicitly approve
          let detected_fields: {
            id: string
            label: string
            placeholder: string
            shapeName: string
            phType: string | null
            editable_state: 'locked' | 'optional' | 'required'
            bounds?: { x: number; y: number; w: number; h: number }
          }[] = []
          if (isPptx) {
            try {
              const detected = await parsePptxFields(qf.file, pi)
              detected_fields = detected.map((f) => ({
                id: f.id,
                label: f.label.slice(0, 100),
                placeholder: f.placeholder.length <= 500 ? f.placeholder : '',
                shapeName: f.shapeName,
                phType: f.phType,
                editable_state: 'locked' as const,
                bounds: f.bounds,
              }))
            } catch {
              // Non-fatal
            }
          }

          const res = await fetch('/api/slides', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              title: slideTitle,
              status: 'standard',
              pptx_url: pptxUrl,
              page_index: pi,
              page_count: indices.length,
              source_filename: qf.file.name,
              detected_fields,
              editable_fields: [], // Empty until admin approves fields
            }),
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(
              (data as { error?: string }).error ?? `Failed to create slide ${slideNum}`
            )
          }

          const data = await res.json()
          fileSlideIds.push(data.slide.id)
          allCreatedSlideIds.push(data.slide.id)
          onUploaded(data.slide as Slide)
        }

        // Update queue entry
        setQueue((prev) =>
          prev.map((f, i) =>
            i === fi ? { ...f, status: 'done', slidesCreated: indices.length } : f
          )
        )

        // Trigger thumbnail generation for this file's slides
        fetch('/api/slides/generate-thumbnails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ slideIds: fileSlideIds }),
        }).catch((err) => {
          console.error('[upload] Thumbnail generation request failed:', err)
        })
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'Upload failed'
        const msg = rawMsg === 'NO_VISIBLE_SLIDES' ? t('slides.no_visible_slides') : rawMsg
        setQueue((prev) =>
          prev.map((f, i) => (i === fi ? { ...f, status: 'error', error: msg } : f))
        )
      }
    }

    // All done
    setCurrentFileIndex(-1)
    setUploading(false)

    if (allCreatedSlideIds.length > 0) {
      setStatusText(t('slides.upload_complete', { count: allCreatedSlideIds.length }))
    }
  }

  // ---- Derived state ----

  const totalFiles = queue.length
  const doneFiles = queue.filter((f) => f.status === 'done').length
  const errorFiles = queue.filter((f) => f.status === 'error').length
  const allDone = uploading === false && totalFiles > 0 && doneFiles + errorFiles === totalFiles
  const hasPptxFiles = queue.some((f) => f.extension === '.pptx')
  const allFailed = allDone && doneFiles === 0 && errorFiles > 0
  const showSuccessScreen = allDone && doneFiles > 0
  const progressPercent =
    totalFiles > 0 && uploading
      ? Math.round((currentFileIndex / totalFiles) * 100)
      : allDone
        ? 100
        : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('slides.upload_presentations')}</DialogTitle>
          <DialogDescription>{t('slides.upload_presentations_description')}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_STRING}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="space-y-4 py-2 overflow-hidden">
          {/* ── Compression Prompt (optional, for PPTX files <=100 MB) ── */}
          {phase === 'compression-prompt' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <PackageOpen className="h-10 w-10 text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-base font-semibold">{t('slides.compression_prompt_title')}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('slides.compression_prompt_description')}
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-center">
                <Button onClick={handleCompressAndUpload}>{t('slides.compression_yes')}</Button>
                <Button variant="outline" onClick={handleSkipCompression}>
                  {t('slides.compression_no')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Compression Progress (mandatory or after user accepted) ── */}
          {phase === 'compressing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold">{t('slides.compressing_title')}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isMandatoryCompression
                    ? t('slides.compressing_description_mandatory')
                    : t('slides.compressing_description_optional')}
                </p>
              </div>
              <div className="w-full space-y-2">
                <Progress value={compressionProgress.percent} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {compressionProgress.percent}%
                  {compressionProgress.currentImage && (
                    <> &middot; {compressionProgress.currentImage}</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Success Screen ── */}
          {showSuccessScreen && phase !== 'compression-prompt' && phase !== 'compressing' ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold">{t('slides.upload_finished_heading')}</h3>
                <p className="text-sm text-muted-foreground">
                  {errorFiles > 0
                    ? t('slides.upload_mixed_result', {
                        success: doneFiles,
                        failed: errorFiles,
                      })
                    : t('slides.upload_finished_subheading')}
                </p>
              </div>

              {/* Compression result summary */}
              {compressionResult && (
                <div className="w-full rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 px-3 py-2.5">
                  <div className="flex gap-2 items-center">
                    <PackageOpen className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <p className="text-xs text-green-800 dark:text-green-300">
                      {t('slides.compression_result', {
                        original: formatSize(compressionResult.originalSize),
                        compressed: formatSize(compressionResult.compressedSize),
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Failed files list (mixed result) */}
              {errorFiles > 0 && (
                <div className="w-full space-y-1.5">
                  {queue
                    .filter((f) => f.status === 'error')
                    .map((f, i) => (
                      <div
                        key={`error-${i}`}
                        className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
                      >
                        <FileX className="h-4 w-4 shrink-0 text-destructive" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate font-medium">{f.file.name}</p>
                          {f.error && (
                            <p className="text-xs text-destructive truncate">{f.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Post-upload hint about configuring text fields */}
              {hasPptxFiles && (
                <div className="w-full rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-3 py-2.5">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                      {t('slides.post_upload_hint')}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={handleResetForNewBatch}>
                  {t('slides.upload_more_files')}
                </Button>
                <Button onClick={handleClose}>{t('slides.go_to_slides')}</Button>
              </div>
            </div>
          ) : phase !== 'compression-prompt' && phase !== 'compressing' ? (
            <>
              {/* File picker (hidden when uploading) */}
              {!uploading && (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-muted-foreground/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('slides.select_presentation_files')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    .pptx, .ppt, .key, .odp &middot; {t('slides.max_100_mb')} &middot;{' '}
                    {t('slides.max_10_files')}
                  </p>
                </div>
              )}

              {/* Hidden-slides info banner (only when queue has .pptx files, before upload starts) */}
              {hasPptxFiles && !uploading && queue.length > 0 && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-sm text-blue-800 dark:text-blue-300">
                    {t('slides.hidden_slides_hint')}
                  </AlertDescription>
                </Alert>
              )}

              {/* Processing warning banner (during upload) */}
              {uploading && (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                    {t('slides.processing_warning')}
                  </AlertDescription>
                </Alert>
              )}

              {/* File list */}
              {queue.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {queue.map((qf, i) => (
                    <div
                      key={`${qf.file.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      {/* Status indicator */}
                      <div className="shrink-0">
                        {qf.status === 'done' && (
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                        )}
                        {qf.status === 'error' && <FileX className="h-4 w-4 text-destructive" />}
                        {qf.status === 'pending' && (
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                        )}
                        {(qf.status === 'uploading' ||
                          qf.status === 'converting' ||
                          qf.status === 'processing') && (
                          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                        )}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{qf.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {qf.compressed && qf.originalSize ? (
                            <>
                              <span className="line-through">{formatSize(qf.originalSize)}</span>{' '}
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                {formatSize(qf.file.size)}
                              </span>
                            </>
                          ) : (
                            formatSize(qf.file.size)
                          )}
                          {qf.status === 'done' &&
                            ` · ${t('slides.slides_created_count', { count: qf.slidesCreated })}`}
                          {qf.status === 'error' && qf.error && (
                            <span className="text-destructive"> · {qf.error}</span>
                          )}
                          {qf.status === 'converting' && (
                            <span className="text-primary"> · {t('slides.converting')}</span>
                          )}
                        </p>
                      </div>

                      {/* Remove button (only when not uploading and not all done) */}
                      {!uploading && !allDone && !allFailed && (
                        <button
                          onClick={() => removeFile(i)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={t('slides.cancel')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress */}
              {(uploading || allFailed) && (
                <div className="space-y-2">
                  <Progress value={uploading ? progressPercent : 100} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {uploading ? (
                      statusText
                    ) : (
                      <>{errorFiles > 0 && t('slides.some_files_failed', { count: errorFiles })}</>
                    )}
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          ) : null}
        </div>

        {/* Footer — hidden on success screen and compression screens */}
        {!showSuccessScreen && phase !== 'compression-prompt' && phase !== 'compressing' && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              {t('slides.cancel')}
            </Button>
            {!allFailed ? (
              <Button onClick={handleStartUpload} disabled={uploading || queue.length === 0}>
                {uploading ? t('slides.uploading') : t('slides.upload_button')}
              </Button>
            ) : (
              <Button onClick={handleStartUpload}>{t('slides.upload_button')}</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
