"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateDistributionAction } from "../actions";
import { listPeopleAction, type PersonListItem } from "../../../people/actions";
import { PersonPicker } from "../../../people/person-picker";
import type {
  DistributionDetailRow,
  DistributionEventOption,
} from "./distribution-detail-view";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";

function formStateFor(movement: DistributionDetailRow) {
  return {
    quantity: String(movement.quantity),
    occurredAt: utcIsoToDatetimeLocalInBrowser(movement.occurred_at),
    reason: movement.reason ?? "",
    recipient: movement.recipient,
    eventId: movement.event?.id ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, movement: DistributionDetailRow) {
  const baseline = formStateFor(movement);
  return (
    form.quantity !== baseline.quantity ||
    form.occurredAt !== baseline.occurredAt ||
    form.reason !== baseline.reason ||
    form.eventId !== baseline.eventId ||
    (form.recipient?.id ?? null) !== (baseline.recipient?.id ?? null)
  );
}

export function EditDistributionSheet({
  movement,
  events,
}: {
  movement: DistributionDetailRow;
  events: DistributionEventOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formStateFor(movement));
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formId = `edit-distribution-form-${movement.id}`;
  const dirty = isDirty(form, movement);
  // The events query is capped, so an older linked event may be missing from
  // it; keep it selectable so opening the sheet never silently drops it.
  const eventOptions =
    movement.event && !events.some((event) => event.id === movement.event!.id)
      ? [...events, movement.event]
      : events;

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirty) {
      setConfirmingDiscard(true);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      // Re-seed from the movement on every open: a save + router.refresh()
      // may have replaced the `movement` prop since this component mounted.
      setForm(formStateFor(movement));
      setError(null);
    }
  }

  function confirmDiscard() {
    setForm(formStateFor(movement));
    setError(null);
    setConfirmingDiscard(false);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("quantity", form.quantity);
    // Converted here, in the browser, so the recorded instant is fixed
    // using the user's own timezone rather than the server's.
    formData.set("occurredAt", new Date(form.occurredAt).toISOString());
    formData.set("reason", form.reason);
    formData.set("recipientPersonId", form.recipient?.id ?? "");
    formData.set("eventId", form.eventId);

    startTransition(async () => {
      const result = await updateDistributionAction(movement.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Distribution saved.");
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
              <SheetTitle>Edit distribution</SheetTitle>
              <SheetDescription>
                Update this distribution record.
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
                <ReadOnlyField label="Item" htmlFor="edit-dist-item">
                  {movement.inventory_item?.description ?? "—"}
                </ReadOnlyField>
                <Field>
                  <FieldLabel htmlFor="edit-dist-event">Event</FieldLabel>
                  <Select
                    value={form.eventId || "none"}
                    onValueChange={(value) =>
                      update("eventId", value === "none" ? "" : (value ?? ""))
                    }
                  >
                    <SelectTrigger id="edit-dist-event" className="w-full">
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

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-dist-quantity" required>
                      Quantity
                    </FieldLabel>
                    <Input
                      id="edit-dist-quantity"
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.quantity}
                      onChange={(event) =>
                        update("quantity", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-dist-occurredAt" required>
                      Date &amp; time
                    </FieldLabel>
                    <Input
                      id="edit-dist-occurredAt"
                      type="datetime-local"
                      required
                      value={form.occurredAt}
                      onChange={(event) =>
                        update("occurredAt", event.target.value)
                      }
                    />
                  </Field>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-distribution-recipient">
                    Recipient
                  </FieldLabel>
                  <PersonPicker
                    id="edit-distribution-recipient"
                    people={people}
                    selected={form.recipient}
                    onSelect={(person) => update("recipient", person)}
                    onPersonCreated={(person) =>
                      setPeople((prev) => [...prev, person])
                    }
                    placeholder="Search recipient by name or email..."
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-dist-reason">
                    Reason / notes
                  </FieldLabel>
                  <Textarea
                    id="edit-dist-reason"
                    value={form.reason}
                    onChange={(event) => update("reason", event.target.value)}
                  />
                </Field>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
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
              You have unsaved changes to this distribution. Leaving now will
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
