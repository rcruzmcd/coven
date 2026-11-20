"use client";

import type { Json } from "@/lib/supabase/types";
import { PublicSiteLink } from "@/components/portal/public-site-link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import type {
  ContentSlot,
  LegalDocumentContent,
  ListItem,
} from "@/lib/site-content";
import {
  isMultiline,
  paragraphHint,
  paragraphsToText,
  textToParagraphs,
} from "./content-values";
import { DocumentEditor } from "./document-editor";
import { ImageSlotField } from "./image-slot-field";
import { ListEditor } from "./list-editor";

/** The slot's control, for the label to point at. */
export function slotControlId(key: string): string {
  return `content-${key}`;
}

/**
 * The slot's whole field, which is what the rail scrolls to. A `list` or
 * `document` slot has many controls and no single one to land on.
 */
export function slotFieldId(key: string): string {
  return `field-${key}`;
}

/**
 * Where this slot renders, for the slots that own a page of their own. Only
 * the legal documents do: the `legal` section holds three of them, so a single
 * link for the whole section was right for one document and wrong for the
 * other two (#791).
 */
export function slotRoute(slot: ContentSlot): string | undefined {
  return slot.type === "document" ? slot.route : undefined;
}

/** One slot's state: the words on its badge, and how loudly to say them. */
type SlotStatusBadge = { text: string; className: string };

/** Loud enough to catch while scrolling: something this page still owes. */
const PENDING_BADGE =
  "rounded-full bg-[var(--purple-soft)] px-2 py-0.5 text-xs font-medium text-[var(--purple-deep)]";
/** Quiet: a settled fact about the slot rather than work outstanding. */
const SETTLED_BADGE =
  "app-muted rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-normal";

/**
 * The state of one slot, said in words rather than in colour.
 *
 * Every slot used to carry a "Default" or "Your text" badge in a card header
 * of its own, which is most of what made eighty-six fields three thousand
 * pixels tall. Default is now the silent case -- there is nothing to say about
 * a slot nobody has touched. "Not published" is the state #793 adds, and it is
 * the one an editor most needs to see: the words on screen are not the words
 * on the site.
 *
 * Returned rather than rendered, so the caller can put the badge beside the
 * `<label>` instead of inside it. A badge within the label joins the control's
 * accessible name, and a box that renames itself from "Heading" to "Heading
 * Unsaved" as you type is a box a screen reader announces twice for no reason
 * (#924). Beside the label it is still read in place, and the control points
 * at it with `aria-describedby`, so tabbing straight into the box hears it.
 */
function slotStatus({
  overridden,
  dirty,
  hasDraft,
  noun,
}: {
  overridden: boolean;
  dirty: boolean;
  hasDraft: boolean;
  /** What the tenant's override is called: "text" for copy, "image" for a photo. */
  noun: "text" | "image";
}): SlotStatusBadge | null {
  if (dirty) return { text: "Unsaved", className: PENDING_BADGE };
  if (hasDraft) return { text: "Not published", className: PENDING_BADGE };
  if (overridden) return { text: `Your ${noun}`, className: SETTLED_BADGE };
  return null;
}

/**
 * Who last touched this slot and when.
 *
 * The audit log has recorded every write since the table existed, but nothing
 * on this page said so, and reaching it means leaving the editor and knowing
 * the table name. One line against the field answers the question that was
 * actually being asked: is this copy current, and whose is it (#793)?
 */
function SlotAttribution({
  hasDraft,
  draftUpdatedAt,
  draftUpdatedBy,
  publishedAt,
  publishedBy,
}: {
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}) {
  const lines: string[] = [];
  if (hasDraft && draftUpdatedAt) {
    lines.push(
      `Draft saved ${formatDateTime(draftUpdatedAt)}${
        draftUpdatedBy ? ` by ${draftUpdatedBy}` : ""
      }`,
    );
  }
  if (publishedAt) {
    lines.push(
      `Published ${formatDateTime(publishedAt)}${
        publishedBy ? ` by ${publishedBy}` : ""
      }`,
    );
  }
  if (lines.length === 0) return null;
  return <FieldDescription>{lines.join(" · ")}</FieldDescription>;
}

export function ContentSlotField({
  slot,
  value,
  initialValue,
  overridden,
  hasDraft,
  publishedAt,
  publishedBy,
  draftUpdatedAt,
  draftUpdatedBy,
  starter,
  images,
  dirty,
  canEdit,
  onChange,
  onReset,
  onPublish,
}: {
  slot: ContentSlot;
  value: unknown;
  /** What the server sent, which decides the control a text slot gets. */
  initialValue: unknown;
  overridden: boolean;
  /** Whether a saved draft is waiting to be published. */
  hasDraft: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  /** The platform's own document, for a `document` slot; null otherwise. */
  starter: LegalDocumentContent | null;
  /**
   * This page's image slots as the editor currently has them, by short name.
   * A `list` slot's `photo` field previews the picture its row resolves to,
   * which may be one of them (#922).
   */
  images: Readonly<Record<string, string | null>>;
  dirty: boolean;
  canEdit: boolean;
  onChange: (value: Json) => void;
  onReset: () => void;
  /** Publish this slot on its own, rather than the whole page. */
  onPublish: () => void;
}) {
  const controlId = slotControlId(slot.key);
  const route = slotRoute(slot);
  const paragraphs = Array.isArray(value) ? (value as string[]) : [];
  const composite = slot.type === "list" || slot.type === "document";
  // "Back to default" now stages a revert rather than deleting the row, so it
  // is offered whenever the copy on screen is not already the default -- an
  // unsaved edit included.
  const isDefault =
    JSON.stringify(value ?? null) === JSON.stringify(slot.default ?? null);

  const status = slotStatus({
    overridden,
    dirty,
    hasDraft,
    noun: slot.type === "image" ? "image" : "text",
  });
  // Described by, not named by -- and only where there is both a badge to
  // point at and a single control to point from: a `list` or `document` slot
  // has many controls and no one of them owns the slot's state (#924).
  const statusId = status && !composite ? `${controlId}-status` : undefined;

  return (
    <Field id={slotFieldId(slot.key)} className="scroll-mt-32">
      {/* The label carries the slot's label alone. The badge and the link are
          siblings of it in the same row rather than children of it, so neither
          lands in the control's accessible name (#924). */}
      <div className="flex flex-wrap items-center gap-2">
        {composite ? (
          <FieldTitle>{slot.label}</FieldTitle>
        ) : (
          <FieldLabel htmlFor={controlId}>{slot.label}</FieldLabel>
        )}
        {status && (
          <span id={statusId} className={status.className}>
            {status.text}
          </span>
        )}
        {route && (
          <PublicSiteLink
            path={route}
            fallback={null}
            target="_blank"
            rel="noopener noreferrer"
            className="app-muted inline-flex items-center gap-1.5 text-sm font-normal underline-offset-4 hover:underline"
          >
            View on the site
            <ExternalLink className="size-3.5" aria-hidden />
          </PublicSiteLink>
        )}
      </div>

      {slot.type === "text" &&
        (isMultiline(slot, initialValue) ? (
          <Textarea
            id={controlId}
            aria-describedby={statusId}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
          />
        ) : (
          <Input
            id={controlId}
            aria-describedby={statusId}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        ))}

      {slot.type === "paragraphs" && (
        <Textarea
          id={controlId}
          aria-describedby={statusId}
          value={paragraphsToText(paragraphs)}
          onChange={(event) => onChange(textToParagraphs(event.target.value))}
          rows={8}
        />
      )}

      {slot.type === "image" && (
        <ImageSlotField
          id={controlId}
          describedBy={statusId}
          label={slot.label}
          ratio={slot.ratio}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      )}

      {slot.description && (
        <FieldDescription>{slot.description}</FieldDescription>
      )}
      {slot.type === "paragraphs" && (
        <FieldDescription>{paragraphHint(paragraphs)}</FieldDescription>
      )}

      {slot.type === "list" && (
        <ListEditor
          slot={slot}
          items={Array.isArray(value) ? (value as ListItem[]) : []}
          images={images}
          onChange={onChange}
        />
      )}

      {slot.type === "document" && (
        <DocumentEditor
          slot={slot}
          doc={(value as LegalDocumentContent | null) ?? null}
          starter={starter}
          onChange={onChange}
        />
      )}

      <SlotAttribution
        hasDraft={hasDraft}
        draftUpdatedAt={draftUpdatedAt}
        draftUpdatedBy={draftUpdatedBy}
        publishedAt={publishedAt}
        publishedBy={publishedBy}
      />

      {canEdit && (!isDefault || hasDraft) && (
        <div className="flex flex-wrap gap-2">
          {!isDefault && slot.type !== "document" && (
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              Back to default
            </Button>
          )}
          {(hasDraft || dirty) && (
            <Button type="button" variant="ghost" size="sm" onClick={onPublish}>
              Publish this
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
