"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { saveMinutesDraftAction, type MinutesRow } from "./minutes-actions";
import type { ActionItem } from "./action-items-actions";
import type { MinutesItem } from "./minutes-snapshot";
import {
  datedRecordHref,
  type MeetingDatedContext as MeetingDatedContextData,
} from "./meeting-context-shared";
import type { MeetingTopicContext } from "./meeting-context-catalog";
import { TopicContext } from "./meeting-topic-context";
import { OngoingTopicsTooltip } from "./agenda-tab";
import { MinutesActionItemDialog } from "./minutes-action-item-dialog";
import { DecisionsTab } from "./decisions-tab";
import {
  MinutesQuickReferenceAside,
  MinutesQuickReferenceBody,
  MinutesQuickReferenceTrigger,
} from "./minutes-quick-reference";
import {
  forbiddenPreviewKinds,
  MEETING_RECORD_PREVIEW_LOADERS,
} from "./meeting-record-preview";
import { MeetingExportDialog } from "./meeting-export-dialog";
import {
  formatMinutesMarkdown,
  formatMinutesPlainText,
  type MinutesExportInput,
} from "./minutes-export";
import type { PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { MarkdownText } from "@/components/portal/markdown-text";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import {
  RecordPreviewLink,
  RecordPreviewProvider,
} from "@/components/portal/record-preview-sheet";
import { SaveStatusLine } from "@/components/portal/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { useUnsavedChangesGuard } from "@/components/portal/unsaved-changes-guard";
import { usePortalDevice } from "@/lib/portal/device-context";
import { formatCalendarDate, personDisplayName } from "@/lib/format";

/**
 * Taking minutes against the frozen agenda (#1200).
 *
 * The whole editor is **one** piece of state and **one** autosave, not one per
 * textarea: a save carries whatever changed since the server last accepted
 * something, so twelve sections and the closing notes coalesce into a single
 * request rather than twelve competing ones.
 *
 * `MarkdownTextarea`s (#1872): plain controlled textareas with list
 * continuation, a small formatting toolbar and a Preview, so the autosave sees
 * the same string changes it always did. No contenteditable rich-text editor.
 */

/**
 * The live reference reads the minutes show beside each section (#1224).
 * Loaded once by `MinutesTab` and threaded down, rather than fetched per card.
 */
export type TopicContextProps = {
  context: MeetingTopicContext | undefined;
  datedContext: MeetingDatedContextData | undefined;
};

export type MinutesDraft = {
  notes: Record<string, string>;
  bodyText: string;
};

/** What the tab hands the parent so a tab switch can save before it leaves. */
export type MinutesLeaveGuard = { flush: () => Promise<boolean> };

function initialDraft(minutes: MinutesRow): MinutesDraft {
  return { notes: minutes.notes, bodyText: minutes.body_text ?? "" };
}

/**
 * The note keys whose text differs from what the server last accepted.
 *
 * This is why `save_meeting_minutes_draft` merges with `||` instead of
 * replacing: sending the whole `notes` object would mean one notetaker's stale
 * copy of a section overwriting another's edit to it, every time either of them
 * paused typing. The diff is recomputed on each attempt, so a retry after a
 * failure still carries everything that has not landed.
 */
function changedNotes(
  baseline: Record<string, string>,
  next: Record<string, string>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value !== (baseline[key] ?? "")) patch[key] = value;
  }
  return patch;
}

function ItemActionItems({ items }: { items: ActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="app-muted mt-2 list-disc pl-5 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          {item.description}
          {" — "}
          {personDisplayName(item.owner)}
          {item.due_date && ` (due ${formatCalendarDate(item.due_date)})`}
        </li>
      ))}
    </ul>
  );
}

/** What the agenda planned for this item, read from the snapshot. */
function PlannedContent({ item }: { item: MinutesItem }) {
  const planned = item.planned;
  if (!planned) return null;

  const lines = [
    planned.text ? { label: null, text: planned.text } : null,
    planned.updates ? { label: "Planned update", text: planned.updates } : null,
    planned.decisions_needed
      ? { label: "Decisions needed", text: planned.decisions_needed }
      : null,
    planned.discussion
      ? { label: "Discussion", text: planned.discussion }
      : null,
  ].filter((line): line is { label: string | null; text: string } => !!line);

  const topics = planned.topics ?? [];
  const references = planned.references ?? [];
  if (lines.length === 0 && topics.length === 0 && references.length === 0) {
    return null;
  }

  return (
    <div className="mt-1">
      {lines.map((line) => (
        <p key={line.label ?? "text"} className="app-muted text-sm">
          {line.label && <span className="font-medium">{line.label}: </span>}
          {line.text}
        </p>
      ))}
      <OngoingTopicsTooltip topics={topics} />
      {/* Navigating away is safe -- #1200's autosave and leave guard are what
          made it safe -- so a pinned date is a link rather than dead text, which
          was the complaint #1199-#1201 exist to answer. Since #1225 it does not
          navigate at all: the record opens over the minutes, and the full
          record is one more click from there. */}
      {references.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-sm">
          {references.map((reference) => (
            <li key={`${reference.kind}:${reference.id}`}>
              <RecordPreviewLink
                record={{
                  kind: reference.kind,
                  id: reference.id,
                  label: reference.label,
                }}
                href={datedRecordHref(reference.kind, reference.id)}
                className="text-left text-[var(--purple-deep)] underline"
              />
              {reference.date && (
                <span className="app-muted">
                  {" — "}
                  {formatCalendarDate(reference.date)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The small caps label that separates the parts of one card. */
function PartLabel({ children }: { children: ReactNode }) {
  return (
    <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
      {children}
    </p>
  );
}

/**
 * The decisions item records decisions, not prose: the same list and form
 * the overview's Decisions section shows, so a vote is written once, as a
 * decision, rather than as a sentence in a notes box nobody can count.
 */
function DecisionsItemBody({
  meeting,
  legacyNote,
  readOnly,
  onDecisionsChange,
}: {
  meeting: { id: string; date: string };
  /** A note typed into this item before it became the decisions list. */
  legacyNote: string;
  readOnly: boolean;
  onDecisionsChange?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DecisionsTab
        meetingId={meeting.id}
        meetingDate={meeting.date.slice(0, 10)}
        mode={readOnly ? "view" : "edit"}
        onDecisionsChange={onDecisionsChange}
      />
      {legacyNote.trim() !== "" && (
        <div>
          <PartLabel>Earlier notes</PartLabel>
          <MarkdownText className="mt-1 text-sm">{legacyNote}</MarkdownText>
        </div>
      )}
    </div>
  );
}

function MinutesItemCard({
  item,
  number,
  meeting,
  note,
  actionItems,
  readOnly,
  topicContext,
  onNoteChange,
  onFlush,
  onAddActionItem,
  onDecisionsChange,
}: {
  item: MinutesItem;
  number: number;
  meeting: { id: string; date: string };
  note: string;
  actionItems: ActionItem[];
  readOnly: boolean;
  topicContext?: TopicContextProps;
  onNoteChange?: (value: string) => void;
  onFlush?: () => void;
  onAddActionItem?: () => void;
  onDecisionsChange?: () => void;
}) {
  const headingId = `minutes-item-${item.key.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <li
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-[var(--line)] bg-card"
    >
      <div className="flex items-baseline gap-3 border-b border-[var(--line)] bg-muted/50 px-4 py-3">
        <span className="app-muted text-sm tabular-nums" aria-hidden>
          {number}.
        </span>
        <h3 id={headingId} className="text-base font-semibold">
          {item.label}
        </h3>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* From the snapshot, never the live agenda: the plan a notetaker is
            working against must not move under them because someone opened
            the Agenda tab in another window. */}
        <PlannedContent item={item} />

        {/* Live, and deliberately not frozen into the snapshot (#1224): what
            gets typed into the note below is the record, and a cash position
            copied into `agenda_snapshot` would be a second, silent,
            un-auditable financial statement. */}
        <TopicContext
          itemKey={item.key}
          context={topicContext?.context}
          datedContext={topicContext?.datedContext}
        />

        {item.kind === "decisions" ? (
          <DecisionsItemBody
            meeting={meeting}
            legacyNote={note}
            readOnly={readOnly}
            onDecisionsChange={onDecisionsChange}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <PartLabel>Notes</PartLabel>
            {readOnly ? (
              note.trim() === "" ? (
                <p className="app-muted text-sm">No notes recorded.</p>
              ) : (
                // Rendered, not `whitespace-pre-wrap` (#1201): the editor is a
                // plain textarea and notetakers type Markdown conventions into
                // it, so finalized minutes read with literal asterisks
                // otherwise.
                <MarkdownText className="text-sm">{note}</MarkdownText>
              )
            ) : (
              <MarkdownTextarea
                aria-label={`Notes for ${item.label}`}
                placeholder="What happened"
                value={note}
                onChange={(event) => onNoteChange?.(event.target.value)}
                // Leaving a field is a natural save point and costs nothing
                // when the debounce has already fired.
                onBlur={onFlush}
              />
            )}

            <ItemActionItems items={actionItems} />

            {!readOnly && onAddActionItem && (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0"
                  onClick={onAddActionItem}
                >
                  + Add action item
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function itemsFor(actionItems: ActionItem[], key: string): ActionItem[] {
  return actionItems.filter((item) => item.minutes_item_key === key);
}

/**
 * The minutes' half of the shared export dialog (#1201). The agenda tab has
 * the same three lines over `agenda-export.ts`.
 */
function MinutesExport({ input }: { input: MinutesExportInput }) {
  return (
    <MeetingExportDialog
      title="Export minutes"
      markdown={formatMinutesMarkdown(input)}
      plainText={formatMinutesPlainText(input)}
    />
  );
}

/** Minutes nobody may write to: finalized, or a viewer without manage access. */
export function MinutesReadOnlyView({
  meetingDate,
  minutes,
  actionItems,
  topicContext,
  lifecycleAction,
}: {
  meetingDate: string;
  minutes: MinutesRow;
  actionItems: ActionItem[];
  topicContext: TopicContextProps;
  lifecycleAction?: ReactNode;
}) {
  const items = minutes.agenda_snapshot?.items ?? [];

  return (
    <RecordPreviewProvider
      loaders={MEETING_RECORD_PREVIEW_LOADERS}
      forbiddenKinds={forbiddenPreviewKinds(topicContext.datedContext)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={minutes.status === "final" ? "success" : "progress"}>
            {minutes.status === "final" ? "Final" : "Draft"}
          </Badge>
          <div className="flex flex-wrap items-center gap-2">
            <MinutesExport
              input={{
                meetingDate,
                minutes,
                actionItems,
                topicContext: topicContext.context,
                datedContext: topicContext.datedContext,
              }}
            />
            {lifecycleAction}
          </div>
        </div>

        <ol className="flex flex-col gap-4">
          {items.map((item, index) => (
            <MinutesItemCard
              key={item.key}
              item={item}
              number={index + 1}
              meeting={{ id: minutes.meeting_id, date: meetingDate }}
              note={minutes.notes[item.key] ?? ""}
              actionItems={itemsFor(actionItems, item.key)}
              topicContext={topicContext}
              readOnly
            />
          ))}
        </ol>

        <div>
          <p className="text-sm font-semibold">Closing notes</p>
          {minutes.body_text?.trim() ? (
            <MarkdownText className="mt-1 text-sm">
              {minutes.body_text}
            </MarkdownText>
          ) : (
            <p className="app-muted mt-1 text-sm">None.</p>
          )}
        </div>
      </div>
    </RecordPreviewProvider>
  );
}

export function MinutesEditor({
  meetingId,
  meetingDate,
  minutes,
  actionItems,
  people,
  topicContext,
  onPersonCreated,
  onActionItemAdded,
  onViewDecisions,
  lifecycleAction,
  guardRef,
}: {
  meetingId: string;
  meetingDate: string;
  minutes: MinutesRow;
  actionItems: ActionItem[];
  people: PersonListItem[];
  topicContext: TopicContextProps;
  onPersonCreated: (person: PickedPerson) => void;
  /** Refreshes the item list in place -- never the whole route, mid-meeting. */
  onActionItemAdded: () => void;
  /** Leaves for the overview's decisions section. Saves on the way out. */
  onViewDecisions: () => void;
  lifecycleAction?: ReactNode;
  guardRef: RefObject<MinutesLeaveGuard | null>;
}) {
  const items = minutes.agenda_snapshot?.items ?? [];
  const [draft, setDraft] = useState<MinutesDraft>(() => initialDraft(minutes));
  // The open add-action-item dialog, if any. Its `item` is the snapshot item
  // the action was raised under, or null for one raised out of band from the
  // quick-reference panel -- a wrapper object rather than a bare
  // `MinutesItem | null`, so "closed" and "open, for the meeting" stay
  // distinguishable.
  const [addingActionItem, setAddingActionItem] = useState<{
    item: MinutesItem | null;
  } | null>(null);
  // Bumped when a decision is recorded under the decisions item, so the quick
  // reference's own copy of the list refetches rather than going stale.
  const [decisionsVersion, setDecisionsVersion] = useState(0);
  // From the layout, decided on the server (#1079/#1115) -- never
  // `useIsMobile()`, which answers `false` during SSR and would flash the
  // desktop aside onto a phone before correcting itself.
  const isPhone = usePortalDevice() === "mobile";

  // What the server has accepted, and therefore what the next save diffs
  // against. Written only by a save that succeeded, so a failure leaves the
  // next attempt carrying everything that has not landed.
  const savedRef = useRef<MinutesDraft>(initialDraft(minutes));

  const autosave = useAutosave<MinutesDraft>({
    save: async (value) => {
      const baseline = savedRef.current;
      const notes = changedNotes(baseline.notes, value.notes);
      const bodyTextChanged = value.bodyText !== baseline.bodyText;
      // Nothing moved -- a flush on blur with no edit behind it. Skip the
      // round trip rather than writing an empty merge.
      if (Object.keys(notes).length === 0 && !bodyTextChanged) return {};

      const result = await saveMinutesDraftAction(meetingId, {
        notes,
        // Absent, not null: `parseMinutesPatch` reads an absent field as "leave
        // the closing notes alone" and `null` as "clear them".
        ...(bodyTextChanged ? { bodyText: value.bodyText } : {}),
      });
      if (!("error" in result)) savedRef.current = value;
      return result;
    },
  });
  const { flush, queue } = autosave;

  // The honest last line. Autosave shrinks the unsaved window to about a
  // second, but a save that keeps failing leaves the only copy of the text in
  // these textareas, so the browser still asks before a refresh throws it
  // away. The tab-switch half of the same guard is in meeting-detail-view.tsx,
  // which owns the tab strip.
  useUnsavedChangesGuard(autosave.dirty);

  // Published for the tab strip, which saves before it unmounts this panel.
  useEffect(() => {
    guardRef.current = { flush };
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, flush]);

  function edit(next: MinutesDraft) {
    setDraft(next);
    queue(next);
  }

  function openActionItemDialog(item: MinutesItem | null) {
    // Started before the dialog opens, so the sentence being typed is on its
    // way to the server rather than waiting out a debounce behind a modal.
    // Not awaited: the dialog should open now, not after a round trip.
    void flush();
    setAddingActionItem({ item });
  }

  const quickReference = {
    meetingId,
    meetingDate,
    actionItems,
    onAddActionItem: () => openActionItemDialog(null),
    // No flush here: this leaves the tab, and the tab strip's own leave path
    // (`leaveMinutes` in meeting-detail-view.tsx) is what flushes, waits for
    // the result and asks about discarding if the save failed. Flushing again
    // first would only duplicate the half of that which cannot report back.
    onViewDecisions,
    decisionsVersion,
  };

  return (
    <RecordPreviewProvider
      loaders={MEETING_RECORD_PREVIEW_LOADERS}
      forbiddenKinds={forbiddenPreviewKinds(topicContext.datedContext)}
      // Phone only. The sheet the provider owns is the *same* surface the
      // quick reference uses, so a referenced record replaces this body rather
      // than opening a second overlay over a 390px screen -- literally the
      // "replace the quick glance with view details" the request asked for.
      // On a desktop the aside below stays put and the record opens over the
      // page, so there is no host and nothing to go back to.
      host={
        isPhone
          ? {
              title: "Quick reference",
              description:
                "Action items, decisions and attendance for this meeting, without leaving the minutes.",
              body: <MinutesQuickReferenceBody {...quickReference} />,
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="progress">Draft</Badge>
            <SaveStatusLine
              status={autosave.status}
              lastSavedAt={autosave.lastSavedAt}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MinutesQuickReferenceTrigger />
            <MinutesExport
              input={{
                meetingDate,
                minutes,
                actionItems,
                topicContext: topicContext.context,
                datedContext: topicContext.datedContext,
              }}
            />
            {lifecycleAction}
          </div>
        </div>

        {autosave.status === "error" && autosave.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{autosave.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-4">
              {items.map((item, index) => (
                <MinutesItemCard
                  key={item.key}
                  item={item}
                  number={index + 1}
                  meeting={{ id: meetingId, date: meetingDate }}
                  note={draft.notes[item.key] ?? ""}
                  actionItems={itemsFor(actionItems, item.key)}
                  topicContext={topicContext}
                  readOnly={false}
                  onNoteChange={(value) =>
                    edit({
                      ...draft,
                      notes: { ...draft.notes, [item.key]: value },
                    })
                  }
                  onFlush={() => void flush()}
                  onAddActionItem={() => openActionItemDialog(item)}
                  onDecisionsChange={() =>
                    setDecisionsVersion((version) => version + 1)
                  }
                />
              ))}
            </ol>

            <Field>
              <FieldLabel htmlFor="minutes-closing-notes">
                Closing notes
              </FieldLabel>
              <MarkdownTextarea
                id="minutes-closing-notes"
                placeholder="Anything that belongs to the meeting as a whole"
                value={draft.bodyText}
                onChange={(event) =>
                  edit({ ...draft, bodyText: event.target.value })
                }
                onBlur={() => void flush()}
              />
            </Field>
          </div>
          {!isPhone && <MinutesQuickReferenceAside {...quickReference} />}
        </div>

        {addingActionItem && (
          <MinutesActionItemDialog
            meetingId={meetingId}
            item={addingActionItem.item}
            people={people}
            onPersonCreated={onPersonCreated}
            onAdded={() => {
              setAddingActionItem(null);
              onActionItemAdded();
            }}
            onOpenChange={(open) => {
              if (!open) setAddingActionItem(null);
            }}
          />
        )}
      </div>
    </RecordPreviewProvider>
  );
}
