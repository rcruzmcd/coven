"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  RECORD_PREVIEW_KIND_LABELS,
  type RecordPreview,
  type RecordPreviewKind,
  type RecordPreviewLoaders,
  type RecordPreviewRef,
} from "@/lib/portal/record-preview";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/portal/status-badge";
import { useTabData } from "@/hooks/use-tab-data";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { EMPTY_VALUE } from "@/lib/format";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * Opening a referenced record without leaving the page that referred to it
 * (#1225).
 *
 * #1223 and #1224 put the calendar's dates and each topic's records beside the
 * minutes, as links. #1200's autosave made following one *safe*, but safe is
 * not the same as staying: the notetaker still loses their place, and losing
 * their place is the sentence the whole #1199-#1201 run exists to answer.
 *
 * **One overlay, ever.** A `Sheet` over a `Sheet` is two backdrops and two
 * scroll containers, and on a 390px screen the quick reference *is* already a
 * sheet. So this provider owns a single sheet with two possible views: the
 * host panel it was given (the minutes' quick reference, on a phone) and one
 * record's detail, which replaces the host's body rather than stacking over it
 * and offers a back button in its place. On a desktop there is no host -- the
 * quick reference is an aside that stays put -- and the same sheet opens over
 * the page with nothing to go back to.
 *
 * Read-only by design: the write from the minutes is an action item, and that
 * dialog exists.
 */

/** The panel a phone shows behind a button, and whose body a record replaces. */
export type RecordPreviewHost = {
  title: string;
  description: string;
  body: ReactNode;
};

type RecordPreviewContextValue = {
  loaders: RecordPreviewLoaders;
  forbiddenKinds: readonly RecordPreviewKind[];
  hasHost: boolean;
  openRecord: (record: RecordPreviewRef, trigger: HTMLElement | null) => void;
  openHost: (trigger: HTMLElement | null) => void;
};

const RecordPreviewContext = createContext<RecordPreviewContextValue | null>(
  null,
);

/** Null outside a provider, which is what lets a link fall back to navigating. */
export function useRecordPreview(): RecordPreviewContextValue | null {
  return useContext(RecordPreviewContext);
}

type View =
  | { kind: "host" }
  | { kind: "record"; record: RecordPreviewRef; fromHost: boolean };

export function RecordPreviewProvider({
  loaders,
  forbiddenKinds = [],
  host,
  children,
}: {
  loaders: RecordPreviewLoaders;
  /**
   * Kinds this viewer's role does not carry. Their references render as plain
   * text: a governance manager without `events:view` must not be offered a
   * link that can only refuse. The loaders refuse too -- this is the courtesy,
   * not the gate.
   */
  forbiddenKinds?: readonly RecordPreviewKind[];
  /** Omitted on a desktop, where the quick reference is an aside. */
  host?: RecordPreviewHost;
  children: ReactNode;
}) {
  const [view, setView] = useState<View | null>(null);
  // What opened the sheet, so closing puts focus back on it. Base UI returns
  // focus to its own `Trigger`, and these triggers are scattered across the
  // page rather than wrapped around this sheet, so it is handed the element.
  const triggerRef = useRef<HTMLElement | null>(null);

  function openRecord(record: RecordPreviewRef, trigger: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger;
    setView((current) => ({
      kind: "record",
      record,
      fromHost: current?.kind === "host",
    }));
  }

  function openHost(trigger: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger;
    setView({ kind: "host" });
  }

  return (
    <RecordPreviewContext.Provider
      value={{
        loaders,
        forbiddenKinds,
        hasHost: host !== undefined,
        openRecord,
        openHost,
      }}
    >
      {children}
      <Sheet
        open={view !== null}
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
      >
        <SheetContent side="right" finalFocus={triggerRef}>
          {view?.kind === "record" ? (
            <RecordPreviewView
              record={view.record}
              loaders={loaders}
              onBack={
                view.fromHost && host
                  ? () => setView({ kind: "host" })
                  : undefined
              }
              backLabel={host?.title ?? ""}
            />
          ) : host ? (
            <>
              <SheetHeader>
                <SheetTitle>{host.title}</SheetTitle>
                <SheetDescription>{host.description}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {host.body}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </RecordPreviewContext.Provider>
  );
}

/** The record's when, in its own zone and saying which zone that is. */
function When({ preview }: { preview: RecordPreview }) {
  const viewerZone = useViewerTimeZone();
  const start = formatDateTimeInZone(
    preview.startsAt,
    preview.timeZone,
    DATE_TIME_WITH_ZONE,
    "en-US",
  );
  const end = preview.endsAt
    ? formatDateTimeInZone(
        preview.endsAt,
        preview.timeZone,
        DATE_TIME_WITH_ZONE,
        "en-US",
      )
    : null;

  return (
    <div>
      <time dateTime={preview.startsAt} className="text-sm">
        {start}
        {end && ` – ${end}`}
      </time>
      {/* The portal shows instants in the viewer's zone (#1057); this one is
          shown in the record's, because a notetaker is writing down which
          evening the event is on and the record's clock is the answer. Where
          the two differ, the viewer's is the second line rather than the
          missing one. */}
      {viewerZone && viewerZone !== preview.timeZone && (
        <p className="app-muted text-xs">
          {formatDateTimeInZone(
            preview.startsAt,
            viewerZone,
            DATE_TIME_WITH_ZONE,
            "en-US",
          )}{" "}
          your time
        </p>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="app-muted text-xs font-semibold tracking-[0.1em] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * One record, loaded on open.
 *
 * The header lives here rather than in the provider so the sheet's title is
 * the record's own name as soon as the read lands -- a swapping body that
 * keeps announcing the panel it replaced tells a screen reader the wrong
 * thing.
 */
function RecordPreviewView({
  record,
  loaders,
  onBack,
  backLabel,
}: {
  record: RecordPreviewRef;
  loaders: RecordPreviewLoaders;
  /** Present only where the sheet has something to go back to. */
  onBack?: () => void;
  backLabel: string;
}) {
  const { data: preview, loadError } = useTabData<RecordPreview>(async () => {
    const loader = loaders[record.kind];
    if (!loader) {
      return { error: "This record cannot be opened from here." };
    }
    const result = await loader(record.id);
    return "error" in result ? { error: result.error.message } : result;
  }, [record.kind, record.id]);

  return (
    <>
      <SheetHeader className="flex-row items-start gap-2">
        {onBack && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Back to ${backLabel}`}
                  onClick={onBack}
                />
              }
            >
              <ArrowLeft />
            </TooltipTrigger>
            <TooltipContent>{`Back to ${backLabel}`}</TooltipContent>
          </Tooltip>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <SheetTitle>{preview?.title ?? record.label}</SheetTitle>
          <SheetDescription>
            {RECORD_PREVIEW_KIND_LABELS[record.kind]}
          </SheetDescription>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loadError ? (
          <p className="app-muted text-sm">{loadError}</p>
        ) : preview === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <dl className="flex flex-col gap-4">
            <Detail label="When">
              <When preview={preview} />
            </Detail>
            {preview.location !== null && (
              <Detail label="Where">{preview.location || EMPTY_VALUE}</Detail>
            )}
            <Detail label="Status">
              <StatusBadge tone={preview.statusTone}>
                {preview.statusLabel}
              </StatusBadge>
            </Detail>
            {preview.figures.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {preview.figures.map((figure) => (
                  <Detail key={figure.label} label={figure.label}>
                    {figure.value}
                  </Detail>
                ))}
              </div>
            )}
            <Detail label="Summary">
              <MarkdownText fallback="None recorded.">
                {preview.summary}
              </MarkdownText>
            </Detail>
          </dl>
        )}
      </div>

      {/* The floor under "more details": whatever the sheet leaves out is one
          click away, and that click is the navigation this exists to make
          optional rather than forbidden. */}
      {preview && (
        <SheetFooter>
          {/* A styled `Link`, not a `Button` rendering one: Base UI's
              `nativeButton={false}` puts `role="button"` on the anchor, and
              this navigates, so it has to announce as a link. */}
          <Link
            href={preview.href}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open full record
          </Link>
        </SheetFooter>
      )}
    </>
  );
}

/**
 * A reference, as the surface that carries it should render it.
 *
 * Three renderings, and which one you get is a permission answer:
 * - inside a provider, with the kind readable: a button that opens the sheet;
 * - inside a provider, with the kind forbidden: plain text, because a link
 *   that can only refuse is worse than no link;
 * - outside a provider: the ordinary link it was before this existed.
 */
export function RecordPreviewLink({
  record,
  href,
  className,
}: {
  record: RecordPreviewRef;
  /** Where the full record lives, for the no-provider fallback. */
  href: string;
  className?: string;
}) {
  const preview = useRecordPreview();

  if (!preview || !preview.loaders[record.kind]) {
    return (
      <Link href={href} className={className}>
        {record.label}
      </Link>
    );
  }

  if (preview.forbiddenKinds.includes(record.kind)) {
    return <span className={className}>{record.label}</span>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => preview.openRecord(record, event.currentTarget)}
    >
      {record.label}
    </button>
  );
}
