'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileX, Info, Loader2, Upload, X } from 'lucide-react'
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

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
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
    throw new Error('No slides found in the file — is this a valid PowerPoint?')
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
}

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
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentFileIndex, setCurrentFileIndex] = useState(-1)
  const [statusText, setStatusText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- beforeunload warning during upload ----

  const beforeUnloadHandler = useCallback((e: BeforeUnloadEvent) => {
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (uploading) {
      window.addEventListener('beforeunload', beforeUnloadHandler)
    } else {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
  }, [uploading, beforeUnloadHandler])

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

      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: ${t('slides.file_too_large', { size: formatSize(file.size) })}`)
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
    if (uploading) return
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }

  // ---- Close / reset ----

  function handleClose() {
    if (uploading) return
    setQueue([])
    setError(null)
    setStatusText('')
    setCurrentFileIndex(-1)
    onClose()
  }

  // ---- Reset for new batch ----

  function handleResetForNewBatch() {
    setQueue([])
    setError(null)
    setStatusText('')
    setCurrentFileIndex(-1)
  }

  // ---- Upload all files ----

  async function handleUpload() {
    if (queue.length === 0) {
      setError(t('slides.select_file_first'))
      return
    }

    setUploading(true)
    setError(null)

    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setError('Not authenticated')
      setUploading(false)
      return
    }

    const allCreatedSlideIds: string[] = []

    for (let fi = 0; fi < queue.length; fi++) {
      const qf = queue[fi]
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
        const msg = err instanceof Error ? err.message : 'Upload failed'
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
      <DialogContent className="sm:max-w-lg">
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

        <div className="space-y-4 py-2">
          {/* Success Screen — replaces queue view when at least one file succeeded */}
          {showSuccessScreen ? (
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

              <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={handleResetForNewBatch}>
                  {t('slides.upload_more_files')}
                </Button>
                <Button onClick={handleClose}>{t('slides.go_to_slides')}</Button>
              </div>
            </div>
          ) : (
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
                    .pptx, .ppt, .key, .odp &middot; {t('slides.max_50_mb')} &middot;{' '}
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
                          {formatSize(qf.file.size)}
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
          )}
        </div>

        {/* Footer — hidden on success screen (buttons are inline there) */}
        {!showSuccessScreen && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              {t('slides.cancel')}
            </Button>
            {!allFailed ? (
              <Button onClick={handleUpload} disabled={uploading || queue.length === 0}>
                {uploading ? t('slides.uploading') : t('slides.upload_button')}
              </Button>
            ) : (
              <Button onClick={handleUpload}>{t('slides.upload_button')}</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
