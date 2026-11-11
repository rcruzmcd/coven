"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Program } from "../../programs/actions";
import type { EventRow } from "../event-badges";
import { StatusBadge, VisibilityBadge } from "../event-badges";
import { EventTimingBadge } from "../event-timing-badge";
import {
  FORM_ID_PREFIX,
  LOCKED_ON_REPORT_SUBMIT_TABS,
  TAB_CONFIG,
  cardTitle,
  type EventGroup,
  type TabConfigEntry,
  type TabRenderContext,
  type TabValue,
} from "../event-tabs-config";
import { useFormTabState, type FormTabCallbacks } from "../use-form-tab-state";
import { TabRefreshProvider, useTabRefresh } from "@/hooks/use-tab-refresh";
import {
  EventSharedDataProvider,
  useEventSharedData,
} from "../event-shared-data";
import { EventDateProvider } from "../event-date-defaults";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { DeleteEventButton } from "./delete-event-button";
import type { DeviceClass } from "@/proxy";
import { EventSectionRail } from "./event-section-rail";
import {
  EventSocialContentProvider,
  type EventSocialContent,
} from "../social-content-tab";

const NOOP_CALLBACKS: FormTabCallbacks = {
  onPendingChange: () => {},
  onDirtyChange: () => {},
  registerHandle: () => {},
};

const NOOP_FORM_CALLBACKS = Object.fromEntries(
  TAB_CONFIG.map((entry) => [entry.value, NOOP_CALLBACKS]),
) as Record<TabValue, FormTabCallbacks>;

// Tabs whose edit UI renders its own save/cancel controls, so the card only
// toggles the mode and doesn't add a footer.
const SELF_MANAGED_EDIT_TABS: ReadonlySet<TabValue> = new Set([
  "attendance",
  "giveaway",
]);

function entryFor(tab: TabValue): TabConfigEntry {
  return TAB_CONFIG.find((entry) => entry.value === tab)!;
}

/**
 * Card wrapper for a tab that toggles between view and inline edit via a
 * pencil action, replacing the old full-event edit sheet.
 */
function EditableTabCard({
  entry,
  title,
  event,
  programs,
  canManage,
}: {
  entry: TabConfigEntry;
  title: string;
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  /** Unused: a form card has no settings dialog (#1777). */
  canManageSettings?: boolean;
}) {
  const { notify } = useTabRefresh<TabValue>();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const formTabs = useMemo(() => [entry.value], [entry.value]);
  const formTabState = useFormTabState(formTabs);
  const pending = formTabState.pending[entry.value] ?? false;

  const shared = useEventSharedData();

  const formId = `${FORM_ID_PREFIX}-${entry.value}-${event.id}`;
  const ctx: TabRenderContext = {
    event,
    programs,
    mode,
    shared,
    formId: (tabValue) => `${FORM_ID_PREFIX}-${tabValue}-${event.id}`,
    onSaved: () => {
      setMode("view");
      // Same channel a plain card's toolbar uses: the shared reads another
      // card depends on are the provider's to invalidate, not this card's to
      // know about.
      notify(entry.value);
    },
    formCallbacks: { ...NOOP_FORM_CALLBACKS, ...formTabState.callbacks },
  };

  const locked =
    LOCKED_ON_REPORT_SUBMIT_TABS.has(entry.value) &&
    event.report_status === "submitted";
  const canEdit = canManage && !locked;
  const selfManaged = SELF_MANAGED_EDIT_TABS.has(entry.value);

  function cancel() {
    formTabState.discardAll();
    setMode("view");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        {canEdit && mode === "view" && (
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${title.toLowerCase()}`}
                    onClick={() => setMode("edit")}
                  />
                }
              >
                <Pencil />
              </TooltipTrigger>
              <TooltipContent>{`Edit ${title.toLowerCase()}`}</TooltipContent>
            </Tooltip>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{entry.render(ctx)}</CardContent>
      {!selfManaged && mode === "edit" && (
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * A plain tab's create actions, in its own card header.
 *
 * These used to be merged into one strip beside the phase tabs, which put
 * every card's actions in a single row -- seven of them on "During" -- with
 * nothing tying a button to the card it belonged to, and left the operator
 * scrolling back to the top of a long phase to reach any of them.
 *
 * Returns `CardAction` as its root so the div stays a direct grid child of
 * `CardHeader`, which is what positions it. `EditableTabCard` spends its one
 * `CardAction` on the edit pencil, so no `kind: "form"` tab may define
 * `toolbarActions`.
 */
function TabCardActions({
  entry,
  event,
  canManage,
  canManageSettings,
}: {
  entry: TabConfigEntry;
  event: EventRow;
  canManage: boolean;
  canManageSettings: boolean;
}) {
  const { notify } = useTabRefresh<TabValue>();
  const toolbar = canManage && entry.toolbarActions;
  // #1777. The submitted-report lock the form cards have.
  const settings =
    canManageSettings &&
    event.report_status !== "submitted" &&
    entry.settingsActions;
  if (!toolbar && !settings) return null;
  const onSaved = () => notify(entry.value);

  return (
    <CardAction className="flex flex-wrap items-center justify-end gap-2">
      {toolbar &&
        toolbar({ eventId: event.id, eventName: event.name, onSaved })}
      {settings && settings({ event, onSaved })}
    </CardAction>
  );
}

/**
 * Card wrapper for list-style tabs whose add/manage controls are shown
 * based on the user's events permission rather than an edit toggle.
 */
function PlainTabCard({
  entry,
  title,
  event,
  programs,
  canManage,
  canManageSettings = false,
}: {
  entry: TabConfigEntry;
  title: string;
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  canManageSettings?: boolean;
}) {
  const shared = useEventSharedData();

  const ctx: TabRenderContext = {
    event,
    programs,
    mode: canManage ? "edit" : "view",
    shared,
    formId: (tabValue) => `${FORM_ID_PREFIX}-${tabValue}-${event.id}`,
    onSaved: () => {},
    formCallbacks: NOOP_FORM_CALLBACKS,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        <TabCardActions
          entry={entry}
          event={event}
          canManage={canManage}
          canManageSettings={canManageSettings}
        />
      </CardHeader>
      <CardContent>{entry.render(ctx)}</CardContent>
    </Card>
  );
}

export function EventDetailView(props: {
  /** Which shape the rail takes, decided on the server (#1079, #1093). */
  device: DeviceClass;
  event: EventRow;
  programs: Program[];
  /**
   * `events: manage`, which deleting an event still takes (#1687). What each
   * card may edit is `EventSection.canManage`, since a guest's grant may
   * manage some areas and not others (#1688).
   */
  canDelete: boolean;
  deleteBlockers: string[];
  /**
   * The event's public page as a staff preview (#1764), null for a reader
   * without `events: manage` or a tenant with no public site to open it on.
   */
  previewUrl?: string | null;
  /**
   * The rail's groups and cards for this reader, resolved from the permission
   * map on the server (#903) rather than from the module-level constant this
   * file used to import: the map is the server's to read, and the Finance and
   * Inventory cards have to be gone before the markup reaches the browser, not
   * hidden in it.
   */
  groups: EventGroup[];
  /** The card to open, already resolved against `groups` on the server. */
  initialCard: TabValue;
  cardTasks?: Partial<Record<TabValue, string[]>>;
  /** The Social content section's posts (#1795); null when it is not shown. */
  social?: EventSocialContent | null;
  /** The render's instant, for the Upcoming/Today/Past badge (#1609). */
  nowIso: string;
}) {
  const { social = null, ...rest } = props;
  return (
    <TabRefreshProvider>
      <EventSocialContentProvider value={social}>
        <EventDetailContent {...rest} />
      </EventSocialContentProvider>
    </TabRefreshProvider>
  );
}

function EventDetailContent({
  device,
  event,
  programs,
  canDelete,
  deleteBlockers,
  previewUrl,
  groups,
  initialCard,
  cardTasks,
  nowIso,
}: {
  device: DeviceClass;
  event: EventRow;
  programs: Program[];
  /**
   * `events: manage`, which deleting an event still takes (#1687). What each
   * card may edit is `EventSection.canManage`, since a guest's grant may
   * manage some areas and not others (#1688).
   */
  canDelete: boolean;
  deleteBlockers: string[];
  previewUrl?: string | null;
  groups: EventGroup[];
  initialCard: TabValue;
  cardTasks?: Partial<Record<TabValue, string[]>>;
  nowIso: string;
}) {
  // One parameter, and it is the one every deep link in the app already writes
  // -- the notification bell, the outstanding-tasks sheet, attention-items and
  // the ops report all link with `?tab=<card>`. #958 needed three (`?phase=`
  // and `?card=` for the two tab levels, `?tab=` to enter by); with the rail
  // there is one thing selected, so there is one thing in the URL. The old
  // pair is still read on the way in -- `page.tsx` resolves `initialCard` from
  // whichever of the three a bookmark carries -- and dropped on the way out.
  //
  // Validated against `groups` rather than the whole catalog: since #903 a
  // reader without Finance has no Expenses card, and a deep link to one has to
  // fall back rather than render an empty card.
  const sections = groups.flatMap((group) => group.tabs);
  const visible = (value: string): value is TabValue =>
    sections.some((section) => section.value === value);
  const [card, setCard] = useUrlTabState<TabValue>({
    param: "tab",
    fallback: initialCard,
    isValid: visible,
  });

  const entry = entryFor(card);
  const title = cardTitle(card, entry.label);
  // Per card since #1688: a guest's grant may manage some areas of the event
  // and not others.
  const section = sections.find((row) => row.value === card);
  const canManageCard = section?.canManage ?? false;
  const editToggle = entry.kind === "form" || SELF_MANAGED_EDIT_TABS.has(card);
  const TabCard = editToggle ? EditableTabCard : PlainTabCard;

  return (
    // Every date field on a card below opens on this event's date rather than
    // on today, since that is the day the thing being recorded happened. See
    // EventDateProvider for the two limits on that.
    <EventDateProvider startsAt={event.starts_at} endsAt={event.ends_at}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="w-fit">
            <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
              {event.name}
            </h1>
            <div className="rainbow-accent mt-3 w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <EventTimingBadge event={event} nowIso={nowIso} />
            <VisibilityBadge visibility={event.visibility} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {previewUrl && (
            /* #1764. A new tab, so the portal stays where it was; what
               registers there is a test registration. */
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Eye aria-hidden />
              Preview
              <span className="sr-only"> (opens in a new tab)</span>
            </Button>
          )}
          {canDelete && (
            <DeleteEventButton
              eventId={event.id}
              eventName={event.name}
              blockers={deleteBlockers}
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <EventSectionRail
          device={device}
          groups={groups}
          current={card}
          currentTitle={title}
          cardTasks={cardTasks}
          // `phase` and `card` are #958's parameters. A bookmark carrying them
          // still opens the right section, and the first thing the reader does
          // here clears them, so the URL they go on to share names only `tab`.
          onSelect={(next) => setCard(next, { phase: null, card: null })}
        />

        {/* One provider above the single card on screen, rather than the one
            per phase #958 relied on Base UI to unmount. It takes this card's
            reads and keeps every read it has been asked for -- see
            EventSharedDataProvider. */}
        <EventSharedDataProvider
          eventId={event.id}
          resources={entry.sharedData ?? []}
        >
          <TabCard
            // Two plain cards in a row would otherwise reuse one instance and
            // carry the previous card's edit mode and scroll state into the
            // next one.
            key={card}
            entry={entry}
            title={title}
            event={event}
            programs={programs}
            canManage={canManageCard}
            canManageSettings={section?.canManageSettings ?? false}
          />
        </EventSharedDataProvider>
      </div>
    </EventDateProvider>
  );
}
