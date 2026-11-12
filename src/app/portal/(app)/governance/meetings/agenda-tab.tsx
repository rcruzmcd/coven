"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getAgendaAction,
  listActiveAgendaTemplatesAction,
  upsertAgendaAction,
  type Agenda,
} from "./agenda-actions";
import type { AgendaOngoingItem, AgendaUpcomingDate } from "./agenda-form";
import {
  getMeetingTopicContextAction,
  listMeetingDatedContextAction,
} from "./meeting-context-actions";
import {
  contextSourcesForItem,
  type ContextSourceKey,
  type MeetingTopicContext,
} from "./meeting-context-catalog";
import { TopicContext } from "./meeting-topic-context";
import {
  meetingContextEntryDay,
  meetingContextSourceId,
  meetingContextSourceKey,
  type MeetingContextEntry,
  type MeetingDatedContext as MeetingDatedContextData,
} from "./meeting-context-shared";
import { MeetingDatedContext } from "./meeting-dated-context";
import {
  forbiddenPreviewKinds,
  MEETING_RECORD_PREVIEW_LOADERS,
} from "./meeting-record-preview";
import {
  agendaSectionSource,
  isSourcedSection,
  sectionShowsContentState,
  type ActiveAgendaTemplate,
  type AgendaTemplateSection,
  type CalendarSectionSource,
} from "./agenda-template-shared";
import {
  listAgendaEventsAction,
  type AgendaEventsFeed as AgendaEventsFeedData,
} from "./agenda-events-actions";
import { AgendaEventsFeed } from "./agenda-events-feed";
import {
  listAgendaCalendarItemsAction,
  listOpenPartnershipsAction,
  type AgendaCalendarFeed as AgendaCalendarFeedData,
  type AgendaPartnershipsFeed as AgendaPartnershipsFeedData,
} from "./agenda-calendar-actions";
import { AgendaCalendarFeed } from "./agenda-calendar-feed";
import { AgendaPartnershipsFeed } from "./agenda-partnerships-feed";
import {
  listActionItemsAction,
  listCarriedOverActionItemsAction,
  updateActionItemStatusAction,
  type ActionItem,
} from "./action-items-actions";
import { listDecisionsAction, type Decision } from "./decisions-actions";
import {
  getPreviousMeetingMinutesAction,
  type PreviousMeetingMinutes,
} from "./minutes-approval-actions";
import { RecordPreviewProvider } from "@/components/portal/record-preview-sheet";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { runAction } from "@/components/portal/action-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  DocumentField,
  DocumentPreview,
} from "@/components/portal/document-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatedListEditor } from "@/components/dated-list-editor";
import { FreeformListEditor } from "@/components/freeform-list-editor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import type { AgendaSectionFeeds } from "./agenda-feed-text";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { OPENING_CHECKLIST } from "./opening-checklist";
import { agendaFormatForMeetingType, type AgendaFormat } from "./agenda-form";
import {
  AgendaCreatedActionItems,
  AgendaDecisions,
  AgendaExport,
  AgendaOpening,
  ReadOnlySection,
} from "./agenda-parts";
import { SimpleAgenda } from "./simple-agenda";
import { prefillAgendaFromEventAction } from "./agenda-prefill-actions";

/** One labelled paragraph of a standing section's per-meeting text. */
function OngoingItemBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

/**
 * Whether a sourced section carries the open-partnerships block (#1242).
 *
 * Read off #1224's section-to-source catalog rather than off the template's
 * own `source`, because the source cannot answer it: Community & Partnerships
 * and Marketing & Social are both `{kind: "calendar"}`, and only their
 * category keys differ. The catalog already names `community_partnerships` as
 * the section partnerships belong under, and one mapping is what keeps the two
 * from drifting apart.
 */
function sectionShowsPartnerships(section: AgendaTemplateSection): boolean {
  return (
    isSourcedSection(section) &&
    contextSourcesForItem(`section:${section.key}`).includes("partnerships")
  );
}

/**
 * The topic-context sources a sourced section's feed already renders in full.
 *
 * The feed lists every open partnership, ordered by next step and flagged when
 * it is overdue; the three-row block below would be the same records a second
 * time, under a second heading, in a different order.
 */
function sectionFeedSources(
  section: AgendaTemplateSection,
): ContextSourceKey[] {
  return sectionShowsPartnerships(section) ? ["partnerships"] : [];
}

export type SectionModuleFeeds = {
  eventsFeed: AgendaEventsFeedData | undefined;
  eventsFeedError: string | null;
  /** Keyed by section key: each calendar-sourced section filters on its own source. */
  calendarFeeds: Record<string, AgendaCalendarFeedData> | undefined;
  calendarFeedsError: string | null;
  partnershipsFeed: AgendaPartnershipsFeedData | undefined;
  partnershipsFeedError: string | null;
};

/**
 * What a sourced section's module contributes, above its Discussion box.
 *
 * One place where a section key meets a feed, so the section's own markup does
 * not grow a branch per module. #1241 filled the `events` arm and #1242 the
 * calendar one; a source this build does not render yet falls through to
 * nothing rather than to an error -- the same stance `agendaSectionSource`
 * takes about a `kind` it has never heard of.
 */
function SectionModuleFeed({
  section,
  feeds,
}: {
  section: AgendaTemplateSection;
  feeds: SectionModuleFeeds;
}) {
  const source = agendaSectionSource(section);
  if (source?.kind === "events") {
    return (
      <AgendaEventsFeed
        feed={feeds.eventsFeed}
        loadError={feeds.eventsFeedError}
      />
    );
  }
  if (source?.kind === "calendar") {
    return (
      <>
        <AgendaCalendarFeed
          feed={feeds.calendarFeeds?.[section.key]}
          loadError={feeds.calendarFeedsError}
          title="On the calendar"
          label={`${section.label} items on the calendar`}
          emptyTitle="Nothing on the calendar before the next meeting"
          // Off the section's own source, the same question the reader asked
          // before deciding whether to join the pieces at all.
          showContentState={sectionShowsContentState(section)}
        />
        {sectionShowsPartnerships(section) && (
          <AgendaPartnershipsFeed
            feed={feeds.partnershipsFeed}
            loadError={feeds.partnershipsFeedError}
          />
        )}
      </>
    );
  }
  return null;
}

/**
 * The same question `SectionModuleFeed` above answers -- which module rows
 * belong to this section -- asked for the export (#1244) rather than for the
 * screen. Keyed by section key, the way `AgendaExportInput` keys it.
 *
 * It hands over the feeds the tab has already loaded: a section still waiting
 * on its read contributes `undefined`, which the export prints as nothing
 * rather than as an empty group, and the export itself reads nothing.
 */
function sourcedSectionFeeds(
  sections: AgendaTemplateSection[],
  feeds: SectionModuleFeeds,
): Record<string, AgendaSectionFeeds> {
  const bySection: Record<string, AgendaSectionFeeds> = {};
  for (const section of sections) {
    const source = agendaSectionSource(section);
    if (source?.kind === "events") {
      bySection[section.key] = { events: feeds.eventsFeed };
    } else if (source?.kind === "calendar") {
      bySection[section.key] = {
        calendar: feeds.calendarFeeds?.[section.key],
        partnerships: sectionShowsPartnerships(section)
          ? feeds.partnershipsFeed
          : undefined,
      };
    }
  }
  return bySection;
}

/**
 * The template's reference topics for a section, behind a dotted-underline
 * count so a long list does not push the agenda's own content down the page.
 *
 * Exported for the Minutes tab (#1200), which renders the same topics beside
 * each snapshot item -- they are what the section is *for*, and a notetaker
 * needs them in front of them as much as the agenda's author did.
 */
export function OngoingTopicsTooltip({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="app-muted mt-1 text-xs underline decoration-dotted underline-offset-2"
          />
        }
      >
        {topics.length} reference topic{topics.length === 1 ? "" : "s"}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <ul className="list-disc pl-4">
          {topics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Titles for the rows the editor shows as linked, keyed the way a pinned row
 * names its source. Only what is in the live window is here; a pinned row whose
 * record has since moved out of it keeps its link and reads generically.
 */
function sourceTitles(
  context: MeetingDatedContextData | undefined,
): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const entry of context?.entries ?? []) {
    titles[meetingContextSourceKey(entry)] = entry.title;
  }
  return titles;
}

/**
 * What the previous meeting left open -- and, for a governance manager, where
 * it gets closed (#1245).
 *
 * Going through these is the first real thing a board does, and closing one
 * used to mean leaving the agenda for the Action Items tab, finding the row,
 * and coming back. Mid-meeting that does not happen, so items stayed open.
 *
 * A ticked row stays in the list, struck through, until the tab is left and
 * re-entered: `listCarriedOverActionItemsAction` filters on `status = 'open'`,
 * so re-reading here would make the row vanish under the reader in the one
 * moment when the whole board is looking at it. The Action Items tab reads
 * afresh when it mounts, which is where the two lists meet again.
 *
 * Optimistic, and reverted on failure -- a tick that quietly did nothing is
 * worse than an error, because the meeting moves on believing it closed.
 */
function CarriedOverActionItems({
  items,
  canManage,
  onChanged,
}: {
  items: ActionItem[];
  canManage: boolean;
  onChanged: () => void;
}) {
  // Only what has been ticked in this sitting. Everything the read returned
  // was open, so an absent key means open.
  const [done, setDone] = useState<Record<string, boolean>>({});
  // No pending flag on the boxes: the tick is already on screen, and
  // disabling the list would stop a board closing three items in a row.
  const [, startToggle] = useTransition();

  function toggle(item: ActionItem) {
    const next = !done[item.id];
    setDone((prev) => ({ ...prev, [item.id]: next }));
    startToggle(async () => {
      const outcome = await runAction(
        () => updateActionItemStatusAction(item.id, next ? "done" : "open"),
        {
          success: next ? "Action item marked done." : "Action item reopened.",
          error: "Could not update the action item. Please try again.",
          onSuccess: onChanged,
        },
      );
      if (!outcome.ok) setDone((prev) => ({ ...prev, [item.id]: !next }));
    });
  }

  if (items.length === 0) {
    return <p className="app-muted text-sm">None carried over.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          {/* Read-only governance access sees the list exactly as before. */}
          {canManage && (
            <Checkbox
              className="mt-1"
              checked={done[item.id] ?? false}
              aria-label={item.description}
              onCheckedChange={() => toggle(item)}
            />
          )}
          <span
            className={done[item.id] ? "app-muted line-through" : undefined}
          >
            {item.description}
            <span className="app-muted">
              {" "}
              — {personDisplayName(item.owner)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReadOnlyListSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="app-muted text-sm">None.</p>
      ) : (
        <ul className="app-muted mt-1 list-disc pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaForm({
  agenda,
  sections,
  templateId,
  templateVersionId,
  meetingId,
  datedContext,
  datedContextError,
  feeds,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  agenda: Agenda | null;
  sections: AgendaTemplateSection[];
  templateId: string | null;
  templateVersionId: string | null;
  meetingId: string;
  datedContext: MeetingDatedContextData | undefined;
  datedContextError: string | null;
  feeds: SectionModuleFeeds;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [externalLink, setExternalLink] = useState(agenda?.external_link ?? "");
  const [documentPath, setDocumentPath] = useState(agenda?.document_path ?? "");
  const [bodyText, setBodyText] = useState(agenda?.body_text ?? "");
  const [ongoingItems, setOngoingItems] = useState<
    Record<string, AgendaOngoingItem>
  >(agenda?.ongoing_items ?? {});
  const [newBusiness, setNewBusiness] = useState<string[]>(
    agenda?.new_business ?? [],
  );
  const [parkingLot, setParkingLot] = useState<string[]>(
    agenda?.parking_lot ?? [],
  );
  const [upcomingDates, setUpcomingDates] = useState<AgendaUpcomingDate[]>(
    agenda?.upcoming_dates ?? [],
  );
  const [nextMeetingDate, setNextMeetingDate] = useState(
    agenda?.next_meeting_date ?? "",
  );
  const [nextMeetingTopics, setNextMeetingTopics] = useState(
    agenda?.next_meeting_topics ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Captured once on mount so edits can be compared back to the loaded
  // agenda, regardless of later prop changes (e.g. a background refresh).
  const baselineRef = useRef({
    externalLink: agenda?.external_link ?? "",
    documentPath: agenda?.document_path ?? "",
    bodyText: agenda?.body_text ?? "",
    ongoingItems: agenda?.ongoing_items ?? {},
    newBusiness: agenda?.new_business ?? [],
    parkingLot: agenda?.parking_lot ?? [],
    upcomingDates: agenda?.upcoming_dates ?? [],
    nextMeetingDate: agenda?.next_meeting_date ?? "",
    nextMeetingTopics: agenda?.next_meeting_topics ?? "",
  });

  useEffect(() => {
    const baseline = baselineRef.current;
    const dirty =
      externalLink !== baseline.externalLink ||
      documentPath !== baseline.documentPath ||
      bodyText !== baseline.bodyText ||
      JSON.stringify(ongoingItems) !== JSON.stringify(baseline.ongoingItems) ||
      JSON.stringify(newBusiness) !== JSON.stringify(baseline.newBusiness) ||
      JSON.stringify(parkingLot) !== JSON.stringify(baseline.parkingLot) ||
      JSON.stringify(upcomingDates) !==
        JSON.stringify(baseline.upcomingDates) ||
      nextMeetingDate !== baseline.nextMeetingDate ||
      nextMeetingTopics !== baseline.nextMeetingTopics;
    onDirtyChange?.(dirty);
  }, [
    externalLink,
    documentPath,
    bodyText,
    ongoingItems,
    newBusiness,
    parkingLot,
    upcomingDates,
    nextMeetingDate,
    nextMeetingTopics,
    onDirtyChange,
  ]);

  // Reported dirty state belongs to this mounted form only -- clear it when
  // the form goes away (save, cancel, or a forced discard from the parent),
  // so a stale "dirty" flag can't outlive the component that set it.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Spreads whatever the section already holds rather than rebuilding it from
  // the manual pair: a section whose template version turned it into a sourced
  // one still carries the Updates/Decisions needed text somebody typed under
  // the old version, and editing the Discussion box must not wipe it (#1240).
  function updateOngoingItem(key: string, patch: Partial<AgendaOngoingItem>) {
    setOngoingItems((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  /**
   * Copies one live entry into the agenda's own list. A copy, not a reference:
   * the saved row is what the frozen minutes and the printed export read, and
   * the description stays editable because the board's wording for a date is
   * often not the calendar's.
   */
  function pinEntry(entry: MeetingContextEntry) {
    setUpcomingDates((prev) => [
      ...prev,
      {
        date: meetingContextEntryDay(entry),
        description: entry.title,
        owner: "",
        source_kind: entry.kind,
        source_id: meetingContextSourceId(entry),
      },
    ]);
  }

  const pinnedKeys = new Set(
    upcomingDates
      .filter((item) => item.source_kind && item.source_id)
      .map((item) => `${item.source_kind}:${item.source_id}`),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("externalLink", externalLink);
    formData.set("documentPath", documentPath);
    formData.set("bodyText", bodyText);
    formData.set("templateId", templateId ?? "");
    formData.set("templateVersionId", templateVersionId ?? "");
    formData.set("ongoingItems", JSON.stringify(ongoingItems));
    formData.set("newBusiness", JSON.stringify(newBusiness));
    formData.set("parkingLot", JSON.stringify(parkingLot));
    formData.set("upcomingDates", JSON.stringify(upcomingDates));
    formData.set("nextMeetingDate", nextMeetingDate);
    formData.set("nextMeetingTopics", nextMeetingTopics);

    startTransition(async () => {
      const result = await upsertAgendaAction(meetingId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <DocumentField
          value={{ link: externalLink, path: documentPath }}
          onChange={({ link, path }) => {
            setExternalLink(link);
            setDocumentPath(path);
          }}
          signedUrl={agenda?.document_url ?? null}
          idPrefix="agenda"
          module="governance"
        />

        <div>
          <p className="text-sm font-semibold">Ongoing board items</p>
          <div className="mt-2 flex flex-col gap-3">
            {sections.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No agenda template is configured"
                description="Agenda templates are managed outside the portal; ask an administrator to activate one."
              />
            ) : (
              sections.map((section) => (
                <div
                  key={section.key}
                  className="rounded-md border border-[var(--line)] p-3"
                >
                  <p className="text-sm font-semibold">{section.label}</p>
                  <OngoingTopicsTooltip topics={section.topics} />
                  <div className="mt-3 flex flex-col gap-3">
                    {isSourcedSection(section) ? (
                      <>
                        {/* MODULE FEED SLOT (#1240): the rows this section's
                            source names go here, above the box. Every module
                            arm lives inside SectionModuleFeed rather than
                            restructuring the section. */}
                        <SectionModuleFeed section={section} feeds={feeds} />
                        <Field>
                          <FieldLabel
                            htmlFor={`agenda-discussion-${section.key}`}
                          >
                            Discussion
                          </FieldLabel>
                          <Textarea
                            id={`agenda-discussion-${section.key}`}
                            rows={3}
                            value={ongoingItems[section.key]?.discussion ?? ""}
                            onChange={(event) =>
                              updateOngoingItem(section.key, {
                                discussion: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field>
                          <FieldLabel htmlFor={`agenda-updates-${section.key}`}>
                            Updates
                          </FieldLabel>
                          <Textarea
                            id={`agenda-updates-${section.key}`}
                            rows={3}
                            value={ongoingItems[section.key]?.updates ?? ""}
                            onChange={(event) =>
                              updateOngoingItem(section.key, {
                                updates: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`agenda-decisions-${section.key}`}
                          >
                            Decisions needed
                          </FieldLabel>
                          <Textarea
                            id={`agenda-decisions-${section.key}`}
                            rows={2}
                            value={
                              ongoingItems[section.key]?.decisions_needed ?? ""
                            }
                            onChange={(event) =>
                              updateOngoingItem(section.key, {
                                decisions_needed: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <FreeformListEditor
          label="New business"
          items={newBusiness}
          onChange={setNewBusiness}
        />
        <FreeformListEditor
          label="Parking lot"
          items={parkingLot}
          onChange={setParkingLot}
        />
        <MeetingDatedContext
          context={datedContext}
          loadError={datedContextError}
          pinnedKeys={pinnedKeys}
          onPin={pinEntry}
        />
        <DatedListEditor
          items={upcomingDates}
          onChange={setUpcomingDates}
          sourceTitles={sourceTitles(datedContext)}
        />

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="agenda-next-meeting-date">
              Next meeting date
            </FieldLabel>
            <Input
              id="agenda-next-meeting-date"
              type="date"
              value={nextMeetingDate}
              onChange={(event) => setNextMeetingDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="agenda-next-meeting-topics">
              Primary topics
            </FieldLabel>
            <Input
              id="agenda-next-meeting-topics"
              value={nextMeetingTopics}
              onChange={(event) => setNextMeetingTopics(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="agenda-body">Agenda notes</FieldLabel>
          <Textarea
            id="agenda-body"
            rows={6}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
          />
          {/* Renamed in #1201. This field has been "the minutes" since #408,
              and since #1200 it is not: it is pre-meeting context, and what
              happened belongs in the Minutes tab. Removing it outright is a
              follow-up -- meetings that predate the minutes record still hold
              their only account of themselves here. */}
          <FieldDescription>
            Context to have in front of the board before the meeting. What
            actually happened goes in the Minutes tab.
          </FieldDescription>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save agenda"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

type AgendaTabProps = {
  meetingId: string;
  meetingDate: string;
  /** The meeting's type, which decides the agenda's shape (#1623). */
  meetingType: string;
  /** The event the meeting is linked to, if any (#1622). */
  eventId: string | null;
  mode: "view" | "edit";
  canManage: boolean;
  minutesApprovedAt: string | null;
  onViewActionItems: () => void;
  onViewDecisions: () => void;
  onExitEdit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Told whether the agenda can be edited at all, so the card can drop its
   * pencil for an agenda written in the other shape. A callback rather than a
   * prop because only this component has read the row.
   */
  onReadOnlyChange?: (readOnly: boolean) => void;
};

/** What a governance manager is told about an agenda in the other shape. */
function shapeMismatchNote(format: AgendaFormat): string {
  return format === "board"
    ? "This agenda was written in the board format, which only board meetings use. It is kept as it was and can no longer be edited."
    : "This agenda was written as a list of items before this became a board meeting. It is kept as it was and can no longer be edited.";
}

/**
 * Whether this agenda is filled from the meeting's linked event (#1624): a
 * committee meeting with an event, for someone who may write the agenda.
 * Board meetings pull events through their own feed instead.
 */
function fillsFromEvent(props: {
  meetingType: string;
  eventId: string | null;
  canManage: boolean;
}): boolean {
  return (
    props.canManage && props.meetingType === "committee" && !!props.eventId
  );
}

/**
 * Loads the agenda, pre-filling it from the linked event first when there is
 * none yet (#1624). Re-read after the pre-fill whatever it reported, so a
 * second tab that won the race to create the row is shown rather than an empty
 * agenda; a failed pre-fill leaves the agenda empty, and "Refresh from event"
 * is where its error would surface.
 */
async function loadAgenda(meetingId: string, prefill: boolean) {
  const first = await getAgendaAction(meetingId);
  if (!prefill || "error" in first || first.data) return first;
  await prefillAgendaFromEventAction(meetingId);
  return getAgendaAction(meetingId);
}

/**
 * The agenda tab (#1623): a board meeting gets the structured board agenda,
 * every other type a simple list of items. An agenda already written in the
 * other shape -- the meeting's type changed after, or it is a committee meeting
 * from before #1623 -- keeps rendering in its own shape, read-only, and is
 * never converted.
 */
export function AgendaTab({ onReadOnlyChange, ...props }: AgendaTabProps) {
  const {
    data: agenda,
    loadError,
    refresh: refreshAgenda,
  } = useTabData<Agenda | null>(
    () => loadAgenda(props.meetingId, fillsFromEvent(props)),
    [props.meetingId],
  );
  const expected = agendaFormatForMeetingType(props.meetingType);
  const format = agenda?.format ?? expected;
  const readOnly = format !== expected;

  useEffect(() => {
    onReadOnlyChange?.(readOnly);
  }, [readOnly, onReadOnlyChange]);

  if (agenda === undefined) {
    return <TabLoadingSkeleton />;
  }

  const body = {
    ...props,
    agenda,
    loadError,
    refreshAgenda,
    readOnly,
    fillsFromEvent: fillsFromEvent(props),
  };

  return (
    <div className="flex flex-col gap-6">
      {readOnly && props.canManage && (
        <Alert>
          <AlertDescription>{shapeMismatchNote(format)}</AlertDescription>
        </Alert>
      )}
      {format === "simple" ? (
        <SimpleAgenda {...body} />
      ) : (
        <BoardAgenda {...body} />
      )}
    </div>
  );
}

export type AgendaBodyProps = Omit<
  AgendaTabProps,
  "meetingType" | "eventId" | "onReadOnlyChange"
> & {
  agenda: Agenda | null;
  loadError: string | null;
  refreshAgenda: () => void;
  /** Written in the other shape: render it, never offer to edit it. */
  readOnly: boolean;
  /** A committee meeting linked to an event (#1624); see `fillsFromEvent`. */
  fillsFromEvent: boolean;
};

function BoardAgenda({
  meetingId,
  meetingDate,
  mode,
  canManage,
  minutesApprovedAt,
  onViewActionItems,
  onViewDecisions,
  onExitEdit,
  onDirtyChange,
  agenda,
  loadError,
  refreshAgenda,
  readOnly,
}: AgendaBodyProps) {
  const router = useRouter();
  const { data: templates } = useTabData<ActiveAgendaTemplate[]>(
    () => listActiveAgendaTemplatesAction(),
    [meetingId],
  );
  // Resolved here rather than after the reads below, because one of them is
  // gated on it: a template with no events-sourced section must not pay for the
  // events feed. Plain derivation from data two hooks already hold, so it costs
  // nothing and keeps the hook order fixed.
  const activeTemplate = templates?.[0] ?? null;
  const sections = agenda?.template_sections.length
    ? agenda.template_sections
    : (activeTemplate?.sections ?? []);
  const hasEventsSection = sections.some(
    (section) => agendaSectionSource(section)?.kind === "events",
  );
  const { data: carriedOverItems } = useTabData<ActionItem[]>(
    () => listCarriedOverActionItemsAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );
  const { data: createdItems } = useTabData<ActionItem[]>(
    () => listActionItemsAction(meetingId),
    [meetingId],
  );
  const { data: decisions } = useTabData<Decision[]>(
    () => listDecisionsAction(meetingId),
    [meetingId],
  );
  const { data: previousMinutes } = useTabData<PreviousMeetingMinutes | null>(
    () => getPreviousMeetingMinutesAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );
  // Its own read rather than part of the agenda's: this is live reference
  // material, and it must stay right when the agenda row does not move.
  const { data: datedContext, loadError: datedContextError } =
    useTabData<MeetingDatedContextData>(async () => {
      const result = await listMeetingDatedContextAction(meetingId);
      return "error" in result ? { error: result.error.message } : result;
    }, [meetingId]);
  // The records behind each standing section (#1224). One read for the whole
  // page, not one per section: seven sections times two sources would be a
  // page that fetches fourteen times to show a reference list.
  const { data: topicContext } = useTabData<MeetingTopicContext>(async () => {
    const result = await getMeetingTopicContextAction(meetingId);
    return "error" in result ? { error: result.error.message } : result;
  }, [meetingId]);
  // The Events section's own rows (#1241). Read once for the tab and handed to
  // both the form and the read view, which show the same feed: the section is
  // the same section whether or not somebody is typing in its Discussion box.
  const { data: eventsFeed, loadError: eventsFeedError } =
    useTabData<AgendaEventsFeedData>(
      () => listAgendaEventsAction(meetingId, meetingDate),
      [meetingId, meetingDate],
      hasEventsSection,
    );
  // The calendar-sourced sections' rows (#1242). One read per such section --
  // two on version 2's template -- because what separates Community &
  // Partnerships from Marketing & Social is the category keys on the section's
  // own source, so one query cannot answer for both. Keyed by section key,
  // since the form and the read view each hand a section its own feed.
  const calendarSections = sections
    .map((section) => ({
      key: section.key,
      source: agendaSectionSource(section),
    }))
    .filter(
      (entry): entry is { key: string; source: CalendarSectionSource } =>
        entry.source?.kind === "calendar",
    );
  // `sections` is a fresh array on every render, and the sources are what
  // actually decide the reads -- so the dependency is their text, not theirs.
  const calendarSectionsKey = JSON.stringify(calendarSections);
  const { data: calendarFeeds, loadError: calendarFeedsError } = useTabData<
    Record<string, AgendaCalendarFeedData>
  >(
    async () => {
      const results = await Promise.all(
        calendarSections.map(
          async (entry) =>
            [
              entry.key,
              await listAgendaCalendarItemsAction(
                meetingId,
                meetingDate,
                entry.source,
              ),
            ] as const,
        ),
      );
      const feeds: Record<string, AgendaCalendarFeedData> = {};
      for (const [key, result] of results) {
        // A refusal is about the caller, not about one section, so it fails
        // the read rather than leaving the other section silently short. A
        // module that is merely off comes back inside `data` as `unavailable`.
        if ("error" in result) return { error: result.error };
        feeds[key] = result.data;
      }
      return { data: feeds };
    },
    [meetingId, meetingDate, calendarSectionsKey],
    calendarSections.length > 0,
  );
  // The relationships half of Community & Partnerships. Not part of the
  // calendar read: it is a different module under a different order, and it
  // has no window -- an open partnership is open whenever the board meets.
  const hasPartnershipsSection = sections.some(sectionShowsPartnerships);
  const { data: partnershipsFeed, loadError: partnershipsFeedError } =
    useTabData<AgendaPartnershipsFeedData>(
      () => listOpenPartnershipsAction(),
      [meetingId],
      hasPartnershipsSection,
    );
  const feeds: SectionModuleFeeds = {
    eventsFeed,
    eventsFeedError,
    calendarFeeds,
    calendarFeedsError,
    partnershipsFeed,
    partnershipsFeedError,
  };

  const templateId = agenda?.template_id ?? activeTemplate?.id ?? null;
  const templateVersionId =
    agenda?.template_version_id ?? activeTemplate?.version_id ?? null;

  // Both branches below sit inside it, so a "Next 30 days" row opens over the
  // agenda instead of navigating off it (#1225) -- while writing the agenda as
  // much as while reading it, since deciding whether to pin a date is exactly
  // when somebody wants to look at the record. No host: the agenda has no
  // quick-reference panel to replace, on a phone or anywhere else.
  const preview = (body: ReactNode) => (
    <RecordPreviewProvider
      loaders={MEETING_RECORD_PREVIEW_LOADERS}
      forbiddenKinds={forbiddenPreviewKinds(datedContext)}
    >
      {body}
    </RecordPreviewProvider>
  );

  if (mode === "edit" && !readOnly) {
    return preview(
      <AgendaForm
        agenda={agenda}
        sections={sections}
        templateId={templateId}
        templateVersionId={templateVersionId}
        meetingId={meetingId}
        datedContext={datedContext}
        datedContextError={datedContextError}
        feeds={feeds}
        onSaved={() => {
          onExitEdit();
          refreshAgenda();
        }}
        onCancel={onExitEdit}
        onDirtyChange={onDirtyChange}
      />,
    );
  }

  return preview(
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!agenda ? (
        <EmptyState
          title="No agenda added yet"
          description={
            canManage
              ? "Write it with the Edit agenda (pencil) button above; it starts from the active agenda template."
              : "The agenda appears here once a governance manager writes it."
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <AgendaExport
              input={{
                meetingDate,
                agenda,
                sections,
                openingChecklist: OPENING_CHECKLIST,
                carriedOverItems: carriedOverItems ?? [],
                createdItems: createdItems ?? [],
                decisions: decisions ?? [],
                datedContext,
                topicContext,
                sourcedSections: sourcedSectionFeeds(sections, feeds),
              }}
            />
          </div>

          <AgendaOpening
            meetingId={meetingId}
            previousMinutes={previousMinutes}
            minutesApprovedAt={minutesApprovedAt}
            canManage={canManage}
            onApproved={() => router.refresh()}
          />

          <FieldGroup>
            <ReadOnlyField label="Document" htmlFor="agenda-document-view">
              <DocumentPreview
                link={agenda.external_link}
                path={agenda.document_path}
                url={agenda.document_url}
              />
            </ReadOnlyField>
          </FieldGroup>

          <ReadOnlySection
            title="Action items from previous meeting"
            onViewAll={onViewActionItems}
          >
            <CarriedOverActionItems
              items={carriedOverItems ?? []}
              canManage={canManage}
              onChanged={() => router.refresh()}
            />
          </ReadOnlySection>

          <div>
            <p className="text-sm font-semibold">Ongoing board items</p>
            <div className="mt-2 flex flex-col gap-3">
              {sections.length === 0 ? (
                <EmptyState
                  className="py-4"
                  title="No agenda template is configured"
                  description="Agenda templates are managed outside the portal; ask an administrator to activate one."
                />
              ) : (
                sections.map((section) => {
                  const value = agenda.ongoing_items[section.key];
                  return (
                    <div
                      key={section.key}
                      className="rounded-md border border-[var(--line)] p-3"
                    >
                      <p className="text-sm font-semibold">{section.label}</p>
                      <OngoingTopicsTooltip topics={section.topics} />
                      {isSourcedSection(section) ? (
                        <div className="mt-2 flex flex-col gap-2">
                          {/* MODULE FEED SLOT (#1240): see the matching slot
                              in AgendaForm above -- the same feed, since the
                              section is the same section on both sides of the
                              tab. */}
                          <SectionModuleFeed section={section} feeds={feeds} />
                          <OngoingItemBlock
                            label="Discussion"
                            text={value?.discussion || "—"}
                          />
                          {/* Leftovers, shown only when they hold something.
                              A template revised from manual to sourced leaves
                              the old pair in the row, and the form no longer
                              offers boxes for it -- so this is the only place
                              text written for this meeting is still readable.
                              Hiding it would be dropping it. */}
                          {(value?.updates || value?.decisions_needed) && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {value?.updates && (
                                <OngoingItemBlock
                                  label="Updates"
                                  text={value.updates}
                                />
                              )}
                              {value?.decisions_needed && (
                                <OngoingItemBlock
                                  label="Decisions needed"
                                  text={value.decisions_needed}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <OngoingItemBlock
                              label="Updates"
                              text={value?.updates || "—"}
                            />
                            <OngoingItemBlock
                              label="Decisions needed"
                              text={value?.decisions_needed || "—"}
                            />
                          </div>
                          {/* The mirror case: a section revised back from
                              sourced to manual. */}
                          {value?.discussion && (
                            <OngoingItemBlock
                              label="Discussion"
                              text={value.discussion}
                            />
                          )}
                        </div>
                      )}
                      {/* Beside the sentence being written about it, rather
                          than in a panel two columns away. The Events section
                          gets no calendar block here: the agenda already has
                          its own "Next 30 days" further down the page. */}
                      <TopicContext
                        itemKey={`section:${section.key}`}
                        context={topicContext}
                        omitSources={sectionFeedSources(section)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <AgendaDecisions
            decisions={decisions ?? []}
            onViewAll={onViewDecisions}
          />

          <ReadOnlyListSection
            title="New business"
            items={agenda.new_business}
          />

          <MeetingDatedContext
            context={datedContext}
            loadError={datedContextError}
          />

          <div>
            <p className="text-sm font-semibold">Upcoming dates</p>
            {agenda.upcoming_dates.length === 0 ? (
              <p className="app-muted text-sm">None scheduled.</p>
            ) : (
              // Sticky header only: the agenda's upcoming dates read in
              // the order the minute-taker entered them.
              <Table stickyHeader="page">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event / deadline</TableHead>
                    <TableHead>Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agenda.upcoming_dates.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="app-muted">
                        {formatCalendarDate(item.date)}
                      </TableCell>
                      <TableCell>{item.description || "—"}</TableCell>
                      <TableCell className="app-muted">
                        {item.owner || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <AgendaCreatedActionItems
            items={createdItems ?? []}
            onViewAll={onViewActionItems}
          />

          <ReadOnlyListSection title="Parking lot" items={agenda.parking_lot} />

          <div>
            <p className="text-sm font-semibold">Next meeting</p>
            <p className="app-muted text-sm">
              {formatCalendarDate(agenda.next_meeting_date)}
              {agenda.next_meeting_topics
                ? ` — ${agenda.next_meeting_topics}`
                : ""}
            </p>
          </div>

          <FieldGroup>
            {/* Still `whitespace-pre-wrap`, not `MarkdownText`. The agenda is
                a plan someone reads back while editing it, and #1201 scoped
                rendering to the three surfaces that present a finished
                document. Widening it here is a follow-up. */}
            <ReadOnlyField label="Agenda notes" htmlFor="agenda-body-view">
              <span className="whitespace-pre-wrap">
                {agenda.body_text || "—"}
              </span>
            </ReadOnlyField>
          </FieldGroup>
        </>
      )}
    </div>,
  );
}
