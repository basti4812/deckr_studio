'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileText, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import { parsePptxFields } from '@/lib/pptx-parser'
import { getVisibleSlideIndices } from '@/lib/pptx-utils'
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
import type { Slide, DetectedFieldConfig } from './slide-card'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = ['.pptx', '.ppt', '.key', '.odp']
const ACCEPT_STRING =
  '.pptx,.ppt,.key,.odp,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.ms-powerpoint,' +
  'application/x-iwork-keynote-sffkey,' +
  'application/vnd.oasis.opendocument.presentation'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

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
// Types
// ---------------------------------------------------------------------------

type ReplacePhase =
  | 'selection'
  | 'uploading'
  | 'converting'
  | 'detecting'
  | 'replacing'
  | 'success'
  | 'error'

interface ReplaceResult {
  fieldsChanged: boolean
  affectedProjectCount: number
  wasReactivated: boolean
}

interface ReplaceSlideDialogProps {
  slide: Slide | null
  onClose: () => void
  onReplaced: (slide: Slide) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReplaceSlideDialog({ slide, onClose, onReplaced }: ReplaceSlideDialogProps) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<ReplacePhase>('selection')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReplaceResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)
  const { compress } = usePptxCompressor()

  // Reset state when slide changes
  useEffect(() => {
    if (slide) {
      setFile(null)
      setPhase('selection')
      setProgress(0)
      setError(null)
      setResult(null)
      abortRef.current = false
    }
  }, [slide])

  // Warn before closing during active processing
  const beforeUnloadHandler = useCallback((e: BeforeUnloadEvent) => {
    e.preventDefault()
  }, [])

  const isProcessing =
    phase === 'uploading' ||
    phase === 'converting' ||
    phase === 'detecting' ||
    phase === 'replacing'

  useEffect(() => {
    if (isProcessing) {
      window.addEventListener('beforeunload', beforeUnloadHandler)
    } else {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler)
  }, [isProcessing, beforeUnloadHandler])

  // ---------------------------------------------------------------------------
  // File selection
  // ---------------------------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError(null)

    const ext = getExtension(selected.name)
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(t('slides.unsupported_format', 'Unsupported format'))
      return
    }

    if (selected.size > 500 * 1024 * 1024) {
      setError(t('slides.file_too_large_absolute', { name: selected.name }))
      return
    }

    setFile(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---------------------------------------------------------------------------
  // Close / cancel
  // ---------------------------------------------------------------------------

  function handleClose() {
    if (isProcessing) {
      abortRef.current = true
      return
    }
    setFile(null)
    setPhase('selection')
    setProgress(0)
    setError(null)
    setResult(null)
    onClose()
  }

  // ---------------------------------------------------------------------------
  // Replace flow
  // ---------------------------------------------------------------------------

  async function handleReplace() {
    if (!slide || !file) return

    const ext = getExtension(file.name)
    const isPptx = ext === '.pptx'

    abortRef.current = false
    setError(null)
    setProgress(0)

    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setError('Not authenticated')
      return
    }

    let workingFile = file

    try {
      // -------------------------------------------------------------------
      // Step 1: Compress if PPTX and large
      // -------------------------------------------------------------------
      if (isPptx && file.size > MAX_FILE_SIZE) {
        setPhase('uploading')
        setProgress(5)
        const compressResult = await compress(file)
        if (compressResult.status === 'done') {
          workingFile = compressResult.file
        }
      }

      if (abortRef.current) return

      // -------------------------------------------------------------------
      // Step 2: Upload to storage
      // -------------------------------------------------------------------
      setPhase('uploading')
      setProgress(10)

      const contentTypeMap: Record<string, string> = {
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.key': 'application/x-iwork-keynote-sffkey',
        '.odp': 'application/vnd.oasis.opendocument.presentation',
      }

      const storagePath = `${slide.tenant_id}/${slide.id}/replacement${ext}`
      const { error: storageError } = await supabase.storage
        .from('slides')
        .upload(storagePath, workingFile, {
          contentType: contentTypeMap[ext] ?? 'application/octet-stream',
          upsert: true,
        })
      if (storageError) throw new Error(storageError.message)

      setProgress(30)
      if (abortRef.current) {
        // Cleanup uploaded file
        supabase.storage
          .from('slides')
          .remove([storagePath])
          .catch(() => {})
        return
      }

      // -------------------------------------------------------------------
      // Step 3: Get signed URL
      // -------------------------------------------------------------------
      const { data: urlData, error: signedUrlError } = await supabase.storage
        .from('slides')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
      if (signedUrlError || !urlData?.signedUrl) {
        throw new Error('Failed to create signed URL')
      }

      setProgress(40)

      // -------------------------------------------------------------------
      // Step 4: Convert if non-PPTX
      // -------------------------------------------------------------------
      let pptxUrl: string
      let pageCount: number
      let visibleIndices: number[] | null = null

      if (isPptx) {
        pptxUrl = urlData.signedUrl
        // Count pages client-side
        const zip = await JSZip.loadAsync(workingFile)
        const indices = await getVisibleSlideIndices(zip)
        pageCount = indices.length
        visibleIndices = indices
        if (pageCount === 0) {
          throw new Error(t('slides.no_visible_slides'))
        }
      } else {
        setPhase('converting')
        setProgress(45)
        const sourceFormat = ext.slice(1)
        const convertRes = await fetch('/api/slides/convert-presentation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            sourceUrl: urlData.signedUrl,
            sourceFormat,
            tenantId: slide.tenant_id,
            fileId: slide.id,
          }),
        })
        if (!convertRes.ok) {
          const data = await convertRes.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? 'Conversion failed')
        }
        const convertData = (await convertRes.json()) as {
          pptxUrl: string
          pageCount: number
        }
        pptxUrl = convertData.pptxUrl
        pageCount = convertData.pageCount
      }

      setProgress(60)
      if (abortRef.current) return

      // -------------------------------------------------------------------
      // Step 5: Validate page_index
      // -------------------------------------------------------------------
      const slidePageIndex = slide.page_index ?? 0
      const effectivePageCount = visibleIndices ? visibleIndices.length : pageCount

      if (slidePageIndex >= effectivePageCount) {
        throw new Error(
          t('slides.replace_page_index_error', {
            pageIndex: slidePageIndex,
            pageCount: effectivePageCount,
          })
        )
      }

      // -------------------------------------------------------------------
      // Step 6: Detect fields
      // -------------------------------------------------------------------
      setPhase('detecting')
      setProgress(70)

      let detectedFields: DetectedFieldConfig[] = []
      if (isPptx) {
        try {
          const actualPageIndex = visibleIndices ? visibleIndices[slidePageIndex] : slidePageIndex
          const detected = await parsePptxFields(workingFile, actualPageIndex)
          detectedFields = detected.map((f) => ({
            id: f.id,
            label: f.label.slice(0, 100),
            placeholder: f.placeholder.length <= 500 ? f.placeholder : '',
            shapeName: f.shapeName,
            phType: f.phType,
            editable_state: 'locked' as const,
            bounds: f.bounds,
          }))
        } catch {
          // Non-fatal: fields will be empty
        }
      }

      setProgress(80)
      if (abortRef.current) return

      // -------------------------------------------------------------------
      // Step 7: Call replace API
      // -------------------------------------------------------------------
      setPhase('replacing')
      setProgress(85)

      const replaceRes = await fetch(`/api/slides/${slide.id}/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pptx_url: pptxUrl,
          detected_fields: detectedFields,
          page_index: slidePageIndex,
          page_count: effectivePageCount,
          source_filename: file.name,
        }),
      })

      if (!replaceRes.ok) {
        const data = await replaceRes.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Replacement failed')
      }

      const replaceData = await replaceRes.json()
      setProgress(95)

      // -------------------------------------------------------------------
      // Step 8: Trigger thumbnail regeneration
      // -------------------------------------------------------------------
      fetch('/api/slides/generate-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slideIds: [slide.id] }),
      }).catch(() => {})

      setProgress(100)
      setResult(replaceData.replacement)
      setPhase('success')
      onReplaced(replaceData.slide as Slide)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Replacement failed'
      setError(message)
      setPhase('error')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={!!slide} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('slides.replace_slide_title')}</DialogTitle>
          <DialogDescription>{t('slides.replace_slide_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current slide preview */}
          {slide && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2.5">
              <div className="h-12 w-[68px] flex-shrink-0 overflow-hidden rounded border bg-muted">
                {slide.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.thumbnail_url}
                    alt={slide.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{slide.title}</p>
                {slide.source_filename && (
                  <p className="text-xs text-muted-foreground truncate">{slide.source_filename}</p>
                )}
              </div>
            </div>
          )}

          {/* Selection phase */}
          {phase === 'selection' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_STRING}
                className="hidden"
                onChange={handleFileChange}
              />

              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-3 py-2.5">
                  <RefreshCw className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium text-blue-700 dark:text-blue-300">
                      {file.name}
                    </p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                      {formatSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center transition-colors hover:border-muted-foreground/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('slides.replace_select_file')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('slides.replace_supported_formats')}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Processing phases */}
          {isProcessing && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {phase === 'uploading' && t('slides.replace_uploading')}
                  {phase === 'converting' && t('slides.replace_converting')}
                  {phase === 'detecting' && t('slides.replace_detecting_fields')}
                  {phase === 'replacing' && t('slides.replace_processing')}
                </p>
              </div>
              <div className="w-full">
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          )}

          {/* Success phase */}
          {phase === 'success' && result && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center space-y-2">
                <h3 className="text-base font-semibold">{t('slides.replace_success_title')}</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {result.fieldsChanged ? (
                    <p>
                      {t('slides.replace_success_fields_changed', {
                        count: result.affectedProjectCount,
                      })}
                    </p>
                  ) : (
                    <p>{t('slides.replace_success_fields_preserved')}</p>
                  )}
                  {result.wasReactivated && (
                    <p className="text-amber-600 dark:text-amber-400">
                      {t('slides.replace_success_reactivated')}
                    </p>
                  )}
                  {result.affectedProjectCount > 0 && (
                    <p>
                      {t('slides.replace_success_projects_affected', {
                        count: result.affectedProjectCount,
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error phase */}
          {phase === 'error' && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive font-medium">{t('slides.replace_error')}</p>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
            </div>
          )}

          {/* Inline error for selection phase */}
          {phase === 'selection' && error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {phase === 'selection' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t('slides.cancel')}
              </Button>
              <Button onClick={handleReplace} disabled={!file}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('slides.replace_start')}
              </Button>
            </>
          )}
          {isProcessing && (
            <Button variant="outline" onClick={handleClose}>
              {t('slides.cancel')}
            </Button>
          )}
          {(phase === 'success' || phase === 'error') && (
            <Button onClick={handleClose}>{t('slides.replace_close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
