"use client";

import { useId, useState } from "react";
import { ImagePlus, RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/portal/action-toast";
import { generateSocialPostStoryImagesAction } from "@/lib/social-content/story-images-actions";
import type { StoryImagesState } from "@/lib/social-content/story-images";

/**
 * Generate story images (#1909): draws a featured-gear story's three Gear
 * Spotlight frames (#1908) into the post's media. Regenerating replaces only
 * the images made here, never media someone added, and asks first. Says when
 * the images no longer match the post, and warns -- without blocking -- when
 * the item has no photo.
 */
export function StoryImagesPanel({
  postId,
  state,
  published,
  canManage,
  unsaved = false,
  onGenerated,
}: {
  postId: string;
  state: StoryImagesState;
  published: boolean;
  canManage: boolean;
  /** The template card has changes not saved yet (#1925). */
  unsaved?: boolean;
  onGenerated: () => void;
}) {
  const headingId = useId();
  const { isPending, run } = useActionToast();
  const [confirming, setConfirming] = useState(false);
  const hasSet = state.generated > 0;
  const copy = panelCopy(state);
  const disabled = !state.hasItem || published || unsaved || isPending;

  function generate() {
    run(() => generateSocialPostStoryImagesAction(postId), {
      success:
        state.record === "event"
          ? hasSet
            ? "Image regenerated."
            : "Image added."
          : hasSet
            ? "Story images regenerated."
            : "Story images added.",
      onSuccess: onGenerated,
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-sm font-semibold">
          {copy.heading}
        </h3>
        {hasSet && state.stale && <Badge variant="outline">Out of date</Badge>}
      </div>

      <p className="app-muted text-sm">
        {!state.hasItem
          ? copy.missing
          : hasSet
            ? state.stale
              ? copy.stale
              : copy.made
            : copy.draws}
      </p>

      {state.hasItem && !state.hasPhoto && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            This item has no photo. The first image shows a tinted panel with
            its category instead.
          </AlertDescription>
        </Alert>
      )}

      {published && (
        <p className="app-muted text-sm">
          This post is published, so its images stay as they are.
        </p>
      )}

      {canManage && unsaved && !published && (
        <p className="app-muted text-sm">
          Save the template first: images are drawn from what is saved.
        </p>
      )}

      {canManage && (
        <div>
          <Button
            type="button"
            variant={hasSet && !state.stale ? "secondary" : "default"}
            disabled={disabled}
            onClick={() => (hasSet ? setConfirming(true) : generate())}
          >
            {isPending ? (
              <>
                <Spinner /> Drawing images...
              </>
            ) : hasSet ? (
              <>
                <RefreshCw /> Regenerate {copy.noun}
              </>
            ) : (
              <>
                <ImagePlus /> Generate {copy.noun}
              </>
            )}
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the {copy.noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.replaced} Photos and videos someone added to the post stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                generate();
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * The panel's words: Gear Spotlight's three story frames as before, an event
 * template's single image (#1926) in its own.
 */
function panelCopy(state: StoryImagesState) {
  if (state.record !== "event") {
    return {
      heading: "Story images",
      noun: "story images",
      missing:
        "This post features no Gear Library item, so there is nothing to draw the story from.",
      stale:
        "The post, its item or your branding changed after these images were made. Regenerate them to match.",
      made: "Three story images, drawn from this post and its item, are first in the post's media.",
      draws:
        "Draws three story images from this post, its item and your branding, and adds them to the post's media.",
      replaced: "The three images made here before are replaced with new ones.",
    };
  }
  return {
    heading: "Template image",
    noun: "image",
    missing:
      "This post isn't related to an event, so there is nothing to draw the image from.",
    stale:
      "The post, its event, the day or your branding changed after this image was made. Regenerate it to match.",
    made: "The image, drawn from this post and its event, is first in the post's media.",
    draws:
      "Draws the image from this post, its event and its flyer or your branding, and adds it to the post's media.",
    replaced: "The image made here before is replaced with a new one.",
  };
}
