import { roundToCenti } from "../../utils/rounding";

function roundTimelineTime(value: number): number {
  return roundToCenti(value);
}

export interface TimelineGroupTimingMember {
  start: number;
  duration: number;
}

export interface TimelineGroupMoveResult {
  delta: number;
  members: Array<Pick<TimelineGroupTimingMember, "start" | "duration">>;
}

function clampTimelineGroupMoveDelta(
  rawDelta: number,
  members: readonly TimelineGroupTimingMember[],
): number {
  if (members.length === 0) return 0;
  const minDelta = Math.max(...members.map((member) => -member.start));
  return roundTimelineTime(Math.max(rawDelta, minDelta));
}

export function resolveTimelineGroupMove(
  members: readonly TimelineGroupTimingMember[],
  rawDelta: number,
): TimelineGroupMoveResult {
  const delta = clampTimelineGroupMoveDelta(rawDelta, members);
  return {
    delta,
    members: members.map((member) => ({
      start: roundTimelineTime(member.start + delta),
      duration: member.duration,
    })),
  };
}
