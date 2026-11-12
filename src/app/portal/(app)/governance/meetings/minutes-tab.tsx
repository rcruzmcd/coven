"use client";

import { useEffect, useState, useTransition, type RefObject } from "react";
import {
  finalizeMinutesAction,
  getMinutesAction,
  reopenMinutesAction,
  startMinutesFromAgendaAction,
  type MinutesRow,
} from "./minutes-actions";
import { listActionItemsAction, type ActionItem } from "./action-items-actions";
import { getAgendaAction } from "./agenda-actions";
import {
  getMeetingTopicContextAction,
  listMeetingDatedContextAction,
} from "./meeting-context-actions";
import type { MeetingTopicContext } from "./meeting-context-catalog";
import type { MeetingDatedContext } from "./meeting-context-shared";
import {
  MinutesEditor,
  MinutesReadOnlyView,
  type MinutesLeaveGuard,
} from "./minutes-editor";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import type { PickedPerson } from "../../people/person-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { useTabData } from "@/hooks/use-tab-data";

export type { MinutesLeaveGuard } from "./minutes-editor";

/**
 * The minutes of one meeting: a different *view of one object*, with its own
 * record, structure and lifecycle (#1200).
 *
 * #408 removed a Minutes tab, and this is deliberately not that tab. That one
 * was a second free-text box over the same two agenda columns -- a duplicate,
 * and right to go. This renders the frozen agenda snapshot from
 * `meeting_minutes` (#1199) as the list a notetaker works down, with notes
 * keyed to it and a draft -> final lifecycle of its own, which is exactly what
 * `docs/portal-navigation.md` says a tab is for. Three tabs is far under the
 * ~10-part rail threshold, and the lifecycle stays a badge plus a button rather
 * than becoming a fourth tab.
 */

/** A confirm in front of a state change, not a form: `AlertDialog` on purpose. */
function LifecycleButton({
  label,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            focusableWhenDisabled
          />
        }
      >
        {pending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          label
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MinutesTab({
  meetingId,
  meetingDate,
  canManage,
  onViewDecisions,
  guardRef,
}: {
  meetingId: string;
  /**
   * The meeting's own date. The quick-reference panel measures "previous
   * meeting" against it, and the export heads the document with it. Passed
   * rather than read off `agenda_snapshot.meeting_date`, which is the date as
   * it stood when the minutes were started.
   */
  meetingDate: string;
  canManage: boolean;
  /** Leaves for the overview's decisions section, saving on the way out. */
  onViewDecisions: () => void;
  guardRef: RefObject<MinutesLeaveGuard | null>;
}) {
  const {
    data: minutes,
    loadError,
    refresh,
  } = useTabData<MinutesRow | null>(
    // `getMinutesAction` answers the #1082 envelope (`{ error: { code, message } }`),
    // and `useTabData` renders `loadError` as text, so the message is unwrapped
    // here rather than handed an object to stringify.
    async () => {
      const result = await getMinutesAction(meetingId);
      return "error" in result ? { error: result.error.message } : result;
    },
    [meetingId],
  );

  // The live records behind each standing section (#1224), plus #1223's
  // calendar block, which the Events section reads from. Two reads for the
  // whole tab rather than one per card, and both are supplementary: a failure
  // leaves the notes readable rather than replacing them with an error.
  const { data: topicContext } = useTabData<MeetingTopicContext>(async () => {
    const result = await getMeetingTopicContextAction(meetingId);
    return "error" in result ? { error: result.error.message } : result;
  }, [meetingId]);
  const { data: datedContext } = useTabData<MeetingDatedContext>(async () => {
    const result = await listMeetingDatedContextAction(meetingId);
    return "error" in result ? { error: result.error.message } : result;
  }, [meetingId]);

  // Supplementary: the action items raised under each section. Gated at
  // `governance:manage`, unlike the minutes themselves, so a view-only board
  // member simply sees the notes without them rather than an error about a
  // list they did not ask for.
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  // Wording only -- `startMinutesFromAgenda` resolves the agenda and the
  // template ladder itself, and builds a snapshot either way. Without this the
  // empty state would offer to start minutes "from agenda" for a meeting that
  // has none.
  const [hasAgenda, setHasAgenda] = useState(false);
  const [isMutating, startMutation] = useTransition();

  function refreshActionItems() {
    listActionItemsAction(meetingId).then((result) => {
      if (!("error" in result)) setActionItems(result.data);
    });
  }

  useEffect(() => {
    let alive = true;
    listActionItemsAction(meetingId).then((result) => {
      if (alive && !("error" in result)) setActionItems(result.data);
    });
    listPeopleAction().then((result) => {
      if (alive && !("error" in result)) setPeople(result.data);
    });
    // `getAgendaAction` gates its read at `governance:manage` (a pre-existing
    // inconsistency `minutes-core.ts` documents), so a view-only member gets a
    // refusal here. They see no Start button either way, so it is ignored.
    getAgendaAction(meetingId).then((result) => {
      if (alive && !("error" in result)) setHasAgenda(result.data !== null);
    });
    return () => {
      alive = false;
    };
  }, [meetingId]);

  function handleStart() {
    startMutation(async () => {
      await runAction(() => startMinutesFromAgendaAction(meetingId), {
        success: "Minutes started.",
        description: hasAgenda
          ? "The agenda is frozen into this record; later agenda edits won't move it."
          : undefined,
        onSuccess: refresh,
      });
    });
  }

  function handleFinalize() {
    startMutation(async () => {
      await runAction(() => finalizeMinutesAction(meetingId), {
        success: "Minutes finalized.",
        onSuccess: refresh,
      });
    });
  }

  function handleReopen() {
    startMutation(async () => {
      await runAction(() => reopenMinutesAction(meetingId), {
        success: "Minutes reopened.",
        onSuccess: refresh,
      });
    });
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (minutes === undefined) return <TabLoadingSkeleton />;

  if (minutes === null) {
    return (
      <EmptyState
        title="No minutes started yet"
        description={
          canManage
            ? hasAgenda
              ? "Starting minutes freezes this meeting's agenda into a list to take notes against. Notes save themselves as you type."
              : "This meeting has no agenda, so the minutes are built from the active agenda template's sections instead."
            : "Minutes appear here once a governance manager starts them for this meeting."
        }
        action={
          canManage ? (
            <Button type="button" onClick={handleStart} disabled={isMutating}>
              {isMutating ? (
                <>
                  <Spinner /> Starting...
                </>
              ) : hasAgenda ? (
                "Start minutes from agenda"
              ) : (
                "Start minutes"
              )}
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (minutes.status === "final" || !canManage) {
    return (
      <MinutesReadOnlyView
        meetingDate={meetingDate}
        minutes={minutes}
        actionItems={actionItems}
        topicContext={{ context: topicContext, datedContext }}
        lifecycleAction={
          canManage && minutes.status === "final" ? (
            <LifecycleButton
              label="Reopen"
              title="Reopen these minutes?"
              description="They go back to draft so they can be edited again. The board's approval, if it has already been recorded, is unaffected."
              confirmLabel="Reopen"
              pending={isMutating}
              onConfirm={handleReopen}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <MinutesEditor
      meetingId={meetingId}
      meetingDate={meetingDate}
      minutes={minutes}
      actionItems={actionItems}
      people={people}
      topicContext={{ context: topicContext, datedContext }}
      onPersonCreated={(person: PickedPerson) =>
        setPeople((prev) => [...prev, person])
      }
      onActionItemAdded={refreshActionItems}
      onViewDecisions={onViewDecisions}
      guardRef={guardRef}
      lifecycleAction={
        <LifecycleButton
          label="Finalize"
          title="Finalize these minutes?"
          description="The notes are locked against further edits. You can reopen them if something needs correcting; the board's approval is a separate step at the next meeting."
          confirmLabel="Finalize"
          pending={isMutating}
          onConfirm={handleFinalize}
        />
      }
    />
  );
}
