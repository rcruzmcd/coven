"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CameraOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { runAction } from "@/components/portal/action-toast";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { ViewerTime } from "@/components/viewer-time";
import { formatFileSize } from "@/lib/publications";
import {
  eventMediaExpiresSoon,
  eventMediaRetentionLabel,
  keepSignedUrls,
} from "@/lib/storage/event-media-files";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import {
  deleteEventMediaAction,
  getEventMediaAction,
  setEventFlyerAction,
  setEventMediaPublicAction,
  type EventMediaRow,
  type EventMediaState,
} from "./media-actions";
import { EventMediaUploader } from "./event-media-uploader";
import { MediaExpiryNotice } from "./media-expiry-notice";
import { MediaPhotoGrid } from "./media-photo-grid";
import { MediaPublicLink } from "./media-public-link";
import { MediaUploadLinks } from "./media-upload-links";
import { MediaVideoList } from "./media-video-list";

/** formatFileSize rounds anything under a KB up to "1 KB"; nothing is nothing. */
function storageSize(bytes: number): string {
  return bytes > 0 ? formatFileSize(bytes) : "0 MB";
}

type HeldMediaState = Omit<EventMediaState, "items"> & {
  items: (EventMediaRow & { signedAt: number })[];
};

/**
 * What each event's tab last showed, kept across the tab unmounting so coming
 * back to it shows the same URLs, which the browser already has, rather than
 * signing and downloading every photo again (#1653). In memory only.
 */
const heldByEvent = new Map<
  string,
  { state: HeldMediaState; loadedAt: Date }
>();

/**
 * An event's photos and videos (#1606, #1607, #1608, #1654): the upload
 * control, while the organization has uploads on and the reader may upload
 * here; the photo-objection notice; the public gallery's link; what the retention setting deletes soon; then the
 * photo gallery and the video list; how much storage the event and the
 * organization use, and how long this event's media is kept.
 */
export function MediaTab({
  eventId,
  eventName,
  eventStartsAt,
  eventEndsAt,
  timeZone,
}: {
  eventId: string;
  eventName: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  timeZone: string;
}) {
  // `loadedAt` is when `state` was read, which "expires soon" is measured
  // from: a clock read during render would differ between renders.
  const [held, setHeld] = useState(() => heldByEvent.get(eventId) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Whether a show-or-hide is in flight; one at a time, like delete.
  const [publishing, setPublishing] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    const requestedAt = Date.now();
    getEventMediaAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      const prior = heldByEvent.get(eventId);
      const next = {
        state: {
          ...result.data,
          items: keepSignedUrls(
            prior?.state.items ?? [],
            result.data.items,
            requestedAt,
          ),
        },
        loadedAt: new Date(),
      };
      heldByEvent.set(eventId, next);
      setHeld(next);
    });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterTabRefresh<TabValue>("media", load);

  function handleDelete(item: EventMediaRow) {
    setDeletingId(item.id);
    startTransition(async () => {
      await runAction(() => deleteEventMediaAction(item.id), {
        success: `${item.original_filename} deleted.`,
        onSuccess: load,
      });
      setDeletingId(null);
    });
  }

  function handleSetPublic(items: EventMediaRow[], isPublic: boolean) {
    if (items.length === 0) return;
    const name =
      items.length === 1
        ? items[0].original_filename
        : `${items.length} ${items.every((item) => item.kind === "photo") ? "photos" : "files"}`;
    setPublishing(true);
    startTransition(async () => {
      await runAction(
        () =>
          setEventMediaPublicAction(
            eventId,
            items.map((item) => item.id),
            isPublic,
          ),
        {
          success: isPublic
            ? `${name} ${items.length === 1 ? "is" : "are"} public.`
            : `${name} ${items.length === 1 ? "is" : "are"} hidden from the public site.`,
          onSuccess: load,
        },
      );
      setPublishing(false);
    });
  }

  function handleSetFlyer(item: EventMediaRow | null) {
    setPublishing(true);
    startTransition(async () => {
      await runAction(() => setEventFlyerAction(eventId, item?.id ?? null), {
        success: item
          ? `${item.original_filename} is the flyer.`
          : "The event has no flyer now.",
        onSuccess: load,
      });
      setPublishing(false);
    });
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!held) return <TabLoadingSkeleton />;
  const { state, loadedAt } = held;

  const showUploader = state.enabled && state.canUpload;
  // events:manage (canDelete) on top of being allowed to upload at all, which
  // is what rules out the demo tenant (#1620).
  const showLinks = showUploader && state.canDelete;
  const photos = state.items.filter((item) => item.kind === "photo");
  const videos = state.items.filter((item) => item.kind === "video");
  const flyer = photos.find((item) => item.id === state.flyerMediaId) ?? null;
  const expiring = state.items.filter((item) =>
    eventMediaExpiresSoon(item.expires_at, loadedAt),
  );

  return (
    <div className="flex flex-col gap-4">
      {state.photoObjections > 0 && (
        <Alert>
          <CameraOff />
          <AlertTitle>Photo objections at this event</AlertTitle>
          <AlertDescription>
            {state.photoObjections === 1
              ? "1 person at this event objected to being photographed"
              : `${state.photoObjections} people at this event objected to being photographed`}{" "}
            {state.publicGalleryEnabled
              ? "— photos go on the public site as soon as they are uploaded, so check them now and hide any photo of someone who objected."
              : "— check photos and footage before sharing them outside the portal."}
          </AlertDescription>
        </Alert>
      )}
      {expiring.length > 0 && (
        <MediaExpiryNotice items={expiring} timeZone={timeZone} />
      )}
      {showUploader && (
        <EventMediaUploader eventId={eventId} onUploaded={load} />
      )}
      {showLinks && (
        <MediaUploadLinks
          eventId={eventId}
          eventStartsAt={eventStartsAt}
          eventEndsAt={eventEndsAt}
          timeZone={timeZone}
        />
      )}
      {state.publicGalleryUrl && (
        <MediaPublicLink url={state.publicGalleryUrl} />
      )}
      {!state.publicGalleryEnabled && state.items.length > 0 && (
        <p className="app-muted text-sm">
          The public event gallery is off for this organization, so nothing here
          is on the public site, whatever it is marked.
        </p>
      )}
      {(flyer || state.canDelete) && (
        <section
          aria-labelledby="event-media-flyer"
          className="flex flex-col gap-2"
        >
          <h3 id="event-media-flyer" className="text-sm font-semibold">
            Flyer
          </h3>
          {flyer ? (
            <div className="flex items-center gap-3">
              {(flyer.display_url ?? flyer.url) ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image would cache it past its expiry
                <img
                  src={flyer.display_url ?? flyer.url ?? undefined}
                  alt={`Flyer: ${flyer.original_filename}`}
                  className="h-24 w-auto max-w-32 rounded-md border border-[var(--line)] object-cover"
                />
              ) : null}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm">
                  {flyer.original_filename}
                </span>
                <span className="app-muted text-xs">
                  Offered first when a social post takes media from this event.
                  Kept whatever the retention setting.
                </span>
                {state.canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    disabled={publishing}
                    onClick={() => handleSetFlyer(null)}
                  >
                    Remove as flyer
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="app-muted text-sm">
              {photos.length > 0
                ? "No flyer yet. Choose Use as flyer on one of the photos below."
                : "No flyer yet. Upload it here, then choose Use as flyer on it."}
            </p>
          )}
        </section>
      )}
      {state.items.length === 0 ? (
        <EmptyState
          title="No photos or videos yet"
          description={
            !state.enabled
              ? "Event media uploads are turned off for this organization. Someone who manages events can turn them on from the Media button on the Events page."
              : showUploader
                ? "Upload what was taken at this event so it stays with the event."
                : "Event staff can upload what was taken at this event."
          }
        />
      ) : (
        <>
          {photos.length > 0 && (
            <MediaPhotoGrid
              photos={photos}
              eventName={eventName}
              canDelete={state.canDelete}
              deletingId={deletingId}
              onDelete={handleDelete}
              publishing={publishing}
              onSetPublic={handleSetPublic}
              flyerId={state.flyerMediaId}
              onSetFlyer={state.canDelete ? handleSetFlyer : undefined}
            />
          )}
          {videos.length > 0 && (
            <MediaVideoList
              videos={videos}
              timeZone={timeZone}
              canDelete={state.canDelete}
              deletingId={deletingId}
              onDelete={handleDelete}
              publishing={publishing}
              onSetPublic={handleSetPublic}
            />
          )}
        </>
      )}
      <p className="app-muted text-xs">
        Storage: {storageSize(state.eventBytes)} for this event,{" "}
        {storageSize(state.tenantBytes)} for all of this organization&apos;s
        event media.{" "}
        {state.retentionDays === null ? (
          "Kept indefinitely."
        ) : (
          <>
            Kept {eventMediaRetentionLabel(state.retentionDays).toLowerCase()}
            {state.eventExpiresAt && (
              <>
                , until{" "}
                <ViewerTime
                  iso={state.eventExpiresAt}
                  fallbackZone={timeZone}
                />
              </>
            )}
            .
          </>
        )}
      </p>
    </div>
  );
}
