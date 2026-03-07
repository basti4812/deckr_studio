/**
 * Auto-layout algorithm for the board canvas.
 *
 * Computes initial x/y positions for groups and their member slides
 * based on a 5-column grid layout. Used as the default "reset" state
 * when no custom positions have been saved.
 */

const COLS = 5
const CARD_WIDTH = 240
const CARD_HEIGHT = 185
const GAP = 24
const PADDING = 48
const SECTION_HEADER = 36 + 12 // header height + margin-bottom
const BETWEEN_GROUPS = 40

export interface GroupPosition {
  id: string
  x: number
  y: number
}

export interface SlidePosition {
  slideId: string
  groupId: string
  x: number
  y: number
}

const COLLAPSED_HEIGHT = SECTION_HEADER

/**
 * Compute group heights for layout calculation.
 * When collapsed, returns only the header height.
 */
export function calcGroupHeight(slideCount: number, collapsed?: boolean): number {
  if (collapsed) return COLLAPSED_HEIGHT
  if (slideCount === 0) return SECTION_HEADER + 60 // empty state placeholder
  const rows = Math.ceil(slideCount / COLS)
  return SECTION_HEADER + rows * CARD_HEIGHT + (rows - 1) * GAP
}

/**
 * Compute the world bounding box that contains all groups.
 */
export function calcWorldSize(
  groupSlideCountsOrSections: { slides: { length: number } | number }[]
): { w: number; h: number } {
  const totalH = groupSlideCountsOrSections.reduce((acc, s, i) => {
    const count = typeof s.slides === 'number' ? s.slides : (s.slides as { length: number }).length
    return acc + calcGroupHeight(count) + (i < groupSlideCountsOrSections.length - 1 ? BETWEEN_GROUPS : 0)
  }, 0)
  const w = Math.max(COLS * CARD_WIDTH + (COLS - 1) * GAP + PADDING * 2, 1500)
  const h = Math.max(totalH + PADDING * 2, 1200)
  return { w, h }
}

/**
 * Compute default positions for groups when no custom positions exist.
 * Groups are stacked vertically, each starting at x=PADDING.
 */
export function computeGroupPositions(
  groups: { id: string; slideCount: number }[]
): GroupPosition[] {
  const positions: GroupPosition[] = []
  let currentY = PADDING

  for (const group of groups) {
    positions.push({ id: group.id, x: PADDING, y: currentY })
    currentY += calcGroupHeight(group.slideCount) + BETWEEN_GROUPS
  }

  return positions
}

/**
 * Compute default positions for slides within a group.
 * Slides are arranged in a 5-column grid relative to the group's origin.
 */
export function computeSlidePositionsInGroup(
  slideIds: string[],
  groupId: string,
  groupX: number,
  groupY: number
): SlidePosition[] {
  return slideIds.map((slideId, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    return {
      slideId,
      groupId,
      x: groupX + col * (CARD_WIDTH + GAP),
      y: groupY + SECTION_HEADER + row * (CARD_HEIGHT + GAP),
    }
  })
}

/**
 * Compute a group's bounding box from its position and slide count.
 */
export function getGroupBounds(
  groupX: number,
  groupY: number,
  slideCount: number
): { x: number; y: number; width: number; height: number } {
  const width = COLS * CARD_WIDTH + (COLS - 1) * GAP
  const height = calcGroupHeight(slideCount)
  return { x: groupX, y: groupY, width, height }
}

/**
 * Hit-test: find which group a point falls inside.
 * Returns the group ID or null if outside all groups.
 */
export function hitTestGroups(
  canvasX: number,
  canvasY: number,
  groups: { id: string; x: number; y: number; slideCount: number }[]
): string | null {
  for (const group of groups) {
    const bounds = getGroupBounds(group.x, group.y, group.slideCount)
    if (
      canvasX >= bounds.x &&
      canvasX <= bounds.x + bounds.width &&
      canvasY >= bounds.y &&
      canvasY <= bounds.y + bounds.height
    ) {
      return group.id
    }
  }
  return null
}

export { COLS, CARD_WIDTH, CARD_HEIGHT, GAP, PADDING, SECTION_HEADER, BETWEEN_GROUPS, COLLAPSED_HEIGHT }
