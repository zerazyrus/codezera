import type React from 'react'
import type { GitGraphLaneRef, GitGraphRow, GitGraphSegment } from './git-graph-layout'

export const GIT_GRAPH_ROW_HEIGHT = 24
export const GIT_GRAPH_LANE_WIDTH = 16
const NODE_RADIUS = 4
const STROKE_WIDTH = 2

export function laneX(lane: number): number {
  return GIT_GRAPH_LANE_WIDTH * lane + GIT_GRAPH_LANE_WIDTH / 2 + 4
}

function segmentPath(segment: GitGraphSegment): string {
  const x1 = laneX(segment.fromLane)
  const x2 = laneX(segment.toLane)
  const y1 = segment.fromY === 'top' ? 0 : GIT_GRAPH_ROW_HEIGHT / 2
  const y2 = segment.toY === 'bottom' ? GIT_GRAPH_ROW_HEIGHT : GIT_GRAPH_ROW_HEIGHT / 2
  if (x1 === x2) {
    return `M ${x1} ${y1} V ${y2}`
  }
  const bend = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${bend} ${x2} ${bend} ${x2} ${y2}`
}

export function GitGraphRowSvg({
  row,
  width,
  node
}: {
  row: GitGraphRow
  width: number
  node: 'filled' | 'hollow'
}): React.JSX.Element {
  const cx = laneX(row.lane)
  const cy = GIT_GRAPH_ROW_HEIGHT / 2
  return (
    <svg aria-hidden="true" width={width} height={GIT_GRAPH_ROW_HEIGHT} className="block">
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={segmentPath(segment)}
          fill="none"
          stroke={segment.color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={segment.dashed ? '2 2' : undefined}
        />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={NODE_RADIUS}
        fill={node === 'filled' ? row.color : 'var(--editor-surface)'}
        stroke={row.color}
        strokeWidth={node === 'filled' ? 1 : STROKE_WIDTH}
      />
    </svg>
  )
}

/** Keeps lanes flowing through an expanded commit's details panel. */
export function GitGraphLanesThrough({
  lanes,
  width
}: {
  lanes: readonly GitGraphLaneRef[]
  width: number
}): React.JSX.Element {
  return (
    <svg aria-hidden="true" width={width} height="100%" className="absolute inset-y-0 left-0">
      {lanes.map((lane) => (
        <line
          key={lane.lane}
          x1={laneX(lane.lane)}
          x2={laneX(lane.lane)}
          y1="0"
          y2="100%"
          stroke={lane.color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={lane.dashed ? '2 2' : undefined}
        />
      ))}
    </svg>
  )
}
