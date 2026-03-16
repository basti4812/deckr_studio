'use client'

import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BarChart3,
  ChevronDown,
  CreditCard,
  FolderOpen,
  Home,
  Image,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LogOut,
  Plug,
  Settings,
  User,
  Users,
} from 'lucide-react'

import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Nav item type
// ---------------------------------------------------------------------------

interface NavItem {
  labelKey: string
  href: string
  icon: React.ElementType
}

// ---------------------------------------------------------------------------
// Nav items per workspace
// ---------------------------------------------------------------------------

const adminNavItems: NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.slide_library', href: '/admin/slides', icon: Image },
  { labelKey: 'nav.template_sets', href: '/admin/templates', icon: Layers },
  { labelKey: 'nav.board_config', href: '/admin/board-config', icon: LayoutGrid },
  { labelKey: 'nav.team_management', href: '/admin/team', icon: Users },
  { labelKey: 'nav.analytics', href: '/admin/analytics', icon: BarChart3 },
  { labelKey: 'nav.activity_log', href: '/admin/activity', icon: Activity },
  { labelKey: 'nav.integrations', href: '/admin/integrations', icon: Plug },
  { labelKey: 'nav.billing', href: '/admin/billing', icon: CreditCard },
]

const personalNavItems: NavItem[] = [
  { labelKey: 'nav.home', href: '/home', icon: Home },
  { labelKey: 'nav.board', href: '/board', icon: LayoutGrid },
  { labelKey: 'nav.projects', href: '/projects', icon: FolderOpen },
  { labelKey: 'nav.profile', href: '/profile', icon: User },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(displayName: string | null): string {
  if (!displayName) return '?'
  return displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function isAdminWorkspace(pathname: string): boolean {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, displayName, avatarUrl, role, userId } = useCurrentUser()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const inAdminWorkspace = isAdmin && isAdminWorkspace(pathname)
  const navItems = inAdminWorkspace ? adminNavItems : personalNavItems

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <Sidebar collapsible="icon">
      {/* Header: logo + workspace switcher */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            O
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-sm text-foreground tracking-tight">onslide.io</span>
          )}
        </div>

        {/* Workspace switcher — admins only */}
        {isAdmin && !isCollapsed && (
          <div className="mx-2 mt-1 flex rounded-md border bg-muted p-0.5">
            <button
              onClick={() => router.push('/dashboard')}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                inAdminWorkspace
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('nav.admin')}
            </button>
            <button
              onClick={() => router.push('/home')}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                !inAdminWorkspace
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('nav.employee')}
            </button>
          </div>
        )}
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel>
              {inAdminWorkspace ? t('nav.administration') : t('nav.workspace')}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon
              const label = t(item.labelKey)
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Notifications + Settings */}
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <NotificationPanel userId={userId} />
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/profile'}
                tooltip={t('nav.profile_and_settings')}
              >
                <Link href="/profile">
                  <Settings className="h-4 w-4" />
                  <span>{t('nav.settings')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user menu */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  tooltip={displayName ?? 'Account'}
                >
                  <Avatar className="h-6 w-6 shrink-0 rounded-md">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName ?? ''} />}
                    <AvatarFallback className="rounded-md text-xs bg-primary text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{displayName ?? 'User'}</span>
                    <span className="truncate text-xs text-muted-foreground capitalize">
                      {role ?? 'employee'}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName ?? 'User'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      variant={role === 'admin' ? 'default' : 'secondary'}
                      className="text-xs px-1.5 py-0"
                    >
                      {role === 'admin' ? t('nav.admin') : t('nav.employee')}
                    </Badge>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    {t('nav.profile_and_settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.log_out')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
