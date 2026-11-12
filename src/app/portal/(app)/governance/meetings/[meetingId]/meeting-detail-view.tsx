"use client";

import { CardEditButton } from "@/components/portal/card-edit-button";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";

import type { MeetingRow } from "../meeting-badges";
import { MeetingStatusBadge, MeetingTypeBadge } from "../meeting-badges";
import { AttendeesTab } from "../attendees-tab";
import { AgendaTab } from "../agenda-tab";
import { ActionItemsTab } from "../action-items-tab";
import { DecisionsTab } from "../decisions-tab";
import { ResolutionsTab } from "../resolutions-tab";
import { MinutesTab, type MinutesLeaveGuard } from "../minutes-tab";
import { MeetingDetailsCards } from "./meeting-details-cards";
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatDateTime } from "@/lib/format";

type TabValue = "overview" | "agenda" | "minutes";

function isTabValue(value: string): value is TabValue {
  return value === "overview" || value === "agenda" || value === "minutes";
}

/**
 * Sections inside the overview tab that something outside this component may
 * link to by hash. An allow-list rather than any id: the hash is attacker-
 * controlled input, and scrolling to an arbitrary element is a small but free
 * way to point someone at the wrong part of a record.
 */
const OVERVIEW_SECTION_IDS = ["action-items-section", "decisions-section"];

function SectionCard({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id}>
      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

/**
 * Agenda gets its own card-level pencil toggle: AgendaTab's edit mode is a
 * self-managed form with its own save/cancel, so the card only flips the mode.
 */
function AgendaCard({
  meeting,
  canManage,
  mode,
  onModeChange,
  onDirtyChange,
  onViewActionItems,
  onViewDecisions,
}: {
  meeting: MeetingRow;
  canManage: boolean;
  mode: "view" | "edit";
  onModeChange: (mode: "view" | "edit") => void;
  onDirtyChange: (dirty: boolean) => void;
  onViewActionItems: () => void;
  onViewDecisions: () => void;
}) {
  // An agenda written in the other shape (#1623) is shown, never edited.
  const [readOnly, setReadOnly] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Agenda
        </CardTitle>
        {canManage && !readOnly && (
          <CardEditButton
            label={"Edit agenda"}
            editing={mode !== "view"}
            onEdit={() => onModeChange("edit")}
          />
        )}
      </CardHeader>
      <CardContent>
        <AgendaTab
          meetingId={meeting.id}
          meetingDate={meeting.meeting_date}
          meetingType={meeting.meeting_type}
          eventId={meeting.event_id ?? null}
          mode={mode}
          canManage={canManage}
          minutesApprovedAt={meeting.minutes_approved_at}
          onViewActionItems={onViewActionItems}
          onViewDecisions={onViewDecisions}
          onExitEdit={() => onModeChange("view")}
          onDirtyChange={onDirtyChange}
          onReadOnlyChange={setReadOnly}
        />
      </CardContent>
    </Card>
  );
}

export function MeetingDetailView({
  meeting,
  canManage,
}: {
  meeting: MeetingRow;
  canManage: boolean;
}) {
  // In the URL rather than in state, so Back returns to the previous tab
  // instead of leaving the meeting, and a link can point at the agenda.
  const [tab, setTab] = useUrlTabState<TabValue>({
    fallback: "overview",
    isValid: isTabValue,
  });
  const [agendaMode, setAgendaMode] = useState<"view" | "edit">("view");
  const [agendaDirty, setAgendaDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabValue | null>(null);
  // Which unsaved thing the discard confirm is about. The agenda's behaviour is
  // unchanged; minutes only ever reach it after a save has actually failed.
  const [discardSubject, setDiscardSubject] = useState<
    "this agenda" | "these minutes"
  >("this agenda");
  // Published by MinutesTab while its panel is mounted and writable, so a tab
  // switch can save before Base UI unmounts the textarea being typed into.
  const minutesGuardRef = useRef<MinutesLeaveGuard | null>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const hashHandledRef = useRef(false);

  // A link from outside can name an overview section in the hash -- how the
  // daily task digest (#488) lands someone on the item it emailed them about
  // rather than at the top of the meeting.
  //
  // Declared before the scroll effect below on purpose: on mount, effects run
  // in order, so this one queues the section and that one performs the scroll,
  // including the case where the hash arrives with ?tab=overview already set
  // and `setTab` therefore changes nothing for it to react to.
  //
  // Once only. The hash stays in the URL after the first scroll, and re-running
  // this on a later render would yank the page back while someone is reading.
  useEffect(() => {
    if (hashHandledRef.current) return;
    hashHandledRef.current = true;

    const section = window.location.hash.slice(1);
    if (!OVERVIEW_SECTION_IDS.includes(section)) return;

    pendingScrollRef.current = section;
    setTab("overview");
  }, [setTab]);

  // Cross-tab links (agenda -> action items/decisions) scroll after the
  // overview panel has re-mounted.
  useEffect(() => {
    if (tab !== "overview" || !pendingScrollRef.current) return;
    document
      .getElementById(pendingScrollRef.current)
      ?.scrollIntoView({ behavior: "smooth" });
    pendingScrollRef.current = null;
  }, [tab]);

  // Through `handleTabChange`, not `setTab`: since #1201 the Minutes tab links
  // here too, and Base UI unmounts its panel on the way out. That path is
  // where the minutes' autosave is flushed and where a save that failed turns
  // into the discard confirm, so a link that bypassed it would be the one way
  // out of the minutes that still loses a sentence.
  function goToOverviewSection(id: string) {
    pendingScrollRef.current = id;
    handleTabChange("overview");
  }

  // Base UI's Tabs unmounts an inactive TabsContent's subtree by default, so
  // switching away from Agenda while its form is mid-edit would otherwise
  // silently discard whatever the user typed. Gate the switch on a confirm
  // dialog when that's the case, mirroring the "Discard changes?" pattern
  // used for the bylaws editor (edit-bylaws-modal.tsx).
  function handleTabChange(value: string) {
    const next = value as TabValue;
    if (tab === "agenda" && agendaMode === "edit" && agendaDirty) {
      setDiscardSubject("this agenda");
      setPendingTab(next);
      return;
    }
    if (tab === "minutes" && minutesGuardRef.current) {
      void leaveMinutes(next);
      return;
    }
    setTab(next);
  }

  /**
   * The minutes save themselves, so leaving is normally free -- but Base UI
   * unmounts this panel on the way out, and the unmount flush cannot report
   * whether it landed. So the switch waits for the save it would otherwise
   * fire blind, and only asks about discarding when that save actually failed.
   */
  async function leaveMinutes(next: TabValue) {
    const saved = (await minutesGuardRef.current?.flush()) ?? true;
    if (saved) {
      setTab(next);
      return;
    }
    setDiscardSubject("these minutes");
    setPendingTab(next);
  }

  /**
   * Staying put. The queued scroll goes with it -- it was set by the link that
   * asked to leave, and leaving it armed would yank the page to that section
   * the next time they switched to Overview for their own reasons.
   */
  function cancelPendingTab() {
    setPendingTab(null);
    pendingScrollRef.current = null;
  }

  function confirmDiscard() {
    setAgendaMode("view");
    setAgendaDirty(false);
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }

  const listMode = canManage ? "edit" : "view";

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {formatDateTime(meeting.meeting_date)}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MeetingTypeBadge type={meeting.meeting_type} />
          <MeetingStatusBadge status={meeting.status} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
        <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="minutes">Minutes</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <div className="flex flex-col gap-6">
            <MeetingDetailsCards meeting={meeting} canManage={canManage} />

            <SectionCard title="Attendees">
              <AttendeesTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>

            <SectionCard id="action-items-section" title="Action Items">
              <ActionItemsTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>

            <SectionCard id="decisions-section" title="Decisions">
              <DecisionsTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date.slice(0, 10)}
                mode={listMode}
              />
            </SectionCard>

            <SectionCard title="Resolutions">
              <ResolutionsTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaCard
            meeting={meeting}
            canManage={canManage}
            mode={agendaMode}
            onModeChange={setAgendaMode}
            onDirtyChange={setAgendaDirty}
            onViewActionItems={() =>
              goToOverviewSection("action-items-section")
            }
            onViewDecisions={() => goToOverviewSection("decisions-section")}
          />
        </TabsContent>

        <TabsContent value="minutes" className="mt-4">
          <SectionCard title="Minutes">
            <MinutesTab
              meetingId={meeting.id}
              meetingDate={meeting.meeting_date}
              canManage={canManage}
              onViewDecisions={() => goToOverviewSection("decisions-section")}
              guardRef={minutesGuardRef}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(next) => !next && cancelPendingTab()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to {discardSubject}. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingTab}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
