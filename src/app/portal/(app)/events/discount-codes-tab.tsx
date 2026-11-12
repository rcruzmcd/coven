"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  assignDiscountCodeAction,
  deleteDiscountCodeAction,
  listDiscountCodesAction,
  markDiscountCodeSentAction,
  type DiscountCode,
} from "./discount-codes-actions";
import type { EventRegistrantsData } from "./registrants-actions";
import { useTabData, type TabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatCurrency, formatInstantDate } from "@/lib/format";
import { DISCOUNT_CODE_KINDS } from "@/lib/portal/impact-metrics";
import { Pencil } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditDiscountCodeDialog } from "./edit-discount-code-dialog";
import { AddSharedDiscountCodeDialog } from "./add-shared-discount-code-dialog";
import { EmptyState } from "@/components/portal/empty-state";

// Base UI's Select doesn't accept an empty-string item value, so "no
// registrant assigned" needs its own sentinel instead.
const UNASSIGNED = "__unassigned__";

/** "Rental · $45.00", "Rental", "$45.00" or "—". */
function kindAndValue(code: DiscountCode) {
  const kind = DISCOUNT_CODE_KINDS.find(
    (option) => option.value === code.kind,
  )?.label;
  const value = code.value === null ? null : formatCurrency(code.value);
  return [kind, value].filter(Boolean).join(" · ") || "—";
}

/** The code, with the partner's PIN under it where there is one (#1589). */
function CodeWithPin({ code }: { code: DiscountCode }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{code.code}</span>
      {code.pin && (
        <span className="app-muted block truncate text-xs">PIN {code.pin}</span>
      )}
    </span>
  );
}

/**
 * The event's one shared code (#1589), on its own above the single-use list:
 * it goes to everyone who registers, in their confirmation email, and is
 * never assigned.
 */
function SharedCodePanel({
  eventId,
  code,
  mode,
  pending,
  onEdit,
  onDelete,
  onSaved,
}: {
  eventId: string;
  code: DiscountCode | null;
  mode: "view" | "edit";
  pending: boolean;
  onEdit: (code: DiscountCode) => void;
  onDelete: (id: string) => void;
  onSaved: () => void;
}) {
  if (!code && mode !== "edit") return null;
  return (
    <section
      aria-labelledby="shared-discount-code-heading"
      className="flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="shared-discount-code-heading" className="text-sm font-semibold">
          Shared code
        </h3>
        {mode === "edit" &&
          (code ? (
            <div className="flex shrink-0 items-center">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit shared code ${code.code}`}
                      onClick={() => onEdit(code)}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit shared code</TooltipContent>
              </Tooltip>
              <ConfirmDeleteButton
                label="Remove shared code"
                title={`Remove shared code ${code.code}?`}
                description="Registration confirmation emails stop including it. Emails already sent keep it. It can't be undone."
                confirmLabel="Remove"
                pending={pending}
                onConfirm={() => onDelete(code.id)}
              />
            </div>
          ) : (
            <AddSharedDiscountCodeDialog eventId={eventId} onSaved={onSaved} />
          ))}
      </div>
      {code ? (
        <div className="flex flex-col gap-1 text-sm">
          <CodeWithPin code={code} />
          {(code.description || code.source) && (
            <span className="app-muted min-w-0 break-words">
              {[code.description, code.source].filter(Boolean).join(" · ")}
            </span>
          )}
          <span className="app-muted text-xs">
            Sent to everyone who registers, in their confirmation email.
          </span>
        </div>
      ) : (
        <p className="app-muted text-sm">
          None. Add one when a partner gives a single code for everyone who
          registers.
        </p>
      )}
    </section>
  );
}

export function DiscountCodesTab({
  eventId,
  mode,
  registrants: registrantsData,
  refreshDerived,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  registrants: TabData<EventRegistrantsData>;
  /** Refetches the Results card's Outcomes, which count these codes. */
  refreshDerived: () => void;
  /** Rows before the rest move behind "View all"; `null` disables the cap. */
  previewRows?: number | null;
}) {
  const {
    data: codes,
    loadError,
    refresh: refreshCodes,
  } = useTabData<DiscountCode[]>(
    () => listDiscountCodesAction(eventId),
    [eventId],
  );
  const registrants = registrantsData.data?.registrants;
  const refreshRegistrants = registrantsData.refresh;
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [isPending, startTransition] = useTransition();

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refreshAll = useCallback(() => {
    refreshCodes();
    refreshRegistrants();
  }, [refreshCodes, refreshRegistrants]);

  useRegisterTabRefresh<TabValue>("discount-codes", refreshAll);

  // The toolbar's notification reaches the shared-data provider, which
  // refreshes the derived figures itself. A change made inside the card goes
  // through no notification, so it refreshes them here (#1619).
  const refreshAfterChange = useCallback(() => {
    refreshAll();
    refreshDerived();
  }, [refreshAll, refreshDerived]);

  const handleAssign = useCallback(
    (codeId: string, registrationId: string) => {
      setActionError(null);
      startTransition(async () => {
        const result = await assignDiscountCodeAction(
          codeId,
          registrationId === UNASSIGNED ? null : registrationId,
        );
        if ("error" in result) {
          setActionError(result.error);
          return;
        }
        refreshAfterChange();
      });
    },
    [refreshAfterChange],
  );

  const handleMarkSent = useCallback(
    (codeId: string) => {
      setActionError(null);
      startTransition(async () => {
        const result = await markDiscountCodeSentAction(codeId);
        if ("error" in result) {
          setActionError(result.error);
          return;
        }
        refreshAfterChange();
      });
    },
    [refreshAfterChange],
  );

  const handleDelete = useCallback(
    (codeId: string) => {
      startTransition(async () => {
        await deleteDiscountCodeAction(codeId);
        refreshAfterChange();
      });
    },
    [refreshAfterChange],
  );

  const sharedCode = useMemo(
    () => (codes ?? []).find((code) => code.shared) ?? null,
    [codes],
  );
  const list = useMemo(
    () => (codes ?? []).filter((code) => !code.shared),
    [codes],
  );

  const availableRegistrants = useMemo(() => {
    const assignedRegistrationIds = new Set(
      list
        .map((code) => code.registration_id)
        .filter((id): id is string => !!id),
    );
    return (registrants ?? []).filter(
      (registrant) => !assignedRegistrationIds.has(registrant.id),
    );
  }, [list, registrants]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((code) =>
      [
        code.code,
        code.pin,
        code.description,
        code.source,
        code.registration?.name,
        code.registration?.email,
        code.sent_to_name,
        code.sent_to_email,
      ].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [list, query]);

  const columns = useMemo<PortalDataTableColumn<DiscountCode>[]>(
    () => [
      {
        key: "code",
        label: "Code",
        sortValue: (code) => code.code,
        cellClassName: "max-w-xs",
        render: (code) => <CodeWithPin code={code} />,
      },
      {
        key: "description",
        label: "Description",
        hideBelow: "md",
        sortValue: (code) => code.description,
        cellClassName: "max-w-xs truncate app-muted",
        render: (code) => code.description ?? "—",
      },
      {
        key: "source",
        label: "Source",
        hideBelow: "lg",
        sortValue: (code) => code.source,
        cellClassName: "app-muted",
        render: (code) => code.source ?? "—",
      },
      {
        key: "kind",
        label: "Pays for",
        hideBelow: "md",
        sortValue: (code) => code.kind,
        cellClassName: "app-muted whitespace-nowrap",
        render: kindAndValue,
      },
      {
        key: "registration",
        label: "Assigned to",
        // Sorts on whoever the cell names, whether that came from the linked
        // registration or from the name the code was sent to by hand.
        sortValue: (code) => code.registration?.name ?? code.sent_to_name,
        render: (code) =>
          mode === "edit" && !code.sent_at ? (
            <Select
              value={code.registration_id ?? UNASSIGNED}
              onValueChange={(value) =>
                handleAssign(code.id, value ?? UNASSIGNED)
              }
              disabled={isPending}
            >
              <SelectTrigger
                className="w-full"
                aria-label={`Registrant assigned to discount code ${code.code}`}
              >
                <SelectValue placeholder="Unassigned">
                  {() =>
                    code.registration ? code.registration.name : "Unassigned"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {code.registration && (
                  <SelectItem value={code.registration.id}>
                    {code.registration.name}
                  </SelectItem>
                )}
                {availableRegistrants.map((registrant) => (
                  <SelectItem key={registrant.id} value={registrant.id}>
                    {registrant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : code.registration || code.sent_to_name ? (
            <span>
              {code.registration?.name ?? code.sent_to_name}
              <span className="app-muted block text-xs">
                {code.registration?.email ?? code.sent_to_email}
              </span>
            </span>
          ) : (
            <span className="app-muted">Unassigned</span>
          ),
      },
      {
        key: "assigned_at",
        label: "Assigned",
        hideBelow: "sm",
        sortValue: (code) => code.assigned_at,
        cellClassName: "app-muted whitespace-nowrap",
        render: (code) => formatInstantDate(code.assigned_at),
      },
      {
        key: "sent_at",
        label: "Sent",
        sortValue: (code) => code.sent_at,
        cellClassName: "whitespace-nowrap",
        render: (code) =>
          code.sent_at ? (
            <span className="app-muted">{formatInstantDate(code.sent_at)}</span>
          ) : mode === "edit" && code.registration_id ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() => handleMarkSent(code.id)}
            >
              Mark as sent
            </Button>
          ) : (
            <span className="app-muted">—</span>
          ),
      },
      ...(mode === "edit"
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right whitespace-nowrap",
              render: (code: DiscountCode) => (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit discount code ${code.code}`}
                          onClick={() => setEditing(code)}
                        />
                      }
                    >
                      <Pencil />
                    </TooltipTrigger>
                    <TooltipContent>Edit code</TooltipContent>
                  </Tooltip>
                  <ConfirmDeleteButton
                    label="Remove code"
                    title={`Remove discount code ${code.code}?`}
                    description="This deletes the code and unassigns it from any registrant it was issued to. It can't be undone."
                    confirmLabel="Remove"
                    pending={isPending}
                    onConfirm={() => handleDelete(code.id)}
                  />
                </>
              ),
            } satisfies PortalDataTableColumn<DiscountCode>,
          ]
        : []),
    ],
    [
      mode,
      isPending,
      availableRegistrants,
      handleAssign,
      handleMarkSent,
      handleDelete,
    ],
  );

  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewColumns = useMemo(() => withoutSorting(columns), [columns]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;
  const previewIsWholeList = !hasOverflow;

  return (
    <div className="flex flex-col gap-4">
      {editing && (
        <EditDiscountCodeDialog
          code={editing}
          onClose={() => setEditing(null)}
          onSaved={refreshAfterChange}
        />
      )}
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {codes !== undefined && (
        <SharedCodePanel
          eventId={eventId}
          code={sharedCode}
          mode={mode}
          pending={isPending}
          onEdit={setEditing}
          onDelete={handleDelete}
          onSaved={refreshAfterChange}
        />
      )}

      {codes === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No single-use codes recorded for this event yet"
          description="Add the first ones with + Add codes above."
        />
      ) : (
        <>
          <PortalDataTable
            columns={previewIsWholeList ? columns : previewColumns}
            rows={capped}
            getRowKey={(code) => code.id}
            // listDiscountCodesAction returns them oldest first, which is the
            // order they were added in; no column carries that, so the table
            // opens on it rather than on a sort of its own.
            emptyMessage="No discount codes to show."
            // The tab is already inside its own card on the phase grid.
            shell="bare"
          />
          {hasOverflow && (
            <ListPreviewSheet
              title="Discount codes"
              description={`${list.length} codes`}
              triggerLabel={`View all ${list.length} discount codes`}
              searchPlaceholder="Search code, source, or registrant"
              searchLabel="Search discount codes"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
            >
              <PortalDataTable
                columns={columns}
                rows={filtered}
                getRowKey={(code) => code.id}
                emptyMessage="No discount codes match your search. Clear or loosen it to see more."
                // The sheet body is the scroller here and brings its own
                // surface, so the header pins to the top of that rather than
                // to the portal's header.
                shell="bare"
                stickyHeader="container"
              />
            </ListPreviewSheet>
          )}
        </>
      )}
    </div>
  );
}
