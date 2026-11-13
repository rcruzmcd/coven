import { MarkdownText } from "@/components/portal/markdown-text";
import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  deliveryMethodLabel,
  gearRequestStatusLabel,
} from "@/lib/gear-requests";
import type { InventoryCategory } from "@/lib/inventory";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  CONDITIONS,
  GENDERS,
  IntendedUseBadge,
  STATUSES,
  StatusBadge,
  categoryLabelFor,
  formatFaceValue,
  labelFor,
  resolveImageUrl,
  type InventoryItem,
} from "../inventory-shared";
import { CodeActions } from "./code-actions";
import { ItemActions, type ItemDistribute } from "./item-actions";
import { ItemHistoryCard } from "./item-history-card";
import type { HistoryEntry } from "./item-history";

export function ItemDetailView({
  item,
  categories,
  canManage,
  history,
  distribute = null,
  numberedOnly = false,
}: {
  item: InventoryItem;
  categories: InventoryCategory[];
  canManage: boolean;
  history: HistoryEntry[];
  distribute?: ItemDistribute | null;
  /** Numbered codes only (#1543): a tag code shows only where one exists. */
  numberedOnly?: boolean;
}) {
  const imageUrl = resolveImageUrl(item.photo_url);
  const hasActions = canManage || !!distribute;

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {item.description}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 text-sm">
          {[
            categoryLabelFor(item),
            labelFor(STATUSES, item.status),
            item.assetTag,
            item.numberedCode,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {hasActions && (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <ItemActions
            item={item}
            categories={categories}
            canManage={canManage}
            distribute={distribute}
            numberedOnly={numberedOnly}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField
                label="Item description"
                htmlFor="item-description"
              >
                {item.description}
              </ReadOnlyField>
              <Field orientation="responsive">
                <ReadOnlyField label="Item category" htmlFor="item-category">
                  {categoryLabelFor(item)}
                </ReadOnlyField>
                <ReadOnlyField label="Size" htmlFor="item-size">
                  {item.size || "—"}
                </ReadOnlyField>
              </Field>
              <Field orientation="responsive">
                <ReadOnlyField label="Gender" htmlFor="item-gender">
                  {labelFor(GENDERS, item.gender ?? "") || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Condition" htmlFor="item-condition">
                  {labelFor(CONDITIONS, item.condition) || "—"}
                </ReadOnlyField>
              </Field>
              <Field orientation="responsive">
                <ReadOnlyField label="Status" htmlFor="item-status">
                  <StatusBadge status={item.status} />
                </ReadOnlyField>
                <ReadOnlyField label="Intended use" htmlFor="item-intendedUse">
                  <IntendedUseBadge intendedUse={item.intended_use} />
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Face value" htmlFor="item-faceValue">
                {formatFaceValue(item.face_value)}
              </ReadOnlyField>
              <ReadOnlyField label="Item notes" htmlFor="item-notes">
                <MarkdownText fallback="—">{item.notes}</MarkdownText>
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Photo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={item.description}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <BrandImageFallback label="No photo" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Tag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {/* On numbered codes only, a random code is legacy: shown
                  where an item still has one, never offered (#1543). */}
              {(item.assetTag || !numberedOnly) && (
                <>
                  <ReadOnlyField label="Tag code" htmlFor="item-assetTag">
                    {item.assetTag ? (
                      <CodeActions
                        itemId={item.id}
                        code={item.assetTag}
                        kind="tag"
                      />
                    ) : (
                      "None yet"
                    )}
                  </ReadOnlyField>
                  <p className="app-muted text-sm">
                    {item.assetTag
                      ? "Tapping an NFC tag with either code, or scanning its label, opens this page. To write the tag on an iPhone, copy the tag URL and write it to the tag with a free app such as NFC Tools."
                      : canManage
                        ? "Generate a code to print this item's label or write it to an NFC tag."
                        : "This item has no tag code yet."}
                  </p>
                </>
              )}
              <ReadOnlyField label="Numbered code" htmlFor="item-numberedCode">
                {item.numberedCode ? (
                  <CodeActions
                    itemId={item.id}
                    code={item.numberedCode}
                    kind="numbered"
                  />
                ) : (
                  "None"
                )}
              </ReadOnlyField>
              {item.numberedCode && (
                <p className="app-muted text-sm">
                  A reusable code: it comes off this item by itself when the
                  item is distributed, retired or lost. Take the tag off the
                  item then, for the next one.
                </p>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        {item.status === "reserved" && item.holdRequester && (
          <Card>
            <CardHeader>
              <CardTitle className="app-muted text-sm font-semibold">
                Hold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <ReadOnlyField
                  label="Requested by"
                  htmlFor="item-hold-requester"
                >
                  {[
                    item.holdRequester.name,
                    item.holdRequester.email,
                    item.holdRequester.phone,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </ReadOnlyField>
                {item.holdRequest && (
                  <ReadOnlyField label="Request" htmlFor="item-hold-request">
                    <Link
                      href={`/portal/inventory/requests/${item.holdRequest.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {[
                        deliveryMethodLabel(item.holdRequest.delivery_method),
                        gearRequestStatusLabel(item.holdRequest.status),
                        item.holdRequest.delivery_method === "shipping" &&
                        item.holdRequest.quoted_amount !== null
                          ? `${formatCurrency(item.holdRequest.quoted_amount)} postage`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Link>
                  </ReadOnlyField>
                )}
                {item.holdNotes && (
                  <ReadOnlyField
                    label="Request notes"
                    htmlFor="item-hold-notes"
                  >
                    {/* The public form's Notes is a textarea, and the RPC
                        only trims, so the text arrives with the line breaks
                        the requester typed. */}
                    <MarkdownText>{item.holdNotes}</MarkdownText>
                  </ReadOnlyField>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        )}

        <ItemHistoryCard entries={history} />
      </div>
    </>
  );
}
