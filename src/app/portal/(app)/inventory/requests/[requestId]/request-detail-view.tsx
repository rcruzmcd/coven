import { MarkdownText } from "@/components/portal/markdown-text";
import Link from "next/link";
import { acknowledgementMethodPhrase } from "@/lib/distribution-acknowledgement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, personDisplayName } from "@/lib/format";
import {
  deliveryMethodLabel,
  isOpenGearRequest,
  latestRequestMovementType,
  shippingAddressLines,
  type PaymentMethod,
} from "@/lib/gear-requests";
import type { Lexicon } from "@/lib/lexicon";
import { GearRequestStatusBadge } from "../request-status-badge";
import { GearRequestAsIsBadge } from "../as-is-badge";
import { AskAsIsButton } from "./ask-as-is-button";
import {
  needsAsIsAcknowledgement,
  type AsIsRequestStatus,
} from "@/lib/gear-request-as-is-requests";
import { GearRequestStatusActions } from "./request-status-actions";
import {
  messagingDisabledReason,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";
import { RequestMessagesCard } from "./request-messages-card";
import { ViewerTime } from "@/components/viewer-time";
import { instagramUrl } from "@/components/instagram-link";
import { RequestItemThumb } from "./request-item-thumb";
import { RemoveRequestItemButton } from "./remove-request-item-button";
import { ReturnRequestItemButton } from "./return-request-item-button";
import {
  AddRequestItemDialog,
  type AddableItem,
} from "./add-request-item-dialog";
import { EditRequestNotesDialog } from "./edit-request-notes-dialog";

export type GearRequestDetailRow = {
  id: string;
  status: string;
  delivery_method: string;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_region: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  payment_method: string | null;
  notes: string | null;
  quoted_amount: number | string | null;
  quoted_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  as_is_acknowledged_at: string | null;
  as_is_text: string | null;
  as_is_method: string | null;
  as_is_typed_name: string | null;
  /** The emailed link asking for the acknowledgement (#1518), if sent. */
  as_is_request: AsIsRequestStatus | null;
  requester: {
    id: string;
    name: string | null;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
    instagram_handle: string | null;
  } | null;
  movements: {
    id: string;
    movement_type: string;
    occurred_at: string;
    created_at: string;
    inventory_item: {
      id: string;
      description: string;
      size: string | null;
      status: string;
      photo_url: string | null;
      category_label: { label: string } | null;
    } | null;
  }[];
};

/**
 * What an item's own status says about this request's hold on it. The
 * request does not track per-item progress; the item does, through the
 * ordinary distribution flow.
 */
function itemProgress(status: string, onRequest: string | null): string {
  // Once a request is fulfilled its own movements say what happened to the
  // item on it; the item's status may since belong to someone else's request.
  if (onRequest === "distributed") return "Handed over";
  if (onRequest === "other") return "Returned to shelf";
  switch (status) {
    case "reserved":
      return "On hold";
    case "distributed":
      return "Handed over";
    case "available":
      return "Released";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function GearRequestDetailView({
  request,
  paymentMethods,
  canManage,
  lexicon,
  messages,
  messageActors,
  orgName,
  replyTo,
  orgEmailEnabled,
  addableItems,
}: {
  request: GearRequestDetailRow;
  paymentMethods: PaymentMethod[];
  canManage: boolean;
  lexicon: Lexicon;
  messages: RecordMessageRow[];
  messageActors: MessageActor[];
  orgName: string;
  replyTo: string | null;
  orgEmailEnabled: boolean;
  /** On the shelf and addable; only read when the request can be edited. */
  addableItems: AddableItem[];
}) {
  const requesterName = personDisplayName(
    request.requester,
    "an anonymized requester",
  );
  const shipping = request.delivery_method === "shipping";
  const addressLines = shippingAddressLines({
    name: request.ship_name,
    line1: request.ship_line1,
    line2: request.ship_line2,
    city: request.ship_city,
    region: request.ship_region,
    postal_code: request.ship_postal_code,
    country: request.ship_country,
  });
  const paymentMethod =
    paymentMethods.find((method) => method.key === request.payment_method) ??
    null;
  const fulfilled = request.status === "fulfilled";
  const requestMovements = request.movements.map((movement) => ({
    ...movement,
    item_id: movement.inventory_item?.id ?? null,
  }));
  const items = request.movements
    .filter((movement) => movement.movement_type === "reserved")
    .map((movement) => movement.inventory_item)
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map((item) => ({
      ...item,
      onRequest: fulfilled
        ? latestRequestMovementType(requestMovements, item.id)
        : null,
    }));
  const heldCount = items.filter((item) => item.status === "reserved").length;
  // Staff edits (#1527) are for an open request only, like the status moves.
  const canEdit = canManage && isOpenGearRequest(request.status);
  // A fulfilled request's correction (#1567): an item handed over on it, and
  // not moved on since, can go back on the shelf.
  const canReturn = (item: (typeof items)[number]) =>
    canManage &&
    item.onRequest === "distributed" &&
    item.status === "distributed";
  const hasActions = canEdit || items.some(canReturn);
  const columnCount = hasActions ? 5 : 4;

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            Request from {requesterName}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 flex flex-wrap items-center gap-2 text-sm">
          <GearRequestStatusBadge status={request.status} />
          <GearRequestAsIsBadge request={request} />
          <span>
            Requested <ViewerTime iso={request.created_at} fallbackZone="UTC" />
          </span>
        </p>
      </div>

      {canManage && isOpenGearRequest(request.status) && (
        <GearRequestStatusActions
          requestId={request.id}
          status={request.status}
          deliveryMethod={request.delivery_method}
          heldCount={heldCount}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Method" htmlFor="request-delivery-method">
                {deliveryMethodLabel(request.delivery_method)}
              </ReadOnlyField>
              {shipping && (
                <>
                  <ReadOnlyField
                    label="Ship to"
                    htmlFor="request-shipping-address"
                  >
                    {addressLines.length > 0 ? (
                      <span className="whitespace-pre-line">
                        {addressLines.join("\n")}
                      </span>
                    ) : (
                      "Address removed"
                    )}
                  </ReadOnlyField>
                  <ReadOnlyField
                    label="Postage paid by"
                    htmlFor="request-payment-method"
                  >
                    {paymentMethod?.label ??
                      request.payment_method ??
                      "Not recorded"}
                  </ReadOnlyField>
                  <ReadOnlyField label="Postage" htmlFor="request-quote">
                    {request.quoted_amount === null ? (
                      "Not quoted yet"
                    ) : (
                      <>
                        {`${formatCurrency(request.quoted_amount)} quoted `}
                        <ViewerTime
                          iso={request.quoted_at}
                          fallbackZone="UTC"
                        />
                      </>
                    )}
                  </ReadOnlyField>
                  <ReadOnlyField label="Paid" htmlFor="request-paid">
                    {request.paid_at ? (
                      <ViewerTime iso={request.paid_at} fallbackZone="UTC" />
                    ) : (
                      "Not yet"
                    )}
                  </ReadOnlyField>
                </>
              )}
              {request.fulfilled_at && (
                <ReadOnlyField label="Fulfilled" htmlFor="request-fulfilled">
                  <ViewerTime iso={request.fulfilled_at} fallbackZone="UTC" />
                </ReadOnlyField>
              )}
              {request.cancelled_at && (
                <ReadOnlyField label="Cancelled" htmlFor="request-cancelled">
                  <ViewerTime iso={request.cancelled_at} fallbackZone="UTC" />
                </ReadOnlyField>
              )}
              {/* What the requester was told, and when they said they
                  understood it (#1367). Read-only and gating nothing: the
                  request carries the record, so a handout against it skips
                  the checkout's acknowledgement step (#1519).

                  Gear handed out in person outside a request is no longer
                  untouched: the handout checkout asks the recipient themselves
                  -- never staff on their behalf -- and a meetup request from
                  before #1367 picked up there is written back here with
                  method `in_person`. Null here is a request from before #1367
                  not yet handed over -- and staff can ask the requester to
                  acknowledge it themselves by emailed link (#1518). */}
              <ReadOnlyField label="Given as-is" htmlFor="request-as-is">
                {request.as_is_acknowledged_at ? (
                  <>
                    {"Acknowledged "}
                    {acknowledgementMethodPhrase(request.as_is_method) &&
                      `${acknowledgementMethodPhrase(request.as_is_method)} `}
                    {"on "}
                    <ViewerTime
                      iso={request.as_is_acknowledged_at}
                      fallbackZone="UTC"
                    />
                    {request.as_is_typed_name && (
                      <span className="block">
                        {`Name typed: ${request.as_is_typed_name}`}
                      </span>
                    )}
                    {request.as_is_text && (
                      // The wording as it stood that day, not as it reads now.
                      // It is the whole point of the snapshot, so it is shown
                      // rather than hidden behind a disclosure: a staffer
                      // answering "what were they told" should not have to
                      // click for it.
                      <p className="app-muted mt-2 text-sm whitespace-pre-line">
                        {request.as_is_text}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {request.as_is_request ? (
                      <>
                        {"Not recorded yet — asked by emailed link "}
                        <ViewerTime
                          iso={request.as_is_request.requested_at}
                          fallbackZone="UTC"
                        />
                      </>
                    ) : (
                      "Not recorded — this request predates the acknowledgement"
                    )}
                    {canManage && needsAsIsAcknowledgement(request) && (
                      <AskAsIsButton
                        requestId={request.id}
                        asked={Boolean(request.as_is_request)}
                        disabledReason={messagingDisabledReason(
                          orgEmailEnabled,
                          request.requester?.email,
                          "This request has no email address — the requester's record was cleared or never carried one.",
                        )}
                      />
                    )}
                  </>
                )}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Requester
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Name" htmlFor="request-requester-name">
                {request.requester ? (
                  <Link
                    href={`/portal/people/${request.requester.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {requesterName}
                  </Link>
                ) : (
                  "Anonymized"
                )}
              </ReadOnlyField>
              <ReadOnlyField label="Email" htmlFor="request-requester-email">
                {request.requester?.email ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Phone" htmlFor="request-requester-phone">
                {request.requester?.phone ?? "—"}
              </ReadOnlyField>
              {/* Often the only identifier that reaches a requester (#1357),
                  so it is a link: staff read this page to get in touch. */}
              <ReadOnlyField
                label="Instagram"
                htmlFor="request-requester-instagram"
              >
                {request.requester?.instagram_handle ? (
                  <a
                    href={instagramUrl(request.requester.instagram_handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    @{request.requester.instagram_handle}
                  </a>
                ) : (
                  "—"
                )}
              </ReadOnlyField>
              <ReadOnlyField label="Notes" htmlFor="request-notes">
                {request.notes ? (
                  // The public form's Notes is a textarea, and the RPC only
                  // trims, so the text arrives with the line breaks typed.
                  <MarkdownText>{request.notes}</MarkdownText>
                ) : (
                  "—"
                )}
                {canEdit && (
                  <div className="mt-2">
                    <EditRequestNotesDialog
                      requestId={request.id}
                      notes={request.notes}
                    />
                  </div>
                )}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="app-muted text-sm font-semibold">
            {lexicon.item_plural} requested
          </CardTitle>
          {canEdit && (
            <AddRequestItemDialog
              requestId={request.id}
              items={addableItems}
              lexicon={lexicon}
            />
          )}
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lexicon.item}</TableHead>
                <TableHead hideBelow="sm">Category</TableHead>
                <TableHead hideBelow="sm">Size</TableHead>
                <TableHead>Progress</TableHead>
                {hasActions && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="app-muted text-sm"
                  >
                    No items are linked to this request.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/portal/inventory/items/${item.id}`}
                        className="flex items-center gap-3 underline-offset-2 hover:underline"
                      >
                        <RequestItemThumb photoUrl={item.photo_url} />
                        <span className="min-w-0 break-words">
                          {item.description}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell hideBelow="sm" className="app-muted">
                      {item.category_label?.label ?? "—"}
                    </TableCell>
                    <TableCell hideBelow="sm" className="app-muted">
                      {item.size ?? "—"}
                    </TableCell>
                    <TableCell>
                      {itemProgress(item.status, item.onRequest)}
                    </TableCell>
                    {hasActions && (
                      <TableCell className="text-right">
                        {canReturn(item) && (
                          <ReturnRequestItemButton
                            requestId={request.id}
                            itemId={item.id}
                            itemLabel={item.description}
                          />
                        )}
                        {canEdit && item.status === "reserved" && (
                          <RemoveRequestItemButton
                            requestId={request.id}
                            itemId={item.id}
                            itemLabel={item.description}
                            isLast={items.length === 1}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="app-muted mt-3 text-xs">
        Handing an item over is recorded through Distribution, as for any other
        item; it shows here as &ldquo;Handed over&rdquo;. Mark the request
        fulfilled once everything in it is out.
        {fulfilled &&
          canManage &&
          " If something was not actually handed over, return it to the shelf; an extra item given is recorded through Distribution with the requester as recipient."}
      </p>

      {canManage && (
        <RequestMessagesCard
          requestId={request.id}
          messages={messages}
          actors={messageActors}
          recipientName={requesterName}
          toEmail={request.requester?.email ?? ""}
          orgName={orgName}
          replyTo={replyTo}
          disabledReason={messagingDisabledReason(
            orgEmailEnabled,
            request.requester?.email,
            "This request has no email address — the requester's record was cleared or never carried one.",
          )}
        />
      )}
    </>
  );
}
