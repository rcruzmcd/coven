"use client";

import { useMemo, useState, useTransition } from "react";
import { MessageCircleOff, RotateCcw } from "lucide-react";
import {
  clearTestRegistrationsAction,
  setRegistrationsGroupChatAction,
  type EventRegistrant,
  type EventRegistrantsData,
} from "./registrants-actions";
import { runAction } from "@/components/portal/action-toast";
import { StatusBadge } from "@/components/portal/status-badge";
import type { EventGroupChat } from "@/lib/registration-group-chat";
import { CancelRegistrationDialog } from "./cancel-registration-dialog";
import {
  RegistrantDetailSheet,
  type RegistrantDoorActions,
} from "./registrant-detail-sheet";
import { RegistrantAnnouncements } from "./registrant-announcements";
import { cancellationReasonLabel } from "@/lib/registration-cancellation";
import { announcementBatches } from "@/lib/event-announcements";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { formatDateTime } from "@/lib/format";

const NO_QUESTIONS: RegistrationQuestion[] = [];

/**
 * The pieces of the registrants list that read the same wherever the list is:
 * the event's registrants card, the Happening Now check-in sheet and the
 * registrants page (#1511). Each surface lays out its own table and toolbar;
 * these are what it would otherwise copy.
 */

/**
 * Cancelled registrations (#1418), apart from the list so one is never
 * mistaken for somebody still coming. Hidden behind a toggle.
 */
export function CancelledRegistrations({
  cancelled,
  canRestore,
  onRestore,
  isRowPending,
  groupChat = null,
  onGroupChatChanged,
}: {
  cancelled: readonly EventRegistrant[];
  canRestore: boolean;
  onRestore: (registrant: EventRegistrant) => void;
  isRowPending: (registrant: EventRegistrant) => boolean;
  /**
   * #1648. A cancelled registration keeps its group chat flag, so this list
   * is where staff see who to take back out -- and mark it once they have.
   */
  groupChat?: EventGroupChat;
  onGroupChatChanged?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [groupChatPending, startGroupChat] = useTransition();
  const stillInChat = groupChat
    ? cancelled.filter((registrant) => registrant.group_chat_added_at !== null)
        .length
    : 0;

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        cellClassName: "max-w-xs font-medium",
        render: (registrant) => (
          <>
            <span className="block truncate" title={registrant.name}>
              {registrant.name}
            </span>
            {groupChat && registrant.group_chat_added_at && (
              <StatusBadge tone="warning" className="mt-1 font-normal">
                Still in {groupChat.label}
              </StatusBadge>
            )}
          </>
        ),
      },
      {
        key: "party_size",
        label: "Party size",
        sortValue: (registrant) => registrant.party_size,
        hideBelow: "sm",
        render: (registrant) => registrant.party_size,
      },
      {
        key: "reason",
        label: "Reason",
        sortValue: (registrant) => registrant.cancellation_reason,
        cellClassName: "app-muted max-w-56 whitespace-normal",
        render: (registrant) => (
          <>
            {cancellationReasonLabel(registrant.cancellation_reason) ?? "—"}
            {registrant.cancellation_note && (
              <span className="block text-xs">
                {registrant.cancellation_note}
              </span>
            )}
          </>
        ),
      },
      {
        key: "cancelled_at",
        label: "Cancelled",
        sortValue: (registrant) => registrant.cancelled_at,
        hideBelow: "md",
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.cancelled_at),
      },
      ...(canRestore
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right whitespace-nowrap",
              render: (registrant: EventRegistrant) => (
                <>
                  {groupChat && registrant.group_chat_added_at && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Mark ${registrant.name} removed from ${groupChat.label}`}
                      disabled={groupChatPending}
                      focusableWhenDisabled
                      onClick={() =>
                        startGroupChat(async () => {
                          await runAction(
                            () =>
                              setRegistrationsGroupChatAction({
                                eventId: registrant.event_id,
                                registrationIds: [registrant.id],
                                added: false,
                              }),
                            {
                              success: `${registrant.name} marked not in ${groupChat.label}.`,
                              onSuccess: onGroupChatChanged,
                            },
                          );
                        })
                      }
                    >
                      <MessageCircleOff /> Removed
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Restore registration for ${registrant.name}`}
                    disabled={isRowPending(registrant)}
                    focusableWhenDisabled
                    onClick={() => onRestore(registrant)}
                  >
                    <RotateCcw /> Restore
                  </Button>
                </>
              ),
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
    ],
    [
      canRestore,
      isRowPending,
      onRestore,
      groupChat,
      groupChatPending,
      onGroupChatChanged,
    ],
  );

  if (cancelled.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          aria-expanded={shown}
          onClick={() => setShown((open) => !open)}
        >
          {shown ? "Hide" : "Show"} cancelled ({cancelled.length}
          {stillInChat > 0 && ` · ${stillInChat} still in ${groupChat?.label}`})
        </Button>
      </div>
      {shown && (
        <PortalDataTable
          columns={columns}
          rows={cancelled}
          getRowKey={(registrant) => registrant.id}
          defaultSort={{ key: "cancelled_at", dir: "desc" }}
          emptyMessage="No cancelled registrations."
          shell="bare"
        />
      )}
    </section>
  );
}

/**
 * Test registrations from the event's staff preview (#1764), apart from the
 * list so one is never counted or mistaken for somebody coming. Hidden behind
 * a toggle, and cleared all at once by someone who manages the event.
 */
export function TestRegistrations({
  eventId,
  tests,
  canClear,
  onCleared,
}: {
  eventId: string;
  tests: readonly EventRegistrant[];
  canClear: boolean;
  onCleared: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startClear] = useTransition();

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        cellClassName: "max-w-xs font-medium",
        render: (registrant) => (
          <span className="flex items-center gap-2">
            <span className="truncate" title={registrant.name}>
              {registrant.name}
            </span>
            <StatusBadge tone="info" className="font-normal">
              Test
            </StatusBadge>
          </span>
        ),
      },
      {
        key: "party_size",
        label: "Party size",
        sortValue: (registrant) => registrant.party_size,
        hideBelow: "sm",
        render: (registrant) => registrant.party_size,
      },
      {
        key: "created_at",
        label: "Registered",
        sortValue: (registrant) => registrant.created_at,
        hideBelow: "md",
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.created_at),
      },
    ],
    [],
  );

  if (tests.length === 0) return null;

  function clear() {
    startClear(async () => {
      await runAction(() => clearTestRegistrationsAction(eventId), {
        success: "Test registrations cleared.",
        onSuccess: () => {
          setConfirming(false);
          onCleared();
        },
      });
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          aria-expanded={shown}
          onClick={() => setShown((open) => !open)}
        >
          {shown ? "Hide" : "Show"} test registrations ({tests.length})
        </Button>
        {canClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            focusableWhenDisabled
            onClick={() => setConfirming(true)}
          >
            Clear test registrations
          </Button>
        )}
      </div>
      {shown && (
        <PortalDataTable
          columns={columns}
          rows={tests}
          getRowKey={(registrant) => registrant.id}
          defaultSort={{ key: "created_at", dir: "desc" }}
          emptyMessage="No test registrations."
          shell="bare"
        />
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear {tests.length} test registration
              {tests.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every test registration on this event is deleted, with its
              answers. Real registrations are not touched. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={clear}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * Only once something has gone out. An empty card headed "Announcements" on
 * every event would be a permanent reminder of a feature most events never
 * need.
 */
export function RegistrantAnnouncementsSection({
  data,
}: {
  data: EventRegistrantsData | undefined;
}) {
  const messages = data?.messages ?? NO_RECORD_MESSAGES;
  const batches = data?.messaging ? announcementBatches(messages) : [];
  if (batches.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="app-muted text-sm font-semibold">Announcements</h3>
      <RegistrantAnnouncements batches={batches} actors={messages.actors} />
    </section>
  );
}

/**
 * The detail sheet and the two row dialogs, mounted only for the registration
 * they are about.
 */
export function RegistrantOverlays({
  data,
  eventName,
  detailId,
  onDetailClosed,
  cancelTarget,
  onCancelClosed,
  onChanged,
  onRegistrantsChanged,
  detailDoor,
}: {
  data: EventRegistrantsData | undefined;
  eventName: string;
  detailId: string | null;
  onDetailClosed: () => void;
  cancelTarget: EventRegistrant | null;
  onCancelClosed: () => void;
  /** After something that moves the counts: a cancellation. */
  onChanged: () => void;
  /** After something only the list itself shows: a message, an answer. */
  onRegistrantsChanged: () => void;
  /** #1558. The phone check-in sheet's actions for the registration open. */
  detailDoor?: (registrant: EventRegistrant) => RegistrantDoorActions;
}) {
  const messages = data?.messages ?? NO_RECORD_MESSAGES;
  const messaging = data?.messaging ?? null;
  const detailTarget = data?.registrants.find(
    (registrant) => registrant.id === detailId,
  );

  return (
    <>
      {/* Keyed by registrant, and mounted only for the one being read: the
          sheet seeds its own open state, so switching rows has to remount it
          rather than hand it a new registrant behind its back. */}
      {detailTarget && (
        <RegistrantDetailSheet
          key={detailTarget.id}
          registrant={detailTarget}
          eventName={eventName}
          // `messaging` is populated only for a caller holding
          // `events: manage`, the gate the sheet's messaging half is behind.
          canManage={messaging !== null}
          messages={messages.byRecord[detailTarget.id] ?? []}
          messageActors={messages.actors}
          orgName={messaging?.orgName ?? ""}
          replyTo={messaging?.replyTo ?? null}
          orgEmailEnabled={messaging?.orgEmailEnabled ?? false}
          // False while loading, which only suppresses a row (#686, #599).
          waiverInForce={data?.waiverInForce ?? false}
          photoConsentInForce={data?.photoConsentInForce ?? false}
          optionsPrompt={data?.registrationOptions?.prompt ?? null}
          registrationQuestions={data?.registrationQuestions ?? NO_QUESTIONS}
          profileQuestions={data?.profileQuestions}
          profileAnswers={
            detailTarget.person_id
              ? (data?.profileAnswers?.[detailTarget.person_id] ?? [])
              : undefined
          }
          canEditProfileAnswers={data?.canEditProfileAnswers ?? false}
          groupChat={data?.groupChat ?? null}
          carpools={data?.carpools ?? null}
          onClosed={onDetailClosed}
          onSent={onRegistrantsChanged}
          onAnswersSaved={onRegistrantsChanged}
          door={detailDoor?.(detailTarget)}
        />
      )}

      {/* Keyed so the form re-seeds from whichever registrant was opened.
          Rendered as a sibling of the sheet, not inside it: the house pattern
          for a second overlay. */}
      {cancelTarget && (
        <CancelRegistrationDialog
          key={cancelTarget.id}
          registrant={cancelTarget}
          orgEmailEnabled={messaging?.orgEmailEnabled ?? false}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onCancelClosed();
          }}
          onCancelled={onChanged}
        />
      )}
    </>
  );
}
