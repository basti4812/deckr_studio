import type { TrayItem } from '@/components/board/tray-panel'
import type { Slide } from '@/components/slides/slide-card'

export interface UnfilledField {
  instanceId: string
  trayPosition: number  // 1-based display index
  slideTitle: string
  fieldId: string
  fieldLabel: string
}

/**
 * Pure function that checks all required fields across tray items.
 * Returns a list of unfilled required fields, or empty array if all good.
 */
export function checkFillStatus(
  trayItems: TrayItem[],
  slideMap: Map<string, Slide>,
  textEdits: Record<string, Record<string, string>>
): UnfilledField[] {
  const unfilled: UnfilledField[] = []

  trayItems.forEach((item, index) => {
    const slide = slideMap.get(item.slide_id)
    if (!slide) return

    const instanceEdits = textEdits[item.id] ?? {}

    for (const field of slide.editable_fields) {
      if (!field.required) continue
      const value = instanceEdits[field.id] ?? ''
      if (value.trim() === '') {
        unfilled.push({
          instanceId: item.id,
          trayPosition: index + 1,
          slideTitle: slide.title,
          fieldId: field.id,
          fieldLabel: field.label,
        })
      }
    }
  })

  return unfilled
}
