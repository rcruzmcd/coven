"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { requestGearItemsAction } from "./gear-cart-request-actions";
import {
  EMPTY_SHIPPING_FIELDS,
  GearDeliveryFields,
  GearRequesterContactFields,
  type ShippingFields,
} from "./gear-requester-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { GearAsIsNotice } from "@/components/gear-as-is-notice";
import { PrivacyNotice } from "@/components/privacy-notice";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  type DeliveryMethod,
  type PublicGearRequestOptions,
} from "@/lib/gear-requests";
import { trackForm, useFormStarted } from "@/lib/analytics/form-events";
import { GEAR_AS_IS_CONSENT_LABEL } from "@/lib/gear-as-is";
import { applyLexicon, DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import {
  EMPTY_CONTACT_PREFILL,
  type ViewerContactPrefill,
} from "@/lib/constituent/viewer";

export function GearCartCheckoutForm({
  itemIds,
  options,
  onSuccess,
  prefill = EMPTY_CONTACT_PREFILL,
  lexicon = DEFAULT_LEXICON,
  termsInForce = false,
  onPassphraseRejected,
}: {
  itemIds: string[];
  options: PublicGearRequestOptions;
  onSuccess: (deliveryMethod: DeliveryMethod, requestId: string) => void;
  /**
   * What a signed-in reader's session already knows about them (#1357), so
   * they do not retype it -- and do not mint a second `people` row with a
   * typo. Everything in it is derivable from the caller's own session, which
   * is the line: nothing here may differ according to whether a typed address
   * matches a directory record (§5.23).
   */
  prefill?: ViewerContactPrefill;
  /**
   * This organization's words (#896), for the privacy notice: it names what
   * was requested, and "gear" is one tenant's word for it.
   */
  lexicon?: Lexicon;
  /**
   * Whether this tenant serves `/terms` (#859). Decides only whether the as-is
   * notice offers the full wording: a notice may link a document only where
   * that document is served, and the summary itself is unconditional.
   */
  termsInForce?: boolean;
  /**
   * Called when the database refused the passphrase this browser holds
   * (#1536) -- the tenant changed it -- so the catalog can ask again.
   */
  onPassphraseRejected?: (message: string) => void;
}) {
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [instagramHandle, setInstagramHandle] = useState(
    prefill.instagramHandle,
  );
  const [notes, setNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("meetup");
  const [shipping, setShipping] = useState<ShippingFields>(
    EMPTY_SHIPPING_FIELDS,
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [company, setCompany] = useState("");
  const [asIsAcknowledged, setAsIsAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const startTracking = useFormStarted("gear_request", {});

  // The gear request funnel's checkout (#1711): shown once the cart holds
  // something, which is when this form mounts.
  useEffect(() => {
    trackForm("gear_request", "form_viewed", {});
  }, []);

  // A reader with a record of their own requests as that record (#1359):
  // `request_gear_items_as_me()` takes the person from the session, so the
  // contact fields decide nothing and asking for them would be asking for
  // input the request throws away. They are shown instead, because somebody
  // is entitled to see which name they are about to appear under, and
  // changing either is a link to `/my/details` -- the one place a person is
  // edited.
  const requestingAsSelf = prefill.linked;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    trackForm("gear_request", "form_submitted", {
      item_count: String(itemIds.length),
    });

    const formData = new FormData();
    if (!requestingAsSelf) {
      formData.set("name", name);
      formData.set("email", email);
      formData.set("phone", phone);
      formData.set("instagram_handle", instagramHandle);
      formData.set("company", company);
    }
    formData.set("notes", notes);
    formData.set("as_is_acknowledged", String(asIsAcknowledged));
    formData.set("delivery_method", deliveryMethod);
    if (deliveryMethod === "shipping") {
      formData.set("ship_name", shipping.name);
      formData.set("ship_line1", shipping.line1);
      formData.set("ship_line2", shipping.line2);
      formData.set("ship_city", shipping.city);
      formData.set("ship_region", shipping.region);
      formData.set("ship_postal_code", shipping.postalCode);
      formData.set("ship_country", shipping.country);
      formData.set("payment_method", paymentMethod);
    }

    startTransition(async () => {
      const result = await requestGearItemsAction(itemIds, formData);
      if ("error" in result) {
        setError(result.error);
        trackForm("gear_request", "form_failed", {
          error_code: result.code ?? "INVALID_FORM",
        });
        if (result.passphraseRequired) onPassphraseRejected?.(result.error);
        return;
      }
      // A filled honeypot "succeeds" with no row behind it, so a bot is not
      // counted as a request.
      if (!company) trackForm("gear_request", "form_completed", {});
      onSuccess(deliveryMethod, result.requestId);
    });
  }

  return (
    <form onSubmit={handleSubmit} {...startTracking}>
      <FieldGroup>
        {requestingAsSelf ? (
          <p className="app-muted text-sm leading-relaxed">
            Requesting as {name || "yourself"}
            {email ? ` (${email})` : ""}.{" "}
            <Link href={`${MY_PATH_PREFIX}/details`} className="underline">
              Not you, or out of date?
            </Link>
          </p>
        ) : (
          prefill.signedInAs && (
            // One line, and no more than that (#1257). It says which session
            // is filling the fields in, so a shared browser can correct them;
            // it says nothing about what the organization knows.
            <p className="app-muted text-sm">
              Signed in as {prefill.signedInAs}.
            </p>
          )
        )}

        {/* Unconditional since #1367. It used to render only where something
            on screen actually carried a `*` -- the contact fields, or a
            shipping address -- because a linked reader arranging a meetup was
            asked for nothing at all and a legend about required fields with no
            required field is noise. The as-is box is required on every path,
            so there is now always one. */}
        <RequiredFieldsNote />

        {!requestingAsSelf && (
          <GearRequesterContactFields
            idPrefix="cart-checkout"
            name={name}
            onNameChange={setName}
            email={email}
            onEmailChange={setEmail}
            phone={phone}
            onPhoneChange={setPhone}
            instagramHandle={instagramHandle}
            onInstagramHandleChange={setInstagramHandle}
          />
        )}

        <GearDeliveryFields
          idPrefix="cart-checkout"
          notes={notes}
          onNotesChange={setNotes}
          options={options}
          deliveryMethod={deliveryMethod}
          onDeliveryMethodChange={setDeliveryMethod}
          shipping={shipping}
          onShippingChange={setShipping}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
        />

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. There is none on
            the self-service path: it costs an account and an approved claim,
            so a hidden input would only catch somebody already let in. */}
        {!requestingAsSelf && (
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="cart-checkout-company">Company</label>
            <input
              id="cart-checkout-company"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <PrivacyNotice surface="gearRequest" lexicon={lexicon} />

        {/* After the privacy notice and beside the button, the order the
            artwork submission form and the registration waiver both argue
            for: the notice is the thing to read first, and the box that
            carries a real choice belongs next to the button that acts on it.

            Unticked, and `required` rather than a disabled submit, so the
            browser says which control is missing. `acknowledged_as_is()`
            refuses it independently -- a client-side `required` is a
            convenience and never the gate. */}
        <GearAsIsNotice lexicon={lexicon} termsInForce={termsInForce} />
        <Field orientation="horizontal">
          <Checkbox
            id="cart-checkout-as-is"
            checked={asIsAcknowledged}
            onCheckedChange={(next) => setAsIsAcknowledged(next === true)}
            disabled={isPending}
            required
          />
          <FieldLabel htmlFor="cart-checkout-as-is" required>
            {applyLexicon(GEAR_AS_IS_CONSENT_LABEL, lexicon)}
          </FieldLabel>
        </Field>

        <Button
          type="submit"
          disabled={isPending || itemIds.length === 0}
          className="w-full sm:w-fit"
        >
          {isPending
            ? "Requesting..."
            : `Request ${itemIds.length} item${itemIds.length === 1 ? "" : "s"}`}
        </Button>
      </FieldGroup>
    </form>
  );
}
