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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/components/portal/action-toast";
import {
  GEAR_DETAIL_LIMITS,
  GEAR_PLACEHOLDERS,
  gearItemDetails,
  hasGearDetails,
  type GearPostDetails,
} from "@/lib/social-content/series-gear";
import {
  swapFeaturedGearAction,
  updateGearDetailsAction,
  type GearItemOption,
} from "@/lib/social-content/series-gear-actions";

/** A swap waiting on "replace your edited caption?". */
type PendingSwap = { itemId: string | null };

/**
 * The Gear Library item a post features (#1841), with "Pick another" and
 * "Choose item" until it is published, and what the post says about it:
 * brand, best for and why we love it (#1906).
 */
export function SocialPostFeaturedGearCard({
  postId,
  published,
  canManage,
  featured,
  options,
  captionEdited,
  details,
}: {
  postId: string;
  published: boolean;
  canManage: boolean;
  featured: GearItemOption | null;
  options: GearItemOption[];
  captionEdited: boolean;
  details: GearPostDetails;
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

  // A swap replaces the caption and clears the details, so either one typed
  // by hand is asked about first.
  const detailsTyped = hasGearDetails(details);
  function request(itemId: string | null) {
    if (captionEdited || detailsTyped) setConfirming({ itemId });
    else swap(itemId, false);
  }

  const itemDetails = featured ? gearItemDetails(featured) : "";

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
            {itemDetails && (
              <span className="app-muted text-xs">{itemDetails}</span>
            )}
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
        {featured &&
          (canSwap ? (
            <GearDetailsForm
              key={`${featured.id}:${details.brand}:${details.best_for}:${details.why}`}
              postId={postId}
              details={details}
            />
          ) : (
            <GearDetailsSummary details={details} />
          ))}
        {canSwap && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => request(null)}
              disabled={isPending}
              focusableWhenDisabled
            >
              Pick another
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setChoosing(true)}
              disabled={isPending}
              focusableWhenDisabled
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
            <AlertDialogTitle>Replace what you typed?</AlertDialogTitle>
            <AlertDialogDescription>
              {captionEdited
                ? "This post's caption was changed after it was filled in. "
                : ""}
              The new item replaces the caption and photo with its own
              {detailsTyped
                ? ", and clears the brand, best for and why we love it"
                : ""}
              .
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
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const DETAIL_FIELDS: {
  key: keyof GearPostDetails;
  label: string;
  hint: string;
}[] = [
  { key: "brand", label: "Brand", hint: "Shown under the item's name." },
  {
    key: "best_for",
    label: "Best for",
    hint: "A few words, e.g. \u201cFirst season\u201d or \u201cPark\u201d.",
  },
  {
    key: "why",
    label: "Why we love it",
    hint: "One sentence.",
  },
];

/** Brand, best for and why we love it, editable until the post is published. */
function GearDetailsForm({
  postId,
  details,
}: {
  postId: string;
  details: GearPostDetails;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [values, setValues] = useState({
    brand: details.brand ?? "",
    best_for: details.best_for ?? "",
    why: details.why ?? "",
  });
  const changed = DETAIL_FIELDS.some(
    ({ key }) => values[key].trim() !== (details[key] ?? ""),
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => updateGearDetailsAction(postId, values), {
          success: "Details saved.",
          description: (result) =>
            result.captionUpdated ? "The caption was updated too." : undefined,
          onSuccess: () => router.refresh(),
        });
      }}
    >
      <FieldGroup className="gap-3">
        {DETAIL_FIELDS.map(({ key, label, hint }) => {
          const id = `gear-detail-${key}`;
          const limit = GEAR_DETAIL_LIMITS[key];
          const Control = key === "why" ? Textarea : Input;
          return (
            <Field key={key}>
              <FieldLabel htmlFor={id}>
                {label}{" "}
                <span className="app-muted font-normal">(optional)</span>
              </FieldLabel>
              <Control
                id={id}
                maxLength={limit}
                {...(key === "why" ? { rows: 2 } : {})}
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                {hint} The caption can use {GEAR_PLACEHOLDERS[key]}.
                {key === "why" && ` ${values.why.length}/${limit}`}
              </FieldDescription>
            </Field>
          );
        })}
      </FieldGroup>
      <div>
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !changed}
          focusableWhenDisabled
        >
          Save details
        </Button>
      </div>
    </form>
  );
}

/** The details, read-only, once the post can't change. */
function GearDetailsSummary({ details }: { details: GearPostDetails }) {
  const filled = DETAIL_FIELDS.filter(({ key }) => details[key]);
  if (filled.length === 0) return null;
  return (
    <dl className="grid gap-1 text-sm">
      {filled.map(({ key, label }) => (
        <div key={key} className="flex flex-col">
          <dt className="app-muted text-xs">{label}</dt>
          <dd>{details[key]}</dd>
        </div>
      ))}
    </dl>
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
