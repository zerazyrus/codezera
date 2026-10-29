import type { GitHistoryItem } from '../../../../shared/git-history'

/** VS Code Git Graph's default branch palette, so lanes read the same as the extension. */
export const GIT_GRAPH_COLORS = [
  '#0085d9',
  '#d9008f',
  '#00d90a',
  '#d98500',
  '#a300d9',
  '#ff0000',
  '#00d9cc',
  '#e138e8',
  '#85d900',
  '#dc5b23',
  '#6f24d6',
  '#ffcc00'
] as const

export const GIT_GRAPH_UNCOMMITTED_COLOR = '#808080'

export type GitGraphSegment = {
  fromLane: number
  /** `top` enters from the row above; `mid` leaves this row's node. */
  fromY: 'top' | 'mid'
  toLane: number
  toY: 'mid' | 'bottom'
  color: string
  dashed: boolean
}

export type GitGraphLaneRef = { lane: number; color: string; dashed: boolean }

export type GitGraphRow = {
  lane: number
  color: string
  segments: GitGraphSegment[]
  /** Lanes still running below this row; an expanded details panel keeps drawing them. */
  below: GitGraphLaneRef[]
}

export type GitGraphLayout = {
  /** Present when the working tree is dirty; its dashed lane leads into HEAD. */
  uncommitted: GitGraphRow | null
  rows: GitGraphRow[]
  laneCount: number
}

type Lane = { id: string; color: string; dashed: boolean } | null

function freeSlot(lanes: Lane[], after = -1): number {
  for (let index = after + 1; index < lanes.length; index += 1) {
    if (lanes[index] === null) {
      return index
    }
  }
  return lanes.length
}

function lanesBelow(lanes: Lane[]): GitGraphLaneRef[] {
  const below: GitGraphLaneRef[] = []
  lanes.forEach((lane, index) => {
    if (lane) {
      below.push({ lane: index, color: lane.color, dashed: lane.dashed })
    }
  })
  return below
}

/**
 * Lanes keep their column until their commit appears (curving into it there), freed columns are
 * reused, and merge parents join a lane that already waits for them — VS Code Git Graph's shape.
 */
export function layoutGitGraph(
  items: readonly GitHistoryItem[],
  headOid: string | null,
  hasUncommitted: boolean
): GitGraphLayout {
  let lanes: Lane[] = []
  let colorCursor = 0
  let laneCount = 1
  const nextColor = (): string => {
    const color = GIT_GRAPH_COLORS[colorCursor % GIT_GRAPH_COLORS.length]!
    colorCursor += 1
    return color
  }

  let uncommitted: GitGraphRow | null = null
  if (hasUncommitted) {
    const headLoaded = headOid !== null && items.some((item) => item.id === headOid)
    if (headLoaded) {
      lanes = [{ id: headOid, color: GIT_GRAPH_UNCOMMITTED_COLOR, dashed: true }]
    }
    uncommitted = {
      lane: 0,
      color: GIT_GRAPH_UNCOMMITTED_COLOR,
      segments: headLoaded
        ? [
            {
              fromLane: 0,
              fromY: 'mid',
              toLane: 0,
              toY: 'bottom',
              color: GIT_GRAPH_UNCOMMITTED_COLOR,
              dashed: true
            }
          ]
        : [],
      below: lanesBelow(lanes)
    }
  }

  const rows: GitGraphRow[] = []
  for (const item of items) {
    const segments: GitGraphSegment[] = []
    let lane = lanes.findIndex((candidate) => candidate?.id === item.id)
    const incoming = lane !== -1
    if (!incoming) {
      lane = freeSlot(lanes)
      lanes[lane] = { id: item.id, color: nextColor(), dashed: false }
    }

    for (let index = 0; index < lanes.length; index += 1) {
      const candidate = lanes[index]
      if (!candidate) {
        continue
      }
      if (candidate.id === item.id) {
        if (index === lane && !incoming) {
          continue
        }
        // Converging lanes (and the node's own lane) end at this commit.
        segments.push({
          fromLane: index,
          fromY: 'top',
          toLane: lane,
          toY: 'mid',
          color: candidate.color,
          dashed: candidate.dashed
        })
        if (index !== lane) {
          lanes[index] = null
        }
        continue
      }
      segments.push({
        fromLane: index,
        fromY: 'top',
        toLane: index,
        toY: 'bottom',
        color: candidate.color,
        dashed: candidate.dashed
      })
    }

    const own = lanes[lane]!
    // The dashed working-tree lane hands HEAD a real branch color.
    const color = own.dashed ? nextColor() : own.color
    const [firstParent, ...mergeParents] = item.parentIds
    if (firstParent === undefined) {
      lanes[lane] = null
    } else {
      lanes[lane] = { id: firstParent, color, dashed: false }
      segments.push({
        fromLane: lane,
        fromY: 'mid',
        toLane: lane,
        toY: 'bottom',
        color,
        dashed: false
      })
    }

    for (const parent of mergeParents) {
      let target = lanes.findIndex((candidate) => candidate?.id === parent)
      if (target === -1) {
        target = freeSlot(lanes, lane)
        lanes[target] = { id: parent, color: nextColor(), dashed: false }
      }
      segments.push({
        fromLane: lane,
        fromY: 'mid',
        toLane: target,
        toY: 'bottom',
        color: lanes[target]!.color,
        dashed: false
      })
    }

    laneCount = Math.max(laneCount, lanes.length)
    while (lanes.length > 0 && lanes.at(-1) === null) {
      lanes.pop()
    }
    rows.push({ lane, color, segments, below: lanesBelow(lanes) })
  }

  return { uncommitted, rows, laneCount }
}
