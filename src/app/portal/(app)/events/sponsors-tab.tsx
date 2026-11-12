"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import {
  deleteEventSponsorAction,
  listEventSponsorsAction,
  updateEventSponsorAction,
  type EventSponsor,
  type EventSponsorItem,
  type EventSponsorPerson,
  type SponsorActionResult,
} from "./sponsors-actions";
import { useKeyedRows } from "../website/use-keyed-rows";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import type { PersonListItem } from "../people/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { useEventDateDefaults } from "./event-date-defaults";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCurrency, personDisplayName } from "@/lib/format";
import { INTENDED_USES } from "@/lib/inventory";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

const SUPPORT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "in_kind", label: "In-kind" },
  { value: "both", label: "Cash + in-kind" },
  { value: "other", label: "Other" },
];

const FOLLOW_UP_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/** Support types whose contribution is goods rather than money. Only these show
 *  the item list; `cash` and `other` have nothing to itemise. */
const ITEM_BEARING_SUPPORT_TYPES = ["in_kind", "both"];

/** One row of the in-kind item list. `id` is null until the item exists, and
 *  `allocated` is what a giveaway prize already claims -- removing one of those
 *  would empty the prize, so the RPC refuses and the row's remove is disabled.
 */
export type SponsorItemDraft = {
  id: string | null;
  description: string;
  faceValue: string;
  intendedUse: string;
  allocated: boolean;
};

export type SponsorFormState = {
  supportType: string;
  items: SponsorItemDraft[];
  contributionValue: string;
  isPublic: boolean;
  notes: string;
  followUpStatus: string;
  followUpNotes: string;
  followUpOwner: PickedPerson | null;
  followUpDueDate: string;
};

function emptyItem(): SponsorItemDraft {
  return {
    id: null,
    description: "",
    faceValue: "",
    intendedUse: "giveaway",
    allocated: false,
  };
}

function itemDraftFor(item: EventSponsorItem): SponsorItemDraft {
  return {
    id: item.id,
    description: item.description,
    faceValue: item.face_value === null ? "" : String(item.face_value),
    intendedUse: item.intended_use,
    allocated: item.allocated,
  };
}

/** The list always shows at least one row, so there is somewhere to type
 *  without hunting for an "add" button first. A row left entirely blank is
 *  dropped by `parseSponsorForm` rather than rejected. */
function itemDraftsFor(items: EventSponsorItem[]): SponsorItemDraft[] {
  return items.length ? items.map(itemDraftFor) : [emptyItem()];
}

function itemsTotal(items: SponsorItemDraft[]): number {
  return items.reduce((total, item) => {
    const value = Number(item.faceValue);
    return item.faceValue && !Number.isNaN(value) ? total + value : total;
  }, 0);
}

export function emptySponsorForm(): SponsorFormState {
  return {
    supportType: "in_kind",
    items: [emptyItem()],
    contributionValue: "",
    isPublic: false,
    notes: "",
    followUpStatus: "not_started",
    followUpNotes: "",
    followUpOwner: null,
    followUpDueDate: "",
  };
}

function formStateFor(sponsor: EventSponsor): SponsorFormState {
  return {
    supportType: sponsor.support_type,
    items: itemDraftsFor(sponsor.items),
    contributionValue:
      sponsor.contribution_value === null
        ? ""
        : String(sponsor.contribution_value),
    isPublic: sponsor.is_public,
    notes: sponsor.notes ?? "",
    followUpStatus: sponsor.follow_up_status,
    followUpNotes: sponsor.follow_up_notes ?? "",
    followUpOwner: sponsor.follow_up_owner
      ? { ...sponsor.follow_up_owner, email: null, phone: null }
      : null,
    followUpDueDate: sponsor.follow_up_due_date ?? "",
  };
}

export function SponsorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  people,
  onPersonCreated,
  allowCreatePerson = true,
  personDisplay,
}: {
  initial: SponsorFormState;
  submitLabel: string;
  onSubmit: (
    formData: FormData,
    personId: string | null,
  ) => Promise<SponsorActionResult>;
  onCancel?: () => void;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  /** False hides "+ Create new person" for a caller who cannot write the directory (#1693). */
  allowCreatePerson?: boolean;
  personDisplay?: EventSponsorPerson;
}) {
  const router = useRouter();
  const { date: eventDate } = useEventDateDefaults();
  // A new sponsorship's follow-up is due on the event's day by default. An
  // existing one keeps what was saved, empty included.
  const [form, setForm] = useState(() =>
    personDisplay || initial.followUpDueDate
      ? initial
      : { ...initial, followUpDueDate: eventDate },
  );
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    personDisplay ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof SponsorFormState>(
    key: K,
    value: SponsorFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Keyed rather than indexed: removing a row shifts every index below it, so
  // `key={index}` hands React the wrong input for the row and focus, selection
  // and caret land somewhere else (#792, which is why this hook exists).
  const itemRows = useKeyedRows<SponsorItemDraft>(initial.items, (items) =>
    update("items", items),
  );
  const showItems = ITEM_BEARING_SUPPORT_TYPES.includes(form.supportType);
  const total = itemsTotal(form.items);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!personDisplay && !selectedPerson) {
      setError("Select or create a person to link.");
      return;
    }

    const total = itemsTotal(form.items);
    const formData = new FormData();
    formData.set("supportType", form.supportType);
    formData.set("items", JSON.stringify(form.items));
    // Blank means "whatever the items add up to", which is what the field's
    // placeholder and description both say. Typing a number still wins, since a
    // sponsorship is often worth more to the org than its receipts total.
    formData.set(
      "contributionValue",
      form.contributionValue || (showItems && total > 0 ? String(total) : ""),
    );
    formData.set("isPublic", form.isPublic ? "on" : "off");
    formData.set("notes", form.notes);
    formData.set("followUpStatus", form.followUpStatus);
    formData.set("followUpNotes", form.followUpNotes);
    formData.set("followUpOwnerPersonId", form.followUpOwner?.id ?? "");
    formData.set("followUpDueDate", form.followUpDueDate);

    const sponsorName = personDisplayName(personDisplay ?? selectedPerson);
    startTransition(async () => {
      await runAction(() => onSubmit(formData, selectedPerson?.id ?? null), {
        // The same form adds and edits; `personDisplay` says which.
        success: personDisplay
          ? `${sponsorName} updated.`
          : `${sponsorName} added as a sponsor.`,
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onCancel?.();
        },
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        {personDisplay ? (
          <Field>
            <FieldLabel>Sponsor / partner</FieldLabel>
            <div className="rounded-md border border-[var(--line)] px-3 py-2">
              <p className="text-sm font-medium">{personDisplay.name ?? "—"}</p>
              {personDisplay.email && (
                <p className="app-muted text-xs">{personDisplay.email}</p>
              )}
            </div>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="sponsors-sponsor-partner">
              Sponsor / partner
            </FieldLabel>
            <PersonPicker
              id="sponsors-sponsor-partner"
              people={people}
              selected={selectedPerson}
              onSelect={setSelectedPerson}
              onPersonCreated={onPersonCreated}
              allowCreate={allowCreatePerson}
              newPersonRole="is_sponsor"
            />
          </Field>
        )}

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-supportType">Support type</FieldLabel>
            <Select
              value={form.supportType}
              onValueChange={(value) =>
                update("supportType", value ?? "in_kind")
              }
            >
              <SelectTrigger id="sponsor-supportType" className="w-full">
                <SelectValue placeholder="Select support type">
                  {(value: string) =>
                    SUPPORT_TYPES.find((option) => option.value === value)
                      ?.label ?? "Select support type"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-contributionValue">
              Contribution value ($)
            </FieldLabel>
            <Input
              id="sponsor-contributionValue"
              type="number"
              min="0"
              step="0.01"
              placeholder={
                showItems && total > 0 ? total.toFixed(2) : undefined
              }
              value={form.contributionValue}
              onChange={(event) =>
                update("contributionValue", event.target.value)
              }
            />
            {showItems && total > 0 && !form.contributionValue && (
              <FieldDescription>
                Leave blank to use the items total, {formatCurrency(total)}.
              </FieldDescription>
            )}
          </Field>
        </Field>

        {showItems && (
          <Field>
            <FieldLabel>In-kind items</FieldLabel>
            <FieldDescription>
              One row per thing the sponsor gave. Each becomes its own inventory
              record, so items can go to different giveaway prizes or out to the
              gear library independently.
            </FieldDescription>
            <div className="flex flex-col gap-3">
              {itemRows.rows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--line)] p-3 sm:flex-row sm:items-end"
                >
                  <Field className="sm:flex-2">
                    <FieldLabel htmlFor={`${row.id}-description`}>
                      Item {index + 1}
                    </FieldLabel>
                    <Input
                      id={`${row.id}-description`}
                      placeholder="e.g. Season lift tickets (4)"
                      value={row.value.description}
                      onChange={(event) =>
                        itemRows.update(row.id, {
                          ...row.value,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field className="sm:w-28">
                    <FieldLabel htmlFor={`${row.id}-faceValue`}>
                      Value ($)
                    </FieldLabel>
                    <Input
                      id={`${row.id}-faceValue`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.value.faceValue}
                      onChange={(event) =>
                        itemRows.update(row.id, {
                          ...row.value,
                          faceValue: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field className="sm:w-44">
                    <FieldLabel htmlFor={`${row.id}-intendedUse`}>
                      Headed for
                    </FieldLabel>
                    <Select
                      value={row.value.intendedUse}
                      onValueChange={(value) =>
                        itemRows.update(row.id, {
                          ...row.value,
                          intendedUse: value ?? "giveaway",
                        })
                      }
                    >
                      <SelectTrigger
                        id={`${row.id}-intendedUse`}
                        className="w-full"
                      >
                        <SelectValue placeholder="Select destination">
                          {(value: string) =>
                            INTENDED_USES.find(
                              (option) => option.value === value,
                            )?.label ?? "Select destination"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {INTENDED_USES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove item ${index + 1}`}
                          title={
                            row.value.allocated
                              ? "This item is a giveaway prize. Remove the prize first."
                              : undefined
                          }
                          disabled={
                            itemRows.rows.length === 1 || row.value.allocated
                          }
                          onClick={() => itemRows.remove(row.id)}
                        />
                      }
                    >
                      <X />
                    </TooltipTrigger>
                    <TooltipContent>{`Remove item ${index + 1}`}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => itemRows.add(emptyItem())}
              >
                <Plus /> Add item
              </Button>
              {total > 0 && (
                <p className="app-muted text-sm">
                  Items total: {formatCurrency(total)}
                </p>
              )}
            </div>
          </Field>
        )}

        <Field orientation="horizontal">
          <Checkbox
            id="sponsor-isPublic"
            checked={form.isPublic}
            onCheckedChange={(checked) => update("isPublic", Boolean(checked))}
          />
          <FieldLabel htmlFor="sponsor-isPublic">
            Show on the public event page
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-notes">Notes</FieldLabel>
          <Textarea
            id="sponsor-notes"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-followUpStatus">
            Partner follow-up
          </FieldLabel>
          <Select
            value={form.followUpStatus}
            onValueChange={(value) =>
              update("followUpStatus", value ?? "not_started")
            }
          >
            <SelectTrigger id="sponsor-followUpStatus" className="w-full">
              <SelectValue placeholder="Select follow-up status">
                {(value: string) =>
                  FOLLOW_UP_STATUSES.find((option) => option.value === value)
                    ?.label ?? "Select follow-up status"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_STATUSES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-followUpOwner">
              Follow-up owner
            </FieldLabel>
            <PersonPicker
              id="sponsor-followUpOwner"
              people={people}
              selected={form.followUpOwner}
              onSelect={(person) => update("followUpOwner", person)}
              onPersonCreated={() => {}}
              allowCreate={false}
              placeholder="Search people (optional)"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-followUpDueDate">
              Follow-up due date
            </FieldLabel>
            <Input
              id="sponsor-followUpDueDate"
              type="date"
              value={form.followUpDueDate}
              onChange={(event) =>
                update("followUpDueDate", event.target.value)
              }
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-followUpNotes">
            Follow-up notes
          </FieldLabel>
          <Textarea
            id="sponsor-followUpNotes"
            value={form.followUpNotes}
            onChange={(event) => update("followUpNotes", event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SponsorsTab({
  eventId,
  people,
  onPersonCreated,
  mode,
}: {
  eventId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PersonListItem) => void;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: sponsors,
    loadError,
    refresh: refreshSponsors,
  } = useTabData<EventSponsor[]>(
    () => listEventSponsorsAction(eventId),
    [eventId],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => {
    setEditingId(null);
  });

  function refresh() {
    refreshSponsors();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("sponsors", refresh);

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteEventSponsorAction(id), {
        success: "Sponsor removed.",
        error: "Could not remove the sponsor. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  const sortedSponsors = (sponsors ?? [])
    .slice()
    .sort((a, b) => (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {sponsors === undefined ? (
        <TabLoadingSkeleton />
      ) : sortedSponsors.length === 0 ? (
        <EmptyState
          title="No sponsors or partners recorded yet"
          description="Add the first one with + Add sponsor above."
        />
      ) : (
        // Not a PortalDataTable: editing a sponsor swaps its row for a
        // full-width form, and a flat row list has nowhere to put that. It
        // takes the sticky header and leaves the rest.
        <Table stickyHeader="page">
          <TableHeader>
            <TableRow>
              <TableHead>Sponsor</TableHead>
              <TableHead>Support</TableHead>
              <TableHead>Value</TableHead>
              <TableHead hideBelow="sm">Public</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSponsors.map((sponsor) =>
              editingId === sponsor.id ? (
                <TableRow key={sponsor.id}>
                  <TableCell colSpan={5}>
                    <SponsorForm
                      initial={formStateFor(sponsor)}
                      submitLabel="Save sponsor"
                      onSubmit={(formData) =>
                        updateEventSponsorAction(sponsor.id, formData)
                      }
                      onCancel={() => {
                        setEditingId(null);
                        refresh();
                      }}
                      people={people}
                      onPersonCreated={onPersonCreated}
                      personDisplay={sponsor.person}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={sponsor.id}>
                  <TableCell
                    className="max-w-xs truncate font-medium"
                    title={sponsor.person?.name ?? undefined}
                  >
                    {personDisplayName(sponsor.person)}
                  </TableCell>
                  <TableCell className="app-muted">
                    <span className="capitalize">
                      {sponsor.support_type.replace("_", " ")}
                    </span>
                    {sponsor.items.length > 0 && (
                      <>
                        {" · "}
                        {sponsor.items.length}{" "}
                        {sponsor.items.length === 1 ? "item" : "items"}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(sponsor.contribution_value)}
                  </TableCell>
                  <TableCell hideBelow="sm" className="app-muted">
                    {sponsor.is_public ? "Yes" : "No"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {mode === "edit" && (
                      <>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Edit sponsor"
                                onClick={() => setEditingId(sponsor.id)}
                              />
                            }
                          >
                            <Pencil />
                          </TooltipTrigger>
                          <TooltipContent>Edit sponsor</TooltipContent>
                        </Tooltip>
                        <ConfirmDeleteButton
                          label="Remove sponsor"
                          title={`Remove ${personDisplayName(sponsor.person)} as a sponsor?`}
                          description="This deletes the sponsorship record for this event, including its contribution value and any in-kind items it recorded. It can't be undone."
                          confirmLabel="Remove"
                          pending={isDeleting}
                          onConfirm={() => handleDelete(sponsor.id)}
                        />
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
