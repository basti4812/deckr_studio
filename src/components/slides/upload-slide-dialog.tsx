'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
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
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { Slide } from './slide-card'

interface UploadSlideDialogProps {
  open: boolean
  tenantId: string
  onClose: () => void
  onUploaded: (slide: Slide) => void
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setError(null)
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) {
      setError('Only .pptx files are accepted')
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

      // Generate a temporary ID for the storage path
      const tempId = crypto.randomUUID()
      const storagePath = `${tenantId}/${tempId}/original.pptx`

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('slides')
        .upload(storagePath, file, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: false,
        })

      if (storageError) throw new Error(storageError.message)

      // Get the public or signed URL
      const { data: urlData } = await supabase.storage
        .from('slides')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year signed URL

      const pptx_url = urlData?.signedUrl ?? null

      // Create the slide record via API
      const res = await fetch('/api/slides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          status: 'standard',
          pptx_url,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create slide')
      }

      const data = await res.json()
      onUploaded(data.slide as Slide)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Slide</DialogTitle>
          <DialogDescription>
            Upload a PowerPoint file (.pptx) to add it to the slide library.
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
