"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Copy, Share } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  canShareFiles,
  instagramShareTarget,
  isShareCancel,
  loadShareFiles,
  shareHandles,
  shareableMedia,
  ShareMediaError,
} from "@/lib/social-content/instagram-share";
import {
  formatTakesCaption,
  formatTakesCollaborators,
  postFormatLabel,
  type ContentPieceRow,
} from "@/lib/social-content/pieces";
import type { SocialPostExtras } from "@/lib/social-content/post-content-actions";

const noSubscribe = () => () => {};

/** Read once on the client; the server render assumes no file sharing. */
function useCanShareFiles() {
  return useSyncExternalStore(
    noSubscribe,
    () => canShareFiles(navigator),
    () => false,
  );
}

type Loaded = { key: string; files: File[] } | { key: string; error: string };

/**
 * Loads the post's media into files as soon as the panel shows, so the share
 * itself runs inside the click with nothing awaited first (Safari's rule).
 */
function useShareFiles(
  media: SocialPostExtras["media"] | null,
  enabled: boolean,
) {
  const key = media
    ? shareableMedia(media)
        .ready.map((item) => item.id)
        .join(",")
    : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const ready = media ? shareableMedia(media).ready : [];
    if (!enabled || ready.length === 0) return;
    const key = ready.map((item) => item.id).join(",");
    let cancelled = false;
    loadShareFiles(ready).then(
      (files) => !cancelled && setLoaded({ key, files }),
      (error: unknown) =>
        !cancelled &&
        setLoaded({
          key,
          error:
            error instanceof ShareMediaError
              ? error.message
              : "Couldn't load this post's media to share. Close and reopen the post to try again.",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [media, enabled]);

  return loaded?.key === key ? loaded : null;
}

function HandleCopyList({
  label,
  handles,
}: {
  label: string;
  handles: string[];
}) {
  if (handles.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{label}</p>
      <ul className="flex flex-col gap-1" aria-label={label}>
        {handles.map((handle) => (
          <li key={handle} className="flex items-center gap-1 text-sm">
            <span className="min-w-0 flex-1 truncate">@{handle}</span>
            <CopyButton
              label={`Copy @${handle}`}
              getText={() => handle}
              icon={<Copy />}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Share to Instagram (#1828): on a phone, hands the post's media to the share
 * sheet in order and puts the caption on the clipboard. Collaborators and
 * tags can't travel with a share, so each handle has its own copy button.
 * Where files can't be shared (most desktops) it says to use a phone instead.
 */
export function ShareToInstagram({
  piece,
  extras,
}: {
  piece: Pick<
    ContentPieceRow,
    "post_format" | "content" | "collaborator_handles"
  >;
  extras: SocialPostExtras | null;
}) {
  const supported = useCanShareFiles();
  const media = extras?.media ?? null;
  const { ready, unavailable } = shareableMedia(media ?? []);
  const loaded = useShareFiles(media, supported);
  const headingId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which story of a sequence goes next, for the files loaded under `key`.
  const [step, setStep] = useState<{ key: string; index: number } | null>(null);

  const takesCaption = formatTakesCaption(piece.post_format);
  const captionLabel = takesCaption ? "caption" : "story text";
  // "Instagram reel" -> "reel"
  const format = postFormatLabel(piece.post_format)
    ?.replace(/^Instagram /, "")
    .toLowerCase();
  const target = instagramShareTarget(piece.post_format);
  const handles = extras
    ? shareHandles(
        formatTakesCollaborators(piece.post_format)
          ? piece.collaborator_handles
          : [],
        extras.tags,
        extras.people,
      )
    : null;

  const files = loaded && "files" in loaded ? loaded.files : null;
  const loadError = loaded && "error" in loaded ? loaded.error : null;
  // Several files on a story -- the generated Gear Spotlight images (#1909) --
  // go one story at a time, in order: whether Instagram takes several shared
  // files as consecutive stories differs by phone; one at a time works on all.
  const sequence =
    piece.post_format === "instagram_story" &&
    files !== null &&
    files.length > 1
      ? files
      : null;
  const index =
    sequence && step && step.key === loaded?.key
      ? Math.min(step.index, sequence.length - 1)
      : 0;

  function share() {
    if (!files) return;
    setError(null);
    setStatus(null);
    const sharing = sequence ? [sequence[index]] : files;
    // Neither is awaited before `share`: Safari only allows it while the click
    // is still the user's gesture. The text is copied with the first story.
    const copied =
      piece.content && index === 0
        ? navigator.clipboard.writeText(piece.content).then(
            () => true,
            () => false,
          )
        : Promise.resolve(false);
    if (!navigator.canShare?.({ files: sharing })) {
      setError(
        "This device can't share these files. Save them from the post and add them in Instagram by hand.",
      );
      return;
    }
    navigator.share({ files: sharing }).then(
      async () => {
        const pasted = (await copied)
          ? ` The ${captionLabel} is on your clipboard: paste it in Instagram.`
          : "";
        if (!sequence) {
          setStatus(`Shared.${pasted}`);
          return;
        }
        const last = index === sequence.length - 1;
        setStep({ key: loaded?.key ?? "", index: last ? 0 : index + 1 });
        setStatus(
          last
            ? `All ${sequence.length} stories shared.${pasted}`
            : `Story ${index + 1} of ${sequence.length} shared.${pasted} Share story ${index + 2} next.`,
        );
      },
      (shareError: unknown) => {
        if (isShareCancel(shareError)) return;
        setError(
          "Couldn't open the share sheet. Try again, or save the media and add it in Instagram by hand.",
        );
      },
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <h3 id={headingId} className="text-sm font-semibold">
        Share to Instagram
      </h3>
      <p className="app-muted text-sm">
        {target
          ? `This is a ${format}: in the share sheet, pick Instagram, then ${target}.`
          : "No format chosen yet. In the share sheet, pick Instagram, then Feed, Reels or Stories."}
      </p>

      {!supported ? (
        <Alert>
          <AlertDescription>
            Open this post on your phone to share it to Instagram.
          </AlertDescription>
        </Alert>
      ) : media === null ? (
        <Spinner />
      ) : ready.length === 0 ? (
        <p className="app-muted text-sm">
          This post has no media to share yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" disabled={!files} onClick={share}>
              {files ? (
                <>
                  <Share />{" "}
                  {sequence
                    ? `Share story ${index + 1} of ${sequence.length}`
                    : "Share to Instagram"}
                </>
              ) : (
                <>
                  <Spinner /> Loading media...
                </>
              )}
            </Button>
          </div>
          <p className="app-muted text-xs">
            {sequence
              ? `Shares one story at a time, in order: pick Instagram, then Stories, post it, and come back for the next. The ${captionLabel} is copied with the first.`
              : `Copies the ${captionLabel} and opens your phone's share sheet with ${ready.length === 1 ? "the file" : `${ready.length} files`} in order.`}
          </p>
        </div>
      )}

      {unavailable > 0 && supported && (
        <p className="text-sm text-destructive">
          {unavailable === 1
            ? "1 file can't be shared: it is missing or couldn't be loaded."
            : `${unavailable} files can't be shared: they are missing or couldn't be loaded.`}
        </p>
      )}
      {(loadError || error) && (
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? error}</AlertDescription>
        </Alert>
      )}
      <p role="status" className="text-sm empty:hidden">
        {status}
      </p>

      {piece.content && (
        <div>
          <CopyButton
            label={takesCaption ? "Copy caption" : "Copy story text"}
            getText={() => piece.content ?? ""}
          />
        </div>
      )}
      {handles && (
        <>
          <HandleCopyList
            label="Collaborators to invite"
            handles={handles.collaborators}
          />
          <HandleCopyList label="People to tag" handles={handles.tags} />
          {handles.tagsWithoutHandle.length > 0 && (
            <p className="app-muted text-sm">
              No Instagram handle on record for{" "}
              {handles.tagsWithoutHandle.join(", ")}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
