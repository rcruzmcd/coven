"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import {
  BookOpenIcon,
  CheckIcon,
  FileIcon,
  Maximize2Icon,
  CaptionsIcon,
  Share2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  pageFromHash,
  spreadOf,
  spreadSides,
  type PublicationPage,
  type SpreadSide,
} from "@/lib/publications";
import { cn } from "@/lib/utils";

// Loaded on the first tap of a page, not with the reader.
const PageLightbox = dynamic(() => import("./page-lightbox"), { ssr: false });

type Layout = "single" | "spread";

// ---------------------------------------------------------------------------
// The reader's choices (single/spread, transcripts on/off), remembered per
// viewer. Storage can be missing or refuse (private windows, blocked site
// data), so each choice also lives in memory and the reader works the same
// without it.
// ---------------------------------------------------------------------------

function storedChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const listeners = new Set<() => void>();
  let inMemory = fallback;

  function read(): T {
    try {
      const stored = window.localStorage.getItem(key);
      if (allowed.includes(stored as T)) return stored as T;
    } catch {
      // Fall back to this page load's choice.
    }
    return inMemory;
  }

  function store(next: T) {
    inMemory = next;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Remembered for this page load only.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }

  return { read, store, subscribe, serverValue: () => fallback };
}

const layoutChoice = storedChoice<Layout>(
  "publication-reader-layout",
  ["single", "spread"],
  "single",
);

// Transcripts are off by default and on when asked for. Off only hides them
// from the eye: they stay in the page for screen readers, who they are for.
const transcriptChoice = storedChoice(
  "publication-reader-transcripts",
  ["on", "off"],
  "off",
);

// Spreads are for wide screens (Tailwind's `lg`); a phone always gets single
// pages, whatever was chosen on a laptop.
const WIDE_QUERY = "(min-width: 64rem)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * An issue's pages (#1471) with the reader around them (#1473): a "Page N of
 * M" counter, facing-page spreads on wide screens, a `#page-N` address that
 * follows the reader and can be shared, and a full-screen view that opens on
 * the page that was tapped.
 *
 * The pages, alt text and transcripts are server-rendered as before; nothing
 * here takes over scrolling or zoom. Until the script runs the page is the
 * plain scroll #1471 shipped, and native anchors still land on `#page-N`.
 */
export function IssueReader({
  title,
  pages,
}: {
  title: string;
  pages: PublicationPage[];
}) {
  const total = pages.length;
  const layout = useSyncExternalStore(
    layoutChoice.subscribe,
    layoutChoice.read,
    layoutChoice.serverValue,
  );
  const transcripts =
    useSyncExternalStore(
      transcriptChoice.subscribe,
      transcriptChoice.read,
      transcriptChoice.serverValue,
    ) === "on";
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  const spread = layout === "spread";
  const sides = spreadSides(total);

  const listRef = useRef<HTMLOListElement>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const currentRef = useRef<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxIndexRef = useRef(0);

  // Which page is being read: the first one crossing a line 40% down the
  // viewport. Observed, not computed on scroll, so scrolling stays the
  // browser's own.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const crossing = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const position = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) crossing.add(position);
          else crossing.delete(position);
        }
        if (crossing.size > 0) {
          const first = Math.min(...crossing);
          currentRef.current = first;
          setCurrent(first);
        }
      },
      { rootMargin: "-40% 0px -59% 0px" },
    );
    list
      .querySelectorAll<HTMLElement>("[data-page]")
      .forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [total]);

  // The address follows the page, replacing rather than pushing, so Back
  // still leaves the issue instead of stepping through its pages.
  useEffect(() => {
    if (current === null) return;
    const hash = `#page-${current}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, "", hash);
    }
  }, [current]);

  // Arriving on `#page-N`, and switching between single and spread, both
  // leave the page being read where the reader can see it: the browser's own
  // anchor jump happened before a remembered spread layout moved everything.
  useLayoutEffect(() => {
    const target =
      currentRef.current ?? pageFromHash(window.location.hash, total);
    if (target === null) return;
    document
      .getElementById(`page-${target}`)
      ?.scrollIntoView({ block: "start" });
  }, [layout, wide, total]);

  const openLightbox = useCallback((position: number) => {
    lightboxIndexRef.current = position - 1;
    setLightboxIndex(position - 1);
  }, []);

  const onLightboxIndexChange = useCallback((index: number) => {
    lightboxIndexRef.current = index;
    setLightboxIndex(index);
  }, []);

  // Closing leaves the reader on the page they ended on, with focus on that
  // page's own full-screen button rather than lost at the top of the page.
  const closeLightbox = useCallback(() => {
    const position = lightboxIndexRef.current + 1;
    setLightboxIndex(null);
    const item = document.getElementById(`page-${position}`);
    item?.scrollIntoView({ block: "start" });
    item
      ?.querySelector<HTMLButtonElement>("[data-open-page]")
      ?.focus({ preventScroll: true });
  }, []);

  const showing = current ?? 1;
  const inView = spread && wide ? spreadOf(showing, total) : [showing];
  const counter =
    inView.length > 1
      ? `Pages ${inView[0]}–${inView[1]} of ${total}`
      : `Page ${inView[0]} of ${total}`;

  return (
    <div className="mx-auto mt-10 max-w-3xl lg:max-w-6xl">
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p className="text-sm font-medium tabular-nums">{counter}</p>
        <div className="flex items-center gap-2">
          <ToggleGroup
            aria-label="Page layout"
            value={[layout]}
            onValueChange={(value) => {
              if (value[0]) layoutChoice.store(value[0] as Layout);
            }}
            variant="outline"
            spacing={0}
            size="sm"
            className="hidden lg:flex"
          >
            <ToggleGroupItem value="single">
              <FileIcon aria-hidden="true" />
              Single
            </ToggleGroupItem>
            <ToggleGroupItem value="spread">
              <BookOpenIcon aria-hidden="true" />
              Spread
            </ToggleGroupItem>
          </ToggleGroup>
          <Toggle
            pressed={transcripts}
            onPressedChange={(pressed) =>
              transcriptChoice.store(pressed ? "on" : "off")
            }
            variant="outline"
            size="sm"
          >
            <CaptionsIcon aria-hidden="true" />
            Transcript
          </Toggle>
          <ShareButton title={title} page={current} />
        </div>
      </div>

      <ol
        ref={listRef}
        aria-label={`Pages of ${title}`}
        className={cn(
          "mt-6 space-y-10",
          spread &&
            "lg:grid lg:grid-cols-2 lg:gap-x-2 lg:gap-y-10 lg:space-y-0",
        )}
      >
        {pages.map((page, index) => (
          <IssuePage
            key={page.position}
            page={page}
            total={total}
            eager={index === 0}
            side={spread ? sides[index] : "alone"}
            spread={spread}
            transcripts={transcripts}
            onOpen={openLightbox}
          />
        ))}
      </ol>

      {lightboxIndex !== null && (
        <PageLightbox
          title={title}
          pages={pages}
          index={lightboxIndex}
          onIndexChange={onLightboxIndexChange}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}

function IssuePage({
  page,
  total,
  eager,
  side,
  spread,
  transcripts,
  onOpen,
}: {
  page: PublicationPage;
  total: number;
  eager: boolean;
  side: SpreadSide;
  spread: boolean;
  transcripts: boolean;
  onOpen: (position: number) => void;
}) {
  const { image } = page;
  // The width that gives the page the window's height, less the sticky
  // toolbar and the caption, at the page's own aspect ratio.
  const pageWidth = `calc((100dvh - 7rem) * ${image.width / image.height})`;
  return (
    <li
      id={`page-${page.position}`}
      data-page={page.position}
      // With transcripts on, single view on a wide screen sets each one beside
      // its page: the page keeps the width that fits it in the window, the
      // transcript takes the rest of the row.
      style={{ "--page-w": pageWidth } as CSSProperties}
      className={cn(
        "min-w-0 scroll-mt-16",
        transcripts &&
          !spread &&
          "lg:grid lg:grid-cols-[minmax(0,var(--page-w))_minmax(18rem,1fr)] lg:items-start lg:gap-x-8",
        spread &&
          side === "alone" &&
          "lg:col-span-2 lg:mx-auto lg:w-[calc(50%-0.25rem)]",
      )}
    >
      <figure
        // Capped so a whole page fits the window under the sticky toolbar
        // (its scroll-mt-16) and the caption. A spread's halves hug the
        // gutter so they still read as one sheet.
        style={{ maxWidth: pageWidth }}
        className={cn(
          side === "left"
            ? "lg:ml-auto"
            : side === "right"
              ? "lg:mr-auto"
              : "mx-auto",
          spread && side !== "alone" && "max-lg:mx-auto",
        )}
      >
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized at upload (#1472), served straight from the bucket */}
          <img
            src={image.url}
            srcSet={image.srcSet}
            sizes={
              image.srcSet
                ? spread
                  ? "(min-width: 1232px) 572px, (min-width: 1024px) 46vw, (min-width: 816px) 768px, 100vw"
                  : "(min-width: 816px) 768px, 100vw"
                : undefined
            }
            width={image.width}
            height={image.height}
            alt={page.altText}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            // The button below is the keyboard's way in; a tap on the page
            // itself is the obvious one on a phone.
            onClick={() => onOpen(page.position)}
            className="h-auto w-full cursor-zoom-in rounded-lg border border-[var(--line)] bg-muted"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            data-open-page
            aria-label={`View page ${page.position} full screen`}
            onClick={() => onOpen(page.position)}
            className="absolute top-2 right-2 bg-background/85 shadow-sm backdrop-blur hover:bg-background"
          >
            <Maximize2Icon aria-hidden="true" />
          </Button>
        </div>
        <figcaption className="app-muted mt-2 text-xs">
          Page {page.position} of {total}
        </figcaption>
      </figure>
      {page.transcript && (
        <section
          aria-label={`Transcript of page ${page.position}`}
          className={cn(
            transcripts
              ? "mt-3 rounded-lg border border-[var(--line)] px-4 py-3"
              : "sr-only",
            transcripts && !spread && "lg:mt-0",
          )}
        >
          <h2 className="text-sm font-medium">
            Transcript of page {page.position}
          </h2>
          <MarkdownText className="mt-2 text-sm leading-relaxed break-words">
            {page.transcript}
          </MarkdownText>
        </section>
      )}
    </li>
  );
}

/**
 * Shares the issue at the page being read: the device's share sheet where
 * there is one, the clipboard where there is not. The link is built from the
 * browser's own address so a tenant on its own domain shares that domain, as
 * the gear sheet's does. The public site mounts no Toaster, so the button's
 * own label says it worked.
 */
function ShareButton({ title, page }: { title: string; page: number | null }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}${
      page === null ? "" : `#page-${page}`
    }`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Dismissing the share sheet rejects too (AbortError); either way
        // there is nothing to report, and the address bar holds the link.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Refused in some browsers and on every insecure origin.
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={share}>
        {status === "copied" ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <Share2Icon aria-hidden="true" />
        )}
        {status === "copied"
          ? "Link copied"
          : status === "failed"
            ? "Copy the address bar"
            : "Share"}
      </Button>
      <span role="status" className="sr-only">
        {status === "copied" ? "Link copied" : ""}
      </span>
    </>
  );
}
