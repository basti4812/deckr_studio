'use client'

import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

export interface ActiveFilters {
  groups: string[]
  tags: string[]
  statuses: string[]
}

interface FilterPanelProps {
  groups: string[]
  tags: string[]
  filters: ActiveFilters
  onFiltersChange: (filters: ActiveFilters) => void
  onClearFilters: () => void
}

const STATUS_OPTION_VALUES = ['standard', 'mandatory', 'deprecated'] as const

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

export function FilterPanel({
  groups,
  tags,
  filters,
  onFiltersChange,
  onClearFilters,
}: FilterPanelProps) {
  const { t } = useTranslation()
  const hasFilters =
    filters.groups.length > 0 || filters.tags.length > 0 || filters.statuses.length > 0

  const STATUS_OPTIONS = STATUS_OPTION_VALUES.map((value) => ({
    value,
    label: t(`board.${value}`),
  }))

  return (
    <div className="rounded-lg border bg-background shadow-md p-4 space-y-4 w-72">
      {/* Groups */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('board.groups')}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {groups.map((group) => (
              <div key={group} className="flex items-center gap-2">
                <Checkbox
                  id={`group-${group}`}
                  checked={filters.groups.includes(group)}
                  onCheckedChange={() =>
                    onFiltersChange({ ...filters, groups: toggle(filters.groups, group) })
                  }
                />
                <Label
                  htmlFor={`group-${group}`}
                  className="text-sm font-normal cursor-pointer truncate"
                >
                  {group}
                </Label>
              </div>
            ))}
          </div>
          <Separator />
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('board.tags')}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {tags.map((tag) => (
              <div key={tag} className="flex items-center gap-2">
                <Checkbox
                  id={`tag-${tag}`}
                  checked={filters.tags.includes(tag)}
                  onCheckedChange={() =>
                    onFiltersChange({ ...filters, tags: toggle(filters.tags, tag) })
                  }
                />
                <Label
                  htmlFor={`tag-${tag}`}
                  className="text-sm font-normal cursor-pointer truncate"
                >
                  {tag}
                </Label>
              </div>
            ))}
          </div>
          <Separator />
        </div>
      )}

      {/* Status */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('board.status')}
        </p>
        <div className="space-y-1.5">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`status-${value}`}
                checked={filters.statuses.includes(value)}
                onCheckedChange={() =>
                  onFiltersChange({ ...filters, statuses: toggle(filters.statuses, value) })
                }
              />
              <Label htmlFor={`status-${value}`} className="text-sm font-normal cursor-pointer">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <>
          <Separator />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="w-full text-muted-foreground"
          >
            {t('board.clear_all_filters')}
          </Button>
        </>
      )}
    </div>
  )
}
