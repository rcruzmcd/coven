"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, TriangleAlert } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionToast } from "@/components/portal/action-toast";
import { gearItemDetails } from "@/lib/social-content/series-gear";
import {
  swapFeaturedGearAction,
  type GearItemOption,
} from "@/lib/social-content/series-gear-actions";

/** A swap waiting on "replace your edited caption?". */
type PendingSwap = { itemId: string | null };

/**
 * The Gear Library item a post features (#1841), with "Pick another" and
 * "Choose item" until it is published.
 */
export function SocialPostFeaturedGearCard({
  postId,
  published,
  canManage,
  featured,
  options,
  captionEdited,
}: {
  postId: string;
  published: boolean;
  canManage: boolean;
  featured: GearItemOption | null;
  options: GearItemOption[];
  captionEdited: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [choosing, setChoosing] = useState(false);
  const [confirming, setConfirming] = useState<PendingSwap | null>(null);
  const canSwap = canManage && !published;

  function swap(itemId: string | null, replaceEdited: boolean) {
    run(() => swapFeaturedGearAction(postId, itemId, replaceEdited), {
      success: "Featured item changed.",
      description: (result) =>
        result.photoCopied
          ? undefined
          : "Its photo couldn't be copied; add one to the post by hand.",
      onSuccess: () => {
        setChoosing(false);
        router.refresh();
      },
    });
  }

  function request(itemId: string | null) {
    if (captionEdited) setConfirming({ itemId });
    else swap(itemId, false);
  }

  const details = featured ? gearItemDetails(featured) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted flex items-center gap-1.5 text-sm font-semibold">
          <Package className="size-4" aria-hidden />
          Featured gear
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {featured ? (
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/portal/inventory/items/${featured.id}`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {featured.description}
            </Link>
            {details && <span className="app-muted text-xs">{details}</span>}
          </div>
        ) : (
          <p className="app-muted text-sm">This post features no item yet.</p>
        )}
        {featured && !featured.qualifies && (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertDescription>
              This item is no longer available in the Gear Library
              {featured.photo_url ? "" : " with a photo"}.
              {canSwap && " Pick another before this post goes out."}
            </AlertDescription>
          </Alert>
        )}
        {canSwap && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => request(null)}
              disabled={isPending}
            >
              Pick another
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setChoosing(true)}
              disabled={isPending}
            >
              Choose item
            </Button>
          </div>
        )}
        {canManage && published && (
          <p className="app-muted text-xs">
            Published, so the item can&apos;t be changed.
          </p>
        )}
      </CardContent>

      <GearPickerDialog
        open={choosing}
        onOpenChange={setChoosing}
        options={options}
        currentId={featured?.id ?? null}
        disabled={isPending}
        onChoose={(itemId) => request(itemId)}
      />

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the edited caption?</AlertDialogTitle>
            <AlertDialogDescription>
              This post&apos;s caption was changed after it was filled in. The
              new item replaces the caption and photo with its own.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = confirming;
                setConfirming(null);
                if (pending) swap(pending.itemId, true);
              }}
            >
              Replace caption
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function GearPickerDialog({
  open,
  onOpenChange,
  options,
  currentId,
  disabled,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: GearItemOption[];
  currentId: string | null;
  disabled: boolean;
  onChoose: (itemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter(
      (item) =>
        !needle ||
        `${item.description} ${gearItemDetails(item)}`
          .toLowerCase()
          .includes(needle),
    );
  }, [options, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose an item</DialogTitle>
          <DialogDescription>
            Available Gear Library items with a photo.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          aria-label="Search items"
          placeholder="Search items"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {shown.length === 0 ? (
          <p className="app-muted text-sm">
            {options.length === 0
              ? "No available gear with a photo."
              : "No items match."}
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {shown.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full flex-col items-start gap-0 py-2 text-left whitespace-normal"
                  disabled={disabled || item.id === currentId}
                  onClick={() => onChoose(item.id)}
                >
                  <span className="text-sm font-medium">
                    {item.description}
                    {item.id === currentId && " (featured now)"}
                  </span>
                  {gearItemDetails(item) && (
                    <span className="app-muted text-xs font-normal">
                      {gearItemDetails(item)}
                    </span>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
