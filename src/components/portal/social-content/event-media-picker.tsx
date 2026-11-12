"use client";

import { useState, useTransition } from "react";
import { CameraOff, Check, Film, Images } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { cn } from "@/lib/utils";
import { mediaRoom, type PostFormat } from "@/lib/social-content/pieces";
import { addSocialPostEventMediaAction } from "@/lib/social-content/post-content-actions";
import {
  getEventMediaAction,
  type EventMediaRow,
  type EventMediaState,
} from "@/app/portal/(app)/events/media-actions";

/**
 * Choose from event (#1827): a post related to an event takes that event's
 * photos and videos by reference instead of a second upload. The flyer comes
 * first. What can be ticked follows the format -- a reel one video, a story
 * one file, otherwise up to the carousel limit -- less what the post holds.
 *
 * Event media is not linked to the people in it, so the photo-consent rule is
 * the event Media card's: the count of registrants who objected, and which
 * photos were hidden from the public site.
 */
export function EventMediaPicker({
  postId,
  eventId,
  format,
  held,
  referencedIds,
  onAdded,
  onError,
}: {
  postId: string;
  eventId: string;
  format: PostFormat | null;
  /** How many files the post holds now. */
  held: number;
  /** Event media the post already shows. */
  referencedIds: ReadonlySet<string>;
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EventMediaState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, startTransition] = useTransition();
  const room = mediaRoom(format, held);

  function openPicker() {
    setOpen(true);
    setPicked([]);
    setLoadError(null);
    getEventMediaAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setState(result.data);
    });
  }

  function why(item: EventMediaRow): string | null {
    if (referencedIds.has(item.id)) return "On the post";
    if (room.videoOnly && item.kind !== "video") return "A reel is a video";
    if (!item.url) return "Couldn't load";
    return null;
  }

  function toggle(item: EventMediaRow) {
    setPicked((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : current.length < room.count
          ? [...current, item.id]
          : current,
    );
  }

  function add() {
    startTransition(async () => {
      await runAction(() => addSocialPostEventMediaAction(postId, picked), {
        success: ({ added }) =>
          added === 1
            ? "Added 1 file from the event."
            : `Added ${added} files from the event.`,
        onError,
        onSuccess: () => {
          setOpen(false);
          onAdded();
        },
      });
    });
  }

  const flyer =
    state?.items.find((item) => item.id === state.flyerMediaId) ?? null;
  const rest = state?.items.filter((item) => item.id !== flyer?.id) ?? [];

  function tile(item: EventMediaRow) {
    const reason = why(item);
    const selected = picked.includes(item.id);
    const full = !selected && picked.length >= room.count;
    const hidden = item.kind === "photo" && !item.is_public;
    return (
      <li key={item.id} className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${item.original_filename}${reason ? ` (${reason})` : ""}${hidden ? " (hidden from the public site)" : ""}`}
          disabled={reason !== null || full || adding}
          onClick={() => toggle(item)}
          className={cn(
            "relative aspect-square overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed",
            selected && "ring-2 ring-primary",
            (reason || full) && "opacity-50",
          )}
        >
          {item.url && item.kind === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimisable asset
            <img
              src={item.display_url ?? item.url}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : item.url ? (
            <video
              src={item.url}
              muted
              preload="metadata"
              aria-hidden="true"
              className="size-full object-cover"
            />
          ) : null}
          {item.kind === "video" && (
            <Film
              aria-hidden="true"
              className="absolute right-1 bottom-1 size-4 text-white drop-shadow"
            />
          )}
          {selected && (
            <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check aria-hidden="true" className="size-3.5" />
            </span>
          )}
          {(reason || hidden) && (
            <Badge
              variant="outline"
              className="absolute bottom-1 left-1 bg-background"
            >
              {reason ?? "Hidden"}
            </Badge>
          )}
        </button>
        <span className="truncate text-xs" title={item.original_filename}>
          {item.original_filename}
        </span>
      </li>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={room.count === 0}
        onClick={openPicker}
      >
        <Images />
        Choose from event
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose from the event</DialogTitle>
            <DialogDescription>
              The post shows the event&apos;s own files, not copies. If one is
              deleted from the event, the post shows it as missing.
            </DialogDescription>
          </DialogHeader>
          {loadError ? (
            <Alert variant="destructive">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : !state ? (
            <Spinner />
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
              {state.photoObjections > 0 && (
                <Alert>
                  <CameraOff />
                  <AlertDescription>
                    {state.photoObjections === 1
                      ? "1 person at this event objected to being photographed."
                      : `${state.photoObjections} people at this event objected to being photographed.`}{" "}
                    Check each photo before posting it. Photos marked Hidden
                    were taken off the public site.
                  </AlertDescription>
                </Alert>
              )}
              {state.items.length === 0 ? (
                <p className="app-muted text-sm">
                  This event has no photos or videos yet.
                </p>
              ) : (
                <>
                  {flyer && (
                    <section aria-label="Flyer" className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold">Flyer</h3>
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {tile(flyer)}
                      </ul>
                    </section>
                  )}
                  {rest.length > 0 && (
                    <section
                      aria-label="Photos and videos"
                      className="flex flex-col gap-2"
                    >
                      {flyer && (
                        <h3 className="text-sm font-semibold">
                          Photos and videos
                        </h3>
                      )}
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {rest.map(tile)}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter className="items-center">
            <span className="app-muted mr-auto text-sm" aria-live="polite">
              {picked.length} of {room.count} selected
              {room.videoOnly ? " (a reel is one video)" : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={picked.length === 0 || adding}
              onClick={add}
            >
              {adding && <Spinner />}
              Add {picked.length > 0 ? picked.length : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
