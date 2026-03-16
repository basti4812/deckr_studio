'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Copy, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SimulatedShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FAKE_LINK = 'https://app.onslide.io/view/demo-abc123'

export function SimulatedShareDialog({ open, onOpenChange }: SimulatedShareDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(FAKE_LINK).catch(() => {
      // Clipboard may not be available in all contexts
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        setCopied(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <DialogTitle className="text-center">{t('demo.share_link_created')}</DialogTitle>
          <DialogDescription className="text-center">{t('demo.share_link_desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={FAKE_LINK} className="flex-1 text-sm" aria-label="Share link" />
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title={copied ? t('demo.copied') : t('demo.copy_link')}
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">{t('demo.demo_share_notice')}</p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <Link href="/register">{t('demo.sign_up_share')}</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
