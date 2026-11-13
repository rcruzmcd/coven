"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateDonationAction } from "../actions";
import { updateInventoryItemAction } from "../../items/actions";
import { listInventoryCategoriesAction } from "../../categories/actions";
import { CategorySelect } from "@/components/portal/category-select";
import { OTHER_CATEGORY_KEY, type InventoryCategory } from "@/lib/inventory";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  donorLabel,
  labelFor,
  type DonationItemRow,
  type DonationRow,
  type EventOption,
} from "../donation-shared";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function donationFormStateFor(donation: DonationRow) {
  return {
    // Already "YYYY-MM-DD": a `date` column, straight into the date input.
    donatedAt: donation.donated_at,
    notes: donation.notes ?? "",
    eventId: donation.event_id ?? "",
  };
}

type DonationFormState = ReturnType<typeof donationFormStateFor>;

function itemFormStateFor(item: DonationItemRow) {
  return {
    description: item.description,
    categoryId: item.category_id ?? "",
    categoryDetail: item.type ?? "",
    size: item.size ?? "",
    gender: item.gender ?? "",
    condition: item.condition,
    intendedUse: item.intended_use,
    faceValue: item.face_value === null ? "" : String(item.face_value),
    notes: item.notes ?? "",
  };
}

type ItemFormState = ReturnType<typeof itemFormStateFor>;

function itemsFormStateFor(donation: DonationRow) {
  return Object.fromEntries(
    donation.inventory_items.map((item) => [item.id, itemFormStateFor(item)]),
  );
}

function isDonationDirty(form: DonationFormState, donation: DonationRow) {
  const baseline = donationFormStateFor(donation);
  return (Object.keys(baseline) as (keyof DonationFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

function isItemDirty(form: ItemFormState, item: DonationItemRow) {
  const baseline = itemFormStateFor(item);
  return (Object.keys(baseline) as (keyof ItemFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

/**
 * Editing stays on a Sheet for this pass (#469) — the dedicated detail page
 * shows the read-only view that used to live in the old DonationSheet's view
 * mode, and this sheet carries over its edit mode unchanged.
 */
export function EditDonationSheet({
  donation,
  events,
}: {
  donation: DonationRow;
  /** Events the donation can be linked to, newest first. */
  events: EventOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [donationForm, setDonationForm] = useState(() =>
    donationFormStateFor(donation),
  );
  const [itemsForm, setItemsForm] = useState<Record<string, ItemFormState>>(
    () => itemsFormStateFor(donation),
  );
  const [categories, setCategories] = useState<InventoryCategory[]>([]);

  // Loaded on open rather than passed down: this sheet is rendered from a
  // client component, so there is no server parent to hand it the vocabulary.
  useEffect(() => {
    if (!open) return;
    listInventoryCategoriesAction().then((result) => {
      if (!("error" in result)) setCategories(result.data);
    });
  }, [open]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formId = `edit-donation-form-${donation.id}`;
  // The events query is capped, so an older linked event may be missing from
  // it; keep it selectable so opening the sheet never silently drops it.
  const eventOptions =
    donation.event && !events.some((event) => event.id === donation.event!.id)
      ? [...events, donation.event]
      : events;

  const dirty =
    isDonationDirty(donationForm, donation) ||
    donation.inventory_items.some((item) =>
      isItemDirty(itemsForm[item.id], item),
    );

  function updateDonationField<K extends keyof DonationFormState>(
    key: K,
    value: DonationFormState[K],
  ) {
    setDonationForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateItemField<K extends keyof ItemFormState>(
    itemId: string,
    key: K,
    value: ItemFormState[K],
  ) {
    setItemsForm((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [key]: value },
    }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirty) {
      setConfirmingDiscard(true);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      // Re-seed from the donation on every open: a save + router.refresh()
      // may have replaced the `donation` prop since this component mounted.
      setDonationForm(donationFormStateFor(donation));
      setItemsForm(itemsFormStateFor(donation));
      setError(null);
    }
  }

  function confirmDiscard() {
    setDonationForm(donationFormStateFor(donation));
    setItemsForm(itemsFormStateFor(donation));
    setError(null);
    setConfirmingDiscard(false);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const donationFormData = new FormData();
    donationFormData.set("donatedAt", donationForm.donatedAt);
    donationFormData.set("notes", donationForm.notes);
    donationFormData.set("eventId", donationForm.eventId);

    startTransition(async () => {
      const donationResult = await updateDonationAction(
        donation.id,
        donationFormData,
      );
      if ("error" in donationResult) {
        setError(donationResult.error);
        return;
      }

      for (const item of donation.inventory_items) {
        const form = itemsForm[item.id];
        if (!isItemDirty(form, item)) continue;

        const itemFormData = new FormData();
        itemFormData.set("description", form.description);
        itemFormData.set("categoryId", form.categoryId);
        itemFormData.set("categoryDetail", form.categoryDetail);
        itemFormData.set(
          "categoryIsOther",
          String(
            categories.find((category) => category.id === form.categoryId)
              ?.key === OTHER_CATEGORY_KEY,
          ),
        );
        itemFormData.set("size", form.size);
        itemFormData.set("gender", form.gender);
        itemFormData.set("condition", form.condition);
        itemFormData.set("status", item.status);
        itemFormData.set("intendedUse", form.intendedUse);
        itemFormData.set("faceValue", form.faceValue);
        itemFormData.set("photoUrl", item.photo_url ?? "");
        itemFormData.set("notes", form.notes);

        const itemResult = await updateInventoryItemAction(
          item.id,
          itemFormData,
        );
        if ("error" in itemResult) {
          setError(itemResult.error);
          return;
        }
      }

      toast.success("Donation saved.");
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button type="button" variant="secondary" />}>
          <Pencil /> Edit
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} size="lg">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>Edit donation</SheetTitle>
              <SheetDescription>
                Update the details for this donation.
              </SheetDescription>
            </div>
          </SheetHeader>

          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <RequiredFieldsNote />
                <ReadOnlyField label="Donor" htmlFor="donation-donor-edit">
                  {donorLabel(donation)}
                </ReadOnlyField>
                <Field>
                  <FieldLabel htmlFor="donation-donatedAt" required>
                    Date received
                  </FieldLabel>
                  <Input
                    id="donation-donatedAt"
                    type="date"
                    required
                    value={donationForm.donatedAt}
                    onChange={(event) =>
                      updateDonationField("donatedAt", event.target.value)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="donation-event-edit">
                    Source event
                  </FieldLabel>
                  <Select
                    value={donationForm.eventId || "none"}
                    onValueChange={(value) =>
                      updateDonationField(
                        "eventId",
                        value === "none" ? "" : (value ?? ""),
                      )
                    }
                  >
                    <SelectTrigger id="donation-event-edit" className="w-full">
                      <SelectValue placeholder="No event">
                        {(value: string) =>
                          value && value !== "none"
                            ? (eventOptions.find((event) => event.id === value)
                                ?.name ?? "No event")
                            : "No event"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No event</SelectItem>
                      {eventOptions.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="donation-notes-edit">
                    Donation notes
                  </FieldLabel>
                  <MarkdownTextarea
                    id="donation-notes-edit"
                    value={donationForm.notes}
                    onChange={(event) =>
                      updateDonationField("notes", event.target.value)
                    }
                  />
                </Field>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>

              <div className="mt-4 flex flex-col gap-4">
                {donation.inventory_items.map((item, index) => {
                  const form = itemsForm[item.id];
                  return (
                    <FieldGroup
                      key={item.id}
                      className="rounded-md border border-[var(--line)] p-4"
                    >
                      <FieldLabel className="text-sm font-medium">
                        Item {index + 1}
                      </FieldLabel>
                      <Field>
                        <FieldLabel
                          htmlFor={`edit-item-description-${item.id}`}
                          required
                        >
                          Item description
                        </FieldLabel>
                        <Textarea
                          id={`edit-item-description-${item.id}`}
                          required
                          value={form.description}
                          onChange={(event) =>
                            updateItemField(
                              item.id,
                              "description",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                      <Field orientation="responsive">
                        <CategorySelect
                          categories={categories}
                          categoryId={form.categoryId}
                          detail={form.categoryDetail}
                          idPrefix={`edit-item-${item.id}`}
                          onCategoryChange={(value) =>
                            updateItemField(item.id, "categoryId", value)
                          }
                          onDetailChange={(value) =>
                            updateItemField(item.id, "categoryDetail", value)
                          }
                        />
                        <Field>
                          <FieldLabel htmlFor={`edit-item-size-${item.id}`}>
                            Size
                          </FieldLabel>
                          <Input
                            id={`edit-item-size-${item.id}`}
                            value={form.size}
                            onChange={(event) =>
                              updateItemField(
                                item.id,
                                "size",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      </Field>
                      <Field orientation="responsive">
                        <Field>
                          <FieldLabel htmlFor={`edit-item-gender-${item.id}`}>
                            Gender
                          </FieldLabel>
                          <Select
                            value={form.gender || null}
                            onValueChange={(value) =>
                              updateItemField(item.id, "gender", value ?? "")
                            }
                          >
                            <SelectTrigger
                              id={`edit-item-gender-${item.id}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select a gender">
                                {(value: string) =>
                                  labelFor(GENDERS, value) ?? "Select a gender"
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {GENDERS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`edit-item-condition-${item.id}`}
                          >
                            Condition
                          </FieldLabel>
                          <Select
                            value={form.condition || null}
                            onValueChange={(value) =>
                              updateItemField(item.id, "condition", value ?? "")
                            }
                          >
                            <SelectTrigger
                              id={`edit-item-condition-${item.id}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select a condition">
                                {(value: string) =>
                                  labelFor(CONDITIONS, value) ??
                                  "Select a condition"
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`edit-item-faceValue-${item.id}`}>
                          Face value ($)
                        </FieldLabel>
                        <Input
                          id={`edit-item-faceValue-${item.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.faceValue}
                          onChange={(event) =>
                            updateItemField(
                              item.id,
                              "faceValue",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`edit-item-intendedUse-${item.id}`}
                        >
                          Intended use
                        </FieldLabel>
                        <Select
                          value={form.intendedUse || null}
                          onValueChange={(value) =>
                            updateItemField(item.id, "intendedUse", value ?? "")
                          }
                        >
                          <SelectTrigger
                            id={`edit-item-intendedUse-${item.id}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Select an intended use">
                              {(value: string) =>
                                labelFor(INTENDED_USES, value) ??
                                "Select an intended use"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {INTENDED_USES.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Only gear library items appear on the public gear
                          library and can be requested or distributed to riders.
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`edit-item-notes-${item.id}`}>
                          Item notes
                        </FieldLabel>
                        <MarkdownTextarea
                          id={`edit-item-notes-${item.id}`}
                          value={form.notes}
                          onChange={(event) =>
                            updateItemField(
                              item.id,
                              "notes",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                    </FieldGroup>
                  );
                })}
              </div>
            </div>
          </form>

          <SheetFooter>
            <Button type="submit" form={formId} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmingDiscard}
        onOpenChange={(next) => !next && setConfirmingDiscard(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this donation. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingDiscard(false)}>
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
