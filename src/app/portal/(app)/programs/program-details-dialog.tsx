"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { EmptyState } from "@/components/portal/empty-state";
import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Plus } from "lucide-react";
import {
  listProgramEventsAction,
  updateProgramAction,
  type ProgramEvent,
} from "./actions";
import {
  ProgramPublicBadge,
  ProgramStatusBadge,
  type ProgramRow,
} from "./program-badges";
import { ProgramPublicFields } from "./program-public-fields";
import { StatusBadge, VisibilityBadge } from "../events/event-badges";
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
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { formatDateTime } from "@/lib/format";
import { countProgramPiecesAction } from "@/lib/social-content/piece-actions";
import { programSocialHref } from "@/lib/social-content/social-filters";

/** What this reader may do with social posts (`content_calendar`), #1838. */
export type ProgramSocialAccess = { canView: boolean; canManage: boolean };

const STATUSES = [
  { value: "pilot", label: "Pilot" },
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
];

type FormState = {
  name: string;
  description: string;
  status: string;
  isPublic: boolean;
  pillar: string;
  emoji: string;
  sortOrder: string;
};

function formStateFor(program: ProgramRow): FormState {
  return {
    name: program.name,
    description: program.description ?? "",
    status: program.status,
    isPublic: program.is_public,
    pillar: program.pillar ?? "",
    emoji: program.emoji ?? "",
    sortOrder: program.sort_order === null ? "" : String(program.sort_order),
  };
}

function isDirty(form: FormState, program: ProgramRow) {
  const baseline = formStateFor(program);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

const EVENT_COLUMNS: PortalDataTableColumn<ProgramEvent>[] = [
  {
    key: "name",
    label: "Event",
    sortValue: (event) => event.name,
    cellClassName: "max-w-xs font-medium",
    render: (event) => (
      <span className="block truncate" title={event.name}>
        {event.name}
      </span>
    ),
  },
  {
    key: "starts_at",
    label: "Starts",
    sortValue: (event) => event.starts_at,
    render: (event) => formatDateTime(event.starts_at),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (event) => event.status,
    render: (event) => <StatusBadge status={event.status} />,
  },
  {
    key: "visibility",
    label: "Visibility",
    hideBelow: "sm",
    sortValue: (event) => event.visibility,
    render: (event) => <VisibilityBadge visibility={event.visibility} />,
  },
];

export function ProgramDetailsDialog({
  program,
  canManage,
  social,
}: {
  program: ProgramRow;
  canManage: boolean;
  social: ProgramSocialAccess;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(program));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [events, setEvents] = useState<ProgramEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // Undefined while loading; null when it could not be counted.
  const [postCount, setPostCount] = useState<number | null | undefined>(
    undefined,
  );
  const formId = `edit-program-form-${program.id}`;
  const dirty = isDirty(form, program);

  useEffect(() => {
    if (!open) return;
    listProgramEventsAction(program.id).then((result) => {
      if ("error" in result) {
        setEventsError(result.error);
      } else {
        setEventsError(null);
        setEvents(result.data);
      }
    });
  }, [open, program.id]);

  useEffect(() => {
    if (!open || !social.canView) return;
    countProgramPiecesAction(program.id).then(setPostCount);
  }, [open, program.id, social.canView]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(program));
      setError(null);
      setMode("view");
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(formStateFor(program));
    setError(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("status", form.status);
    formData.set("is_public", String(form.isPublic));
    formData.set("pillar", form.pillar);
    formData.set("emoji", form.emoji);
    formData.set("sort_order", form.sortOrder);

    startTransition(async () => {
      const result = await updateProgramAction(program.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Program saved.");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View ${program.name}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View ${program.name}`}</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false} size="xl">
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
              <SheetTitle>{program.name}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this program's details."
                  : "View this program's details."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit program"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit program</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={requestExitEditMode}
                >
                  View
                </Button>
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Program name" htmlFor="program-name">
                  {program.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="program-description"
                >
                  <MarkdownText fallback="—">
                    {program.description}
                  </MarkdownText>
                </ReadOnlyField>
                <Field>
                  <FieldLabel htmlFor="program-status">Status</FieldLabel>
                  <div id="program-status">
                    <ProgramStatusBadge status={program.status} />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="program-public">Public site</FieldLabel>
                  <div id="program-public" className="flex flex-col gap-2">
                    <ProgramPublicBadge isPublic={program.is_public} />
                    {program.is_public && (
                      <p className="app-muted text-sm leading-relaxed">
                        {program.pillar
                          ? `Listed under ${program.pillar}`
                          : "Listed after the grouped programs"}
                        {program.sort_order === null
                          ? ""
                          : `, in position ${program.sort_order}`}
                        .
                      </p>
                    )}
                  </div>
                </Field>

                {social.canView && (
                  <Field>
                    <FieldLabel htmlFor="program-posts">
                      Social posts
                    </FieldLabel>
                    <div
                      id="program-posts"
                      className="flex flex-wrap items-center gap-3"
                    >
                      <span className="text-sm">
                        {postCount === undefined
                          ? "Loading..."
                          : postCount === null
                            ? "Could not count this program's posts."
                            : postCount === 1
                              ? "1 post"
                              : `${postCount} posts`}
                      </span>
                      {postCount ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={programSocialHref(program.id)} />}
                        >
                          View posts
                        </Button>
                      ) : null}
                      {social.canManage && (
                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={
                            <Link
                              href={`${programSocialHref(program.id)}&new=1`}
                            />
                          }
                        >
                          <Plus /> New post
                        </Button>
                      )}
                    </div>
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="program-events">
                    Events{events ? ` (${events.length})` : ""}
                  </FieldLabel>
                  <div id="program-events">
                    {eventsError ? (
                      <p className="app-muted text-sm">{eventsError}</p>
                    ) : events === null ? (
                      <TabLoadingSkeleton />
                    ) : events.length === 0 ? (
                      <EmptyState
                        className="py-4"
                        title="No events tagged to this program yet"
                        description="Assign an event to this program from the event's Overview tab and it will be listed here."
                      />
                    ) : (
                      <PortalDataTable
                        columns={EVENT_COLUMNS}
                        rows={events}
                        getRowKey={(event) => event.id}
                        // listProgramEventsAction returns newest first.
                        defaultSort={{ key: "starts_at", dir: "desc" }}
                        emptyMessage="No events to show."
                        // The sheet body is the scroller here, and it brings
                        // its own surface, so the header pins to the top of
                        // that rather than to the portal's header.
                        shell="bare"
                        stickyHeader="container"
                      />
                    )}
                  </div>
                </Field>
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <RequiredFieldsNote />
                  <Field>
                    <FieldLabel htmlFor="program-edit-name" required>
                      Program name
                    </FieldLabel>
                    <Input
                      id="program-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="program-edit-description">
                      Description
                    </FieldLabel>
                    <MarkdownTextarea
                      id="program-edit-description"
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="program-edit-status">
                      Status
                    </FieldLabel>
                    <Select
                      value={form.status}
                      onValueChange={(value) =>
                        update("status", value ?? "pilot")
                      }
                    >
                      <SelectTrigger
                        id="program-edit-status"
                        className="w-full"
                      >
                        <SelectValue placeholder="Select status">
                          {(value: string) =>
                            STATUSES.find((option) => option.value === value)
                              ?.label ?? "Select status"
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
                  </Field>

                  <ProgramPublicFields
                    idPrefix="program-edit"
                    status={form.status}
                    values={form}
                    onChange={(patch) =>
                      setForm((prev) => ({ ...prev, ...patch }))
                    }
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
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
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this program. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
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
