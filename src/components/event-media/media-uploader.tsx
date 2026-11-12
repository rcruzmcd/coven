"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Film,
  ImageIcon,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/publications";
import {
  createEventMediaQueue,
  type EventMediaItem,
  type EventMediaQueue,
  type EventMediaQueueDeps,
  type RemoteFile,
} from "@/lib/storage/event-media-queue";
import {
  downloadDriveFile,
  formatMegabytes,
  planDriveDownload,
  type PickedDriveDoc,
} from "@/lib/storage/google-drive";

/**
 * What the file picker offers. HEIC/HEIF and .mov are named by extension too,
 * because several browsers report them with no MIME type at all.
 */
const ACCEPT =
  "image/*,video/mp4,video/quicktime,video/webm,.heic,.heif,.mov,.mp4,.m4v,.webm";

/**
 * How long finished files gather before the list below reloads: one reload
 * for a burst of photos rather than one each (#1653), while a new photo still
 * shows within a second or so.
 */
export const UPLOADED_REFRESH_DELAY_MS = 1000;

/** More uploads than this start folded into their summary line. */
export const COLLAPSE_ABOVE = 3;

/**
 * How long a cleanly finished batch stays on screen before it clears itself,
 * where `clearWhenDone` is set: long enough to read, and the files are in the
 * list below by then.
 */
export const CLEAR_DONE_DELAY_MS = 4000;

/**
 * The largest file taken from Google Drive (#1634). A Drive file is held in
 * the browser's memory between download and upload, so it is bounded well
 * below the 10 GB a local file may be; the server-side transfer (#1637) lifts
 * this.
 */
export const DRIVE_MEDIA_MAX_BYTES = 500 * 1024 * 1024;

function driveTooLarge(name: string, maxBytes: number) {
  return `${name} is larger than ${formatMegabytes(maxBytes)}, the limit from Google Drive. Download it from Drive and upload it from this device instead.`;
}

/** Picked Drive docs as queue rows, each fetched only when the queue is ready. */
export function driveRemoteFiles(
  docs: PickedDriveDoc[],
  accessToken: string,
): RemoteFile[] {
  return docs.map((doc) => {
    const plan = planDriveDownload(doc, {
      accept: ACCEPT,
      maxBytes: DRIVE_MEDIA_MAX_BYTES,
      tooLarge: driveTooLarge,
    });
    const size = Number(doc.sizeBytes);
    const base = {
      name: doc.name || "Untitled",
      size: doc.sizeBytes !== undefined && Number.isFinite(size) ? size : null,
      kind: doc.mimeType.startsWith("video/")
        ? ("video" as const)
        : doc.mimeType.startsWith("image/")
          ? ("photo" as const)
          : null,
    };
    if ("error" in plan) return { ...base, error: plan.error };
    return {
      ...base,
      fetch: (onProgress) =>
        downloadDriveFile(plan, accessToken, {
          maxBytes: DRIVE_MEDIA_MAX_BYTES,
          tooLarge: driveTooLarge,
          onProgress: (loaded, total) =>
            onProgress(total ? Math.min(1, loaded / total) : null),
        }),
    };
  });
}

const STATUS_LABELS: Record<EventMediaItem["status"], string> = {
  queued: "Waiting",
  downloading: "Downloading from Drive",
  uploading: "Uploading",
  paused: "Paused",
  failed: "Failed",
  done: "Uploaded",
};

/**
 * Picks and uploads photos and videos (#1606), several at once, each with its
 * own progress. A video can be paused, and a failed one resumes from where it
 * stopped rather than starting over.
 *
 * Shared by the event's Media card and the upload-link page (#1620), which
 * differ only in `deps`: where slots come from, how a finished file is
 * recorded, and whether it can be taken back. `deps` is read once, on mount.
 */
export function MediaUploader({
  deps,
  hint,
  disabled = false,
  googleDrive = false,
  clearWhenDone = false,
  onUploaded,
}: {
  deps: EventMediaQueueDeps;
  hint: React.ReactNode;
  /** Holds the picker shut, e.g. until the rights box is ticked. */
  disabled?: boolean;
  /**
   * Offer **From Google Drive** (#1634). Signed-in pages only: the upload-link
   * page is public and leaves it off (#1627 non-goals).
   */
  googleDrive?: boolean;
  /**
   * Clear a batch once every file is in and none failed. For a page that lists
   * the uploaded files elsewhere; the upload-link page has no such list, and
   * its rows carry Delete.
   */
  clearWhenDone?: boolean;
  onUploaded?: () => void;
}) {
  const [queue] = useState<EventMediaQueue>(() => createEventMediaQueue(deps));
  const items = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Null until the reader chooses: then the list's length decides.
  const [expanded, setExpanded] = useState<boolean | null>(null);

  // The list below the uploader reloads once the files recorded in the last
  // UPLOADED_REFRESH_DELAY_MS are in, not once per file.
  const doneCount = items.filter((item) => item.status === "done").length;
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (doneCount === 0 || refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      onUploadedRef.current?.();
    }, UPLOADED_REFRESH_DELAY_MS);
  }, [doneCount]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    },
    [],
  );

  // Leaving the page drops every request in flight; say so first.
  const busy = items.some(
    (item) =>
      item.status === "uploading" ||
      item.status === "queued" ||
      item.status === "downloading",
  );
  const cleanBatch =
    items.length > 0 && items.every((item) => item.status === "done");
  useEffect(() => {
    if (!clearWhenDone || !cleanBatch) return;
    const timer = setTimeout(() => {
      for (const item of queue.getSnapshot()) queue.dismiss(item.id);
    }, CLEAR_DONE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [clearWhenDone, cleanBatch, queue]);

  useEffect(() => {
    if (!busy) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Cleared so picking the same file again (after a dismiss) still fires.
    event.target.value = "";
    if (files.length > 0) void queue.add(files);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          Upload photos &amp; videos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          // Hidden: the button above is the control people reach.
          className="hidden"
          aria-label="Choose photos and videos to upload"
          onChange={handlePick}
        />
        {googleDrive && (
          <GoogleDriveButton
            accept={ACCEPT}
            multiple
            disabled={disabled}
            onPick={({ docs, accessToken }) =>
              queue.addRemote(driveRemoteFiles(docs, accessToken))
            }
          />
        )}
        <p className="app-muted text-xs">{hint}</p>
      </div>

      {items.length > 0 && (
        <UploadsPanel
          items={items}
          queue={queue}
          expanded={expanded ?? items.length <= COLLAPSE_ABOVE}
          onExpandedChange={setExpanded}
        />
      )}
    </div>
  );
}

/** Rows that need the reader: a failure to retry, a video to pause or resume. */
function needsAttention(item: EventMediaItem) {
  return (
    item.status === "failed" ||
    item.status === "paused" ||
    (item.kind === "video" && item.status === "uploading")
  );
}

/**
 * The upload list as one summary line with the batch's overall progress, the
 * rows themselves behind **Show files** in a capped, scrolling panel. Rows
 * that need the reader show either way.
 */
function UploadsPanel({
  items,
  queue,
  expanded,
  onExpandedChange,
}: {
  items: EventMediaItem[];
  queue: EventMediaQueue;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const active = items.length - done - failed;
  // Each file counts once; one in flight counts for what it has sent.
  const settled = items.reduce(
    (sum, item) =>
      sum +
      (item.status === "done" || item.status === "failed"
        ? 1
        : item.status === "uploading" || item.status === "paused"
          ? (item.progress ?? 0)
          : 0),
    0,
  );
  const percent = Math.round((settled / items.length) * 100);
  const files = (n: number) => (n === 1 ? "1 file" : `${n} files`);
  const summary =
    active > 0
      ? `Uploading ${files(items.length)}: ${done} done${failed ? `, ${failed} failed` : ""}`
      : `${done} uploaded${failed ? `, ${failed} failed` : ""}`;
  const shown = expanded ? items : items.filter(needsAttention);

  return (
    <section
      aria-label="Uploads"
      className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1" aria-live="polite">
          {summary}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? "Hide files" : `Show files (${items.length})`}
        </Button>
        {done + failed > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              for (const item of items) queue.dismiss(item.id);
            }}
          >
            Clear finished
          </Button>
        )}
      </div>
      {active > 0 && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {shown.length > 0 && (
        <ul
          className="flex max-h-80 flex-col gap-1.5 overflow-y-auto"
          aria-label="Upload files"
        >
          {shown.map((item) => (
            <UploadRow key={item.id} item={item} queue={queue} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadRow({
  item,
  queue,
}: {
  item: EventMediaItem;
  queue: EventMediaQueue;
}) {
  const percent =
    item.progress === null ? null : Math.round(item.progress * 100);
  const showBar =
    item.status === "uploading" ||
    item.status === "paused" ||
    item.status === "downloading";
  const KindIcon = item.kind === "video" ? Film : ImageIcon;

  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-[var(--line)] px-3 py-1.5"
      data-status={item.status}
    >
      <div className="flex items-center gap-2 text-sm">
        <KindIcon className="app-muted size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={item.name}>
          {item.name}
        </span>
        {item.size !== null && (
          <span className="app-muted shrink-0 text-xs tabular-nums">
            {formatFileSize(item.size)}
          </span>
        )}
        <span
          className={
            item.status === "failed"
              ? "shrink-0 text-xs text-destructive"
              : "app-muted shrink-0 text-xs"
          }
          aria-live="polite"
        >
          {STATUS_LABELS[item.status]}
          {showBar && percent !== null ? ` ${percent}%` : ""}
        </span>
        {item.kind === "video" && item.status === "uploading" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Pause ${item.name}`}
            onClick={() => queue.pause(item.id)}
          >
            <Pause className="size-4" />
          </Button>
        )}
        {item.status === "paused" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Resume ${item.name}`}
            onClick={() => queue.resume(item.id)}
          >
            <Play className="size-4" />
          </Button>
        )}
        {item.status === "failed" && item.retryable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Retry ${item.name}`}
            onClick={() => queue.retry(item.id)}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        {item.removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.name}`}
            onClick={() => void queue.remove(item.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        {(item.status === "done" || item.status === "failed") && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss ${item.name}`}
            onClick={() => queue.dismiss(item.id)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {showBar && (
        <div
          role="progressbar"
          aria-label={`${item.status === "downloading" ? "Downloading" : "Uploading"} ${item.name}`}
          // Omitted while indeterminate, as on the artwork upload field.
          aria-valuenow={percent ?? undefined}
          aria-valuemin={percent === null ? undefined : 0}
          aria-valuemax={percent === null ? undefined : 100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={
              percent === null
                ? "h-full w-1/3 animate-pulse rounded-full bg-primary"
                : "h-full rounded-full bg-primary transition-[width] duration-200"
            }
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      )}
      {item.error && <p className="text-xs text-destructive">{item.error}</p>}
    </li>
  );
}
