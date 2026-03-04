'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import JSZip from 'jszip'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { Slide } from './slide-card'

interface UploadSlideDialogProps {
  open: boolean
  tenantId: string
  onClose: () => void
  onUploaded: (slide: Slide) => void
}

/**
 * Count slides in a PPTX file by inspecting its zip structure.
 * PPTX files contain ppt/slides/slide1.xml, slide2.xml, etc.
 */
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

export function UploadSlideDialog({
  open,
  tenantId,
  onClose,
  onUploaded,
}: UploadSlideDialogProps) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setError(null)
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) {
      setError('Only .pptx files are accepted')
      return
    }
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
    if (selected.size > MAX_FILE_SIZE) {
      setError(`File exceeds 50 MB limit (${(selected.size / 1024 / 1024).toFixed(1)} MB)`)
      return
    }
    setFile(selected)
    if (!title) {
      setTitle(selected.name.replace(/\.pptx$/i, ''))
    }
  }

  function handleClose() {
    if (uploading) return
    setTitle('')
    setFile(null)
    setError(null)
    setProgress({ current: 0, total: 0, status: '' })
    onClose()
  }

  async function handleUpload() {
    if (!file) { setError('Please select a .pptx file'); return }
    if (!title.trim()) { setError('Please enter a title'); return }

    setUploading(true)
    setError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Count pages in PPTX
      setProgress({ current: 0, total: 0, status: 'Counting slides…' })
      const pageCount = await countPptxPages(file)

      // Upload PPTX file to storage
      setProgress({ current: 0, total: pageCount + 1, status: 'Uploading file…' })
      const tempId = crypto.randomUUID()
      const storagePath = `${tenantId}/${tempId}/original.pptx`

      const { error: storageError } = await supabase.storage
        .from('slides')
        .upload(storagePath, file, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: false,
        })

      if (storageError) throw new Error(storageError.message)

      // Get signed URL for ConvertAPI to access
      const { data: urlData, error: signedUrlError } = await supabase.storage
        .from('slides')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year signed URL

      if (signedUrlError || !urlData?.signedUrl) {
        throw new Error('Failed to create signed URL for uploaded file')
      }
      const pptx_url = urlData.signedUrl

      // Create slide records — one per page
      const createdSlideIds: string[] = []

      for (let i = 0; i < pageCount; i++) {
        setProgress({
          current: i + 1,
          total: pageCount + 1,
          status: pageCount > 1
            ? `Creating slide ${i + 1} of ${pageCount}…`
            : 'Creating slide…',
        })

        const slideTitle = pageCount > 1
          ? `${title.trim()} — Slide ${i + 1}`
          : title.trim()

        // Auto-detect editable text fields from PPTX
        let editable_fields: { id: string; label: string; placeholder: string; required: boolean }[] = []
        try {
          const detected = await parsePptxFields(file, i)
          editable_fields = detected.map((f) => ({
            id: f.id,
            label: f.label,
            placeholder: f.placeholder,
            required: f.required,
          }))
        } catch {
          // Non-fatal: proceed without auto-detected fields
          console.warn(`[upload] Could not parse text fields for slide ${i + 1}`)
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
            pptx_url,
            page_index: i,
            page_count: pageCount,
            source_filename: file.name,
            editable_fields,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `Failed to create slide ${i + 1}`)
        }

        const data = await res.json()
        createdSlideIds.push(data.slide.id)
        onUploaded(data.slide as Slide)
      }

      // Trigger thumbnail generation (fire and forget)
      setProgress({
        current: pageCount + 1,
        total: pageCount + 1,
        status: 'Generating thumbnails…',
      })

      fetch('/api/slides/generate-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slideIds: createdSlideIds }),
      })
        .then((res) => {
          if (!res.ok) console.error('[upload] Thumbnail generation failed:', res.status)
        })
        .catch((err) => {
          console.error('[upload] Thumbnail generation request failed:', err)
        })

      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const showProgress = uploading && progress.total > 0
  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Slide</DialogTitle>
          <DialogDescription>
            Upload a PowerPoint file (.pptx). Multi-page presentations will create one slide per page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File picker */}
          <div className="space-y-2">
            <Label>PowerPoint file</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Click to select a .pptx file
                  </p>
                  <p className="text-xs text-muted-foreground">Max 50 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="slide-title">Title</Label>
            <Input
              id="slide-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Company Overview"
            />
          </div>

          {/* Progress */}
          {showProgress && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{progress.status}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload slide'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
