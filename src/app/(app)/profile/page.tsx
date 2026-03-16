'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Camera, Lock, Trash2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/hooks/use-current-user'
import { supabase } from '@/lib/supabase'

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

async function getToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type NotificationPreferences = Partial<Record<string, boolean>>

export default function ProfilePage() {
  const { t } = useTranslation()
  const { displayName, avatarUrl, preferredLanguage, refresh } = useCurrentUser()
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null)

  // Load notification preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setNotificationPreferences(d.user?.notification_preferences ?? {})
      }
    }
    loadPrefs()
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t('profile.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('profile.description')}</p>
      </div>
      <Separator />
      <DisplayNameCard displayName={displayName} refresh={refresh} />
      <AvatarCard displayName={displayName} avatarUrl={avatarUrl} refresh={refresh} />
      <LanguageCard preferredLanguage={preferredLanguage} refresh={refresh} />
      <PasswordCard />
      <EmailNotificationsCard
        preferences={notificationPreferences}
        onUpdate={(prefs) => setNotificationPreferences(prefs)}
      />
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
  const { t } = useTranslation()
  const [name, setName] = useState(displayName ?? '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setName(displayName ?? '')
  }, [displayName])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error(t('profile.display_name_empty'))
      return
    }
    if (trimmed.length > 80) {
      toast.error(t('profile.display_name_too_long'))
      return
    }

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
        toast.error(d.error ?? t('profile.failed_update_name'))
        return
      }
      await refresh()
      toast.success(t('profile.display_name_updated'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.display_name')}</CardTitle>
        <CardDescription>{t('profile.name_shown_throughout')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="display-name">{t('profile.name_label')}</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.name_placeholder')}
            maxLength={80}
          />
        </div>
        <Button onClick={handleSave} disabled={loading} size="sm">
          {loading ? t('profile.saving') : t('profile.save')}
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
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl)

  useEffect(() => {
    setPreviewUrl(avatarUrl)
  }, [avatarUrl])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('profile.image_too_large'))
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
        toast.error(d.error ?? t('profile.upload_failed'))
        return
      }
      const { avatar_url } = await res.json()
      setPreviewUrl(avatar_url)
      await refresh()
      toast.success(t('profile.picture_updated'))
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
        toast.error(d.error ?? t('profile.remove_picture_failed'))
        return
      }
      setPreviewUrl(null)
      await refresh()
      toast.success(t('profile.picture_removed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.profile_picture')}</CardTitle>
        <CardDescription>{t('profile.image_formats')}</CardDescription>
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
            {uploading ? t('profile.uploading') : t('profile.upload_photo')}
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
              {removing ? t('profile.removing') : t('profile.remove')}
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
  const { t } = useTranslation()
  const [lang, setLang] = useState(preferredLanguage ?? 'de')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLang(preferredLanguage ?? 'de')
  }, [preferredLanguage])

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
        toast.error(d.error ?? t('profile.failed_update_language'))
        return
      }
      await refresh()
      toast.success(t('profile.language_saved'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.language')}</CardTitle>
        <CardDescription>{t('profile.choose_display_language')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('profile.language')}</Label>
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
          {loading ? t('profile.saving') : t('profile.save')}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Card 4 — Password
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Card 5 — Email Notifications
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES = [
  {
    key: 'project_shared',
    labelKey: 'profile.project_shared',
    descriptionKey: 'profile.when_team_shares',
    mandatory: false,
  },
  {
    key: 'team_member_joined',
    labelKey: 'profile.team_member_joined',
    descriptionKey: 'profile.when_user_added',
    mandatory: false,
  },
  {
    key: 'slide_deprecated',
    labelKey: 'profile.slide_deprecated',
    descriptionKey: 'profile.when_slide_deprecated',
    mandatory: false,
  },
  {
    key: 'slide_updated',
    labelKey: 'profile.slide_updated',
    descriptionKey: 'profile.when_slide_updated',
    mandatory: false,
  },
  {
    key: 'payment_failed',
    labelKey: 'profile.payment_failed',
    descriptionKey: 'profile.when_payment_fails',
    mandatory: true,
  },
  {
    key: 'trial_ending_7d',
    labelKey: 'profile.trial_ending_7d',
    descriptionKey: 'profile.when_trial_7d',
    mandatory: true,
  },
  {
    key: 'trial_ending_1d',
    labelKey: 'profile.trial_ending_1d',
    descriptionKey: 'profile.when_trial_1d',
    mandatory: true,
  },
] as const

function EmailNotificationsCard({
  preferences,
  onUpdate,
}: {
  preferences: Partial<Record<string, boolean>> | null
  onUpdate: (prefs: Partial<Record<string, boolean>>) => void
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState<string | null>(null)

  async function handleToggle(key: string, value: boolean) {
    setSaving(key)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/profile/notification-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ [key]: value }),
      })

      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? t('profile.failed_update_preference'))
        return
      }

      const d = await res.json()
      onUpdate(d.notification_preferences ?? {})
      toast.success(
        value ? t('profile.notifications_enabled') : t('profile.notifications_disabled')
      )
    } finally {
      setSaving(null)
    }
  }

  function isEnabled(key: string, mandatory: boolean): boolean {
    if (mandatory) return true
    if (!preferences) return true // default: all on
    return preferences[key] !== false
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.email_notifications')}</CardTitle>
        <CardDescription>{t('profile.choose_notification_events')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <TooltipProvider>
          {NOTIFICATION_TYPES.map(({ key, labelKey, descriptionKey, mandatory }) => (
            <div
              key={key}
              className="flex items-center justify-between py-3 border-b last:border-0"
            >
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{t(labelKey)}</span>
                  {mandatory && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('profile.cannot_be_disabled')}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t(descriptionKey)}</p>
              </div>
              <Switch
                checked={isEnabled(key, mandatory)}
                onCheckedChange={(checked) => handleToggle(key, checked)}
                disabled={mandatory || saving === key}
                aria-label={`Toggle ${t(labelKey)} email`}
              />
            </div>
          ))}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Card 4 — Password
// ---------------------------------------------------------------------------

function PasswordCard() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!current) e.current = t('profile.password_empty')
    if (next.length < 8) e.next = t('profile.new_password_min')
    if (next === current) e.next = t('profile.new_password_same')
    if (next !== confirm) e.confirm = t('profile.passwords_no_match')
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
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
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
          toast.error(d.error ?? t('profile.failed_change_password'))
        }
        return
      }
      setCurrent('')
      setNext('')
      setConfirm('')
      setErrors({})
      toast.success(t('profile.password_changed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.password')}</CardTitle>
        <CardDescription>{t('profile.change_password_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">{t('profile.current_password')}</Label>
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
          <Label htmlFor="new-pw">{t('profile.new_password')}</Label>
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
          <Label htmlFor="confirm-pw">{t('profile.confirm_new_password')}</Label>
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
          {loading ? t('profile.changing_password') : t('profile.change_password')}
        </Button>
      </CardContent>
    </Card>
  )
}
