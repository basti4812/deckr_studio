'use client'

import { useTranslation } from 'react-i18next'
import { Filter, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SearchFilterBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  filterCount: number
  filterOpen: boolean
  onToggleFilter: () => void
  resultCount: number
  totalCount: number
  onClearAll: () => void
}

export function SearchFilterBar({
  searchQuery,
  onSearchChange,
  filterCount,
  filterOpen,
  onToggleFilter,
  resultCount,
  totalCount,
  onClearAll,
}: SearchFilterBarProps) {
  const { t } = useTranslation()
  const isFiltering = searchQuery.length > 0 || filterCount > 0

  return (
    <div className="flex items-center gap-2">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('board.search_slides')}
          className="pl-8 pr-8 h-9"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter toggle */}
      <Button
        variant={filterOpen ? 'default' : 'outline'}
        size="sm"
        onClick={onToggleFilter}
        className="gap-1.5 h-9"
      >
        <Filter className="h-3.5 w-3.5" />
        {t('board.filters')}
        {filterCount > 0 && (
          <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
            {filterCount}
          </Badge>
        )}
      </Button>

      {/* Result count */}
      {isFiltering && (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {t('board.showing_slides', { shown: resultCount, total: totalCount })}
        </span>
      )}

      {/* Clear all */}
      {isFiltering && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-muted-foreground h-9"
        >
          {t('board.clear_all')}
        </Button>
      )}
    </div>
  )
}
