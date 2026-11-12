"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  updateGearRequestSettingsAction,
  type GearRequestActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  MAX_PAYMENT_METHODS,
  paymentMethodKeyFor,
  type GearRequestSettings,
  type PaymentMethod,
} from "@/lib/gear-requests";

/**
 * How this organization hands gear over (#1032): whether it will post it,
 * which ways it accepts the postage payment, and what it tells a requester
 * in the confirmation email. Lives here rather than in Organization Settings
 * because it shapes exactly one feature (docs/portal-navigation.md).
 *
 * A method's key is derived from its name once, when it is added, and never
 * from a later rename: requests store the key, and "Zelle" becoming "Zelle
 * (preferred)" must not orphan every request that chose it.
 */
export function GearRequestSettingsPanel({
  settings,
  collectionLabel,
}: {
  settings: GearRequestSettings;
  collectionLabel: string;
}) {
  const router = useRouter();
  const [shippingEnabled, setShippingEnabled] = useState(
    settings.shippingEnabled,
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(
    settings.paymentMethods,
  );
  const [meetupInstructions, setMeetupInstructions] = useState(
    settings.meetupInstructions,
  );
  const [shippingInstructions, setShippingInstructions] = useState(
    settings.shippingInstructions,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateMethod(index: number, patch: Partial<PaymentMethod>) {
    setPaymentMethods((methods) =>
      methods.map((method, i) =>
        i === index ? { ...method, ...patch } : method,
      ),
    );
  }

  function addMethod() {
    setPaymentMethods((methods) => [
      ...methods,
      { key: "", label: "", handle: "", instructions: "" },
    ]);
  }

  function removeMethod(index: number) {
    setPaymentMethods((methods) => methods.filter((_, i) => i !== index));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // A method added this session has no key yet; one loaded from the
    // database keeps the key it was stored with.
    const methods = paymentMethods.map((method) => ({
      ...method,
      key: method.key || paymentMethodKeyFor(method.label),
    }));

    startTransition(async () => {
      const outcome = await runAction<GearRequestActionResult>(
        () =>
          updateGearRequestSettingsAction({
            shippingEnabled,
            paymentMethods: methods,
            meetupInstructions,
            shippingInstructions,
          }),
        {
          success: "Delivery settings saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (outcome.ok) setPaymentMethods(methods);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">Delivery and postage</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id="shipping-enabled-label" className="text-sm font-medium">
                  Offer shipping
                </p>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  When this is on, the public form lets a requester ask for
                  their items to be posted, at their own cost. Staff quote the
                  postage after packing; nothing ships until it is paid. Off
                  means every request is a meetup.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span className="app-muted w-8 text-right text-xs">
                  {shippingEnabled ? "On" : "Off"}
                </span>
                <Switch
                  checked={shippingEnabled}
                  onCheckedChange={setShippingEnabled}
                  disabled={isPending}
                  aria-labelledby="shipping-enabled-label"
                />
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="meetup-instructions">
                Meetup instructions
              </FieldLabel>
              <Textarea
                id="meetup-instructions"
                rows={3}
                value={meetupInstructions}
                onChange={(event) => setMeetupInstructions(event.target.value)}
              />
              <FieldDescription>
                Sent in the confirmation email to anyone who chose a meetup:
                where you usually hand {collectionLabel.toLowerCase()} over, and
                how you will get in touch.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="shipping-instructions">
                Shipping instructions
              </FieldLabel>
              <Textarea
                id="shipping-instructions"
                rows={3}
                value={shippingInstructions}
                onChange={(event) =>
                  setShippingInstructions(event.target.value)
                }
              />
              <FieldDescription>
                Sent to anyone who chose shipping, after the standard note that
                you will quote the postage and post once it is paid.
              </FieldDescription>
            </Field>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Postage payment methods</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addMethod}
                  disabled={
                    isPending || paymentMethods.length >= MAX_PAYMENT_METHODS
                  }
                >
                  <Plus className="size-4" />
                  Add method
                </Button>
              </div>
              <p className="app-muted text-sm leading-relaxed">
                The ways a requester can pay you for postage, e.g. Zelle or
                Venmo. Only the name appears on the public form; the handle and
                any instructions go in the confirmation email.
              </p>
              {paymentMethods.length === 0 ? (
                <p className="app-muted rounded-lg border border-dashed border-[var(--line)] p-3 text-sm">
                  No payment methods yet. Shipping cannot be offered until there
                  is at least one.
                </p>
              ) : (
                paymentMethods.map((method, index) => (
                  <fieldset
                    key={index}
                    className="rounded-lg border border-[var(--line)] p-3"
                  >
                    <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Method {index + 1}
                    </legend>
                    <FieldGroup>
                      <Field orientation="responsive">
                        <Field>
                          <FieldLabel
                            htmlFor={`payment-method-${index}-label`}
                            required
                          >
                            Name
                          </FieldLabel>
                          <Input
                            id={`payment-method-${index}-label`}
                            required
                            value={method.label}
                            onChange={(event) =>
                              updateMethod(index, { label: event.target.value })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`payment-method-${index}-handle`}
                          >
                            Handle or account
                          </FieldLabel>
                          <Input
                            id={`payment-method-${index}-handle`}
                            value={method.handle}
                            onChange={(event) =>
                              updateMethod(index, {
                                handle: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor={`payment-method-${index}-instructions`}
                        >
                          Instructions
                        </FieldLabel>
                        <Textarea
                          id={`payment-method-${index}-instructions`}
                          rows={2}
                          value={method.instructions}
                          onChange={(event) =>
                            updateMethod(index, {
                              instructions: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMethod(index)}
                          disabled={isPending}
                          focusableWhenDisabled
                        >
                          <Trash2 className="size-4" />
                          Remove
                        </Button>
                      </div>
                    </FieldGroup>
                  </fieldset>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              {isPending ? <Spinner className="size-4" /> : null}
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                Save settings
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
