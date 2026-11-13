"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventIncidentAction,
  listEventIncidentsAction,
  type EventIncident,
} from "./incidents-actions";
import { SeverityBadge } from "./event-badges";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

/**
 * Severity worst-last, so sorting descending puts the serious ones on top.
 * Alphabetical happens to agree today, but the order that matters here is the
 * one `parseIncidentForm` accepts, not the one the words fall into.
 */
const SEVERITY_ORDER = ["minor", "moderate", "serious"];

export function IncidentsTab({
  eventId,
  mode,
}: {
  eventId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [incidents, setIncidents] = useState<EventIncident[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const load = useCallback(() => {
    listEventIncidentsAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setIncidents(result.data);
      }
    });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refresh = useCallback(() => {
    load();
    router.refresh();
  }, [load, router]);

  useRegisterTabRefresh<TabValue>("incidents", refresh);

  const handleDelete = useCallback(
    (id: string) => {
      startDeleteTransition(async () => {
        await deleteEventIncidentAction(id);
        refresh();
      });
    },
    [refresh],
  );

  const columns = useMemo<PortalDataTableColumn<EventIncident>[]>(
    () => [
      {
        key: "occurred_at",
        label: "When",
        sortValue: (incident) => incident.occurred_at,
        cellClassName: "app-muted whitespace-nowrap",
        render: (incident) => formatDateTime(incident.occurred_at),
      },
      {
        key: "severity",
        label: "Severity",
        sortValue: (incident) => SEVERITY_ORDER.indexOf(incident.severity),
        render: (incident) => <SeverityBadge severity={incident.severity} />,
      },
      {
        key: "description",
        label: "Description",
        sortValue: (incident) => incident.description,
        cellClassName: "whitespace-normal",
        render: (incident) => (
          <MarkdownText>{incident.description}</MarkdownText>
        ),
      },
      ...(mode === "edit"
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right",
              render: (incident: EventIncident) => (
                <ConfirmDeleteButton
                  label="Remove incident"
                  title="Remove this incident?"
                  description="This deletes the incident report, including its severity and description. Incident history is part of the record of how an event ran, and this can't be undone."
                  confirmLabel="Remove"
                  pending={isDeleting}
                  onConfirm={() => handleDelete(incident.id)}
                />
              ),
            } satisfies PortalDataTableColumn<EventIncident>,
          ]
        : []),
    ],
    [mode, isDeleting, handleDelete],
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {incidents === null ? (
        <TabLoadingSkeleton />
      ) : incidents.length === 0 ? (
        <EmptyState
          title="No incidents recorded"
          description="If something happens during the event, log it with + Log incident above."
        />
      ) : (
        <PortalDataTable
          columns={columns}
          rows={incidents}
          getRowKey={(incident) => incident.id}
          // listEventIncidentsAction returns newest first.
          defaultSort={{ key: "occurred_at", dir: "desc" }}
          emptyMessage="No incidents to show."
          // The tab is already inside its own card on the phase grid.
          shell="bare"
        />
      )}
    </div>
  );
}
