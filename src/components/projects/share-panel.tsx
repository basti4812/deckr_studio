'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown, Search, Trash2, UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShareLinksTab } from '@/components/projects/share-links-tab'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareRecord {
  id: string
  user_id: string
  display_name: string
  email: string
  permission: 'view' | 'edit'
}

export interface SearchUser {
  id: string
  display_name: string
  email: string
}

interface SharePanelProps {
  open: boolean
  defaultTab?: 'people' | 'links'
  onClose: () => void
  projectId: string
  projectName: string
  ownerName: string
  shares: ShareRecord[]
  onAddShare: (userId: string, permission: 'view' | 'edit') => Promise<string | null>
  onUpdatePermission: (shareId: string, permission: 'view' | 'edit') => Promise<void>
  onRemoveShare: (shareId: string) => Promise<void>
  onSearchUsers: (query: string) => Promise<SearchUser[]>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SharePanel({
  open,
  defaultTab = 'people',
  onClose,
  projectId,
  projectName,
  ownerName,
  shares,
  onAddShare,
  onUpdatePermission,
  onRemoveShare,
  onSearchUsers,
}: SharePanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'people' | 'links'>(defaultTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [addPermission, setAddPermission] = useState<'view' | 'edit'>('view')
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync active tab when defaultTab prop changes (e.g. opening from different buttons)
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
    }
  }, [open, defaultTab])

  // Reset state when panel closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSearchResults([])
      setAddPermission('view')
      setError(null)
    }
  }, [open])

  // Debounced user search
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (query.trim().length < 2) {
        setSearchResults([])
        setSearching(false)
        return
      }

      setSearching(true)
      debounceRef.current = setTimeout(async () => {
        const results = await onSearchUsers(query.trim())
        setSearchResults(results)
        setSearching(false)
      }, 300)
    },
    [onSearchUsers]
  )

  // Add a user
  async function handleAdd(user: SearchUser) {
    setAdding(user.id)
    setError(null)
    const err = await onAddShare(user.id, addPermission)
    setAdding(null)
    if (err) {
      setError(err)
    } else {
      setSearchQuery('')
      setSearchResults([])
    }
  }

  // Remove a share
  async function handleRemove(shareId: string) {
    setRemoving(shareId)
    await onRemoveShare(shareId)
    setRemoving(null)
  }

  // Filter out users who already have access
  const sharedUserIds = new Set(shares.map((s) => s.user_id))
  const filteredResults = searchResults.filter((u) => !sharedUserIds.has(u.id))

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Dynamic title & description based on active tab
  const sheetTitle = activeTab === 'links' ? t('share.links_title') : t('share.access_title')

  const sheetDescription =
    activeTab === 'links' ? t('share.links_description') : t('share.access_description')

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'people' | 'links')}
          className="mt-4 flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="people">{t('share.colleagues')}</TabsTrigger>
            <TabsTrigger value="links">{t('share.share_links')}</TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="flex-1 flex flex-col overflow-hidden">
            {/* ----- Add people section ----- */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('share.search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={addPermission}
                  onValueChange={(v) => setAddPermission(v as 'view' | 'edit')}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">{t('share.can_view')}</SelectItem>
                    <SelectItem value="edit">{t('share.can_edit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search results dropdown */}
              {searchQuery.trim().length >= 2 && (
                <div className="rounded-md border bg-popover shadow-sm max-h-48 overflow-y-auto">
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t('share.searching')}
                    </p>
                  ) : filteredResults.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {searchResults.length > 0 && filteredResults.length === 0
                        ? t('share.all_users_have_access')
                        : t('share.no_users_found')}
                    </p>
                  ) : (
                    filteredResults.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer"
                        onClick={() => handleAdd(user)}
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {getInitials(user.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.display_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <Button variant="ghost" size="sm" disabled={adding === user.id}>
                          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                          {adding === user.id ? t('share.adding') : t('share.add')}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {error}
              </p>
            )}

            <Separator className="my-4" />

            {/* ----- People with access ----- */}
            <div className="flex-1 overflow-y-auto space-y-1">
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {t('share.people_with_access')}
              </p>

              {/* Owner row */}
              <div className="flex items-center gap-3 rounded-md px-2 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{getInitials(ownerName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ownerName}</p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Crown className="h-3 w-3" />
                  {t('share.owner')}
                </Badge>
              </div>

              {/* Shared users */}
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(share.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{share.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{share.email}</p>
                  </div>
                  <Select
                    value={share.permission}
                    onValueChange={(v) => onUpdatePermission(share.id, v as 'view' | 'edit')}
                  >
                    <SelectTrigger className="w-[110px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">{t('share.can_view')}</SelectItem>
                      <SelectItem value="edit">{t('share.can_edit')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(share.id)}
                    disabled={removing === share.id}
                    title={t('share.remove_access')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {shares.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('share.not_shared')}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="links" className="flex-1 overflow-y-auto">
            <ShareLinksTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
