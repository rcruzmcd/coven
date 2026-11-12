"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Eye, EyeOff, ImageOff, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationNav, RowsPerPageSelect } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import {
  downloadPhotosAsZip,
  photosZipName,
} from "@/lib/storage/event-media-zip";
import type { EventMediaRow } from "./media-actions";
import {
  MediaVisibilityBadge,
  MediaVisibilityToggle,
} from "./media-visibility";

/**
 * Photos per page: rows of the 2/3/4-column grid. The first is the default, and
 * the pager shows only past it.
 */
export const PHOTOS_PER_PAGE_OPTIONS = [24, 48, 96] as const;

const MediaLightbox = dynamic(
  () => import("@/components/event-media/media-lightbox"),
  { ssr: false },
);

/**
 * The Media card's photos (#1607): a thumbnail grid that opens the lightbox,
 * a tick on each for a bulk download, and delete for events:manage. Each says
 * whether it is in the public gallery, and events:manage hides or shows one,
 * or the ticked ones together (#1654). One may be the event's flyer (#1827),
 * which events:manage chooses here.
 *
 * The thumbnail is the stored photo itself -- the browser already re-encoded
 * it at 2048px on upload (#1606), so there is no second rendition to keep.
 */
export function MediaPhotoGrid({
  photos,
  eventName,
  canDelete,
  deletingId,
  onDelete,
  publishing,
  onSetPublic,
  flyerId = null,
  onSetFlyer,
}: {
  photos: EventMediaRow[];
  eventName: string;
  /** events:manage: delete, and show or hide in the public gallery. */
  canDelete: boolean;
  deletingId: string | null;
  onDelete: (photo: EventMediaRow) => void;
  publishing: boolean;
  onSetPublic: (photos: EventMediaRow[], isPublic: boolean) => void;
  /** The photo that is the event's flyer. */
  flyerId?: string | null;
  /** Makes a photo the flyer; omitted, nobody here may. */
  onSetFlyer?: (photo: EventMediaRow) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [perPage, setPerPage] = useState<number>(PHOTOS_PER_PAGE_OPTIONS[0]);
  const [requestedPage, setPage] = useState(1);
  // Clamped rather than reset, so a delete on the last page lands on the one
  // before it and an upload doesn't throw the reader back to page one.
  const totalPages = Math.max(1, Math.ceil(photos.length / perPage));
  const page = Math.min(requestedPage, totalPages);
  const pagePhotos = photos.slice((page - 1) * perPage, page * perPage);
  const showPager = photos.length > PHOTOS_PER_PAGE_OPTIONS[0];

  // Only photos that signed can be shown, opened or zipped.
  const viewable = useMemo(
    () =>
      photos.flatMap((photo) =>
        photo.url ? [{ ...photo, url: photo.url }] : [],
      ),
    [photos],
  );
  // A photo deleted since it was ticked drops out of the selection.
  const selectedPhotos = viewable.filter((photo) => selected.has(photo.id));
  const allSelected =
    viewable.length > 0 && selectedPhotos.length === viewable.length;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDownload() {
    const set = selectedPhotos.length > 0 ? selectedPhotos : viewable;
    setProgress(`Preparing 0 of ${set.length}…`);
    const result = await downloadPhotosAsZip(
      set.map((photo) => ({
        url: photo.url,
        filename: photo.original_filename,
      })),
      photosZipName(eventName),
      (done, total) => setProgress(`Preparing ${done} of ${total}…`),
    );
    setProgress(null);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(
        set.length === 1
          ? "1 photo downloaded."
          : `${set.length} photos downloaded.`,
      );
    }
  }

  return (
    <section
      aria-labelledby="event-media-photos"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="event-media-photos" className="text-sm font-semibold">
          Photos{" "}
          <span className="app-muted font-normal">({photos.length})</span>
        </h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {viewable.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected(
                  allSelected ? new Set() : new Set(viewable.map((p) => p.id)),
                )
              }
            >
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
          )}
          {canDelete && selectedPhotos.length > 0 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={publishing}
                onClick={() => onSetPublic(selectedPhotos, false)}
              >
                <EyeOff />
                Hide selected
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={publishing}
                onClick={() => onSetPublic(selectedPhotos, true)}
              >
                <Eye />
                Make selected public
              </Button>
            </>
          )}
          {viewable.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={progress !== null}
              onClick={handleDownload}
            >
              {progress ? <Spinner /> : <Download />}
              {progress ??
                (selectedPhotos.length > 0
                  ? `Download selected (${selectedPhotos.length})`
                  : "Download all")}
            </Button>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pagePhotos.map((photo) => {
          const index = viewable.findIndex((p) => p.id === photo.id);
          return (
            <li
              key={photo.id}
              className="relative flex min-w-0 flex-col gap-1.5"
            >
              <MediaVisibilityBadge
                item={photo}
                className="pointer-events-none absolute top-1.5 left-1.5 z-10"
              />
              {photo.id === flyerId && (
                <Badge className="pointer-events-none absolute top-1.5 right-1.5 z-10">
                  Flyer
                </Badge>
              )}
              {photo.url ? (
                <button
                  type="button"
                  className="overflow-hidden rounded-md border border-[var(--line)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Open ${photo.original_filename}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image would cache it past its expiry */}
                  <img
                    src={photo.display_url ?? photo.url}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ) : (
                <div className="app-muted flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--line)] p-2 text-center text-xs">
                  <ImageOff className="size-5" aria-hidden />
                  Couldn&apos;t load
                </div>
              )}
              <div className="flex min-w-0 items-center gap-2">
                {photo.url && (
                  <Checkbox
                    aria-label={`Select ${photo.original_filename}`}
                    checked={selected.has(photo.id)}
                    onCheckedChange={(on) => toggle(photo.id, on === true)}
                  />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  title={photo.original_filename}
                >
                  {photo.original_filename}
                </span>
                {onSetFlyer && photo.id !== flyerId && (
                  <TooltipIconButton
                    label={`Use ${photo.original_filename} as the flyer`}
                    disabled={publishing}
                    onClick={() => onSetFlyer(photo)}
                  >
                    <Megaphone />
                  </TooltipIconButton>
                )}
                {canDelete && (
                  <MediaVisibilityToggle
                    item={photo}
                    disabled={publishing}
                    onSetPublic={onSetPublic}
                  />
                )}
                {canDelete && (
                  <ConfirmDeleteButton
                    label={`Delete ${photo.original_filename}`}
                    title={`Delete ${photo.original_filename}?`}
                    description="The photo is removed from this event and from storage. This can't be undone."
                    pending={deletingId === photo.id}
                    disabled={deletingId !== null}
                    onConfirm={() => onDelete(photo)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {showPager && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RowsPerPageSelect
            label="Photos per page"
            value={perPage}
            options={PHOTOS_PER_PAGE_OPTIONS}
            onChange={(next) => {
              setPerPage(next);
              setPage(1);
            }}
          />
          <PaginationNav
            page={page}
            totalPages={totalPages}
            count={photos.length}
            pageSize={perPage}
            onPageChange={setPage}
          />
        </div>
      )}

      {openIndex !== null && viewable[openIndex] && (
        <MediaLightbox
          photos={viewable.map((photo) => ({
            url: photo.display_url ?? photo.url,
            alt: photo.original_filename,
            download: photo.download_url
              ? { url: photo.download_url, filename: photo.original_filename }
              : null,
          }))}
          index={openIndex}
          onIndexChange={(next) => {
            setOpenIndex(next);
            // Keep the grid on the page of the photo the lightbox is showing.
            const at = photos.findIndex((p) => p.id === viewable[next]?.id);
            if (at >= 0) setPage(Math.floor(at / perPage) + 1);
          }}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  );
}
