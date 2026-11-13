"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { upsertAgendaAction, type Agenda } from "./agenda-actions";
import type { AgendaItem, AgendaItemSource } from "./agenda-form";
import { refreshAgendaFromEventAction } from "./agenda-prefill-actions";
import { datedRecordHref } from "./meeting-context-shared";
import type { AgendaBodyProps } from "./agenda-tab";
import {
  AgendaCreatedActionItems,
  AgendaDecisions,
  AgendaExport,
  AgendaOpening,
} from "./agenda-parts";
import { listActionItemsAction, type ActionItem } from "./action-items-actions";
import { listDecisionsAction, type Decision } from "./decisions-actions";
import {
  getPreviousMeetingMinutesAction,
  type PreviousMeetingMinutes,
} from "./minutes-approval-actions";
import { OPENING_CHECKLIST } from "./opening-checklist";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Spinner } from "@/components/ui/spinner";
import { MarkdownText } from "@/components/portal/markdown-text";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DocumentField,
  DocumentPreview,
} from "@/components/portal/document-field";
import { EmptyState } from "@/components/portal/empty-state";
import { useTabData } from "@/hooks/use-tab-data";
import { formatCalendarDate } from "@/lib/format";

/**
 * The agenda of a committee, annual or other meeting (#1623): an ordered list
 * of items, each a title and optional notes, which the minutes then follow one
 * entry per item. None of the board agenda's template sections or feeds.
 */
export function SimpleAgenda({
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
  fillsFromEvent,
}: AgendaBodyProps) {
  const router = useRouter();
  const canRefreshFromEvent = fillsFromEvent && !readOnly;
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

  if (mode === "edit" && !readOnly) {
    return (
      <SimpleAgendaForm
        agenda={agenda}
        meetingId={meetingId}
        onSaved={() => {
          onExitEdit();
          refreshAgenda();
        }}
        onCancel={onExitEdit}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!agenda ? (
        <>
          {canRefreshFromEvent && (
            <div className="flex justify-end">
              <RefreshFromEvent meetingId={meetingId} onAdded={refreshAgenda} />
            </div>
          )}
          <EmptyState
            title="No agenda added yet"
            description={
              canRefreshFromEvent
                ? "The linked event has no open work to add. Add the items to discuss with the Edit agenda (pencil) button above."
                : canManage
                  ? "Add the items to discuss with the Edit agenda (pencil) button above."
                  : "The agenda appears here once a governance manager writes it."
            }
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {canRefreshFromEvent && (
              <RefreshFromEvent meetingId={meetingId} onAdded={refreshAgenda} />
            )}
            <AgendaExport
              input={{
                meetingDate,
                agenda,
                sections: [],
                openingChecklist: OPENING_CHECKLIST,
                carriedOverItems: [],
                createdItems: createdItems ?? [],
                decisions: decisions ?? [],
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

          {(agenda.external_link || agenda.document_path) && (
            <FieldGroup>
              <ReadOnlyField label="Document" htmlFor="agenda-document-view">
                <DocumentPreview
                  link={agenda.external_link}
                  path={agenda.document_path}
                  url={agenda.document_url}
                />
              </ReadOnlyField>
            </FieldGroup>
          )}

          <div>
            <p className="text-sm font-semibold">Agenda items</p>
            {agenda.items.length === 0 ? (
              <p className="app-muted text-sm">No items yet.</p>
            ) : (
              <ol className="mt-2 flex list-decimal flex-col gap-3 pl-5">
                {agenda.items.map((item) => (
                  <li key={item.id} className="text-sm">
                    <p className="font-medium break-words">{item.title}</p>
                    {item.source && <ItemSource source={item.source} />}
                    {item.notes?.trim() && (
                      <MarkdownText className="app-muted mt-1 break-words">
                        {item.notes}
                      </MarkdownText>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <AgendaDecisions
            decisions={decisions ?? []}
            onViewAll={onViewDecisions}
          />
          <AgendaCreatedActionItems
            items={createdItems ?? []}
            onViewAll={onViewActionItems}
          />
        </>
      )}
    </div>
  );
}

/**
 * Where a pre-filled item came from (#1624): the event its work sits on, as
 * the frozen label and date it was added with.
 */
function ItemSource({ source }: { source: AgendaItemSource }) {
  return (
    <p className="app-muted text-xs">
      From{" "}
      <Link
        href={datedRecordHref(source.kind, source.id)}
        className="text-[var(--purple-deep)] underline"
      >
        {source.label}
      </Link>
      {source.date && ` — ${formatCalendarDate(source.date)}`}
    </p>
  );
}

/**
 * "Refresh from event" (#1624): adds the linked event's open work that is not
 * on the agenda yet. Nothing is removed or reworded, so it is safe to press
 * whenever the event has moved on.
 */
function RefreshFromEvent({
  meetingId,
  onAdded,
}: {
  meetingId: string;
  onAdded: () => void;
}) {
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshAgendaFromEventAction(meetingId);
      if ("error" in result) {
        setMessage({ text: result.error, error: true });
        return;
      }
      if (result.added === 0) {
        setMessage({
          text: "Nothing new: the event's open work is already on the agenda.",
          error: false,
        });
        return;
      }
      setMessage({
        text: `Added ${result.added} item${result.added === 1 ? "" : "s"} from the event.`,
        error: false,
      });
      onAdded();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        focusableWhenDisabled
        onClick={handleClick}
      >
        {isPending ? <Spinner /> : <RefreshCw />} Refresh from event
      </Button>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={
            message.error ? "text-destructive text-sm" : "app-muted text-sm"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function blankItem(): AgendaItem {
  return { id: crypto.randomUUID(), title: "", notes: "" };
}

function SimpleAgendaForm({
  agenda,
  meetingId,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  agenda: Agenda | null;
  meetingId: string;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [externalLink, setExternalLink] = useState(agenda?.external_link ?? "");
  const [documentPath, setDocumentPath] = useState(agenda?.document_path ?? "");
  // A new agenda opens with one empty row to type into, rather than a lone
  // Add button.
  const [items, setItems] = useState<AgendaItem[]>(() =>
    agenda?.items.length ? agenda.items : [blankItem()],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Captured once on mount, as AgendaForm does, so a background refresh does
  // not move the line edits are compared against.
  const baselineRef = useRef({
    externalLink,
    documentPath,
    items: JSON.stringify(items),
  });

  useEffect(() => {
    const baseline = baselineRef.current;
    onDirtyChange?.(
      externalLink !== baseline.externalLink ||
        documentPath !== baseline.documentPath ||
        JSON.stringify(items) !== baseline.items,
    );
  }, [externalLink, documentPath, items, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function updateItem(id: string, patch: Partial<AgendaItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function moveItem(index: number, offset: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(index + offset, 0, moved);
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("externalLink", externalLink);
    formData.set("documentPath", documentPath);
    formData.set("items", JSON.stringify(items));

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
          <p className="text-sm font-semibold">Agenda items</p>
          <ol className="mt-2 flex flex-col gap-3">
            {items.map((item, index) => {
              const n = index + 1;
              return (
                <li
                  key={item.id}
                  className="rounded-md border border-[var(--line)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <Field className="min-w-0 flex-1">
                      <FieldLabel htmlFor={`agenda-item-title-${item.id}`}>
                        Item {n}
                      </FieldLabel>
                      <Input
                        id={`agenda-item-title-${item.id}`}
                        value={item.title}
                        placeholder="Title"
                        onChange={(event) =>
                          updateItem(item.id, { title: event.target.value })
                        }
                      />
                    </Field>
                    <div className="flex shrink-0 gap-1 pt-6">
                      <ItemButton
                        label={`Move item ${n} up`}
                        disabled={index === 0}
                        onClick={() => moveItem(index, -1)}
                      >
                        <ArrowUp />
                      </ItemButton>
                      <ItemButton
                        label={`Move item ${n} down`}
                        disabled={index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ArrowDown />
                      </ItemButton>
                      <ItemButton
                        label={`Remove item ${n}`}
                        onClick={() =>
                          setItems((prev) =>
                            prev.filter((other) => other.id !== item.id),
                          )
                        }
                      >
                        <Trash2 />
                      </ItemButton>
                    </div>
                  </div>
                  {item.source && <ItemSource source={item.source} />}
                  <Field className="mt-3">
                    <FieldLabel htmlFor={`agenda-item-notes-${item.id}`}>
                      Notes
                    </FieldLabel>
                    <MarkdownTextarea
                      id={`agenda-item-notes-${item.id}`}
                      rows={2}
                      value={item.notes ?? ""}
                      onChange={(event) =>
                        updateItem(item.id, { notes: event.target.value })
                      }
                    />
                  </Field>
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setItems((prev) => [...prev, blankItem()])}
          >
            <Plus /> Add item
          </Button>
        </div>

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

function ItemButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
