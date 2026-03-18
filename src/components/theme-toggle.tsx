'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const THEMES = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
] as const

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch -- only render icon after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('theme.toggle')}>
          {mounted ? (
            resolvedTheme === 'dark' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="gap-2"
            aria-selected={theme === value}
          >
            <Icon className="h-4 w-4" />
            <span>{t(labelKey)}</span>
            {theme === value && (
              <span className="ml-auto text-xs text-primary" aria-hidden="true">
                &#10003;
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
