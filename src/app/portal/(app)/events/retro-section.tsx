"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import {
  deleteEventRetroItemAction,
  getEventRetroAction,
  setEventRetroActionDoneAction,
  type EventRetro,
  type EventRetroItem,
} from "./retro-actions";
import {
  RETRO_AREA_LABELS,
  RETRO_KIND_LABELS,
  RETRO_KINDS,
  type RetroKind,
} from "./retro-form";
import { RetroItemDialog } from "./retro-item-dialog";
import { useTabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { runAction } from "@/components/portal/action-toast";
import { cn } from "@/lib/utils";

/** Who may change an item: an event manager, or its author while on staff. */
export function canChangeRetroItem(
  item: Pick<EventRetroItem, "author_id">,
  viewer: { canManage: boolean; canWrite?: boolean; userId: string },
) {
  return (
    viewer.canManage ||
    (item.author_id === viewer.userId && viewer.canWrite !== false)
  );
}

/**
 * One action item's open/done box, its owner, and who raised it. Shared by
 * the retro and by the Checklist card's carried-forward list.
 */
export function RetroActionRow({
  item,
  canToggle,
  pending,
  onToggle,
  children,
}: {
  item: EventRetroItem;
  canToggle: boolean;
  pending: boolean;
  onToggle: (done: boolean) => void;
  children?: React.ReactNode;
}) {
  const done = item.status === "done";
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={!canToggle || pending}
        aria-label={`Mark "${item.body}" ${done ? "open" : "done"}`}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={cn(
            "text-sm break-words whitespace-pre-wrap",
            done && "app-muted line-through",
          )}
        >
          {item.body}
        </p>
        <RetroItemMeta item={item} />
        {children}
      </div>
    </div>
  );
}

function RetroItemMeta({ item }: { item: EventRetroItem }) {
  const parts = [
    item.kind === "action"
      ? `Owner: ${item.owner?.name ?? "unassigned"}`
      : null,
    item.author_name
      ? `by ${item.author_name}`
      : item.author_id === null
        ? "from the earlier written report"
        : null,
  ].filter(Boolean);
  return (
    <div className="app-muted flex flex-wrap items-center gap-2 text-xs">
      {item.area && (
        <Badge variant="outline">{RETRO_AREA_LABELS[item.area]}</Badge>
      )}
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
    </div>
  );
}

/**
 * The event's retro (#1578), on the Results card: went-well, improve and action
 * items from anyone on the event's staff roster or holding events:manage. It
 * keeps its own controls rather than following the card's edit mode, since
 * staff who add items cannot edit the report itself.
 */
export function RetroSection({ eventId }: { eventId: string }) {
  const router = useRouter();
  const {
    data: retro,
    loadError,
    refresh: reload,
  } = useTabData<EventRetro>(() => getEventRetroAction(eventId), [eventId]);
  const [dialog, setDialog] = useState<{
    item?: EventRetroItem;
    kind: RetroKind;
    key: number;
  } | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    reload();
    router.refresh();
  }

  function withPending(id: string, run: () => Promise<unknown>) {
    setError(null);
    setPendingIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await run();
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  function handleToggle(id: string, done: boolean) {
    withPending(id, () =>
      runAction(() => setEventRetroActionDoneAction(id, done), {
        success: done ? "Action item done." : "Action item reopened.",
        onError: setError,
        onSuccess: refresh,
      }),
    );
  }

  function handleDelete(id: string) {
    withPending(id, () =>
      runAction(() => deleteEventRetroItemAction(id), {
        success: "Retro item removed.",
        onError: setError,
        onSuccess: refresh,
      }),
    );
  }

  const canAdd = !!retro && retro.canWrite && !retro.locked;

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Retro</FieldLabel>
        {canAdd && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ kind: "went_well", key: Date.now() })}
          >
            + Add to retro
          </Button>
        )}
      </div>

      {(loadError || error) && (
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? error}</AlertDescription>
        </Alert>
      )}

      {!retro ? (
        !loadError && <TabLoadingSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {RETRO_KINDS.map((kind) => {
            // Done actions sink below open ones; the sort is stable, so
            // each half keeps its written order.
            const items = retro.items
              .filter((item) => item.kind === kind)
              .sort(
                (a, b) =>
                  Number(a.status === "done") - Number(b.status === "done"),
              );
            return (
              <section
                key={kind}
                aria-label={RETRO_KIND_LABELS[kind]}
                className="flex min-w-0 flex-col gap-2"
              >
                <h4 className="app-eyebrow">
                  {RETRO_KIND_LABELS[kind]}
                  {items.length > 0 && ` (${items.length})`}
                </h4>
                {items.length === 0 ? (
                  <p className="app-muted text-sm">Nothing yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[var(--line)]">
                    {items.map((item) => {
                      const changeable = canChangeRetroItem(item, retro);
                      const controls = changeable && !retro.locked && (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit retro item"
                            disabled={pendingIds.has(item.id)}
                            focusableWhenDisabled
                            onClick={() =>
                              setDialog({ item, kind, key: Date.now() })
                            }
                          >
                            <PencilIcon />
                          </Button>
                          <ConfirmDeleteButton
                            label="Remove retro item"
                            title="Remove this retro item?"
                            description="This deletes the item from the event's retro. It can't be undone."
                            confirmLabel="Remove"
                            pending={pendingIds.has(item.id)}
                            onConfirm={() => handleDelete(item.id)}
                          />
                        </div>
                      );
                      return (
                        <li key={item.id} className="py-2">
                          {kind === "action" ? (
                            <RetroActionRow
                              item={item}
                              canToggle={changeable}
                              pending={pendingIds.has(item.id)}
                              onToggle={(done) => handleToggle(item.id, done)}
                            >
                              {controls}
                            </RetroActionRow>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <p className="text-sm break-words whitespace-pre-wrap">
                                {item.body}
                              </p>
                              <RetroItemMeta item={item} />
                              {controls}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {retro && dialog && (
        <RetroItemDialog
          key={dialog.key}
          eventId={eventId}
          item={dialog.item}
          defaultKind={dialog.kind}
          owners={retro.owners}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSaved={refresh}
        />
      )}
    </Field>
  );
}
