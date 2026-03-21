'use client'

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Progress } from '@/components/ui/progress'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export interface PersonalSlideRecord {
  id: string
  project_id: string
  user_id: string
  title: string
  filename: string
  pptx_storage_path: string
  file_size_bytes: number
  uploaded_at: string
}

interface UploadPersonalSlideDialogProps {
  open: boolean
  projectId: string
  onClose: () => void
  onUploaded: (slide: PersonalSlideRecord) => void
}

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export function UploadPersonalSlideDialog({
  open,
  projectId,
  onClose,
  onUploaded,
}: UploadPersonalSlideDialogProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setError(null)
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) {
      setError(t('slides.only_pptx'))
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(t('slides.file_too_large'))
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
    setProgress(0)
    onClose()
  }

  async function handleUpload() {
    if (!file) {
      setError(t('slides.select_file_error'))
      return
    }
    if (!title.trim()) {
      setError(t('slides.enter_title_error'))
      return
    }

    setUploading(true)
    setError(null)
    setProgress(10)

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error(t('common.not_authenticated'))

      const userId = session.user.id
      const fileId = crypto.randomUUID()
      const storagePath = `${projectId}/${userId}/${fileId}/original.pptx`

      setProgress(20)

      // Upload file to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('personal-slides')
        .upload(storagePath, file, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: false,
        })

      if (storageError) throw new Error(storageError.message)

      setProgress(70)

      // Register the personal slide via API
      const res = await fetch(`/api/projects/${projectId}/personal-slides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          filename: file.name,
          pptx_storage_path: storagePath,
          file_size_bytes: file.size,
        }),
      })

      setProgress(90)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? t('slides.failed_to_register'))
      }

      const data = await res.json()
      setProgress(100)
      onUploaded(data.slide as PersonalSlideRecord)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('slides.upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('slides.upload_personal_slide')}</DialogTitle>
          <DialogDescription>{t('slides.upload_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File picker */}
          <div className="space-y-2">
            <Label>{t('slides.powerpoint_file')}</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t('slides.click_to_select')}</p>
                  <p className="text-xs text-muted-foreground">{t('slides.max_file_size')}</p>
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
            <Label htmlFor="personal-slide-title">{t('slides.title_label')}</Label>
            <Input
              id="personal-slide-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('slides.title_placeholder')}
              maxLength={200}
            />
          </div>

          {/* Progress */}
          {uploading && <Progress value={progress} className="h-2" />}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? t('slides.uploading') : t('slides.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
