'use client'

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
  Settings,
  User,
  Users,
} from 'lucide-react'

import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
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
  label: string
  href: string
  icon: React.ElementType
}

// ---------------------------------------------------------------------------
// Nav items per workspace
// ---------------------------------------------------------------------------

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Slide Library', href: '/admin/slides', icon: Image },
  { label: 'Template Sets', href: '/admin/templates', icon: Layers },
  { label: 'Board Configuration', href: '/admin/board-config', icon: LayoutGrid },
  { label: 'Team Management', href: '/admin/team', icon: Users },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Activity Log', href: '/admin/activity', icon: Activity },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
]

const personalNavItems: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Board', href: '/board', icon: LayoutGrid },
  { label: 'Projects', href: '/projects', icon: FolderOpen },
  { label: 'Profile', href: '/profile', icon: User },
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
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, displayName, avatarUrl, role } = useCurrentUser()
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
            D
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-sm text-foreground tracking-tight">
              deckr
            </span>
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
              Admin
            </button>
            <button
              onClick={() => router.push('/home')}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                !inAdminWorkspace
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Personal
            </button>
          </div>
        )}
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel>
              {inAdminWorkspace ? 'Administration' : 'Workspace'}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href ||
                    pathname.startsWith(item.href + '/')
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Settings shortcut */}
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/profile'}
                tooltip="Profile & Settings"
              >
                <Link href="/profile">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
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
                    {avatarUrl && (
                      <AvatarImage src={avatarUrl} alt={displayName ?? ''} />
                    )}
                    <AvatarFallback className="rounded-md text-xs bg-primary text-primary-foreground">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {displayName ?? 'User'}
                    </span>
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
                      {role === 'admin' ? 'Admin' : 'Employee'}
                    </Badge>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile & Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
