export interface TimelineItem {
  id: string;
  start: number;
  end: number;
}

export interface LanePlacement {
  /** 0-based column inside its overlap group. */
  lane: number;
  /** Column count of the group — every item in a group gets the same width. */
  lanes: number;
}

/**
 * Side-by-side columns for overlapping intervals (calendar-style), so bookings at the
 * same time for different stylists don't draw on top of each other. Items that touch
 * end-to-start do not overlap.
 */
export function layoutLanes(items: TimelineItem[]): Map<string, LanePlacement> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const placements = new Map<string, LanePlacement>();

  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const { id, lane } of group) placements.set(id, { lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    group.push({ id: item.id, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();

  return placements;
}
