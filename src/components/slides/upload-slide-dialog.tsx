'use client'

import { useRef, useState } from 'react'
import { FileX, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import { useTranslation } from 'react-i18next'
import { parsePptxFields } from '@/lib/pptx-parser'
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

async function countPptxPages(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(file)
  let count = 0
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(path)) {
      count++
    }
  })
  if (count === 0) {
    throw new Error('No slides found in the file — is this a valid PowerPoint?')
  }
  return count
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

        if (isPptx) {
          // --- PPTX: client-side page counting ---
          pptxUrl = urlData.signedUrl
          pageCount = await countPptxPages(qf.file)
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

        for (let pi = 0; pi < pageCount; pi++) {
          const slideTitle = pageCount > 1 ? `${title} — Slide ${pi + 1}` : title

          // Auto-detect editable fields (only for PPTX, client-side)
          let editable_fields: {
            id: string
            label: string
            placeholder: string
            required: boolean
          }[] = []
          if (isPptx) {
            try {
              const detected = await parsePptxFields(qf.file, pi)
              editable_fields = detected.map((f) => ({
                id: f.id,
                label: f.label.slice(0, 100),
                placeholder: f.placeholder.length <= 200 ? f.placeholder : '',
                required: f.required,
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
              page_count: pageCount,
              source_filename: qf.file.name,
              editable_fields,
            }),
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(
              (data as { error?: string }).error ?? `Failed to create slide ${pi + 1}`
            )
          }

          const data = await res.json()
          fileSlideIds.push(data.slide.id)
          allCreatedSlideIds.push(data.slide.id)
          onUploaded(data.slide as Slide)
        }

        // Update queue entry
        setQueue((prev) =>
          prev.map((f, i) => (i === fi ? { ...f, status: 'done', slidesCreated: pageCount } : f))
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

        <div className="space-y-4 py-2">
          {/* File picker (hidden when uploading or done) */}
          {!uploading && !allDone && (
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
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_STRING}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

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
                    {qf.status === 'done' && <div className="h-2 w-2 rounded-full bg-green-500" />}
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

                  {/* Remove button (only when not uploading) */}
                  {!uploading && !allDone && (
                    <button
                      onClick={() => removeFile(i)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          {(uploading || allDone) && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploading ? (
                  statusText
                ) : (
                  <>
                    {doneFiles > 0 &&
                      t('slides.upload_complete', {
                        count: queue.reduce((sum, f) => sum + f.slidesCreated, 0),
                      })}
                    {errorFiles > 0 && ` · ${t('slides.some_files_failed', { count: errorFiles })}`}
                  </>
                )}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            {allDone ? t('slides.close') : t('slides.cancel')}
          </Button>
          {!allDone && (
            <Button onClick={handleUpload} disabled={uploading || queue.length === 0}>
              {uploading ? t('slides.uploading') : t('slides.upload_button')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
