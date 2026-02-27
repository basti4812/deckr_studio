'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser } from '@/hooks/use-current-user'
import { supabase } from '@/lib/supabase'

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { displayName, avatarUrl, preferredLanguage, refresh } = useCurrentUser()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account information and preferences.
        </p>
      </div>
      <Separator />
      <DisplayNameCard displayName={displayName} refresh={refresh} />
      <AvatarCard displayName={displayName} avatarUrl={avatarUrl} refresh={refresh} />
      <LanguageCard preferredLanguage={preferredLanguage} refresh={refresh} />
      <PasswordCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card 1 — Display Name
// ---------------------------------------------------------------------------

function DisplayNameCard({
  displayName,
  refresh,
}: {
  displayName: string | null
  refresh: () => Promise<void>
}) {
  const [name, setName] = useState(displayName ?? '')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setName(displayName ?? '') }, [displayName])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Display name cannot be empty'); return }
    if (trimmed.length > 80) { toast.error('Display name is too long (max 80 characters)'); return }

    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Failed to update name')
        return
      }
      await refresh()
      toast.success('Display name updated')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Name</CardTitle>
        <CardDescription>This name is shown throughout the app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="display-name">Name</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
          />
        </div>
        <Button onClick={handleSave} disabled={loading} size="sm">
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Card 2 — Profile Picture
// ---------------------------------------------------------------------------

function AvatarCard({
  displayName,
  avatarUrl,
  refresh,
}: {
  displayName: string | null
  avatarUrl: string | null
  refresh: () => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl)

  useEffect(() => { setPreviewUrl(avatarUrl) }, [avatarUrl])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB')
      return
    }

    setUploading(true)
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Upload failed')
        return
      }
      const { avatar_url } = await res.json()
      setPreviewUrl(avatar_url)
      await refresh()
      toast.success('Profile picture updated')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/profile/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Failed to remove picture')
        return
      }
      setPreviewUrl(null)
      await refresh()
      toast.success('Profile picture removed')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Picture</CardTitle>
        <CardDescription>
          JPEG, PNG, or WebP — max 5 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <Avatar className="h-20 w-20 text-lg">
          {previewUrl && <AvatarImage src={previewUrl} alt={displayName ?? ''} />}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload photo'}
          </Button>
          {previewUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              <Trash2 className="h-4 w-4" />
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Card 3 — Language
// ---------------------------------------------------------------------------

function LanguageCard({
  preferredLanguage,
  refresh,
}: {
  preferredLanguage: string | null
  refresh: () => Promise<void>
}) {
  const [lang, setLang] = useState(preferredLanguage ?? 'de')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setLang(preferredLanguage ?? 'de') }, [preferredLanguage])

  async function handleSave() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferred_language: lang }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Failed to update language')
        return
      }
      await refresh()
      toast.success('Language preference saved')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language</CardTitle>
        <CardDescription>Choose your preferred display language.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={loading} size="sm">
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Card 4 — Password
// ---------------------------------------------------------------------------

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!current) e.current = 'Current password is required'
    if (next.length < 8) e.next = 'New password must be at least 8 characters'
    if (next === current) e.next = 'New password must be different from current password'
    if (next !== confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.field === 'currentPassword') {
          setErrors({ current: d.error })
        } else if (d.field === 'newPassword') {
          setErrors({ next: d.error })
        } else if (d.field === 'confirmPassword') {
          setErrors({ confirm: d.error })
        } else {
          toast.error(d.error ?? 'Failed to change password')
        }
        return
      }
      setCurrent(''); setNext(''); setConfirm('')
      setErrors({})
      toast.success('Password changed successfully')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your account password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">Current password</Label>
          <Input
            id="current-pw"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
          {errors.current && <p className="text-xs text-destructive">{errors.current}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          {errors.next && <p className="text-xs text-destructive">{errors.next}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-pw">Confirm new password</Label>
          <Input
            id="confirm-pw"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
        </div>
        <Button onClick={handleSave} disabled={loading} size="sm">
          {loading ? 'Saving…' : 'Change password'}
        </Button>
      </CardContent>
    </Card>
  )
}
