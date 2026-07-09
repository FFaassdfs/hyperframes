import { useCallback, useRef, type RefObject } from "react";
import type { TimelineGroupMoveChange } from "../../hooks/useTimelineGroupEditing";
import type { TimelineElement } from "../store/playerStore";
import { resolveTimelineGroupMove, type TimelineGroupTimingMember } from "./timelineEditing";

type UpdateTimelineElement = (
  elementId: string,
  updates: Partial<Pick<TimelineElement, "start">>,
) => void;

interface GroupTimingMember extends TimelineGroupTimingMember {
  element: TimelineElement;
  key: string;
}

interface MoveSession {
  grabbedKey: string;
  members: GroupTimingMember[];
  changes: TimelineGroupMoveChange[];
  hasChanged: boolean;
}

interface UseTimelineClipGroupDragInput {
  timelineElementsRef: RefObject<TimelineElement[]>;
  updateElement: UpdateTimelineElement;
  onMoveElementsRef: RefObject<
    ((changes: TimelineGroupMoveChange[]) => Promise<void> | void) | undefined
  >;
  onPreviewMoveElementsRef: RefObject<((changes: TimelineGroupMoveChange[]) => void) | undefined>;
}

interface PreviewGroupMoveResult {
  active: boolean;
  previewStart: number;
}

function elementKey(element: TimelineElement): string {
  return element.key ?? element.id;
}

function selectedMembers(
  grabbedElement: TimelineElement,
  selectedElementIdsInput: Set<string>,
  timelineElements: readonly TimelineElement[],
): GroupTimingMember[] | null {
  const selectedElementIds =
    selectedElementIdsInput instanceof Set ? selectedElementIdsInput : new Set<string>();
  const grabbedKey = elementKey(grabbedElement);
  if (selectedElementIds.size <= 1 || !selectedElementIds.has(grabbedKey)) return null;

  const members = timelineElements
    .filter((element) => selectedElementIds.has(elementKey(element)))
    .map((element) => ({
      element,
      key: elementKey(element),
      start: element.start,
      duration: element.duration,
    }));
  return members.length > 1 ? members : null;
}

function sameGesture(sessionKey: string, element: TimelineElement): boolean {
  return sessionKey === elementKey(element);
}

function createMoveSession(
  element: TimelineElement,
  selectedElementIds: Set<string>,
  timelineElements: readonly TimelineElement[],
): MoveSession | null {
  const members = selectedMembers(element, selectedElementIds, timelineElements);
  if (!members) return null;
  return {
    grabbedKey: elementKey(element),
    members,
    changes: [],
    hasChanged: false,
  };
}

function resolveMoveChanges(
  session: MoveSession,
  previewStart: number,
): TimelineGroupMoveChange[] | null {
  const grabbed = session.members.find((member) => member.key === session.grabbedKey);
  if (!grabbed) return null;
  const result = resolveTimelineGroupMove(session.members, previewStart - grabbed.start);
  return result.members.map((member, index) => ({
    element: session.members[index]!.element,
    start: member.start,
  }));
}

function moveSessionHasChanged(
  session: MoveSession,
  changes: readonly TimelineGroupMoveChange[],
): boolean {
  return changes.some((change, index) => change.start !== session.members[index]!.start);
}

function previewStartForGrabbed(
  session: MoveSession,
  changes: readonly TimelineGroupMoveChange[],
  fallback: number,
): number {
  const change = changes.find((candidate) => elementKey(candidate.element) === session.grabbedKey);
  return change?.start ?? fallback;
}

export function useTimelineClipGroupDrag({
  timelineElementsRef,
  updateElement,
  onMoveElementsRef,
  onPreviewMoveElementsRef,
}: UseTimelineClipGroupDragInput) {
  const moveSessionRef = useRef<MoveSession | null>(null);

  const rollbackMove = useCallback(
    (session: MoveSession) => {
      const changes = session.members.map((member) => ({
        element: member.element,
        start: member.start,
      }));
      for (const change of changes) {
        updateElement(elementKey(change.element), { start: change.start });
      }
      onPreviewMoveElementsRef.current?.(changes);
    },
    [onPreviewMoveElementsRef, updateElement],
  );

  const previewGroupMove = useCallback(
    (
      element: TimelineElement,
      selectedElementIds: Set<string>,
      previewStart: number,
    ): PreviewGroupMoveResult => {
      let session = moveSessionRef.current;
      if (!session || !sameGesture(session.grabbedKey, element)) {
        if (!onMoveElementsRef.current) return { active: false, previewStart };
        session = createMoveSession(element, selectedElementIds, timelineElementsRef.current);
        if (!session) return { active: false, previewStart };
        moveSessionRef.current = session;
      }

      const changes = resolveMoveChanges(session, previewStart);
      if (!changes) return { active: false, previewStart };
      session.changes = changes;
      session.hasChanged = moveSessionHasChanged(session, changes);

      for (const change of changes) {
        updateElement(elementKey(change.element), { start: change.start });
      }
      onPreviewMoveElementsRef.current?.(changes);

      return {
        active: true,
        previewStart: previewStartForGrabbed(session, changes, previewStart),
      };
    },
    [onMoveElementsRef, onPreviewMoveElementsRef, timelineElementsRef, updateElement],
  );

  const commitGroupMove = useCallback(
    (element: TimelineElement): boolean => {
      const session = moveSessionRef.current;
      if (!session || !sameGesture(session.grabbedKey, element)) return false;
      moveSessionRef.current = null;
      if (!session.hasChanged) return true;

      Promise.resolve(onMoveElementsRef.current?.(session.changes)).catch((error) => {
        rollbackMove(session);
        console.error("[Timeline] Failed to persist group clip move", error);
      });
      return true;
    },
    [onMoveElementsRef, rollbackMove],
  );

  const clearGroupDragSessions = useCallback(() => {
    moveSessionRef.current = null;
  }, []);

  return {
    previewGroupMove,
    commitGroupMove,
    clearGroupDragSessions,
  };
}
