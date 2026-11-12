"use client";

import {
  FormEvent,
  type ReactNode,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateEmailNotificationsEnabledAction,
  updateOpsReportRecipientsAction,
  updateSenderIdentityAction,
  type SettingActionResult,
} from "./actions";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
// Type-only, like the other panels here: @/lib/notifications/kinds is a pure
// registry, but keeping the import shape consistent makes it obvious that the
// value itself arrives as a prop from the server page.
import type { NotificationKind } from "@/lib/notifications/kinds";
import type {
  NotificationRecipient,
  NotificationRecipientsByKind,
  ReceiptDelivery,
} from "@/lib/notifications/recipients";
import { cn } from "@/lib/utils";

export function NotificationsPanel({
  emailEnabled,
  kinds,
  recipientsByKind,
  receiptDelivery,
  opsReportRecipients,
  orgName,
  platformFrom,
  sendingDomain,
  replyTo,
  fromAddress,
}: {
  emailEnabled: boolean;
  kinds: NotificationKind[];
  /** Null when the recipient read failed; the card says so rather than lying. */
  recipientsByKind: NotificationRecipientsByKind | null;
  /** Null when the read failed, like `recipientsByKind`. */
  receiptDelivery: Record<string, ReceiptDelivery> | null;
  opsReportRecipients: string[];
  orgName: string;
  /** EMAIL_FROM, as the address recipients see when nothing overrides it. */
  platformFrom: string | null;
  /** This tenant's own domain, when it is verified for sending. Null disables the field. */
  sendingDomain: string | null;
  replyTo: string | null;
  fromAddress: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Same reasoning as PageVisibilityRow: useOptimistic drops back to the
  // server's value when the transition ends, so the switch can never keep
  // showing a change the server did not make.
  const [checked, setChecked] = useOptimistic(emailEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updateEmailNotificationsEnabledAction(next),
        {
          success: next
            ? "Outbound email is on."
            : "Outbound email is off for this organization.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* First and full width (#1484): it outranks everything below it, and
          when it is off the tint says so from across the room. */}
      <Card
        className={cn(!checked && "bg-warning/5 ring-warning/50")}
        data-state={checked ? "on" : "off"}
      >
        <CardHeader>
          <CardTitle id="email-enabled-label">Outbound email</CardTitle>
          <CardDescription>
            {checked
              ? "Off means the portal sends no email at all, whatever anyone has turned on. Nothing queues up."
              : "No email is going out: no reminders, notifications, receipts or ops report. Nothing is queued to send later."}
          </CardDescription>
          <CardAction className="flex items-center gap-2 pt-0.5">
            {isPending ? <Spinner className="size-4" /> : null}
            <span className="app-muted w-8 text-right text-xs">
              {checked ? "On" : "Off"}
            </span>
            <Switch
              checked={checked}
              onCheckedChange={handleChange}
              disabled={isPending}
              aria-labelledby="email-enabled-label"
            />
          </CardAction>
        </CardHeader>
      </Card>

      {/* Two columns from lg, after My Account (#1437): the forms in a narrow
          column, the reference list in the wide one. Below lg it is one column
          in this DOM order, which is the order the cards always had except
          that Automatic replies moved down beside the other sending items. */}
      <div className="grid items-start gap-6 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <section aria-labelledby="notifications-sending" className="space-y-3">
          <h2 id="notifications-sending" className="app-eyebrow text-sm">
            Sending
          </h2>
          <div className="space-y-4">
            <SenderIdentityCard
              orgName={orgName}
              platformFrom={platformFrom}
              sendingDomain={sendingDomain}
              replyTo={replyTo}
              fromAddress={fromAddress}
            />
            <OpsReportRecipientsCard recipients={opsReportRecipients} />
            <AutomaticRepliesCard />
          </div>
        </section>

        <WhoReceivesWhat
          kinds={kinds}
          recipientsByKind={recipientsByKind}
          receiptDelivery={receiptDelivery}
        />
      </div>
    </div>
  );
}

/**
 * Where the other half of this organization's email is written (#1235).
 *
 * This page owns whether mail goes out and who it comes from; the wording of
 * the receipts the public forms send back is five templates rather than one
 * object, so it is a page of its own rather than a sixth tab here. The two
 * link both ways so neither reads as the whole of the subject. A compact row
 * since #1484: it holds no setting, only the way there.
 */
function AutomaticRepliesCard() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Automatic replies</CardTitle>
        <CardDescription>
          The wording of each receipt, and a switch for each.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/portal/administration/automatic-replies" />}
          >
            Open
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

/**
 * What the portal can send, and who actually gets it (#1044), split by
 * audience (#1484) because the two halves answer different questions.
 *
 * Staff kinds: two sets have to agree for an email to arrive. The sender
 * resolves the people who hold the role that owns the queue, then mails only
 * those of them who turned that kind on for themselves. Before this card both
 * halves were silent -- an opt-in without the role produced nothing, a role
 * holder who never opted in was simply missing -- and the only way to answer
 * "who gets the volunteer application notice?" was a database query. Each row
 * leads with a count and a badge per gap so eleven rows scan for problems;
 * the full lists stay visible, since this is reference material.
 *
 * Receipts are opt-out and go to whoever filled in the form, so there is no
 * list of names to show -- only who turned them off (ReceiptDelivery).
 *
 * Read-only, deliberately. A preference is the person's own record (the
 * `enabled = false` row is the evidence an opt-out was honoured) and the table's
 * write policies pin writes to my_person_id(); the two gaps below therefore name
 * what to ask for rather than offering a switch.
 */
function WhoReceivesWhat({
  kinds,
  recipientsByKind,
  receiptDelivery,
}: {
  kinds: NotificationKind[];
  recipientsByKind: NotificationRecipientsByKind | null;
  receiptDelivery: Record<string, ReceiptDelivery> | null;
}) {
  const staffKinds = kinds.filter((kind) => kind.audience !== "constituent");
  const receiptKinds = kinds.filter((kind) => kind.audience === "constituent");

  return (
    <section aria-labelledby="notifications-recipients" className="space-y-3">
      <h2 id="notifications-recipients" className="app-eyebrow text-sm">
        Who receives what
      </h2>

      {recipientsByKind === null || receiptDelivery === null ? (
        <Alert variant="destructive">
          <AlertDescription>
            The recipient list could not be loaded. Everything else on this page
            is unaffected.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Staff notifications{" "}
                <span className="app-muted font-normal">
                  ({staffKinds.length})
                </span>
              </CardTitle>
              <CardDescription>
                Sent to people who hold the role and turned it on in{" "}
                <Link
                  href="/portal/account"
                  className="underline underline-offset-4"
                >
                  My Account
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {staffKinds.map((kind) => (
                  <StaffKindRecipients
                    key={kind.key}
                    kind={kind}
                    people={recipientsByKind[kind.key] ?? []}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Receipts to the public{" "}
                <span className="app-muted font-normal">
                  ({receiptKinds.length})
                </span>
              </CardTitle>
              <CardDescription>
                Sent to whoever fills in the form, unless they opted out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {receiptKinds.map((kind) => (
                  <ReceiptKindDelivery
                    key={kind.key}
                    kind={kind}
                    delivery={
                      receiptDelivery[kind.key] ?? {
                        optedOut: 0,
                        switchedOff: false,
                      }
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

/** A kind's name with its summary badges, wrapping under it when narrow. */
function KindHeading({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function StaffKindRecipients({
  kind,
  people,
}: {
  kind: NotificationKind;
  people: NotificationRecipient[];
}) {
  const receiving = people.filter((person) => person.receives);
  const roleWithoutOptIn = people.filter(
    (person) => person.holdsRole && !person.optedIn,
  );
  const optInWithoutRole = people.filter(
    (person) => person.optedIn && !person.holdsRole,
  );

  return (
    <li className="space-y-1.5 py-4 first:pt-0 last:pb-0">
      <KindHeading label={kind.label}>
        <Badge variant={receiving.length > 0 ? "success" : "muted"}>
          {receiving.length} recipient{receiving.length === 1 ? "" : "s"}
        </Badge>
        {roleWithoutOptIn.length > 0 && (
          <Badge variant="warning">
            <TriangleAlert aria-hidden="true" />
            {roleWithoutOptIn.length} not opted in
          </Badge>
        )}
        {optInWithoutRole.length > 0 && (
          <Badge variant="warning">
            <TriangleAlert aria-hidden="true" />
            {optInWithoutRole.length} without the role
          </Badge>
        )}
      </KindHeading>
      <p className="app-muted text-sm leading-relaxed">{kind.description}</p>

      {receiving.length > 0 ? (
        <p className="text-sm leading-relaxed break-words">
          <span className="font-medium">Receives it:</span>{" "}
          {nameList(receiving)}
        </p>
      ) : (
        <p className="app-muted text-sm leading-relaxed">
          Nobody receives this at the moment.
        </p>
      )}

      {roleWithoutOptIn.length > 0 && (
        <p className="app-muted text-sm leading-relaxed break-words">
          Holds the role but has not opted in: {nameList(roleWithoutOptIn)}.
          They can turn it on themselves under My Account &rarr; Email
          notifications.
        </p>
      )}

      {optInWithoutRole.length > 0 && (
        <p className="app-muted text-sm leading-relaxed break-words">
          Opted in, but holds no role that receives this:{" "}
          {nameList(optInWithoutRole)}. Give them the role, or expect them to
          get nothing.
        </p>
      )}
    </li>
  );
}

function ReceiptKindDelivery({
  kind,
  delivery,
}: {
  kind: NotificationKind;
  delivery: ReceiptDelivery;
}) {
  const { optedOut, switchedOff } = delivery;

  return (
    <li className="space-y-1.5 py-4 first:pt-0 last:pb-0">
      <KindHeading label={kind.label}>
        {switchedOff ? (
          <Badge variant="warning">
            <TriangleAlert aria-hidden="true" />
            Switched off
          </Badge>
        ) : (
          <Badge variant="success">Sent</Badge>
        )}
        {optedOut > 0 && <Badge variant="muted">{optedOut} opted out</Badge>}
      </KindHeading>
      <p className="app-muted text-sm leading-relaxed">{kind.description}</p>
      <p className="text-sm leading-relaxed">
        {switchedOff
          ? "Switched off under Automatic Replies, so nobody gets it."
          : optedOut === 0
            ? "Sent to everyone who submits the form. Nobody has opted out."
            : `Sent to everyone who submits the form, except the ${optedOut} ${
                optedOut === 1 ? "person who has" : "people who have"
              } opted out.`}
      </p>
    </li>
  );
}

/** Names, with the address only where it adds something the name does not. */
function nameList(people: NotificationRecipient[]): string {
  return people
    .map((person) =>
      person.name === person.email
        ? person.name
        : `${person.name} (${person.email})`,
    )
    .join(", ");
}

/**
 * Who this organization's mail comes from, and where a reply goes (#857).
 *
 * The Reply-To is the half that matters most and the half anyone can set: mail
 * leaves through one provider while the mailboxes people read are with another,
 * so a reply to the sending address bounces unless this points somewhere real.
 *
 * The From address is not self-service, and the field says so by being
 * read-only until it can work. Sending from a domain means the operator has
 * verified it with the provider and published DNS records for it, which is not
 * something a button here can do -- and an editable box that silently ignored
 * what was typed into it would be worse than no box at all.
 */
function SenderIdentityCard({
  orgName,
  platformFrom,
  sendingDomain,
  replyTo,
  fromAddress,
}: {
  orgName: string;
  platformFrom: string | null;
  sendingDomain: string | null;
  replyTo: string | null;
  fromAddress: string | null;
}) {
  const router = useRouter();
  const [replyToValue, setReplyToValue] = useState(replyTo ?? "");
  const [fromValue, setFromValue] = useState(fromAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sender = fromValue.trim() || platformFrom || "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateSenderIdentityAction(formData),
        {
          success: "Sender details updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who your email comes from</CardTitle>
        <CardDescription className="wrap-anywhere">
          Recipients see{" "}
          <span className="text-foreground">
            {sender ? `"${orgName}" <${sender}>` : `"${orgName}"`}
          </span>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mail-reply-to">Reply-To address</FieldLabel>
              <Input
                id="mail-reply-to"
                name="replyTo"
                type="email"
                spellCheck={false}
                placeholder="hello@example.org"
                value={replyToValue}
                onChange={(event) => setReplyToValue(event.target.value)}
              />
              <FieldDescription>
                Where replies land; without it they bounce. Empty uses the
                platform&rsquo;s.
              </FieldDescription>
            </Field>

            {sendingDomain ? (
              <Field>
                <FieldLabel htmlFor="mail-from-address">
                  Send from your own address
                </FieldLabel>
                <Input
                  id="mail-from-address"
                  name="fromAddress"
                  type="email"
                  spellCheck={false}
                  placeholder={`hello@${sendingDomain}`}
                  value={fromValue}
                  onChange={(event) => setFromValue(event.target.value)}
                />
                <FieldDescription>
                  Must be at {sendingDomain}. Empty uses the platform&rsquo;s.
                </FieldDescription>
              </Field>
            ) : (
              <>
                <input type="hidden" name="fromAddress" value={fromValue} />
                <ReadOnlyField
                  label="Sending address"
                  htmlFor="mail-from-fixed"
                >
                  {platformFrom ?? "Not configured"}
                </ReadOnlyField>
                <FieldDescription>
                  Editable once your platform operator verifies your domain.
                </FieldDescription>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The leadership ops report's recipients (#743).
 *
 * A free-text list rather than a person picker, because the address is
 * routinely a distribution list -- board@, leadership@ -- with no `people` row
 * and no portal account behind it. That is also why this report sits outside
 * the per-person preferences above: nobody can opt themselves in or out of an
 * inbox they do not own. Leaving the field empty switches the report off.
 */
function OpsReportRecipientsCard({ recipients }: { recipients: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(recipients.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateOpsReportRecipientsAction(formData),
        {
          success: "Daily ops report recipients updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily ops report</CardTitle>
        <CardDescription>
          A morning summary of the day, sent by address. Empty sends none.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ops-report-recipients">
                Recipients
              </FieldLabel>
              <Textarea
                id="ops-report-recipients"
                name="recipients"
                rows={3}
                spellCheck={false}
                placeholder="leadership@example.org"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <FieldDescription>
                One address per line (commas work too).
              </FieldDescription>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
