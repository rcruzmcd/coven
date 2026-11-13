"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { CategorySelect } from "@/components/portal/category-select";
import { PhotoUploadField } from "@/components/portal/photo-upload-field";
import { OTHER_CATEGORY_KEY, type InventoryCategory } from "@/lib/inventory";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { updateInventoryItemAction } from "../actions";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  ITEM_EXIT_STATUSES,
  STATUSES,
  labelFor,
  type InventoryItem,
} from "../inventory-shared";
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

function formStateFor(item: InventoryItem) {
  return {
    description: item.description,
    categoryId: item.category_id ?? "",
    categoryDetail: item.type ?? "",
    size: item.size ?? "",
    gender: item.gender ?? "",
    condition: item.condition,
    status: item.status,
    intendedUse: item.intended_use,
    faceValue: item.face_value === null ? "" : String(item.face_value),
    photoUrl: item.photo_url ?? "",
    notes: item.notes ?? "",
  };
}

type InventoryFormState = ReturnType<typeof formStateFor>;

function isDirty(form: InventoryFormState, item: InventoryItem) {
  const baseline = formStateFor(item);
  return (Object.keys(baseline) as (keyof InventoryFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

/**
 * Edits an item from its page (#1441). The item used to open in a sheet with
 * a view mode and an edit mode; the page is the view now, and this is the
 * edit half, opened from the page's toolbar.
 */
export function EditInventorySheet({
  item,
  categories,
}: {
  item: InventoryItem;
  categories: InventoryCategory[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formId = `edit-inventory-form-${item.id}`;
  const dirty = isDirty(form, item);

  function update<K extends keyof InventoryFormState>(
    key: K,
    value: InventoryFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirty) {
      setConfirmingDiscard(true);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(item));
      setError(null);
    }
  }

  function confirmDiscard() {
    setForm(formStateFor(item));
    setError(null);
    setOpen(false);
    setConfirmingDiscard(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("description", form.description);
    formData.set("categoryId", form.categoryId);
    formData.set("categoryDetail", form.categoryDetail);
    formData.set(
      "categoryIsOther",
      String(
        categories.find((category) => category.id === form.categoryId)?.key ===
          OTHER_CATEGORY_KEY,
      ),
    );
    formData.set("size", form.size);
    formData.set("gender", form.gender);
    formData.set("condition", form.condition);
    formData.set("status", form.status);
    formData.set("intendedUse", form.intendedUse);
    formData.set("faceValue", form.faceValue);
    formData.set("photoUrl", form.photoUrl);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await updateInventoryItemAction(item.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Inventory item saved.");
      router.refresh();
    });
  }

  return (
    <>
      <TooltipIconButton label="Edit item" onClick={() => setOpen(true)}>
        <Pencil />
      </TooltipIconButton>
      <Sheet open={open} onOpenChange={handleOpenChange}>
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
              <SheetTitle>Edit item</SheetTitle>
              <SheetDescription>
                Update the details for this inventory item.
              </SheetDescription>
            </div>
          </SheetHeader>

          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <RequiredFieldsNote />
                <Field>
                  <FieldLabel htmlFor="edit-description" required>
                    Item description
                  </FieldLabel>
                  <Textarea
                    id="edit-description"
                    required
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                  />
                </Field>

                <Field orientation="responsive">
                  <CategorySelect
                    categories={categories}
                    categoryId={form.categoryId}
                    detail={form.categoryDetail}
                    idPrefix="edit"
                    onCategoryChange={(value) => update("categoryId", value)}
                    onDetailChange={(value) => update("categoryDetail", value)}
                  />
                  <Field>
                    <FieldLabel htmlFor="edit-size">Size</FieldLabel>
                    <Input
                      id="edit-size"
                      value={form.size}
                      onChange={(event) => update("size", event.target.value)}
                    />
                  </Field>
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-gender">Gender</FieldLabel>
                    <Select
                      value={form.gender || null}
                      onValueChange={(value) => update("gender", value ?? "")}
                    >
                      <SelectTrigger id="edit-gender" className="w-full">
                        <SelectValue placeholder="Select a gender">
                          {(value: string) =>
                            labelFor(GENDERS, value) ?? "Select a gender"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-condition">Condition</FieldLabel>
                    <Select
                      value={form.condition || null}
                      onValueChange={(value) =>
                        update("condition", value ?? "")
                      }
                    >
                      <SelectTrigger id="edit-condition" className="w-full">
                        <SelectValue placeholder="Select a condition">
                          {(value: string) =>
                            labelFor(CONDITIONS, value) ?? "Select a condition"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                    <Select
                      value={form.status || null}
                      onValueChange={(value) => update("status", value ?? "")}
                    >
                      <SelectTrigger id="edit-status" className="w-full">
                        <SelectValue placeholder="Select a status">
                          {(value: string) =>
                            labelFor(STATUSES, value) ?? "Select a status"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {item.numberedCode &&
                      form.status !== item.status &&
                      ITEM_EXIT_STATUSES.includes(form.status) && (
                        <FieldDescription>
                          Saving frees {item.numberedCode}. Remove the tag from
                          this item.
                        </FieldDescription>
                      )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-faceValue">
                      Face value ($)
                    </FieldLabel>
                    <Input
                      id="edit-faceValue"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.faceValue}
                      onChange={(event) =>
                        update("faceValue", event.target.value)
                      }
                    />
                  </Field>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-intendedUse">
                    Intended use
                  </FieldLabel>
                  <Select
                    value={form.intendedUse || null}
                    onValueChange={(value) =>
                      update("intendedUse", value ?? "")
                    }
                  >
                    <SelectTrigger id="edit-intendedUse" className="w-full">
                      <SelectValue placeholder="Select an intended use">
                        {(value: string) =>
                          labelFor(INTENDED_USES, value) ??
                          "Select an intended use"
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
                  <FieldDescription>
                    Only gear library items appear on the public gear library
                    and can be requested or distributed to riders.
                  </FieldDescription>
                </Field>

                <PhotoUploadField
                  idPrefix="edit"
                  value={form.photoUrl}
                  onChange={(url) => update("photoUrl", url)}
                />

                <Field>
                  <FieldLabel htmlFor="edit-notes">Item notes</FieldLabel>
                  <MarkdownTextarea
                    id="edit-notes"
                    value={form.notes}
                    onChange={(event) => update("notes", event.target.value)}
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

      <AlertDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this item. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
